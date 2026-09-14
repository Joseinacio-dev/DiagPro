"""Cliente Gemini via REST. A chave existe somente no header da chamada backend."""
import requests
from django.conf import settings


class GeminiUnavailable(Exception):
    pass


def generate_with_gemini(*, system, contents):
    if not settings.GEMINI_API_KEY or not settings.GEMINI_MODEL:
        raise GeminiUnavailable('provider_not_configured')
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
        raise GeminiUnavailable('timeout') from exc
    except requests.RequestException as exc:
        raise GeminiUnavailable('network_error') from exc
    if response.status_code != 200:
        raise GeminiUnavailable('upstream_error')
    try:
        data = response.json()
        text = data['candidates'][0]['content']['parts'][0]['text'].strip()
    except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
        raise GeminiUnavailable('invalid_response') from exc
    if not text:
        raise GeminiUnavailable('empty_response')
    return text[:settings.GEMINI_MAX_RESPONSE_CHARS]
