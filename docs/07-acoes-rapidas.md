# Ações rápidas

## Estado atual

| Ação | Estado | Comportamento real |
|---|---|---|
| Limpeza Profunda | DIAGNÓSTICO | Mostra armazenamento, cache agregado quando acessível e limitações. Não exclui arquivos. |
| Duplicados | PENDENTE | Não há confirmação segura de duplicados nem remoção. |
| Otimização | DIAGNÓSTICO | Lê armazenamento, RAM e amostra de CPU; gera recomendações sem encerrar processos ou alterar configurações. |
| Bateria | FUNCIONAL NO CÓDIGO | Lê `dumpsys battery` e fontes opcionais do fabricante. Validação física final entre fabricantes é pendente. |
| Gerenciar Apps | FUNCIONAL NO CÓDIGO | Lista apps, separa usuário/sistema e mostra metadados reais. Validação física final entre fabricantes é pendente. |
| Backup | DIAGNÓSTICO | Avalia capacidade e explica limitações. Não copia arquivos. |
| Backup para pendrive | PENDENTE | Destino removível e cópia seletiva não implementados. |

## Bateria

Quando expostos pelo aparelho, podem aparecer nível, estado de carga, fonte, temperatura, tensão, tecnologia, corrente, contador de carga, ciclos e capacidade. Campos ausentes permanecem ausentes; o DiagPro não estima desgaste sem base observável.

## Gerenciar Apps

A listagem usa `packageName` real. Nome amigável só é mostrado quando disponível. Status de análise não é convertido em ameaça.

A remoção é permitida apenas para app de usuário. O fluxo exige preview, `confirmationToken` temporário e confirmação. Apps de sistema e pacotes críticos conhecidos são bloqueados. Desinstalar pode apagar dados locais do app e nunca deve ser feito como parte de um teste de leitura.

## Limpeza, otimização e backup

Essas ações não prometem espaço liberado, ganho percentual ou backup completo. Android moderno restringe cache, armazenamento privado e dados de terceiros. O texto “diagnóstico apenas” é parte do contrato atual.

## Cancelamento e desconexão

Operações longas de leitura podem ser canceladas. Desconexão deve produzir estado explícito, sem continuar em outro serial e sem transformar coleta parcial em sucesso completo.
