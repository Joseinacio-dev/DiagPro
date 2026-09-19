# Estado do produto

Esta é a fonte rápida e oficial do estado do DiagPro. “Teste físico” indica evidência em aparelhos reais, não apenas mocks.

| Funcionalidade | Estado | Teste automatizado | Teste físico | Observação |
|---|---|---:|---:|---|
| Login usuário/senha | FUNCIONAL | Sim | Sim | Backend online validado; sessão expira e renova. |
| Login Google | FUNCIONAL | Sim | Sim | OAuth pelo backend. |
| Lembrar-me/safeStorage | FUNCIONAL | Sim | Parcial | Refresh protegido no Windows quando disponível. |
| Recuperação de senha | PARCIAL | Sim | Não | Funcional no código; aguardando SMTP de produção. |
| Licenças e limites | FUNCIONAL | Sim | Sim | Backend é fonte de verdade. |
| Checkout Pro/webhook | PARCIAL | Sim | Parcial | Código funcional; produção depende das variáveis Mercado Pago. |
| Recorrência automática | PENDENTE | Não | Não | `preapproval`/assinatura não implementado. |
| Conexão ADB | FUNCIONAL | Sim | Sim | Estados explícitos e ADB embarcado. |
| Scanner Rápido | FUNCIONAL | Sim | Sim | Cobertura depende do aparelho. |
| Scanner Completo | FUNCIONAL | Sim | Sim | Arquivos/persistência podem ser parciais. |
| Scanner Personalizado | FUNCIONAL | Sim | Sim | Usuário escolhe módulos. |
| Segurança e risk score | FUNCIONAL | Sim | Sim | Score técnico, sem afirmar ausência de malware. |
| Histórico e relatórios | FUNCIONAL | Sim | Sim | Falha online não invalida resultado local. |
| Clientes e visão gerencial | FUNCIONAL | Sim | Parcial | Dependem dos registros reais do usuário. |
| Gerenciar Apps | PENDENTE DE TESTE FÍSICO | Sim | Parcial | Código funcional; repetir matriz Samsung/Xiaomi/Motorola. |
| Remoção de app do usuário | PARCIAL | Sim | Preview | Exige preview/token; remoção real não integra smoke. |
| Proteção de app de sistema | FUNCIONAL | Sim | Sim | Sem opção de remoção; pacotes críticos bloqueados. |
| Verificação de bateria | PENDENTE DE TESTE FÍSICO | Sim | Parcial | Campos variam conforme fabricante/sysfs. |
| Limpeza Profunda | DIAGNÓSTICO | Sim | Parcial | Não remove arquivos. |
| Duplicados | PENDENTE | Não | Não | Não implementado. |
| Otimização | DIAGNÓSTICO | Sim | Parcial | Não encerra processos nem altera configuração. |
| Backup | DIAGNÓSTICO | Sim | Parcial | Não copia arquivos. |
| Backup para pendrive | PENDENTE | Não | Não | Destino/cópia não implementados. |
| Diag IA/Gemini | FUNCIONAL | Sim | Sim | Tem fallback externo e local. |
| Tickets de suporte | FUNCIONAL | Sim | Parcial | API publicada e migration aplicada. |
| Ticket no Django Admin | FUNCIONAL | Sim | Não | Consulta, filtros e atendimento; criação e exclusão protegidas. |
| Instalador Windows x64 | PARCIAL | Sim | Parcial | Beta gerado; repetir instalação Windows 10/11. |
| Authenticode/SmartScreen | PENDENTE | Não | Não | Bloqueador para venda pública. |
| Atualização automática | PENDENTE | Não | Não | Não implementada. |
| iPhone/iOS | INDISPONÍVEL | Provider stub | Não | `not_implemented`; sem suporte anunciado. |

## Última validação registrada

- backend: 276 testes aprovados após finalizar o Admin de suporte e o e-mail de recuperação;
- desktop: 330 testes aprovados durante a criação desta documentação;
- build Vite aprovado nesta etapa; smoke Electron aprovado na validação anterior;
- produção: health HTTP 200, migration `core.0011_supportticket` e collectstatic confirmados;
- Render executava `cee2bb2`, que contém as implementações; `110ed57` adiciona somente instruções de deploy e aguardava alinhamento do deploy.

Sempre atualize esta seção após uma nova rodada completa.
