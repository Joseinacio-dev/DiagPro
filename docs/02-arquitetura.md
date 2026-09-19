# Arquitetura

## Componentes

```mermaid
flowchart LR
  U[Atendente] --> D[Desktop Electron + React/Vite]
  D --> A[ADB embarcado]
  A --> P[Android autorizado]
  D -->|HTTPS + JWT| B[Backend Django/DRF]
  B --> DB[(PostgreSQL)]
  B --> R[(Redis de throttling)]
  B --> G[Gemini]
  B --> MP[Mercado Pago]
  G -->|falha/timeout| F[Fallback externo e local]
```

### Desktop

O Electron controla o ciclo de vida, a ponte segura do `preload`, o ADB embarcado e o armazenamento protegido de sessão. React/Vite implementa login, scanner, relatórios, dispositivos, suporte e visão gerencial.

O renderer não recebe secrets de integrações. Operações ADB passam por APIs permitidas no `preload` e pelo código do processo principal.

### Backend

Django REST Framework fornece autenticação, diagnósticos, clientes, relatórios, licenças, pagamentos, Diag IA, Google OAuth, recuperação de senha e tickets. O proprietário de registros autenticados é derivado de `request.user`.

### Produção

O backend roda com Gunicorn no Render, PostgreSQL e cache Redis compartilhado para throttling. `collectstatic` e `migrate` fazem parte do build do serviço.

### Autenticação e sessão

```mermaid
sequenceDiagram
  participant UI as React
  participant E as Electron
  participant API as Django
  UI->>API: login ou Google OAuth
  API-->>UI: access + refresh
  UI->>E: persistir refresh se "Lembrar-me"
  E->>E: safeStorage/DPAPI
  UI->>API: Authorization Bearer access
  UI->>API: refresh quando necessário
```

O access token permanece em memória. O refresh persistente usa `safeStorage` quando disponível; sessões antigas em `localStorage` são migradas e removidas.

### Diag IA

O desktop envia contexto técnico sanitizado ao backend. O backend tenta o modelo principal configurado, pode tentar novamente, usa o modelo alternativo quando cabível e só então devolve fallback local seguro.

## Limites de confiança

- o desktop não é fonte de verdade para usuário, licença ou pagamento;
- o backend não executa ADB: a coleta acontece localmente;
- resultados técnicos refletem somente fontes acessíveis;
- logs e respostas públicas não devem expor tokens, chaves, URLs com credenciais ou conteúdo pessoal.
