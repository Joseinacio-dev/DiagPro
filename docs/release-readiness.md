# DiagPro — prontidão para lançamento

## Estado honesto das funcionalidades

- Scanner Android: implementado para modos Rápido, Completo e Personalizado. A cobertura distingue `COMPLETED`, `PARTIAL`, `UNAVAILABLE` e `FAILED`. Requer nova regressão física antes de distribuir o beta.
- Gerenciar Apps: listagem e detalhes reais via ADB; remoção apenas de app de usuário, com preview, token temporário e confirmação. Apps de sistema e pacotes críticos são bloqueados.
- Bateria: leitura ADB de estado atual. Corrente média, ciclos e capacidade só aparecem quando o fabricante expõe os arquivos sysfs consultados. Não calcula porcentagem de desgaste.
- Limpeza Profunda: diagnóstico somente. Não existe exclusão de arquivos nesta versão; duplicados confirmados ainda não estão implementados.
- Otimização: diagnóstico somente. Não encerra processos, não altera configurações e não promete ganho de desempenho.
- Backup: diagnóstico de capacidade somente. Cópia seletiva e destino removível ainda não estão implementados.
- Diag IA: backend Gemini com fallback externo e local. O cliente aguarda 25 segundos, acima do orçamento global de 20 segundos do backend.
- Recuperação de senha: arquitetura pronta, token padrão do Django de uso único e expiração de 30 minutos. Permanece desligada até SMTP ser configurado e validado.
- Lembrar-me: refresh token protegido pelo `safeStorage` do Electron/DPAPI no Windows; access token fica em memória. Sessões antigas em `localStorage` são migradas e removidas.
- Suporte: chamados autenticados persistidos; usuários acessam somente os próprios registros e staff pode atender todos.

## Configuração necessária para recuperação de senha

Configurar no ambiente do backend, sem gravar valores no repositório:

- `DIAGPRO_PASSWORD_RESET_ENABLED=true`
- `DIAGPRO_PUBLIC_URL=https://<origem-publica-do-backend>`
- `EMAIL_HOST`
- `EMAIL_PORT`
- `EMAIL_HOST_USER`
- `EMAIL_HOST_PASSWORD`
- `EMAIL_USE_TLS=true` e `EMAIL_USE_SSL=false`, ou a combinação inversa exigida pelo provedor
- `DEFAULT_FROM_EMAIL`

O e-mail contém o token no fragmento da URL (`#`), que não é enviado ao servidor no acesso inicial nem aparece em logs HTTP. O envio é assíncrono em memória; para volume comercial e garantia de entrega, migrar para fila durável com retentativas.

## Pagamentos e licença

O fluxo atual usa Mercado Pago Checkout Pro. A preferência é criada pelo backend, o webhook é validado e a API do provedor é consultada antes da reconciliação. Há idempotência, validação de valor/moeda/ambiente e ativação/revogação conforme estados mapeados.

Isso **não equivale a uma assinatura recorrente automática**. Não há integração de preapproval/assinatura recorrente nesta versão. A licença criada por um pagamento tem validade e bloqueia novos diagnósticos após expiração/cancelamento/pendência, mas renovação automática comercial ainda exige desenho de produto, contrato do provedor e testes sandbox específicos.

## Windows e instalador

- Alvo: Windows 10/11 x64, instalação por usuário e sem elevação.
- Electron traz seu próprio Chromium/Node; o cliente não precisa instalar Node, Python, Git, Django ou WebView.
- ADB oficial fica em `resources/platform-tools` e não depende do `PATH`.
- `.env`, testes, fixtures, logs, source maps, backend, venv e `node_modules` de desenvolvimento são excluídos do aplicativo.
- Atualização automática não está implementada. Não deve ser adicionada sem origem oficial fixa, manifesto assinado, HTTPS e validação de assinatura/hash.

### Bloqueador comercial: assinatura

O instalador ainda não possui assinatura Authenticode. Um beta controlado pode gerar aviso do SmartScreen, mas venda pública requer certificado de assinatura de código emitido para a empresa (OV ou EV, conforme estratégia de reputação), armazenamento protegido da chave e assinatura de executável/instalador com timestamp no pipeline. Nunca distribuir chave privada no repositório ou no aplicativo.

## iPhone/iOS

Há um contrato de provider com um `IOSBatteryProvider` explicitamente `not_implemented`; ele não simula detecção nem dados. No Windows, suporte real exigirá validar componentes oficiais Apple para USB/pairing ou avaliar `libimobiledevice` com análise de licença, redistribuição, manutenção e compatibilidade. Não baixar binários automaticamente nem declarar suporte antes de testes físicos de trust pairing, identificação, armazenamento e bateria.

## Privacidade

- Nenhuma senha, JWT, chave de API ou URL com credenciais deve aparecer em logs.
- Scanner e Diag IA enviam somente contexto técnico permitido; não enviam conteúdo de fotos, documentos ou backups.
- Chamados armazenam texto fornecido pelo usuário; a interface orienta a não inserir segredos ou dados pessoais.
- Futuro backup deve permanecer no destino escolhido pelo usuário e nunca ser enviado ao backend.

## Testes físicos ainda necessários

1. Android autorizado: três modos do Scanner, desconexão e cancelamento.
2. Listagem/detalhes de apps em Samsung, Xiaomi e Motorola; preview sem confirmar desinstalação.
3. Bateria em ao menos dois fabricantes, comparando com `dumpsys battery` e sysfs disponível.
4. Instalação limpa e desinstalação do beta em Windows 10 e Windows 11 x64.
5. Recuperação de senha com provedor SMTP de produção, entrega, spam, expiração e uso único.
