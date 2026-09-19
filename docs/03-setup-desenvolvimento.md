# Setup de desenvolvimento no Windows

## Requisitos

- Windows 10/11 x64;
- Git;
- Node.js LTS e npm;
- Python e `venv`;
- PostgreSQL apenas quando a tarefa exigir banco local real.

O caminho usado no PC Josei é `C:\Users\Josei\devicecheck-pro`. Adapte-o em outros computadores.

## Backend

```bat
cd /d C:\Users\Josei\devicecheck-pro\backend
venv\Scripts\activate
pip install -r requirements.txt
python manage.py check
python manage.py migrate
python manage.py runserver
```

Copie apenas os nomes necessários de `.env.example` para um `.env` local ignorado pelo Git. Não utilize secrets de produção no computador de desenvolvimento.

Para testes isolados, a configuração `devicecheck_backend.test_settings` evita dependência do Redis de produção.

## Desktop

```bat
cd /d C:\Users\Josei\devicecheck-pro\desktop
npm install
npm run dev
```

Em outro terminal:

```bat
cd /d C:\Users\Josei\devicecheck-pro\desktop
npm run electron
```

O Vite usa normalmente a porta `5173`. O Electron deve ser reiniciado quando houver mudança em `main.js` ou `preload.js`; o hot reload do Vite cobre apenas o renderer.

## Cliente final

O instalador inclui Electron e as ferramentas ADB necessárias. O cliente final não deve instalar Node.js, Python, Git, Django, PostgreSQL ou ADB externo para usar o aplicativo.

## Boas práticas

- nunca versionar `.env`, banco local ou credenciais;
- executar testes antes de commit;
- manter [STATUS.md](STATUS.md) e [CHANGELOG.md](CHANGELOG.md) atualizados;
- usar aparelho físico somente quando a etapa exigir e evitar ações destrutivas sem confirmação explícita.
