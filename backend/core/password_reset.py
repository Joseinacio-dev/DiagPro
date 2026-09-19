"""Password recovery: Django tokens, bounded background delivery, no token in URL logs."""
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from smtplib import SMTPException
from threading import BoundedSemaphore

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.forms import PasswordResetForm, SetPasswordForm
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.db import DatabaseError, close_old_connections, transaction
from django.shortcuts import render
from django.template.loader import render_to_string
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .throttling import ProtectedLoginRateThrottle
from devicecheck_backend.observability import logger

_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix='password-mail')
_slots = BoundedSemaphore(20)
GENERIC = 'Se houver uma conta elegível, você receberá instruções por e-mail.'


class ResetIPThrottle(ProtectedLoginRateThrottle):
    scope = 'reset_ip'


class ResetEmailThrottle(ProtectedLoginRateThrottle):
    scope = 'reset_email'

    def get_cache_key(self, request, view):
        email = request.data.get('email', '') if isinstance(request.data, dict) else ''
        if not isinstance(email, str):
            return None
        digest = sha256(email.strip().casefold().encode()).hexdigest()
        return self.cache_format % {'scope': self.scope, 'ident': digest}


class ResetConfirmThrottle(ProtectedLoginRateThrottle):
    scope = 'reset_confirm'


def deliver_reset(email):
    """No request data in logs. Jobs are not durable across a worker restart."""
    close_old_connections()
    try:
        form = PasswordResetForm({'email': email})
        if not form.is_valid():
            return
        for user in form.get_users(email):
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            link = f'{settings.DIAGPRO_PUBLIC_URL}/api/auth/password/reset/page/#{uid}/{token}'
            context = {
                'reset_url': link,
                'validity_minutes': max(1, settings.PASSWORD_RESET_TIMEOUT // 60),
            }
            send_mail(
                'Redefinição de senha — DiagPro',
                render_to_string('core/email/password_reset.txt', context),
                settings.DEFAULT_FROM_EMAIL,
                [user.email],
                fail_silently=False,
                html_message=render_to_string('core/email/password_reset.html', context),
            )
    except (SMTPException, OSError, DatabaseError) as exc:
        logger.warning('password_reset_delivery_failed', extra={'error_type': type(exc).__name__})
    finally:
        close_old_connections()


def enqueue_reset(email):
    # Queue even unknown addresses; HTTP timing must not depend on account existence/SMTP.
    if not _slots.acquire(blocking=False):
        return False
    try:
        future = _pool.submit(deliver_reset, email)
        future.add_done_callback(lambda _future: _slots.release())
    except RuntimeError:
        _slots.release()
        return False
    return True


class ResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)


class ResetConfirmSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=64)
    token = serializers.CharField(max_length=128)
    new_password1 = serializers.CharField(max_length=256, trim_whitespace=False)
    new_password2 = serializers.CharField(max_length=256, trim_whitespace=False)


class PasswordResetRequestView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ResetIPThrottle, ResetEmailThrottle]

    def post(self, request):
        data = ResetRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if not settings.DIAGPRO_PASSWORD_RESET_ENABLED or not enqueue_reset(data.validated_data['email']):
            return Response({'detail': 'Recuperação temporariamente indisponível. Contate o suporte.'}, status=503)
        return Response({'detail': GENERIC}, status=202, headers={'Cache-Control': 'no-store'})


class PasswordResetConfirmView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [ResetConfirmThrottle]

    def post(self, request):
        data = ResetConfirmSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        invalid = {'detail': 'Link inválido, expirado ou já utilizado. Solicite outro.'}
        try:
            uid = force_str(urlsafe_base64_decode(values['uid']))
            if not uid.isdigit() or len(uid) > 20:
                return Response(invalid, status=400)
            with transaction.atomic():
                user = get_user_model().objects.select_for_update().get(pk=uid, is_active=True)
                if not user.has_usable_password() or not default_token_generator.check_token(user, values['token']):
                    return Response(invalid, status=400)
                form = SetPasswordForm(user, values)
                if not form.is_valid():
                    return Response({'detail': 'Revise a senha e a confirmação.', 'errors': dict(form.errors)}, status=400)
                form.save()
        except (ValueError, UnicodeDecodeError, OverflowError, get_user_model().DoesNotExist):
            return Response(invalid, status=400)
        except DatabaseError as exc:
            logger.error('database_failure', extra={'error_type': type(exc).__name__, 'status_code': 503})
            return Response({'detail': 'Serviço temporariamente indisponível.'}, status=503)
        return Response({'detail': 'Senha atualizada. Entre novamente no DiagPro.'}, headers={'Cache-Control': 'no-store'})


@never_cache
@require_GET
def reset_page(request):
    response = render(request, 'core/password_reset.html')
    response['Referrer-Policy'] = 'no-referrer'
    response['Content-Security-Policy'] = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    return response
