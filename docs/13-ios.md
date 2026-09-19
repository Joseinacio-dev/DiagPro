# iPhone e iOS

## Estado atual

**Não suportado.** O código contém apenas um provider inicial de bateria que retorna explicitamente `not_implemented`. Ele não detecta iPhone, não inventa métricas e não deve aparecer como suporte funcional.

## Pesquisa necessária

- Apple Mobile Device Support no Windows;
- trust pairing e persistência segura da confiança;
- viabilidade e licença do `libimobiledevice`;
- identificação do aparelho;
- bateria e armazenamento acessíveis;
- distribuição e atualização de dependências;
- testes físicos em versões iOS suportadas.

## Critério para suporte futuro

Suporte iOS só pode ser anunciado depois de provider real, tratamento de erros, testes automatizados, validação física e documentação de privacidade. Não baixar binários automaticamente nem pedir ao usuário para enfraquecer segurança do iPhone.
