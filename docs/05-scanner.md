# Scanner Android

## Modos

- **Rápido:** aplicativos, segurança, bateria e armazenamento.
- **Completo:** solicita todos os módulos disponíveis.
- **Personalizado:** o usuário escolhe os módulos.

O modo Completo inclui Identificação, Sistema, Aplicativos, Permissões, Arquivos, Segurança, Persistência/configurações, Bateria, Armazenamento, Desempenho e Consolidação.

## Estados

- `COMPLETED`: módulo concluiu a coleta prevista e não registrou limitação relevante.
- `PARTIAL`: houve resultado útil, mas parte da fonte ficou inacessível ou incompleta.
- `UNAVAILABLE`: fonte ou comando não está disponível naquele aparelho.
- `FAILED`: erro impediu um resultado utilizável.
- `CANCELLED`: operação interrompida antes da conclusão.

Os objetos internos usam valores equivalentes em minúsculas. A interface deve preservar a diferença entre falha, indisponibilidade e parcialidade.

## Módulos processados e cobertura real

“Módulos processados” mede quantos módulos solicitados finalizaram. “Cobertura real” descreve quanto o aparelho permitiu observar. Concluir todos os módulos não significa acessar 100% dos dados do dispositivo.

O Scanner registra warnings e limitações e não atribui porcentagem inventada ao conteúdo inacessível. Um resultado técnico concluído continua válido mesmo se a persistência online falhar; nesse caso a interface informa que o histórico não foi salvo.

## Segurança

Findings dependem de regras e evidências coletadas. O score técnico não representa probabilidade de malware e não certifica ausência de ameaça. Sem evidência, o DiagPro não classifica um aplicativo como vírus.

## Limitações do Android moderno

- Scoped Storage restringe pastas e arquivos;
- SELinux e sandbox protegem dados privados de aplicativos;
- comandos do Toybox variam por versão/fabricante;
- algumas propriedades e arquivos `sysfs` não existem ou não são legíveis;
- ADB comum não equivale a root.

Por isso, arquivos privados, bancos internos de apps e outras áreas protegidas podem permanecer fora da cobertura.

## Persistência

Após uma análise bem-sucedida, o desktop envia ao backend identificação, datas, modo, módulos, score, recursos, contagens, warnings, stages e resultado técnico compatível. O backend associa o registro a `request.user`; o desktop não escolhe o proprietário.
