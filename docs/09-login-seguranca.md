# Login e segurança

## Autenticação

O backend usa JWT com access e refresh token. Login por usuário/senha e Google OAuth terminam no mesmo contrato de sessão. Endpoints protegidos usam o usuário autenticado, não um identificador de proprietário enviado pelo desktop.

## Sessão no desktop

- access token permanece em memória;
- com **Lembrar-me**, o refresh token é persistido pelo Electron usando `safeStorage`/DPAPI quando disponível;
- sem **Lembrar-me**, a sessão não é restaurada depois de fechar o aplicativo;
- dados legados de autenticação no `localStorage` são migrados e removidos;
- senha nunca é salva pelo DiagPro;
- logout apaga a sessão persistente do aplicativo.

## Google OAuth

O fluxo usa backend, state, nonce, PKCE e troca protegida. Client secret fica somente no servidor. O desktop não recebe a chave do provedor.

## Recuperação de senha

Rotas atuais:

- `POST /api/auth/password/reset/` solicita recuperação com resposta genérica;
- `POST /api/auth/password/reset/confirm/` valida UID, token e nova senha;
- `GET /api/auth/password/reset/page/` fornece a página estática do fluxo.

O token padrão do Django é temporário, de uso único após a troca e expira em 30 minutos. Ao definir uma nova senha, refresh tokens anteriores tornam-se inválidos pelo mecanismo de revogação associado à senha.

O link mantém o token no fragmento `#` da URL, evitando envio no primeiro request HTTP. O e-mail possui versões texto e HTML, usa o assunto `Redefinição de senha — DiagPro`, informa a validade e orienta ignorar a mensagem quando a solicitação não foi feita pelo destinatário.

O fluxo está funcional no código e permanece desativado até configurar e testar SMTP em produção. `DIAGPRO_PUBLIC_URL` deve conter somente a origem HTTPS pública do backend. O transporte exige exatamente um modo seguro: TLS ou SSL. Falhas do provedor são registradas de forma sanitizada e não alteram a resposta neutra enviada ao solicitante.

## Gerador de senha

A interface pode ajudar a criar uma senha forte, mas a senha continua sob controle do usuário e não deve ser registrada em log, arquivo ou telemetria.

## Throttling

Há cotas específicas para login por IP e conta, refresh, Google OAuth, recuperação de senha, endpoints gerais e integrações. Produção exige cache compartilhado; falhas previsíveis são tratadas sem expor URLs ou credenciais.

## Princípios

- nunca registrar senha, JWT, cookie, chave ou URL com credenciais;
- respostas de erro não retornam traceback;
- CORS, CSRF, hosts e proxy HTTPS são configurados explicitamente;
- webhook público não usa JWT, mas exige assinatura HMAC válida;
- testes de login em produção devem usar conta autorizada ou credenciais fictícias únicas, evitando bloquear conta real.
