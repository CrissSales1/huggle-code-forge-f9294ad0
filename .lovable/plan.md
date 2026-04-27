## Objetivo

Remover do `CadastroVisitanteModal` o bloco/lógica visual de **"Visitante similar encontrado"** (que está atrapalhando o operador), **sem** quebrar o agrupamento das estatísticas (que hoje agrupa por placa ou por nome normalizado).

A regra "se for as mesmas informações siga com a regra para não atrapalhar nas estatísticas" será garantida silenciosamente no momento do cadastro: se a placa digitada já existir, reaproveitamos a grafia canônica do nome anterior (mesma placa = mesma pessoa). Assim o agrupamento em Estatísticas/Relatórios continua consolidando corretamente, sem precisar exibir a sugestão para o usuário.

## Mudanças

### 1. `src/react-app/components/CadastroVisitanteModal.tsx` — remoção da UI de similares

- Remover do JSX o bloco "Visitante similar encontrado" (cards com % de similaridade e botões "Usar" / "Descartar").
- Remover os estados: `visitantesSimilares`, `buscandoSimilares`, `similarDescartado`.
- Remover funções: `buscarSimilares`, `handleUsarSimilar`, `handleDescartarSimilar`.
- Remover as chamadas a `buscarSimilares(...)` dentro de `handlePlacaChange` e `handleNomeChange`.
- Remover a interface local `VisitanteSimilar` e o import de `buscarVisitantesSimilares` do hook (no modal apenas — manter o hook intacto).
- Remover o reset desses estados no `resetForm`.

**Preservar intactas:**
- Busca por placa existente (`buscarVisitantes`) e o modal `SelecionarVisitanteModal` (operador continua podendo escolher um cadastro anterior pela placa — fluxo principal e desejado).
- Dropdown de autocomplete por nome (`nomeOptions`) — esse não é a "sugestão de similar", é apenas autocomplete.
- Stepper, validação de placa, OCR, prismas, etc.

### 2. `src/react-app/components/CadastroVisitanteModal.tsx` — normalização silenciosa no submit

No `handleSubmit`, antes de chamar `cadastrarVisitante`:

- Se a placa digitada (`placaVeiculo`) já existir em registros anteriores (consulta `buscarVisitantes(placaVeiculo)` filtrada por placa exata):
  - Pegar o **nome canônico** desses cadastros (variação mais frequente, via `encontrarNomeCanonical` já existente em `stringUtils.ts`).
  - Se o nome canônico, comparado com o nome digitado via `nomesSimilares(... , 85)`, for considerado a mesma pessoa, **substituir silenciosamente** `data.nome` pelo nome canônico antes de salvar.
  - Caso contrário (nome claramente diferente para a mesma placa, ex.: venda do carro), manter o nome digitado.
- Aplicar `normalizarNome` apenas para a comparação; o valor gravado é a string canônica original (com acentos/maiúsculas conforme já era salva).

Isso garante que o agrupamento existente em `useApi.ts` (linha ~993, `gerarChaveAgrupamento(placa, nome)` → `nome:${normalizarNome(...)}`) continue colapsando variações da mesma pessoa nos relatórios e estatísticas, sem precisar de UI extra.

### 3. Sem mudanças em

- `src/react-app/hooks/useApi.ts` — `buscarVisitantesSimilares` permanece exportado (pode ser útil em outras telas/futuro), apenas deixa de ser consumido pelo modal.
- `src/react-app/utils/stringUtils.ts` — utilitários permanecem (são usados no agrupamento e agora também no submit).
- Demais componentes, hooks e estatísticas — sem alteração.

## Resultado esperado

- O modal de cadastro fica mais limpo: sem o aviso amarelo/laranja de "Visitante similar encontrado" interrompendo o operador.
- O fluxo "placa já cadastrada → escolher cadastro anterior" continua funcionando via `SelecionarVisitanteModal` (que é explicitamente acionado pela placa exata).
- Estatísticas e Relatórios continuam agrupando corretamente registros da mesma pessoa, porque o nome é padronizado silenciosamente no momento do cadastro quando a placa coincide.