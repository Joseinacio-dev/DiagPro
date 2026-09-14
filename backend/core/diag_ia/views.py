from rest_framework.response import Response
from rest_framework.status import HTTP_200_OK, HTTP_503_SERVICE_UNAVAILABLE
from rest_framework.views import APIView

from devicecheck_backend.observability import logger
from .gemini_service import GeminiUnavailable
from .serializers import DiagIaChatSerializer
from .service import generate_diag_ia_response


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
