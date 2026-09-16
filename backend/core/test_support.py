from django.contrib.auth import get_user_model
from django.core.cache import caches
from rest_framework.test import APITestCase
from .models import SupportTicket


class SupportTicketTests(APITestCase):
    url = '/api/support/tickets/'

    def setUp(self):
        caches['throttle'].clear()
        self.user = get_user_model().objects.create_user('customer')
        self.other = get_user_model().objects.create_user('other')
        self.staff = get_user_model().objects.create_user('staff', is_staff=True)

    def test_requires_auth(self):
        self.assertEqual(self.client.get(self.url).status_code, 401)
        self.assertEqual(self.client.post(self.url, {}).status_code, 401)

    def test_create_owner_and_isolation(self):
        self.client.force_authenticate(self.user)
        response = self.client.post(self.url, {'subject': 'Conexão', 'description': 'Preciso de ajuda', 'user': self.other.pk})
        self.assertEqual(response.status_code, 201)
        ticket = SupportTicket.objects.get(pk=response.data['id'])
        self.assertEqual(ticket.user, self.user)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.url).data['count'], 0)
        self.assertEqual(self.client.get(f'{self.url}{ticket.pk}/').status_code, 404)

    def test_only_staff_updates(self):
        ticket = SupportTicket.objects.create(user=self.user, subject='Test', description='Test')
        url = f'{self.url}{ticket.pk}/'
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.patch(url, {'status': 'RESOLVED'}).status_code, 403)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(self.url).data['count'], 1)
        self.assertEqual(self.client.patch(url, {'status': 'WAITING_CUSTOMER', 'staff_response': 'Pode informar o erro?'}).status_code, 200)
        self.assertEqual(self.client.delete(url).status_code, 405)

    def test_validation_and_no_forged_response(self):
        self.client.force_authenticate(self.user)
        for payload in ({}, {'subject': 'x', 'description': ''}, {'subject': 'x', 'description': 'x', 'status': 'CLOSED'}, {'subject': 'x', 'description': 'x', 'staff_response': 'fake'}, {'subject': 'x' * 161, 'description': 'x'}):
            self.assertEqual(self.client.post(self.url, payload).status_code, 400)
