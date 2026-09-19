from django.contrib import admin
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase
from django.urls import reverse

from .admin import SupportTicketAdmin
from .models import SupportTicket


class SupportTicketAdminTests(TestCase):
    def setUp(self):
        users = get_user_model()
        self.customer = users.objects.create_user('customer-admin-test', email='customer@example.test')
        self.common = users.objects.create_user('common-admin-test')
        self.staff = users.objects.create_user('staff-admin-test', is_staff=True)
        self.superuser = users.objects.create_superuser(
            'super-admin-test', email='admin@example.test', password=None,
        )
        permissions = Permission.objects.filter(
            content_type__app_label='core',
            codename__in=('view_supportticket', 'change_supportticket'),
        )
        self.staff.user_permissions.add(*permissions)
        self.ticket = SupportTicket.objects.create(
            user=self.customer,
            subject='Falha de conexão',
            description='Descrição de teste do chamado.',
        )
        self.changelist_url = reverse('admin:core_supportticket_changelist')
        self.change_url = reverse('admin:core_supportticket_change', args=[self.ticket.pk])
        self.delete_url = reverse('admin:core_supportticket_delete', args=[self.ticket.pk])

    def test_registered_with_safe_configuration(self):
        self.assertTrue(admin.site.is_registered(SupportTicket))
        model_admin = admin.site._registry[SupportTicket]
        self.assertIsInstance(model_admin, SupportTicketAdmin)
        self.assertEqual(
            model_admin.list_display,
            ('id', 'user', 'subject', 'status', 'created_at', 'updated_at'),
        )
        self.assertEqual(model_admin.list_filter, ('status', 'created_at', 'updated_at'))
        self.assertEqual(
            model_admin.search_fields,
            ('=id', 'user__username', 'user__email', 'subject'),
        )
        self.assertIn('description', model_admin.readonly_fields)

    def test_authorized_staff_and_superuser_can_view(self):
        for user in (self.staff, self.superuser):
            with self.subTest(user=user.username):
                self.client.force_login(user)
                self.assertEqual(self.client.get(self.changelist_url).status_code, 200)
                self.assertEqual(self.client.get(self.change_url).status_code, 200)
                self.client.logout()

    def test_common_user_cannot_access_admin(self):
        self.client.force_login(self.common)
        self.assertNotEqual(self.client.get(self.changelist_url).status_code, 200)
        self.assertNotEqual(self.client.get(self.change_url).status_code, 200)

    def test_filter_search_and_status_update(self):
        self.client.force_login(self.staff)
        self.assertContains(self.client.get(f'{self.changelist_url}?status__exact=OPEN'), self.ticket.subject)
        self.assertContains(self.client.get(f'{self.changelist_url}?q={self.ticket.pk}'), self.ticket.subject)
        response = self.client.post(self.change_url, {
            'status': SupportTicket.Status.IN_PROGRESS,
            'staff_response': 'Chamado em análise.',
            '_save': 'Salvar',
        })
        self.assertEqual(response.status_code, 302)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, SupportTicket.Status.IN_PROGRESS)
        self.assertEqual(self.ticket.staff_response, 'Chamado em análise.')

    def test_add_and_delete_are_disabled_and_history_is_preserved(self):
        self.client.force_login(self.superuser)
        model_admin = admin.site._registry[SupportTicket]
        request = self.client.get(self.change_url).wsgi_request
        request.user = self.superuser
        self.assertFalse(model_admin.has_add_permission(request))
        self.assertFalse(model_admin.has_delete_permission(request, self.ticket))
        self.assertEqual(self.client.post(self.delete_url, {'post': 'yes'}).status_code, 403)
        self.assertTrue(SupportTicket.objects.filter(pk=self.ticket.pk).exists())
