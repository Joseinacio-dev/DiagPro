from rest_framework import mixins, serializers, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from .models import SupportTicket
from .throttling import ProtectedLoginRateThrottle


class TicketThrottle(ProtectedLoginRateThrottle):
    scope = 'support_ticket'


class TicketPagination(PageNumberPagination):
    page_size = 20


class TicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportTicket
        fields = ['id', 'subject', 'description', 'status', 'staff_response', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, attrs):
        if self.instance is None and ('status' in attrs or 'staff_response' in attrs):
            raise serializers.ValidationError('O chamado inicia aberto e sem resposta administrativa.')
        return attrs


class TicketUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportTicket
        fields = ['status', 'staff_response']


class SupportTicketViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin,
                           mixins.UpdateModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated]
    throttle_classes = [TicketThrottle]
    pagination_class = TicketPagination
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        queryset = SupportTicket.objects.all()
        if not (self.request.user.is_staff or self.request.user.is_superuser):
            queryset = queryset.filter(user=self.request.user)
        return queryset

    def get_serializer_class(self):
        return TicketUpdateSerializer if self.action == 'partial_update' else TicketSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, status=SupportTicket.Status.OPEN, staff_response='')

    def partial_update(self, request, *args, **kwargs):
        if not (request.user.is_staff or request.user.is_superuser):
            raise PermissionDenied('Somente a equipe pode atualizar o atendimento.')
        return super().partial_update(request, *args, **kwargs)
