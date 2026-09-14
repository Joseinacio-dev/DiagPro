"""Cliente REST Gemini com erros internos classificados e metadados seguros."""
import re
from time import monotonic

import requests
from django.conf import settings


SAFE_PROVIDER_ERROR = re.compile(r'^[A-Z][A-Z0-9_]{0,63}$')


class GeminiUnavailable(Exception):
    default_error = 'UNAVAILABLE'

    def __init__(self, provider_error=None, *, provider_status=None, duration_ms=0, timed_out=False):
        safe_error = provider_error if isinstance(provider_error, str) and SAFE_PROVIDER_ERROR.fullmatch(provider_error) else self.default_error
        super().__init__(safe_error)
        self.provider = 'Gemini'
        self.provider_status = provider_status if type(provider_status) is int and 100 <= provider_status <= 599 else None
        self.provider_error = safe_error
        self.duration_ms = max(0, min(int(duration_ms), 300_000))
        self.model = settings.GEMINI_MODEL
        self.timed_out = timed_out is True


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
    """Nunca retorna a chave; somente presença e modelo já validado pelo settings."""
    return {'api_key_present': bool(settings.GEMINI_API_KEY), 'model': settings.GEMINI_MODEL}


def _duration_ms(started):
    return round((monotonic() - started) * 1000)


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
    return next((value for value in candidates if isinstance(value, str) and SAFE_PROVIDER_ERROR.fullmatch(value)), 'HTTP_ERROR')


def _classified_error(response, started):
    status = response.status_code
    provider_error = _safe_error_code(response)
    kwargs = {'provider_status': status, 'duration_ms': _duration_ms(started)}
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


def generate_with_gemini(*, system, contents):
    started = monotonic()
    if not settings.GEMINI_API_KEY:
        raise GeminiAuthenticationError('KEY_NOT_CONFIGURED', duration_ms=_duration_ms(started))
    if not settings.GEMINI_MODEL:
        raise GeminiModelError('MODEL_NOT_CONFIGURED', duration_ms=_duration_ms(started))
    endpoint = f'https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent'
    try:
        response = requests.post(
            endpoint,
            headers={'Content-Type': 'application/json', 'x-goog-api-key': settings.GEMINI_API_KEY},
            json={
                'system_instruction': {'parts': [{'text': system}]},
                'contents': contents,
                'generationConfig': {'maxOutputTokens': settings.GEMINI_MAX_OUTPUT_TOKENS, 'temperature': 0.2},
            },
            timeout=settings.GEMINI_TIMEOUT_SECONDS,
        )
    except requests.Timeout as exc:
        raise GeminiTimeout('TIMEOUT', duration_ms=_duration_ms(started), timed_out=True) from exc
    except requests.RequestException as exc:
        raise GeminiUnavailable('NETWORK_ERROR', duration_ms=_duration_ms(started)) from exc
    if response.status_code != 200:
        raise _classified_error(response, started)
    try:
        data = response.json()
        text = data['candidates'][0]['content']['parts'][0]['text'].strip()
    except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
        raise GeminiUnavailable('INVALID_RESPONSE', provider_status=200, duration_ms=_duration_ms(started)) from exc
    if not text:
        raise GeminiUnavailable('EMPTY_RESPONSE', provider_status=200, duration_ms=_duration_ms(started))
    return text[:settings.GEMINI_MAX_RESPONSE_CHARS]
