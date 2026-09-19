from datetime import timedelta
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.cache import caches
from django.test import override_settings
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken
from .password_reset import deliver_reset


@override_settings(DIAGPRO_PASSWORD_RESET_ENABLED=True, DIAGPRO_PUBLIC_URL='https://api.example.test',
                   EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', DEFAULT_FROM_EMAIL='support@example.test')
class PasswordResetTests(APITestCase):
    def setUp(self):
        caches['throttle'].clear()
        self.user = get_user_model().objects.create_user('reset-user', email='user@example.test', password='Old-pass-123!')
        self.url = '/api/auth/password/reset/confirm/'

    def payload(self):
        return {'uid': urlsafe_base64_encode(force_bytes(self.user.pk)),
                'token': default_token_generator.make_token(self.user),
                'new_password1': 'New-safe-fixture-pass-932!', 'new_password2': 'New-safe-fixture-pass-932!'}

    def test_request_is_generic_and_no_smtp_in_http_path(self):
        with patch('core.password_reset.enqueue_reset', return_value=True) as enqueue:
            known = self.client.post('/api/auth/password/reset/', {'email': self.user.email})
            unknown = self.client.post('/api/auth/password/reset/', {'email': 'unknown@example.test'})
        self.assertEqual(known.status_code, 202)
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(enqueue.call_count, 2)

    def test_mail_link_fragment_and_no_unknown_or_google_only_mail(self):
        deliver_reset(self.user.email)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0]
        self.assertEqual(message.subject, 'Redefinição de senha — DiagPro')
        self.assertIn('/page/#', message.body)
        self.assertIn('30 minutos', message.body)
        self.assertIn('Se você não solicitou esta alteração, ignore este e-mail.', message.body)
        self.assertEqual(len(message.alternatives), 1)
        html = message.alternatives[0].content
        self.assertEqual(message.alternatives[0].mimetype, 'text/html')
        self.assertIn('Redefinir senha', html)
        self.assertIn('/page/#', html)
        self.assertNotIn(self.user.password, message.body + html)
        self.user.set_unusable_password(); self.user.save()
        deliver_reset(self.user.email)
        deliver_reset('unknown@example.test')
        self.assertEqual(len(mail.outbox), 1)

    def test_reset_once_and_revokes_access(self):
        refresh = RefreshToken.for_user(self.user)
        old = str(refresh.access_token)
        payload = self.payload()
        self.assertEqual(self.client.post(self.url, payload).status_code, 200)
        self.assertEqual(self.client.post(self.url, payload).status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(payload['new_password1']))
        self.assertEqual(self.client.post('/api/token/refresh/', {'refresh': str(refresh)}).status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {old}')
        self.assertEqual(self.client.get('/api/me/').status_code, 401)

    def test_invalid_weak_mismatch_expired_and_inactive(self):
        payload = self.payload()
        for changes in ({'token': 'bad'}, {'uid': '../../bad'}, {'new_password1': '123', 'new_password2': '123'}, {'new_password2': 'mismatch'}):
            self.assertEqual(self.client.post(self.url, {**payload, **changes}).status_code, 400)
        with patch.object(default_token_generator, '_now', return_value=default_token_generator._now() + timedelta(hours=1)):
            self.assertEqual(self.client.post(self.url, payload).status_code, 400)
        self.user.is_active = False; self.user.save()
        self.assertEqual(self.client.post(self.url, payload).status_code, 400)

    def test_disabled_and_queue_full_are_safe(self):
        with override_settings(DIAGPRO_PASSWORD_RESET_ENABLED=False):
            self.assertEqual(self.client.post('/api/auth/password/reset/', {'email': self.user.email}).status_code, 503)
        with patch('core.password_reset.enqueue_reset', return_value=False):
            self.assertEqual(self.client.post('/api/auth/password/reset/', {'email': self.user.email}).status_code, 503)

    def test_page_has_no_token_and_security_headers(self):
        response = self.client.get('/api/auth/password/reset/page/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Referrer-Policy'], 'no-referrer')
        self.assertIn("frame-ancestors 'none'", response['Content-Security-Policy'])
        self.assertIn('no-store', response['Cache-Control'])

    def test_throttle(self):
        with patch('core.password_reset.enqueue_reset', return_value=True):
            responses = [self.client.post('/api/auth/password/reset/', {'email': self.user.email}) for _ in range(4)]
        self.assertEqual(responses[-1].status_code, 429)

    def test_delivery_logs_only_error_class(self):
        with patch('core.password_reset.send_mail', side_effect=OSError('private-smtp-secret')), self.assertLogs('diagpro.operations') as logs:
            deliver_reset(self.user.email)
        self.assertNotIn('private-smtp-secret', '\n'.join(logs.output))
        self.assertNotIn(self.user.email, '\n'.join(logs.output))
