# Troubleshooting

## “Failed to fetch” ou API indisponível

- testar `/health/`;
- confirmar URL pública configurada no desktop;
- verificar CORS para a origem utilizada (`localhost`, `127.0.0.1` ou `file://` conforme ambiente);
- considerar cold start do Render;
- consultar logs sem copiar secrets.

## HTTP 401

O access token pode ter expirado. O aplicativo tenta refresh pelo fluxo normal. Se falhar, sair e entrar novamente. Não colar JWT em conversa, issue ou terminal compartilhado.

## ADB unauthorized

Desbloquear o aparelho e aceitar a chave RSA. Se o aviso não aparecer, revogar apenas autorizações de depuração USB e reconectar. Não restaurar configurações gerais do telefone.

## ADB offline

Trocar cabo/porta, manter o aparelho desbloqueado e reconectar. Reiniciar o servidor ADB é aceitável; reiniciar ou redefinir o aparelho não é necessário para diagnóstico inicial.

## Multiple devices

Deixar apenas o alvo conectado ou selecionar o serial correto. Nunca adivinhar o aparelho antes de uma ação.

## Porta 5173 ocupada

Encerrar a instância antiga do Vite ou iniciar o desenvolvimento na porta indicada pelo Vite e garantir que o Electron aponta para ela. Não iniciar várias cópias sem necessidade.

## Electron não refletiu mudança

Vite recarrega o renderer, mas não `main.js` e `preload.js`. Fechar e iniciar novamente o Electron.

## Gemini usa fallback

Verificar logs sanitizados e o endpoint de saúde do provedor apenas com conta staff autorizada. Causas possíveis incluem timeout, quota, modelo inválido, permissão ou indisponibilidade. Não imprimir a API key.

## Render cold start

No plano gratuito, a primeira chamada pode demorar. Aguarde uma resposta limitada e teste novamente sem gerar muitas requisições simultâneas.

## Scanner parcial

Consultar warnings, stages, raízes acessíveis e limitações. Scoped Storage, SELinux, ausência de comando/arquivo e permissões do fabricante são resultados válidos; não converter parcial em falha nem em cobertura total.

## Histórico não salvo

O diagnóstico local continua visível. Verifique autenticação e API. Erro de persistência não significa que a coleta ADB falhou.

## Password reset não envia e-mail

O recurso permanece indisponível enquanto `DIAGPRO_PASSWORD_RESET_ENABLED` e SMTP não forem configurados e validados no backend. Não habilitar somente para testar sem provedor seguro.
