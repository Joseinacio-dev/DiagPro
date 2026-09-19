# Como contribuir

## Regra de conclusão

Toda funcionalidade relevante deve incluir:

- implementação delimitada e segura;
- testes automatizados proporcionais ao risco;
- atualização da documentação correspondente;
- atualização de [STATUS.md](STATUS.md);
- atualização de [CHANGELOG.md](CHANGELOG.md) quando representar um marco.

Uma feature não é considerada completa sem esses itens e, quando depender de hardware, sem indicar claramente se o teste físico foi executado.

## Fluxo recomendado

1. confirmar branch, status e alterações preexistentes;
2. ler código e testes antes de editar;
3. preservar mudanças não relacionadas;
4. implementar o menor diff necessário;
5. rodar testes específicos e regressão apropriada;
6. revisar `git diff` e procurar secrets;
7. atualizar documentação e status;
8. usar commit claro e focado.

## Segurança

- nunca versionar `.env`, passwords, tokens, chaves, JWT, URLs com credenciais ou dados reais;
- não registrar dados pessoais ou conteúdo do aparelho;
- não executar ação ADB destrutiva sem autorização e confirmação explícita;
- não usar produção para testes que criam, alteram ou apagam dados quando mocks/ambiente isolado bastam;
- migrations de produção devem passar pelo processo de deploy.

## Linguagem e estado real

- diferenciar funcional, parcial, diagnóstico, pendente e indisponível;
- não chamar um app de ameaça sem evidência;
- não prometer cobertura total do Android;
- não apresentar fallback como resposta real do provedor;
- manter documentação compatível com a base de conhecimento da Diag IA.

## Antes do pull/push

Use o checklist em [14-testes.md](14-testes.md). Commits de documentação devem permanecer separados de mudanças funcionais sempre que possível.
