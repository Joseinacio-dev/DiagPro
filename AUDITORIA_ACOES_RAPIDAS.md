# Auditoria das Ações Rápidas — DiagPro desktop

Data: 13/09/2026. Projeto: `C:\Users\Josei\devicecheck-pro`.

## Resultado e alcance

Auditoria do código, correções, testes automatizados e build concluídos. Validação física e revisão visual interativa no Electron permanecem pendentes: o ADB distribuído com o projeto retornou `List of devices attached` sem nenhum aparelho. Nenhuma desinstalação foi executada em dispositivo real.

O estado anterior é o conteúdo encontrado no diretório de trabalho, que já possuía várias alterações e arquivos não rastreados. Não se confunde com o último commit. Alterações anteriores foram preservadas; não houve commit ou push. OAuth, pagamentos, licenças, backend comercial e Diag IA não foram editados nesta auditoria.

## Estado por ação

| AÇÃO | ESTADO ANTES | ESTADO DEPOIS | O QUE FAZ DE VERDADE | LIMITAÇÕES |
|---|---|---|---|---|
| Limpeza Profunda | Cartão com nome de operação; painel já era preview e execução já estava desabilitada. | Cartão informa “Só consulta; limpeza indisponível”; exclusão continua bloqueada. | Consulta espaço em `/data`, cache agregado do Android e presença de `trim-caches` na ajuda do Package Manager. | Cache é um snapshot, não uma estimativa garantida de espaço recuperável. O Android oferece limpeza global de cache, mas este fluxo não tem seleção/preview validado dos itens afetados. Não foram habilitados `rm`, `pm clear` nem limpeza global automática. |
| Otimização do Sistema | Nome sugeria otimização; serviço somente consultava dados. | Cartão informa “Somente diagnóstico”; painel explicita que não executa otimização. | Consulta armazenamento, RAM e amostra agregada de CPU; permite seguir para Gerenciar Apps. | Não encerra processos, não altera animações/configurações e não promete ganho de desempenho. Não há uma otimização genérica validada para todos os Android/fabricantes. |
| Verificação de Bateria | Consulta real de bateria mais dump amplo de estatísticas desde a carga. | Consulta real restrita ao estado atual; removida coleta desnecessária do histórico. | Lê carga, estado de carregamento, condição reportada pelo Android, temperatura e tensão via `dumpsys battery`. | Não mede capacidade real restante, desgaste ou autonomia. Dados ausentes são indisponíveis. `UPDATES STOPPED` não é apresentado como leitura física. |
| Gerenciar Apps | Listagem real e remoção com preview/token; listagem sem usuário explícito e lacuna na verificação de ausência. | Listagem limitada ao usuário atual, revalidação de perfil, erros rejeitados, administração validada e sucesso condicionado à comprovação da remoção. | Lista pacotes, filtra/exibe detalhes básicos e desinstala um app de usuário após confirmação. Executa `pm uninstall --user ID PACOTE` e verifica a ausência. | Desinstalação pode perder dados locais; aviso explícito. Apps de sistema e administradores ativos bloqueados. Administração ilegível, troca de perfil, erros ou consultas divergentes impedem conclusão de sucesso. Permissões e políticas do fabricante podem impedir a remoção. |
| Backup de Dados | Somente diagnóstico de capacidade; botão de criação desabilitado, título “capacidade disponível”. | Cartão e título informam criação indisponível. | Consulta API do Android, versão e ajuda do ADB local. Não cria arquivo nem copia conteúdo do telefone. | Presença de `backup`/`pull` não comprova acesso, integridade ou restauração. Backup integral de apps não é universal no Android moderno. Cópia seletiva de arquivos compartilhados pode ser possível em outro fluxo, mas não foi implementada nem apresentada como backup completo. |

## Rastreamento UI → preload/IPC → main → ADB → UI

### Limpeza, otimização, bateria e backup

1. `src/pages/DashboardPage.jsx`: cartões selecionam `cleanup`, `optimization`, `battery` ou `backup`. Dispositivo desconectado ou scan em execução desabilitam os cartões.
2. `src/components/QuickActionPanel.jsx`: abre diálogo, apresenta carregamento e chama `window.diagpro.inspectQuickAction({serial, action})`. Confere serial/ação da resposta e descarta respostas de efeito encerrado. Erros não viram leitura válida.
3. `preload.js`: expõe somente argumentos previstos e invoca `inspect-quick-action`.
4. `main.js`: `trustedIpcHandler` verifica origem, janela e frame principal. O handler adquire exclusão por dispositivo, transmite cancelamento e libera a operação em `finally`.
5. `adb/maintenanceService.js`: valida ação/serial, consulta o estado ADB antes e depois, executa somente comandos previstos, distingue informação ausente, parcial e indisponível. `canExecute: false` permanece explícito para operações de manutenção.
6. `adb/adbClient.js`: executa binário com argumentos separados, serial explícito nos comandos do aparelho, timeout e limite de saída.
7. O painel mostra somente campos extraídos e notas de limitação; não anuncia limpeza, otimização ou backup executados.

### Gerenciar Apps

1. Dashboard navega para `Dispositivos`; `src/App.jsx` entrega o aparelho atual a `DevicesPage`.
2. `DevicesPage.jsx` chama `getInstalledApps`; preload encaminha para `get-installed-apps`.
3. `main.js` protege a origem e a operação do dispositivo e chama `listarAppsInstalados` com `currentUserOnly: true`.
4. `deviceDetector.js` valida a conexão; `security/collectors/packageCollector.js` identifica o usuário e lista pacotes de usuário/sistema com `--user ID`. Rejeita saídas não reconhecidas e verifica se o usuário mudou.
5. “Remover” chama `getRemovalPreview` → `get-removal-preview` → `obterPreviewRemocao` → `remediationService.createRemovalPreview`. Valida pacote, tipo, usuário e administração; emite token contextual com expiração.
6. Somente “Confirmar remoção” chama `uninstallUserApp` → `uninstall-user-app` → `desinstalarAppUsuario` → executor/serviço de remediação. Token é consumido, elegibilidade revalidada e `pm uninstall --user` executado.
7. `verifyPackageAbsent` consulta novamente o mesmo usuário/pacote; saída inválida ou divergência da listagem resulta em verificação inconclusiva. O executor só retorna `ok: true` quando a ausência foi verificada. A UI também exige `verification.status === 'verified'` e `installed === false`.

## Falhas corrigidas

- Rótulos dos cartões não distinguiam claramente operações indisponíveis de consultas disponíveis.
- Listagem do gerenciador não especificava usuário Android, embora a remoção usasse um usuário determinado.
- Saídas de erro com processo encerrado sem erro podiam virar lista vazia ou ausência de pacote. Agora a sintaxe da listagem é verificada e a ausência é confrontada com a outra consulta.
- Uma saída contendo uma linha `Success` junto de falha podia ser aceita na desinstalação. Agora exige resposta exata `Success`, seguida da verificação independente.
- Administração indisponível podia permitir abrir preview. Agora bloqueia; parser também não trata saída vazia/desconhecida como ausência confirmada de administradores.
- A UI confiava apenas em `ok`; agora exige comprovação de ausência, evita feedback atrasado de outro aparelho e fecha o preview consumido para exigir novo token em uma próxima tentativa.
- O impacto da remoção estava em `preview.preview.impact`, mas a interface buscava no nível incorreto. Exibição corrigida e aviso explícito de possível perda dos dados do app.
- A consulta rápida da bateria coletava estatísticas amplas de uso desnecessárias. Essa coleta foi removida.

## Arquivos alterados nesta auditoria

Todos os caminhos abaixo são relativos a `C:\Users\Josei\devicecheck-pro\desktop`:

| Arquivo | Mudança |
|---|---|
| `src/pages/DashboardPage.jsx` | Estados reais nos cartões. |
| `src/components/QuickActionPanel.jsx` | Título de backup e esclarecimento de consulta. |
| `src/pages/DevicesPage.jsx` | Confirmação, impacto, validação de sucesso e retorno após mudança de dispositivo. |
| `main.js` | Listagem do gerenciador restrita ao usuário atual. |
| `adb/maintenanceService.js` | Remoção do dump amplo de estatísticas de bateria. |
| `adb/maintenanceService.test.js` | Testes ajustados à coleta mínima. |
| `security/collectors/packageCollector.js` | Opção de listagem por usuário com validação de saída e revalidação. Fluxos sem a opção preservam a listagem anterior. |
| `security/parsers/securityParsers.js` | Administração desconhecida/negada não equivale a ausência. |
| `remediation/remediationService.js` | Usuário explícito, administração obrigatória e verificação rigorosa. |
| `quickActions.audit.test.js` | 24 novos testes de integração e regressão. |
| `package.json` | Inclui a auditoria em `npm test`. |

`preload.js`, `deviceDetector.js`, `adbClient.js`, `scanCoordinator.js`, `remediationExecutor.js` e `src/App.jsx` foram inspecionados, mas não editados nesta tarefa. O build regenerou `desktop/dist`. Este relatório foi adicionado à raiz do projeto.

## Testes e build

- Antes: `npm test` — **274/274 aprovados**.
- Depois: `npm test` — **298/298 aprovados**, zero falhas, cancelamentos ou testes ignorados.
- **24 testes novos**: quatro ações atravessando preload real, handlers reais de main, serviço e cliente ADB com processo simulado; bloqueio de remetente não confiável; concorrência e liberação após erro; permissões; usuário e troca de perfil; saídas inválidas; inconsistência de ausência; administração desconhecida; resposta mista de sucesso/falha.
- Testes anteriores também cobrem tokens, expiração, cancelamento, desconexão, pacote de sistema, administração ativa, pacote ainda instalado, bateria simulada e comandos permitidos.
- `npm run build` — **aprovado**, Vite 8.2.1, 1.858 módulos transformados.
- O build realizado é o frontend do desktop; não foi gerado um novo instalador Windows.
- Os testes novos usam processo ADB simulado; não constituem teste físico, clique automatizado no Electron ou revisão visual interativa.

## Teste físico pendente

Todas as cinco ações precisam de validação no desktop conectado a um Android autorizado:

1. **Limpeza:** comparar armazenamento com o Android; confirmar cache parcial/indisponível em OEMs restritivos; confirmar que execução permanece desabilitada e nada é excluído.
2. **Otimização:** confirmar RAM/CPU quando suportadas, atualização e navegação ao gerenciador; nenhuma configuração/processo deve mudar.
3. **Bateria:** comparar carga, temperatura/tensão disponíveis e estado ao conectar/desconectar carregador. Testar dados ausentes sem produzir diagnóstico inventado.
4. **Apps:** listar perfil atual e trocar de perfil; verificar rejeição de sistema/admin; confirmar e cancelar previews; usar exclusivamente um app descartável e autorizado para testar remoção, ausência, recusa por política e desconexão. Nunca usar app com dados importantes para esse teste.
5. **Backup:** confirmar versão/API/limitações e botão de criação desabilitado; nenhum arquivo deve ser copiado.

Para todos: testar USB não autorizado, offline, desconexão durante consulta, reconexão, dois aparelhos, consulta durante scan e reabertura do painel. A principal limitação remanescente é a compatibilidade real de cada fabricante e versão Android, especialmente saída de `device_policy`, permissões do Package Manager e multiusuário.

## Referências de compatibilidade

- [Android Developers — restrições de adb backup no Android 12](https://developer.android.com/about/versions/12/behavior-changes-12#adb-backup-restrictions): apps com alvo API 31+ têm restrições de exportação de dados; não se deve prometer backup completo universal.
- [AOSP — PackageManagerShellCommand](https://android.googlesource.com/platform/frameworks/base/+/master/services/core/java/com/android/server/pm/PackageManagerShellCommand.java): `trim-caches` é limpeza orientada a uma meta de espaço livre. Sua existência não fornece uma lista exata de arquivos para preview deste fluxo.

Decisão de implementação: manter limpeza global, otimização automática e backup integral indisponíveis neste fluxo. Isso não afirma que toda limpeza ou toda cópia seja impossível no Android; delimita exatamente o que esta versão consegue executar com segurança e verificar.
