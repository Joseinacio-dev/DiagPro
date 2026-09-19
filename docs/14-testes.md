# Testes e checklist de release

## Backend

```bat
cd /d C:\Users\Josei\devicecheck-pro\backend
venv\Scripts\activate
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test
```

Quando o ambiente local não possui Redis/PostgreSQL de produção, use a configuração isolada já existente:

```bat
python manage.py check --settings=devicecheck_backend.test_settings
python manage.py makemigrations --check --dry-run --settings=devicecheck_backend.test_settings
python manage.py test --settings=devicecheck_backend.test_settings
```

Essa configuração é somente para testes e não substitui validação do deploy real.

## Desktop

```bat
cd /d C:\Users\Josei\devicecheck-pro\desktop
npm test
npm run build
npm run test:production
```

`npm test` também executa `test:launch` no `posttest`.

## Testes físicos

A matriz de release deve incluir, quando houver aparelhos disponíveis:

- Samsung, Xiaomi/HyperOS e Motorola;
- Android autorizado, unauthorized, offline e desconectado;
- Scanner Rápido, Completo e Personalizado;
- cancelamento e retirada do cabo durante leitura;
- listagem de apps, bloqueio de sistema e somente preview de remoção;
- bateria comparada com as fontes ADB disponíveis;
- Windows 10 e Windows 11 x64.

Ações destrutivas não fazem parte do smoke físico padrão.

## Checklist

- [ ] working tree contém somente mudanças pretendidas;
- [ ] `git diff` revisado e sem secrets;
- [ ] Django check aprovado;
- [ ] nenhuma migration inesperada;
- [ ] testes backend aprovados;
- [ ] testes desktop aprovados;
- [ ] build Vite aprovado;
- [ ] smoke Electron aprovado;
- [ ] migration/collectstatic confirmados no deploy;
- [ ] `/health/` retorna HTTP 200;
- [ ] instalador inspecionado e sem arquivo sensível;
- [ ] teste físico atualizado ou marcado honestamente como pendente;
- [ ] [STATUS.md](STATUS.md) e [CHANGELOG.md](CHANGELOG.md) atualizados.
