"""SimpleJWT-compatible views with explicit abuse protection."""
from django.db import DatabaseError
from django.contrib.auth import get_user_model
from django.utils.crypto import constant_time_compare
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.utils import get_md5_hash_password
from rest_framework import status
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from devicecheck_backend.observability import logger

from .throttling import LoginAccountRateThrottle, LoginIPRateThrottle, RefreshIPRateThrottle


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [LoginIPRateThrottle, LoginAccountRateThrottle]

    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except DatabaseError as exc:
            logger.error(
                'database_failure',
                exc_info=True,
                extra={'error_type': type(exc).__name__, 'status_code': 503},
            )
            return Response(
                {'detail': 'Serviço de autenticação temporariamente indisponível.'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class PasswordAwareRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        token = self.token_class(attrs['refresh'])
        try:
            user = get_user_model().objects.get(**{api_settings.USER_ID_FIELD: token.get(api_settings.USER_ID_CLAIM)})
        except (get_user_model().DoesNotExist, ValueError, TypeError):
            raise AuthenticationFailed('Sessão inválida. Entre novamente.') from None
        if not user.is_active or (api_settings.CHECK_REVOKE_TOKEN and not constant_time_compare(
            token.get(api_settings.REVOKE_TOKEN_CLAIM, ''), get_md5_hash_password(user.password)
        )):
            raise AuthenticationFailed('Sessão expirada. Entre novamente.')
        return super().validate(attrs)


class ThrottledTokenRefreshView(TokenRefreshView):
    serializer_class = PasswordAwareRefreshSerializer
    throttle_classes = [RefreshIPRateThrottle]

    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except DatabaseError as exc:
            logger.error('database_failure', extra={'error_type': type(exc).__name__, 'status_code': 503})
            return Response({'detail': 'Serviço de autenticação temporariamente indisponível.'}, status=503)
