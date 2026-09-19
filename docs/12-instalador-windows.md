# Instalador Windows

## Formato atual

- Electron Builder;
- NSIS;
- Windows x64;
- instalação por usuário, sem exigir elevação;
- versão beta atual do pacote: `0.1.0-beta.1`.

O aplicativo empacotado carrega a interface com `file://` e usa o backend online configurado. O Android Platform Tools é incluído em `resources/platform-tools`.

## Requisitos do cliente

O cliente não precisa instalar:

- Node.js ou npm;
- Python ou Django;
- Git;
- ADB externo;
- servidor PostgreSQL local.

O driver USB adequado ao fabricante ainda pode ser necessário no Windows.

## Empacotamento

```bat
cd /d C:\Users\Josei\devicecheck-pro\desktop
npm run dist
```

O pipeline executa a verificação de release, build Vite e geração NSIS. `.env`, testes, fixtures, logs, source maps, backend, venv e dependências de desenvolvimento não devem entrar no pacote.

## Validação

- instalar e abrir em Windows 10 e Windows 11 x64;
- validar login, backend e ADB embarcado;
- testar instalação limpa e desinstalação;
- confirmar que nenhum secret está no `app.asar`;
- executar `npm run test:production`.

## Pendências comerciais

O executável/instalador não possui assinatura Authenticode. SmartScreen pode exibir alerta no beta. Venda pública exige certificado de assinatura de código, chave protegida, assinatura com timestamp e processo de release controlado.

Atualização automática também não está implementada. Não deve ser habilitada sem origem HTTPS fixa, manifesto e artefatos assinados.

Não registre hash de um instalador como permanente: cada build válido produz um novo artefato e um novo hash.
