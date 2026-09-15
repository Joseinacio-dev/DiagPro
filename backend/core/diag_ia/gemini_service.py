"""Cliente REST Gemini resiliente, com erros e metadados sanitizados."""
from dataclasses import dataclass
import logging
import re
import time

import requests
from django.conf import settings

from devicecheck_backend.observability import logger


SAFE_PROVIDER_ERROR = re.compile(r'^[A-Z][A-Z0-9_]{0,63}$')
PRIMARY_ATTEMPTS = 2
RETRY_BACKOFF_SECONDS = (1.0,)
MIN_REQUEST_TIMEOUT_SECONDS = 0.1


@dataclass(frozen=True)
class GeminiResult:
    text: str
    model_used: str
    primary_status: int | None
    fallback_status: int | None
    attempts: int
    duration_ms: int
    fallback_model_used: bool
    primary_code: str | None = None
    fallback_code: str | None = None


class GeminiUnavailable(Exception):
    default_error = 'UNAVAILABLE'

    def __init__(
        self,
        provider_error=None,
        *,
        provider_status=None,
        duration_ms=0,
        timed_out=False,
        model=None,
        attempts=1,
        primary_status=None,
        fallback_status=None,
        fallback_model_used=False,
        primary_code=None,
        fallback_code=None,
    ):
        safe_error = (
            provider_error
            if isinstance(provider_error, str) and SAFE_PROVIDER_ERROR.fullmatch(provider_error)
            else self.default_error
        )
        super().__init__(safe_error)
        self.provider = 'Gemini'
        self.provider_status = provider_status if type(provider_status) is int and 100 <= provider_status <= 599 else None
        self.provider_error = safe_error
        self.duration_ms = max(0, min(int(duration_ms), 300_000))
        self.model = model if isinstance(model, str) else settings.GEMINI_MODEL
        self.timed_out = timed_out is True
        self.attempts = max(1, min(int(attempts), PRIMARY_ATTEMPTS + 1))
        self.primary_status = primary_status if type(primary_status) is int and 100 <= primary_status <= 599 else None
        self.fallback_status = fallback_status if type(fallback_status) is int and 100 <= fallback_status <= 599 else None
        self.fallback_model_used = fallback_model_used is True
        self.primary_code = primary_code if isinstance(primary_code, str) and SAFE_PROVIDER_ERROR.fullmatch(primary_code) else None
        self.fallback_code = fallback_code if isinstance(fallback_code, str) and SAFE_PROVIDER_ERROR.fullmatch(fallback_code) else None


class GeminiAuthenticationError(GeminiUnavailable):
    default_error = 'AUTHENTICATION_ERROR'


class GeminiPermissionError(GeminiUnavailable):
    default_error = 'PERMISSION_DENIED'


class GeminiQuotaError(GeminiUnavailable):
    default_error = 'RESOURCE_EXHAUSTED'


class GeminiBadRequest(GeminiUnavailable):
    default_error = 'INVALID_ARGUMENT'


class GeminiModelError(GeminiUnavailable):
    default_error = 'MODEL_NOT_FOUND'


class GeminiTimeout(GeminiUnavailable):
    default_error = 'TIMEOUT'


def gemini_configuration_status():
    """Nunca retorna a chave; somente presença e modelos validados pelo settings."""
    return {
        'api_key_present': bool(settings.GEMINI_API_KEY),
        'model': settings.GEMINI_MODEL,
        'fallback_model': settings.GEMINI_FALLBACK_MODEL,
    }


def _duration_ms(started):
    return round((time.monotonic() - started) * 1000)


def _safe_error_code(response):
    try:
        error = response.json().get('error', {})
    except (ValueError, AttributeError, TypeError):
        return 'HTTP_ERROR'
    candidates = []
    if isinstance(error, dict):
        details = error.get('details')
        if isinstance(details, list):
            candidates.extend(item.get('reason') for item in details if isinstance(item, dict))
        candidates.append(error.get('status'))
    return next(
        (value for value in candidates if isinstance(value, str) and SAFE_PROVIDER_ERROR.fullmatch(value)),
        'HTTP_ERROR',
    )


def _classified_error(response, started, model):
    status = response.status_code
    provider_error = _safe_error_code(response)
    kwargs = {'provider_status': status, 'duration_ms': _duration_ms(started), 'model': model}
    if status == 401 or provider_error in {'API_KEY_INVALID', 'UNAUTHENTICATED'}:
        return GeminiAuthenticationError(provider_error, **kwargs)
    if status == 403:
        return GeminiPermissionError(provider_error, **kwargs)
    if status == 429 or provider_error in {'RESOURCE_EXHAUSTED', 'FAILED_PRECONDITION'}:
        return GeminiQuotaError(provider_error, **kwargs)
    if status == 404:
        return GeminiModelError(provider_error, **kwargs)
    if status == 400:
        return GeminiBadRequest(provider_error, **kwargs)
    return GeminiUnavailable(provider_error, **kwargs)


def _request_once(*, model, system, contents, timeout_seconds):
    started = time.monotonic()
    endpoint = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
    try:
        response = requests.post(
            endpoint,
            headers={'Content-Type': 'application/json', 'x-goog-api-key': settings.GEMINI_API_KEY},
            json={
                'system_instruction': {'parts': [{'text': system}]},
                'contents': contents,
                'generationConfig': {'maxOutputTokens': settings.GEMINI_MAX_OUTPUT_TOKENS, 'temperature': 0.2},
            },
            timeout=max(MIN_REQUEST_TIMEOUT_SECONDS, timeout_seconds),
        )
    except requests.Timeout as exc:
        raise GeminiTimeout(
            'TIMEOUT', duration_ms=_duration_ms(started), timed_out=True, model=model,
        ) from exc
    except requests.RequestException as exc:
        raise GeminiUnavailable(
            'NETWORK_ERROR', duration_ms=_duration_ms(started), model=model,
        ) from exc
    if response.status_code != 200:
        raise _classified_error(response, started, model)
    try:
        data = response.json()
        text = data['candidates'][0]['content']['parts'][0]['text'].strip()
    except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
        raise GeminiUnavailable(
            'INVALID_RESPONSE', provider_status=200, duration_ms=_duration_ms(started), model=model,
        ) from exc
    if not text:
        raise GeminiUnavailable(
            'EMPTY_RESPONSE', provider_status=200, duration_ms=_duration_ms(started), model=model,
        )
    return text[:settings.GEMINI_MAX_RESPONSE_CHARS], _duration_ms(started)


def _is_transient(exc):
    return (
        isinstance(exc, GeminiTimeout)
        or exc.provider_error == 'NETWORK_ERROR'
        or exc.provider_status in {500, 502, 503, 504}
    )


def _remaining_budget_ms(deadline):
    return max(0, round((deadline - time.monotonic()) * 1000))


def _log_attempt(
    *, success, exc=None, model, attempt, retry, fallback_model_used,
    duration_ms, remaining_budget_ms, final_provider=None,
):
    extra = {
        'provider': 'Gemini',
        'provider_model': model,
        'provider_attempt': attempt,
        'provider_retry': retry,
        'fallback_model_used': fallback_model_used,
        'request_duration_ms': duration_ms,
        'remaining_budget_ms': remaining_budget_ms,
    }
    if success:
        extra.update({'provider_status': 200, 'provider_error': 'OK'})
    else:
        extra.update({
            'error_type': type(exc).__name__,
            'provider_status': exc.provider_status,
            'provider_error': exc.provider_error,
            'provider_timeout': exc.timed_out,
        })
    if final_provider:
        extra['final_provider'] = final_provider
    logger.log(
        logging.INFO if success else logging.WARNING,
        'gemini_attempt_success' if success else 'gemini_attempt_failed',
        extra=extra,
    )


def _enrich_error(
    exc, *, started, attempts, primary_status, primary_code,
    fallback_status=None, fallback_code=None, fallback_model_used=False,
):
    exc.duration_ms = max(0, min(_duration_ms(started), 300_000))
    exc.attempts = attempts
    exc.primary_status = primary_status
    exc.primary_code = primary_code
    exc.fallback_status = fallback_status
    exc.fallback_code = fallback_code
    exc.fallback_model_used = fallback_model_used
    return exc


def _global_timeout(*, started, attempts, primary_status, primary_code, model, fallback_model_used=False):
    return GeminiTimeout(
        'TOTAL_TIMEOUT',
        provider_status=primary_status,
        duration_ms=_duration_ms(started),
        timed_out=True,
        model=model,
        attempts=attempts,
        primary_status=primary_status,
        primary_code=primary_code,
        fallback_model_used=fallback_model_used,
    )


def generate_with_gemini_result(*, system, contents):
    """Executa uma operação lógica com retry, fallback e orçamento global."""
    started = time.monotonic()
    if not settings.GEMINI_API_KEY:
        raise GeminiAuthenticationError('KEY_NOT_CONFIGURED', duration_ms=_duration_ms(started))
    primary_model = settings.GEMINI_MODEL
    fallback_model = settings.GEMINI_FALLBACK_MODEL
    if not primary_model:
        raise GeminiModelError('MODEL_NOT_CONFIGURED', duration_ms=_duration_ms(started))

    deadline = started + settings.GEMINI_GLOBAL_TIMEOUT_SECONDS
    primary_timeout = settings.GEMINI_PRIMARY_TIMEOUT_SECONDS
    fallback_timeout = settings.GEMINI_FALLBACK_TIMEOUT_SECONDS
    has_fallback = bool(fallback_model and fallback_model != primary_model)
    last_error = None
    last_primary_status = None
    attempts = 0
    for attempt in range(1, PRIMARY_ATTEMPTS + 1):
        remaining = deadline - time.monotonic()
        if remaining <= MIN_REQUEST_TIMEOUT_SECONDS:
            raise _global_timeout(
                started=started,
                attempts=max(1, attempts),
                primary_status=last_primary_status,
                primary_code=last_error.provider_error if last_error else 'TOTAL_TIMEOUT',
                model=primary_model,
            )
        attempts += 1
        try:
            text, attempt_duration = _request_once(
                model=primary_model,
                system=system,
                contents=contents,
                timeout_seconds=min(primary_timeout, remaining),
            )
        except GeminiUnavailable as exc:
            last_error = exc
            if exc.provider_status is not None:
                last_primary_status = exc.provider_status
            transient = _is_transient(exc)
            remaining_after_attempt = max(0.0, deadline - time.monotonic())
            delay = RETRY_BACKOFF_SECONDS[attempt - 1] if attempt < PRIMARY_ATTEMPTS else 0.0
            reserved_fallback = fallback_timeout if has_fallback else 0.0
            retry_budget = delay + primary_timeout + reserved_fallback
            retry = (
                transient
                and not isinstance(exc, GeminiTimeout)
                and attempt < PRIMARY_ATTEMPTS
                and remaining_after_attempt >= retry_budget
            )
            fallback_possible = transient and has_fallback and remaining_after_attempt > MIN_REQUEST_TIMEOUT_SECONDS
            final_provider = None if retry or fallback_possible else 'unavailable'
            _log_attempt(
                success=False,
                exc=exc,
                model=primary_model,
                attempt=attempts,
                retry=retry,
                fallback_model_used=False,
                duration_ms=exc.duration_ms,
                remaining_budget_ms=round(remaining_after_attempt * 1000),
                final_provider=final_provider,
            )
            if not transient:
                raise _enrich_error(
                    exc,
                    started=started,
                    attempts=attempts,
                    primary_status=exc.provider_status,
                    primary_code=exc.provider_error,
                )
            if retry:
                time.sleep(delay)
                continue
            break
        _log_attempt(
            success=True,
            model=primary_model,
            attempt=attempts,
            retry=False,
            fallback_model_used=False,
            duration_ms=attempt_duration,
            remaining_budget_ms=_remaining_budget_ms(deadline),
            final_provider='gemini',
        )
        return GeminiResult(
            text=text,
            model_used=primary_model,
            primary_status=200,
            fallback_status=None,
            attempts=attempts,
            duration_ms=_duration_ms(started),
            fallback_model_used=False,
            primary_code='OK',
        )

    primary_status = last_primary_status
    primary_code = last_error.provider_error if last_error else None
    if has_fallback:
        remaining = deadline - time.monotonic()
        if remaining <= MIN_REQUEST_TIMEOUT_SECONDS:
            raise _global_timeout(
                started=started,
                attempts=attempts,
                primary_status=primary_status,
                primary_code=primary_code or 'TOTAL_TIMEOUT',
                model=primary_model,
            )
        attempts += 1
        try:
            text, attempt_duration = _request_once(
                model=fallback_model,
                system=system,
                contents=contents,
                timeout_seconds=min(fallback_timeout, remaining),
            )
        except GeminiUnavailable as exc:
            _log_attempt(
                success=False,
                exc=exc,
                model=fallback_model,
                attempt=1,
                retry=False,
                fallback_model_used=True,
                duration_ms=exc.duration_ms,
                remaining_budget_ms=_remaining_budget_ms(deadline),
                final_provider='unavailable',
            )
            raise _enrich_error(
                exc,
                started=started,
                attempts=attempts,
                primary_status=primary_status,
                primary_code=primary_code,
                fallback_status=exc.provider_status,
                fallback_code=exc.provider_error,
                fallback_model_used=True,
            )
        _log_attempt(
            success=True,
            model=fallback_model,
            attempt=1,
            retry=False,
            fallback_model_used=True,
            duration_ms=attempt_duration,
            remaining_budget_ms=_remaining_budget_ms(deadline),
            final_provider='gemini',
        )
        return GeminiResult(
            text=text,
            model_used=fallback_model,
            primary_status=primary_status,
            fallback_status=200,
            attempts=attempts,
            duration_ms=_duration_ms(started),
            fallback_model_used=True,
            primary_code=primary_code,
            fallback_code='OK',
        )

    raise _enrich_error(
        last_error,
        started=started,
        attempts=attempts,
        primary_status=primary_status,
        primary_code=primary_code,
    )


def generate_with_gemini(*, system, contents):
    return generate_with_gemini_result(system=system, contents=contents).text
