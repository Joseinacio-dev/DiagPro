# DiagPro

O DiagPro é uma aplicação desktop para diagnóstico técnico de dispositivos Android em assistências técnicas. Ele coleta sinais reais pelo ADB, organiza diagnósticos, relatórios e chamados e usa um backend autenticado para persistência, licenças e integrações.

O produto não é um antivírus, não garante ausência de malware e não acessa áreas privadas que o Android moderno bloqueia. Os resultados sempre dependem da cobertura efetivamente disponível no aparelho.

## Público-alvo

- assistências técnicas e seus atendentes;
- equipes que precisam registrar diagnósticos Android de forma consistente;
- administradores responsáveis por licenças, suporte e acompanhamento gerencial.

## Arquitetura

- **Desktop:** Electron, React e Vite.
- **Backend:** Django REST Framework e Gunicorn.
- **Persistência:** PostgreSQL.
- **Dispositivo:** ADB oficial embarcado no instalador.
- **Autenticação:** JWT, Google OAuth e sessão persistente protegida pelo `safeStorage` do Electron.
- **IA:** Desktop → backend → Gemini, com modelo alternativo externo e fallback local.
- **Produção atual:** backend hospedado no Render.

Consulte [Arquitetura](docs/02-arquitetura.md) e [Estado do produto](docs/STATUS.md).

## Estrutura do repositório

```text
backend/   API Django, modelos, migrations e testes
desktop/   Electron, React/Vite, ADB, scanner e testes
docs/      documentação oficial e viva do produto
```

## Requisitos de desenvolvimento

- Windows 10 ou 11 x64;
- Git;
- Node.js LTS e npm;
- Python compatível com o projeto;
- PostgreSQL quando o desenvolvimento exigir persistência local real.

O instalador destinado ao cliente final inclui o runtime Electron e o ADB; o cliente não precisa instalar Git, Node.js, Python ou ADB separadamente.

## Executar o backend

No Prompt de Comando do Windows:

```bat
cd /d C:\Users\Josei\devicecheck-pro\backend
venv\Scripts\activate
python manage.py runserver
```

Use variáveis locais próprias. Nunca copie credenciais de produção para o repositório.

## Executar o desktop

Em dois terminais:

```bat
cd /d C:\Users\Josei\devicecheck-pro\desktop
npm install
npm run dev
```

```bat
cd /d C:\Users\Josei\devicecheck-pro\desktop
npm run electron
```

## Testes e build

```bat
cd /d C:\Users\Josei\devicecheck-pro\backend
venv\Scripts\activate
python manage.py check
python manage.py test
```

```bat
cd /d C:\Users\Josei\devicecheck-pro\desktop
npm test
npm run build
npm run test:production
```

Para gerar o instalador beta:

```bat
npm run dist
```

## Documentação

- [Visão geral](docs/01-visao-geral.md)
- [Arquitetura](docs/02-arquitetura.md)
- [Setup de desenvolvimento](docs/03-setup-desenvolvimento.md)
- [Deploy de produção](docs/04-deploy-producao.md)
- [Scanner](docs/05-scanner.md)
- [ADB e dispositivos](docs/06-adb-dispositivos.md)
- [Ações rápidas](docs/07-acoes-rapidas.md)
- [Diag IA](docs/08-diag-ia.md)
- [Login e segurança](docs/09-login-seguranca.md)
- [Planos, licenças e pagamentos](docs/10-planos-licencas-pagamentos.md)
- [Suporte e tickets](docs/11-suporte-tickets.md)
- [Instalador Windows](docs/12-instalador-windows.md)
- [iOS](docs/13-ios.md)
- [Testes](docs/14-testes.md)
- [Troubleshooting](docs/15-troubleshooting.md)
- [Estado do produto](docs/STATUS.md)
- [Changelog](docs/CHANGELOG.md)
- [Como contribuir](docs/CONTRIBUTING.md)
