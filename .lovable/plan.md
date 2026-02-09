

# Plano: Correção de Erros OCR com Substituição Dupla - v1.1.82

## Problema

Placas cadastradas com fotos nítidas não estão sendo reconhecidas:

| Placa Real | OCR Leu | Erros | Posições |
|-----------|---------|-------|----------|
| TKG9D97 | TKG2I97 | 9->2, D->I | Pos 3 e 4 (duas mudanças) |
| FUL3E36 | FU1E36 / FUL1E36 | L->1, 3->desaparece ou troca | Confusão L/1 |

### Causa Raiz

1. **Falta mapeamento I<->D** nas tabelas de confusão OCR
2. **Sem substituição dupla**: o sistema só gera variações com 1 mudança por vez. Para TKG2I97 -> TKG9D97, são necessárias 2 mudanças simultâneas
3. **Visitantes usam matching fraco**: `checkIfVisitanteAtivo` usa apenas `generateVariations` (simples), enquanto `checkIfMorador` já usa variações agressivas

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `src/react-app/utils/plateValidator.ts` | Adicionar I<->D nos mapeamentos + implementar substituição dupla |
| `src/react-app/contexts/MonitoringContext.tsx` | Usar variações agressivas na busca de visitantes |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.82 |

---

## Detalhes Técnicos

### 1. Novos mapeamentos em `plateValidator.ts`

**OCR_CORRECTIONS:**
```
'I': adicionar 'D'    (linha 30)
'D': adicionar 'I'    (linha 25)
```

**VISUAL_SIMILAR:**
```
'I': adicionar 'D'    (linha 56)
'D': adicionar 'I'    (linha 52)
```

### 2. Nova função `generateDualVariations`

Gera variações com duas substituições simultâneas em posições adjacentes (distância max 2), usando `VISUAL_SIMILAR`. Cada variação passa por `correctByPosition` e `isValidPlate` para garantir formato válido.

```typescript
export function generateDualVariations(plate: string): string[] {
  const variations = new Set<string>();
  const chars = plate.split('');
  
  for (let i = 0; i < 7; i++) {
    const altsI = VISUAL_SIMILAR[chars[i]] || [];
    for (let j = i + 1; j < 7 && j <= i + 2; j++) {
      const altsJ = VISUAL_SIMILAR[chars[j]] || [];
      for (const ai of altsI) {
        for (const aj of altsJ) {
          const variant = [...chars];
          variant[i] = ai;
          variant[j] = aj;
          const corrected = correctByPosition(variant.join(''));
          if (isValidPlate(corrected)) {
            variations.add(corrected);
          }
        }
      }
    }
  }
  
  return Array.from(variations);
}
```

### 3. Integrar em `generateAggressiveVariations`

Chamar `generateDualVariations` e adicionar os resultados ao set de variações existente.

### 4. Visitantes com matching agressivo

Em `checkIfVisitanteAtivo` (MonitoringContext.tsx, linha 690), substituir:

```typescript
// Antes:
const { generateVariations } = await import(...)
const variacoes = generateVariations(placaLimpa);

// Depois:
const { generateVariations, generateAggressiveVariations } = await import(...)
const variacoes = [...new Set([
  ...generateVariations(placaLimpa),
  ...generateAggressiveVariations(placaLimpa)
])];
```

Também mudar a lógica de matching para comparar cada placa de visitante contra as variações (mesmo padrão que `checkIfMorador`).

---

## Validação: TKG2I97 -> TKG9D97

1. `VISUAL_SIMILAR['2']` inclui '9' -- posição 3: TKG**9**I97
2. `VISUAL_SIMILAR['I']` inclui 'D' (novo!) -- posição 4: TKG2**D**97
3. Dual substitution posições 3+4: 2->9, I->D = TKG**9D**97
4. `correctByPosition("TKG9D97")` -> formato antigo válido
5. Busca no banco encontra o morador

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| TKG2I97 (real: TKG9D97) | Não encontra morador | Match via dual substitution |
| Visitantes com erros OCR | Matching fraco (1 mudança) | Matching agressivo + dual |
| Performance | ~50 variações | ~200 variações (ainda < 1ms) |

---

## Versão

```
Versão 1.1.82 (Fuzzy Dual Match)
```

