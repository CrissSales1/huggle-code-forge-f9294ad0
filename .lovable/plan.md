
# Plano: Mostrar Placa Cadastrada ao Invés da Detectada - v1.1.74

## Diagnóstico

Analisando os dados do banco e o screenshot:

### Situação Atual
| Cadastro | Detecção | Resultado | Problema |
|----------|----------|-----------|----------|
| `SUI2I25` | `SOI2125` | ❌ Não encontrado | Duas diferenças: O↔U e 1↔I |
| `SUI2I25` | `SOI2I25` | ✅ Morador Casa 85 | Apenas O↔U (match funciona) |

### Causa Raiz
1. **Variações limitadas**: As funções `generateVariations` e `generateAggressiveVariations` fazem apenas **uma substituição por vez**
2. **Combinações não cobertas**: Quando OCR erra **dois caracteres** (O↔U e 1↔I), a placa cadastrada não é encontrada
3. **Placa detectada salva**: Mesmo quando match funciona, `placaCadastrada` não está sendo usada corretamente em alguns casos

### O que verificamos no banco:
- Cadastrada: `SUI2I25` (Casa 85)
- Detecção salva: `SOI2I25` (detectada, não cadastrada) ← **Bug!**

---

## Correções Necessárias

### 1. Corrigir `OCR_CORRECTIONS` para incluir O↔U bidirecional

**Arquivo**: `src/react-app/utils/plateValidator.ts`

Adicionar `U` nas confusões de `O` e vice-versa:

```typescript
// Linha ~35
'O': ['0', 'Q', 'D', 'C', 'U'],  // Adicionar 'U'

// Linha ~41
'U': ['V', 'W', '0', 'O'],  // Adicionar 'O'
```

### 2. Gerar variações combinadas (até 2 substituições)

Atualmente só gera variações com 1 substituição. Para capturar erros múltiplos do OCR, precisamos de combinações:

```typescript
// Nova função: generateCombinedVariations
// Gera variações com ATÉ 2 substituições simultâneas
// Ex: SOI2125 → SUI2I25 (troca O→U e 1→I)
```

### 3. Garantir que `placaCadastrada` seja sempre usada quando disponível

Adicionar log de debug e verificar se `checkIfMorador` está retornando `placaCadastrada` corretamente.

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/react-app/utils/plateValidator.ts` | Corrigir OCR_CORRECTIONS (O↔U) + nova função para combinações |
| `src/react-app/contexts/MonitoringContext.tsx` | Adicionar logs para debug de placaCadastrada |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.74 |

---

## Detalhes Técnicos

### Nova função `generateCombinedVariations`

```typescript
export function generateCombinedVariations(plate: string): string[] {
  const variations = new Set<string>();
  const chars = plate.split('');
  
  // Primeira passada: variações simples (1 substituição)
  const simpleVariations = generateAggressiveVariations(plate);
  simpleVariations.forEach(v => variations.add(v));
  
  // Segunda passada: combinar variações (2 substituições)
  // Para cada variação simples, gerar variações dela
  for (const variant1 of simpleVariations) {
    const variantChars = variant1.split('');
    
    // Apenas posições de letras (0, 1, 2) e posição 4
    for (let i = 0; i < 3; i++) {
      const alternatives = VISUAL_SIMILAR[variantChars[i]] || [];
      for (const alt of alternatives) {
        if (/[A-Z]/.test(alt) && alt !== variantChars[i]) {
          const variant2 = [...variantChars];
          variant2[i] = alt;
          variations.add(correctByPosition(variant2.join('')));
        }
      }
    }
  }
  
  // Limitar para evitar explosão combinatória
  return Array.from(variations).slice(0, 100);
}
```

### Exemplo de funcionamento

Placa detectada: `SOI2125`

**Variações geradas (com combinações):**
1. `SOI2125` (original)
2. `S0I2125` (O→0)
3. `SDI2125` (O→D)
4. `SUI2125` (O→U) ← **Importante!**
5. `SOI2I25` (1→I)
6. `SUI2I25` (O→U + 1→I) ← **Match com cadastrada!**

---

## Resultado Esperado

1. Quando OCR detectar `SOI2125` ou `SOI2I25`
2. Sistema encontra match com `SUI2I25` (cadastrada)
3. UI mostra **`SUI2125`** (placa cadastrada) ao invés da detectada
4. Banco salva **`SUI2125`** para consistência
5. Usuário vê a placa que cadastrou, não a leitura OCR com erros
