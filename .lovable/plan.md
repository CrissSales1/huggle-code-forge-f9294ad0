

# Plano: Adicionar confusoes V-Y e Q-O no VISUAL_SIMILAR - v1.1.85

## Problema

A placa da casa 84 e **QYR8E54** mas o OCR leu **OVR8E54** (95% confianca). Sao 2 erros simultaneos:
- Posicao 0: **Q lido como O**
- Posicao 1: **Y lido como V**

O `generateDualVariations` deveria resolver isso (2 substituicoes simultaneas), mas falha porque **V e Y nao existem no mapeamento `VISUAL_SIMILAR`**. Eles existem em `OCR_CORRECTIONS` mas o fuzzy matching usa `VISUAL_SIMILAR`.

## Causa Raiz

No `plateValidator.ts`, o dicionario `VISUAL_SIMILAR` tem entradas para O (inclui Q) e Q (inclui O), mas **nao tem entradas para V nem Y**. Como `generateAggressiveVariations` e `generateDualVariations` usam exclusivamente `VISUAL_SIMILAR`, a variacao V->Y nunca e gerada.

## Trace do erro

1. OCR le "OVR8E54"
2. `generateAggressiveVariations("OVR8E54")` roda
3. Posicao 0: `VISUAL_SIMILAR['O']` = `['0','D','Q','6','U']` -- gera QVR8E54 (1 mudanca)
4. Posicao 1: `VISUAL_SIMILAR['V']` = **undefined** -- NENHUMA variacao gerada
5. `generateDualVariations` tenta pos 0+1: precisa de alternativas para AMBAS posicoes, mas V nao tem -- falha
6. Resultado: QYR8E54 nunca e gerado

## Solucao

Adicionar V e Y ao `VISUAL_SIMILAR`:

```
'V': ['U', 'W', 'Y'],
'Y': ['V', '7', 'T'],
```

Com isso:
1. Posicao 0: `VISUAL_SIMILAR['O']` inclui Q
2. Posicao 1: `VISUAL_SIMILAR['V']` inclui Y (novo)
3. `generateDualVariations` pos 0+1: O->Q + V->Y = **QYR8E54** -- match!

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/react-app/utils/plateValidator.ts` | Adicionar V e Y ao VISUAL_SIMILAR |
| `src/react-app/pages/Configuracoes.tsx` | Versao 1.1.85 |

## Detalhes Tecnicos

### plateValidator.ts - VISUAL_SIMILAR

Adicionar apos a entrada de 'U':

```typescript
'V': ['U', 'W', 'Y'],
'Y': ['V', '7', 'T'],
```

### Configuracoes.tsx

Atualizar versao para `1.1.85 (V-Y Visual Similar Fix)`.

## Validacao: OVR8E54 -> QYR8E54

1. `generateDualVariations("OVR8E54")` com posicoes i=0, j=1 (adjacentes, distancia 1)
2. `VISUAL_SIMILAR['O']` inclui 'Q', `VISUAL_SIMILAR['V']` inclui 'Y'
3. Variante gerada: QYR8E54
4. `correctByPosition("QYR8E54")` = QYR8E54 (ja valido, formato antigo)
5. `isValidPlate("QYR8E54")` = true
6. Busca no banco encontra casa 84

