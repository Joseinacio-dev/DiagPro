from time import monotonic

from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.status import HTTP_200_OK, HTTP_503_SERVICE_UNAVAILABLE
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.views import APIView

from devicecheck_backend.observability import logger
from .gemini_service import GeminiUnavailable, gemini_configuration_status, generate_with_gemini
from .serializers import DiagIaChatSerializer
from .service import generate_diag_ia_response


class IsStaffOrSuperuser(BasePermission):
    """Restringe diagnósticos operacionais a administradores autenticados."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


def _provider_health_payload(*, success, configured, model, provider_status, provider_code, error_class, duration_ms):
    return {
        'provider': 'gemini',
        'configured': configured,
        'model': model,
        'success': success,
        'provider_status': provider_status,
        'provider_code': provider_code,
        'error_class': error_class,
        'duration_ms': max(0, min(int(duration_ms), 300_000)),
    }


class DiagIaChatView(APIView):
    throttle_scope = 'diag_ia'

    def post(self, request):
        serializer = DiagIaChatSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = generate_diag_ia_response(**serializer.validated_data)
        except GeminiUnavailable as exc:
            logger.warning('diag_ia_failed', extra={
                'error_type': type(exc).__name__, 'status_code': 503,
                'provider': exc.provider, 'provider_status': exc.provider_status,
                'provider_error': exc.provider_error, 'request_duration_ms': exc.duration_ms,
                'provider_model': exc.model, 'provider_timeout': exc.timed_out,
            })
            return Response({'detail': 'Diag IA online temporariamente indisponível.', 'code': 'diag_ia_unavailable'}, status=HTTP_503_SERVICE_UNAVAILABLE)
        logger.info('diag_ia_success', extra={'status_code': 200})
        return Response(result, status=HTTP_200_OK)


class DiagIaProviderHealthView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsStaffOrSuperuser]
    throttle_scope = 'diag_ia_provider_health'

    def get(self, request):
        configuration = gemini_configuration_status()
        configured = configuration['api_key_present'] and bool(configuration['model'])
        started = monotonic()
        try:
            # A resposta é intencionalmente descartada: este endpoint expõe apenas
            # metadados operacionais previamente sanitizados.
            generate_with_gemini(
                system='Execute somente o teste de conectividade solicitado.',
                contents=[{'role': 'user', 'parts': [{'text': 'Responda apenas: OK'}]}],
            )
        except GeminiUnavailable as exc:
            payload = _provider_health_payload(
                success=False,
                configured=configured,
                model=configuration['model'],
                provider_status=exc.provider_status,
                provider_code=exc.provider_error,
                error_class=type(exc).__name__,
                duration_ms=exc.duration_ms,
            )
            logger.warning('diag_ia_provider_health_failed', extra={
                'error_type': type(exc).__name__, 'provider': exc.provider,
                'provider_status': exc.provider_status, 'provider_error': exc.provider_error,
                'request_duration_ms': exc.duration_ms, 'provider_model': exc.model,
                'provider_timeout': exc.timed_out,
            })
            return Response(payload, status=HTTP_200_OK)

        duration_ms = round((monotonic() - started) * 1000)
        payload = _provider_health_payload(
            success=True,
            configured=configured,
            model=configuration['model'],
            provider_status=200,
            provider_code='OK',
            error_class=None,
            duration_ms=duration_ms,
        )
        logger.info('diag_ia_provider_health_success', extra={
            'provider': 'Gemini', 'provider_status': 200,
            'provider_error': 'OK', 'request_duration_ms': duration_ms,
            'provider_model': configuration['model'], 'provider_timeout': False,
        })
        return Response(payload, status=HTTP_200_OK)
