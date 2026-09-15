from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.status import HTTP_200_OK, HTTP_503_SERVICE_UNAVAILABLE
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.views import APIView

from devicecheck_backend.observability import logger
from .gemini_service import GeminiUnavailable, gemini_configuration_status, generate_with_gemini_result
from .serializers import DiagIaChatSerializer
from .service import generate_diag_ia_response


class IsStaffOrSuperuser(BasePermission):
    """Restringe diagnósticos operacionais a administradores autenticados."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_staff or user.is_superuser))


def _provider_health_payload(
    *, success, configured, primary_model, fallback_model, model_used,
    primary_status, primary_code, fallback_status, fallback_code,
    fallback_model_used, provider_code, error_class, duration_ms, attempts,
):
    return {
        'provider': 'gemini',
        'configured': configured,
        'primary_model': primary_model,
        'fallback_model': fallback_model,
        'success': success,
        'model_used': model_used,
        'primary_status': primary_status,
        'primary_code': primary_code,
        'fallback_status': fallback_status,
        'fallback_code': fallback_code,
        'fallback_model_used': fallback_model_used,
        'provider_code': provider_code,
        'error_class': error_class,
        'duration_ms': max(0, min(int(duration_ms), 300_000)),
        'attempts': max(1, min(int(attempts), 3)),
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
                'provider_attempt': exc.attempts, 'provider_retry': False,
                'fallback_model_used': exc.fallback_model_used, 'final_provider': 'local',
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
        try:
            # A resposta é intencionalmente descartada: este endpoint expõe apenas
            # metadados operacionais previamente sanitizados.
            result = generate_with_gemini_result(
                system='Execute somente o teste de conectividade solicitado.',
                contents=[{'role': 'user', 'parts': [{'text': 'Responda apenas: OK'}]}],
            )
        except GeminiUnavailable as exc:
            payload = _provider_health_payload(
                success=False,
                configured=configured,
                primary_model=configuration['model'],
                fallback_model=configuration['fallback_model'],
                model_used=None,
                primary_status=exc.primary_status,
                primary_code=exc.primary_code,
                fallback_status=exc.fallback_status,
                fallback_code=exc.fallback_code,
                fallback_model_used=exc.fallback_model_used,
                provider_code=exc.provider_error,
                error_class=type(exc).__name__,
                duration_ms=exc.duration_ms,
                attempts=exc.attempts,
            )
            logger.warning('diag_ia_provider_health_failed', extra={
                'error_type': type(exc).__name__, 'provider': exc.provider,
                'provider_status': exc.provider_status, 'provider_error': exc.provider_error,
                'request_duration_ms': exc.duration_ms, 'provider_model': exc.model,
                'provider_timeout': exc.timed_out,
                'provider_attempt': exc.attempts, 'provider_retry': False,
                'fallback_model_used': exc.fallback_model_used, 'final_provider': 'unavailable',
            })
            return Response(payload, status=HTTP_200_OK)

        payload = _provider_health_payload(
            success=True,
            configured=configured,
            primary_model=configuration['model'],
            fallback_model=configuration['fallback_model'],
            model_used=result.model_used,
            primary_status=result.primary_status,
            primary_code=result.primary_code,
            fallback_status=result.fallback_status,
            fallback_code=result.fallback_code,
            fallback_model_used=result.fallback_model_used,
            provider_code='OK',
            error_class=None,
            duration_ms=result.duration_ms,
            attempts=result.attempts,
        )
        logger.info('diag_ia_provider_health_success', extra={
            'provider': 'Gemini', 'provider_status': 200,
            'provider_error': 'OK', 'request_duration_ms': result.duration_ms,
            'provider_model': result.model_used, 'provider_timeout': False,
            'provider_attempt': result.attempts, 'provider_retry': False,
            'fallback_model_used': result.fallback_model_used, 'final_provider': 'gemini',
        })
        return Response(payload, status=HTTP_200_OK)
