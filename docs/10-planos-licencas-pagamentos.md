# Planos, licenças e pagamentos

## Planos e licenças

O backend é a fonte de verdade para plano, limites, vigência e acesso a recursos. A licença controla diagnósticos mensais e outros limites do plano. Estados expirados, cancelados ou pendentes podem impedir um novo diagnóstico sem apagar resultados anteriores.

## Checkout Pro

O fluxo implementado usa Mercado Pago Checkout Pro:

1. o usuário autenticado escolhe um plano disponível;
2. o backend cria o pagamento e a preferência;
3. o cliente abre somente uma URL de checkout validada;
4. o Mercado Pago chama o webhook;
5. o backend valida HMAC, consulta o provedor e reconcilia valor, moeda, ambiente e referência;
6. aprovação pode ativar a licença; estados posteriores podem revogá-la conforme regras atuais.

O webhook é público para permitir chamada servidor-servidor, mas não é aberto: assinatura HMAC, idempotência, throttling e consulta ao provedor protegem o processamento.

## Estado de produção

As rotas existem, porém pagamentos ficam indisponíveis de forma segura enquanto as variáveis `MERCADO_PAGO_*` não estiverem configuradas. Nunca inserir tokens no desktop ou na documentação.

## O que não está implementado

**Recorrência automática não está implementada.** O fluxo atual não usa `preapproval` nem assinatura recorrente do Mercado Pago. A validade de uma licença gerada por pagamento não equivale a cobrança mensal automática.

Antes de vender assinatura recorrente é necessário definir produto, cancelamento, renovação, inadimplência, reconciliação e testes sandbox específicos.

## Variáveis por nome

- `MERCADO_PAGO_ACCESS_TOKEN`;
- `MERCADO_PAGO_WEBHOOK_SECRET`;
- `MERCADO_PAGO_SUCCESS_URL`;
- `MERCADO_PAGO_FAILURE_URL`;
- `MERCADO_PAGO_PENDING_URL`;
- `MERCADO_PAGO_WEBHOOK_URL`;
- `MERCADO_PAGO_USE_SANDBOX`.
