# Visão geral

## Problema e público

O DiagPro organiza a coleta técnica de dispositivos Android para assistências técnicas. Em vez de depender de anotações dispersas, o atendente conecta um aparelho autorizado, executa módulos de leitura e mantém o resultado no histórico associado à sua conta.

O sistema apresenta sinais observáveis; não chama um aplicativo de ameaça sem evidência e não certifica que um aparelho está livre de malware.

## Fluxo principal

```text
instalar → login → licença → conectar dispositivo → autorizar ADB
         → diagnóstico → ações disponíveis → relatório ou suporte
```

## Estado do produto

### Funcional

- login por usuário/senha e Google OAuth;
- sessão persistente protegida no Windows;
- detecção e autorização de Android via ADB;
- Scanner Rápido, Completo e Personalizado;
- persistência e consulta de diagnósticos, clientes e relatórios;
- licenças, Checkout Pro e webhook protegidos quando configurados;
- Diag IA com Gemini e fallback;
- tickets autenticados de suporte;
- instalador beta Windows x64.

### Parcial ou diagnóstico

- a cobertura do scanner varia por fabricante, versão Android e permissões;
- Limpeza Profunda, Otimização e Backup são diagnósticos, sem modificação do aparelho;
- bateria e gerenciamento de apps estão implementados, mas a matriz física final entre fabricantes ainda deve ser repetida;
- recuperação de senha está implementada, porém o envio depende de SMTP de produção;
- pagamentos são avulsos; recorrência automática não está implementada.

### Em desenvolvimento ou indisponível

- detecção de arquivos duplicados e backup real para pendrive;
- atualização automática e assinatura Authenticode do instalador;
- suporte a iPhone/iOS.

O inventário detalhado fica em [STATUS.md](STATUS.md).
