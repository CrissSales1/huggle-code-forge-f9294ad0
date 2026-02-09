

# Plano: Adicionar confusão W-H no OCR - v1.1.83

## Problema

A placa da casa 14 é **SSW3A38** mas o OCR leu **SSH3A38** (95% confiança). O erro é simples: **W foi lido como H** na posição 2. Essa confusão não está mapeada no sistema.

## Causa Raiz

Nos mapeamentos `OCR_CORRECTIONS` e `VISUAL_SIMILAR` de `plateValidator.ts`, W e H não se referenciam mutuamente. Visualmente, W e H podem ser confundidos em fontes de placa (ambos têm traços verticais com conexão central).

## Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/react-app/utils/plateValidator.ts` | Adicionar W em H e H em W nos dois mapeamentos |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.83 |

## Detalhes Técnicos

### `plateValidator.ts`

**OCR_CORRECTIONS:**
```
'H': ['4', 'N', 'M', 'W'],    // adicionar W
'W': ['V', 'M', 'N', 'H'],    // adicionar H
```

**VISUAL_SIMILAR:**
```
'H': ['4', 'N', 'M', 'W'],    // adicionar W
'W': ['V', 'M', 'N', 'H'],    // adicionar H
```

### Validação: SSH3A38 -> SSW3A38

1. `VISUAL_SIMILAR['H']` inclui 'W' (novo)
2. Variação posição 2: SS**W**3A38
3. `isValidPlate("SSW3A38")` = true (formato antigo)
4. Busca no banco encontra casa 14

Este é um erro de 1 caractere, então nem precisa de dual substitution -- o `generateAggressiveVariations` simples já resolve.

## Versão

```
Versão 1.1.83 (W-H OCR Fix)
```
