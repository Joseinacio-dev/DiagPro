from rest_framework import serializers


class DiagIaHistoryItemSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=('user', 'assistant'))
    content = serializers.CharField(max_length=1200, trim_whitespace=True)


class DiagIaChatSerializer(serializers.Serializer):
    message = serializers.CharField(min_length=1, max_length=1000, trim_whitespace=True)
    history = DiagIaHistoryItemSerializer(many=True, required=False, default=list, max_length=10)
    context = serializers.DictField(required=False, default=dict)
