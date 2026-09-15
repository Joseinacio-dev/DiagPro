"""Eventos operacionais sem bodies, URLs, identificadores ou texto de exceções."""
from datetime import datetime, timezone
import json
import logging
import re

from django.db import DatabaseError


EVENTS = frozenset({
    'backend_started', 'database_failure', 'diagnostic_saved',
    'diagnostic_rejected', 'payment_failure', 'webhook_rejected',
    'webhook_not_processed', 'request_throttled', 'throttle_cache_failure',
    'google_auth_started', 'google_auth_success', 'google_auth_failed',
    'diag_ia_success', 'diag_ia_failed',
    'diag_ia_provider_health_success', 'diag_ia_provider_health_failed',
    'gemini_attempt_success', 'gemini_attempt_failed',
})
logger = logging.getLogger('diagpro.operations')
SAFE_ERROR_TYPE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,79}$')
SAFE_PROVIDER_ERROR = re.compile(r'^[A-Z][A-Z0-9_]{0,63}$')
SAFE_MODEL = re.compile(r'^[a-z0-9][a-z0-9._-]{0,79}$')


class SafeJsonFormatter(logging.Formatter):
    def format(self, record):
        event = record.msg if isinstance(record.msg, str) and record.msg in EVENTS else 'server_event'
        # Inclui falhas de banco reportadas pelo próprio Django. Nunca usa str(exc).
        if record.exc_info and isinstance(record.exc_info[1], DatabaseError):
            event = 'database_failure'
        result = {
            'timestamp': datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            'level': record.levelname,
            'event': event,
        }
        status = getattr(record, 'status_code', None)
        if type(status) is int and 100 <= status <= 599:
            result['status'] = status
        error_type = getattr(record, 'error_type', None)
        if isinstance(error_type, str) and SAFE_ERROR_TYPE.fullmatch(error_type):
            result['error_type'] = error_type
        if getattr(record, 'provider', None) == 'Gemini':
            result['provider'] = 'Gemini'
        provider_status = getattr(record, 'provider_status', None)
        if type(provider_status) is int and 100 <= provider_status <= 599:
            result['provider_status'] = provider_status
        provider_error = getattr(record, 'provider_error', None)
        if isinstance(provider_error, str) and SAFE_PROVIDER_ERROR.fullmatch(provider_error):
            result['provider_error'] = provider_error
        duration = getattr(record, 'request_duration_ms', None)
        if type(duration) is int and 0 <= duration <= 300_000:
            result['request_duration_ms'] = duration
        model = getattr(record, 'provider_model', None)
        if isinstance(model, str) and SAFE_MODEL.fullmatch(model):
            result['model'] = model
        if type(getattr(record, 'provider_timeout', None)) is bool:
            result['timeout'] = record.provider_timeout
        attempt = getattr(record, 'provider_attempt', None)
        if type(attempt) is int and 1 <= attempt <= 4:
            result['attempt'] = attempt
        if type(getattr(record, 'provider_retry', None)) is bool:
            result['retry'] = record.provider_retry
        if type(getattr(record, 'fallback_model_used', None)) is bool:
            result['fallback_model_used'] = record.fallback_model_used
        final_provider = getattr(record, 'final_provider', None)
        if final_provider in {'gemini', 'local', 'unavailable'}:
            result['final_provider'] = final_provider
        return json.dumps(result, ensure_ascii=True)


class OperationalEventsMiddleware:
    """Observa respostas; não altera autenticação, pagamento ou persistência."""
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        event = None
        if response.status_code == 429:
            event = 'request_throttled'
        elif request.method == 'POST':
            if request.path == '/api/diagnosticos/':
                if response.status_code == 201:
                    event = 'diagnostic_saved'
                elif response.status_code >= 400:
                    event = 'diagnostic_rejected'
            elif request.path == '/api/assinatura/checkout/' and response.status_code >= 400:
                event = 'payment_failure'
            elif request.path == '/api/pagamentos/mercadopago/webhook/':
                if response.status_code >= 400:
                    event = 'webhook_rejected'
                elif isinstance(getattr(response, 'data', None), dict) and response.data.get('processed') is False:
                    event = 'webhook_not_processed'
        if event:
            level = logging.WARNING if response.status_code >= 400 else logging.INFO
            logger.log(level, event, extra={'status_code': response.status_code})
        return response
