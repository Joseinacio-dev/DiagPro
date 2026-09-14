from django.core.management.base import BaseCommand

from core.diag_ia.gemini_service import GeminiUnavailable, gemini_configuration_status, generate_with_gemini


class Command(BaseCommand):
    help = 'Verifica a configuração Gemini sem revelar a chave; --live executa uma chamada mínima.'

    def add_arguments(self, parser):
        parser.add_argument('--live', action='store_true', help='Executa uma única chamada curta e sem dados de usuário.')

    def handle(self, *args, **options):
        status = gemini_configuration_status()
        self.stdout.write(f"GEMINI_API_KEY_PRESENT={'true' if status['api_key_present'] else 'false'}")
        self.stdout.write(f"GEMINI_MODEL={status['model'] or 'NOT_CONFIGURED'}")
        if not options['live']:
            return
        try:
            generate_with_gemini(
                system='Responda de forma exata e curta.',
                contents=[{'role': 'user', 'parts': [{'text': 'Responda apenas: OK'}]}],
            )
        except GeminiUnavailable as exc:
            provider_status = exc.provider_status if exc.provider_status is not None else 'NONE'
            self.stdout.write(
                f'GEMINI_REAL_TEST=FAIL provider_status={provider_status} '
                f'provider_error={exc.provider_error} error_type={type(exc).__name__} '
                f'duration_ms={exc.duration_ms} timeout={str(exc.timed_out).lower()}'
            )
            return
        self.stdout.write('GEMINI_REAL_TEST=SUCCESS')
