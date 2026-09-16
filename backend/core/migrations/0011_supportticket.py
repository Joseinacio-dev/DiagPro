from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('core', '0010_externalidentity'), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [migrations.CreateModel(
        name='SupportTicket',
        fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('subject', models.CharField(max_length=160)),
            ('description', models.TextField(max_length=5000)),
            ('status', models.CharField(choices=[('OPEN', 'Aberto'), ('IN_PROGRESS', 'Em atendimento'), ('WAITING_CUSTOMER', 'Aguardando cliente'), ('RESOLVED', 'Resolvido'), ('CLOSED', 'Fechado')], default='OPEN', max_length=24)),
            ('staff_response', models.TextField(blank=True, max_length=5000)),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('updated_at', models.DateTimeField(auto_now=True)),
            ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='support_tickets', to=settings.AUTH_USER_MODEL)),
        ],
        options={'ordering': ['-created_at', '-pk'], 'indexes': [models.Index(fields=['user', '-created_at'], name='support_owner_date_idx')]},
    )]
