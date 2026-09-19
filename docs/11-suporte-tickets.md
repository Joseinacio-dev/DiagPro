# Suporte e tickets

## Canais no produto

- **Diag IA:** orientação contextual com sanitização e fallback;
- **Central de suporte:** interface para registrar e acompanhar solicitações;
- **Tickets:** registros persistidos no backend e vinculados à conta autenticada.

## Estados

- `OPEN`: aberto;
- `IN_PROGRESS`: em atendimento;
- `WAITING_CUSTOMER`: aguardando cliente;
- `RESOLVED`: resolvido;
- `CLOSED`: fechado.

## Permissões

Usuário comum:

- cria chamado próprio;
- lista e consulta somente seus chamados;
- não escolhe o proprietário;
- não altera status nem resposta da equipe.

Staff ou superuser:

- consulta todos os chamados;
- atualiza status e resposta da equipe.

O isolamento é aplicado pelo queryset do backend e coberto por testes. A migration `core.0011_supportticket` cria a tabela.

## Dados e sanitização

O desktop produz contexto técnico reduzido: versão, perfil, estado da API, informações permitidas do dispositivo e resumo de scan. Tokens, passwords, serial completo, caminhos privados e conteúdo pessoal não devem ser incluídos.

O texto digitado pelo usuário é armazenado no ticket. A interface deve orientar que ele não envie senhas, chaves ou dados pessoais desnecessários.

## Notificações

Ticket real no backend está implementado. E-mail de notificação de suporte não está configurado nesta versão. Isso é separado do SMTP de recuperação de senha.

## Administração

`SupportTicket` está registrado no Django Admin. Staff com permissões Django adequadas e superusers podem:

- listar chamados com usuário, assunto, status e datas;
- filtrar por status e datas;
- buscar por ID, usuário, e-mail e assunto;
- consultar o relato completo;
- atualizar somente status e resposta da equipe.

A criação pelo Admin e a exclusão foram desabilitadas para preservar o fluxo autenticado da API e o histórico. Identificação, proprietário, relato e datas são somente leitura.
