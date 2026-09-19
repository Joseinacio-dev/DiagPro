# Deploy de produção

## Plataforma atual

O backend Django é publicado no Render com Gunicorn e PostgreSQL. O serviço público expõe `/health/` para readiness.

## Build

O processo precisa executar, nesta ordem lógica:

```text
pip install -r requirements.txt
python manage.py collectstatic --noinput
python manage.py migrate
```

Depois o serviço inicia com `gunicorn devicecheck_backend.wsgi:application`.

No deploy validado em setembro de 2026, o Render aplicou `core.0011_supportticket`, coletou os estáticos e iniciou o serviço com sucesso. Sempre confirme novamente nos logs do deploy ativo.

## Variáveis de ambiente

Configure valores apenas no provedor. Os nomes relevantes incluem:

- `DATABASE_URL`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`;
- `DJANGO_CORS_ALLOWED_ORIGINS`, `DJANGO_CSRF_TRUSTED_ORIGINS`;
- `DJANGO_THROTTLE_CACHE_URL` e limites `DJANGO_THROTTLE_*`;
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`;
- `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`;
- `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` e URLs `MERCADO_PAGO_*`;
- `DIAGPRO_PASSWORD_RESET_ENABLED`, `DIAGPRO_PUBLIC_URL` e `EMAIL_*`.

Nunca documente nem imprima os valores reais.

### SMTP e recuperação de senha

Para ativar a recuperação em produção, configure no provedor:

- `DIAGPRO_PASSWORD_RESET_ENABLED=true`;
- `DIAGPRO_PUBLIC_URL` com a origem HTTPS pública do backend, sem caminho, query ou credenciais;
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` e `DEFAULT_FROM_EMAIL`;
- exatamente um entre `EMAIL_USE_TLS=true` e `EMAIL_USE_SSL=true`.

Use as informações oficiais do provedor SMTP escolhido. Não copie credenciais para arquivos versionados. Depois de salvar as variáveis, faça um novo deploy e valide o fluxo com uma conta de teste e uma caixa postal controlada. Configurações inválidas de URL ou de TLS/SSL impedem a inicialização de produção de forma segura.

## Validação

1. confirmar o SHA implantado;
2. conferir `collectstatic` e migrations nos logs;
3. testar `GET /health/` e esperar HTTP 200 com `{"status":"ok"}`;
4. confirmar que endpoints autenticados retornam 401 sem JWT, não 404;
5. executar smoke de login com conta de teste autorizada, sem repetir tentativas em conta real;
6. revisar logs sanitizados.

## Rollback

Rollback deve selecionar um deploy anterior conhecido e compatível com o schema. Antes de reverter código, avaliar migrations já aplicadas; não executar comandos destrutivos no banco e não apagar dados para acomodar uma versão antiga.

## Limitações operacionais

- instâncias gratuitas podem sofrer cold start;
- password reset está funcional no código, mas permanece desativado enquanto SMTP de produção não estiver configurado e validado;
- pagamentos ficam indisponíveis de forma segura enquanto as variáveis do Mercado Pago não estiverem configuradas;
- mudanças de ambiente devem ser feitas conscientemente no painel e gerar nova validação.
