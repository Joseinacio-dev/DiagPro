# Changelog

Este arquivo registra marcos relevantes. O histórico detalhado permanece no Git.

## Em desenvolvimento

- documentação oficial e viva do produto;
- status consolidado por funcionalidade;
- guias de setup, deploy, testes e troubleshooting.
- atendimento de tickets no Django Admin com campos protegidos e sem exclusão;
- e-mail de recuperação de senha em texto e HTML, pronto para configuração SMTP de produção.

## Beta 0.1.0

### Segurança e produção

- endurecimento de settings, HTTPS, proxy, CORS, logs e throttling;
- healthcheck com banco e tratamento seguro de indisponibilidade;
- JWT, refresh e sessão protegida via Electron `safeStorage`.

### Autenticação

- login com Google OAuth;
- recuperação de senha com token Django, validade de 30 minutos e página estática;
- gerador de senha e fluxo de logout.

### Diagnóstico

- Scanner Rápido, Completo e Personalizado;
- arquivos e persistência/configurações com cobertura explícita;
- risk score técnico e separação entre ameaças confirmadas e achados;
- persistência de diagnósticos, relatórios, clientes e visão gerencial.

### Dispositivos e ações

- assistente de conexão ADB e estados de autorização;
- listagem e detalhes de apps reais;
- remoção segura restrita a app de usuário;
- diagnósticos de bateria, limpeza, otimização e backup.

### IA e suporte

- Diag IA integrada ao Gemini;
- retry, modelo fallback e fallback local;
- contexto sanitizado e proteção contra prompt injection;
- tickets persistidos com isolamento por usuário e atendimento staff.

### Comercial e distribuição

- planos, licenças e integração Checkout Pro/webhook;
- instalador beta NSIS x64 com ADB embarcado.
