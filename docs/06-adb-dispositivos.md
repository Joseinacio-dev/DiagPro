# ADB e dispositivos

O DiagPro distribui uma cópia controlada do Android Platform Tools e não depende do ADB instalado no `PATH` do cliente.

## Estados de conexão

- `DISCONNECTED`: nenhum aparelho visível.
- `AUTHORIZED`: aparelho em estado `device` e pronto para coleta.
- `UNAUTHORIZED`: o telefone ainda não autorizou a chave deste computador.
- `OFFLINE`: o ADB conhece o aparelho, mas não consegue comunicar.
- `MULTIPLE`: mais de um aparelho elegível sem seleção inequívoca.
- `ADB_UNAVAILABLE`: executável ADB indisponível ou inválido.
- `ERROR`: erro não classificado durante detecção.

O Scanner só deve começar com um serial explicitamente autorizado.

## Preparar o Android

1. abrir **Sobre o telefone**;
2. tocar repetidamente no número/versão de compilação até ativar o modo desenvolvedor;
3. abrir **Opções do desenvolvedor**;
4. ativar **Depuração USB**;
5. conectar um cabo de dados e desbloquear o aparelho;
6. aceitar a impressão digital RSA; use “Sempre permitir” apenas em computador confiável.

Em Samsung, Xiaomi/HyperOS e Motorola os nomes e caminhos visuais podem variar. O código usa o mesmo protocolo ADB e não presume permissões extras específicas de fabricante.

## Troubleshooting

### Nenhum aparelho

- confirmar que o cabo transfere dados;
- testar outra porta USB sem hub;
- desbloquear a tela;
- trocar o modo USB para transferência de arquivos quando necessário.

### Unauthorized

- olhar a tela do telefone e aceitar a autorização;
- se a janela não aparecer, revogar autorizações de depuração USB no telefone, reconectar e autorizar novamente;
- não redefinir configurações gerais do aparelho.

### Offline

- desconectar e reconectar;
- manter a tela desbloqueada;
- reiniciar somente o servidor ADB, se o assistente oferecer essa ação segura.

### Multiple

- desconectar aparelhos não usados ou selecionar explicitamente o serial correto;
- nunca executar comando destrutivo sem confirmar o serial alvo.

## Segurança operacional

A detecção e os diagnósticos são leitura. Desinstalação é uma ação separada, limitada a aplicativos do usuário, com preview, token temporário e confirmação explícita. Pacotes de sistema e críticos são bloqueados.
