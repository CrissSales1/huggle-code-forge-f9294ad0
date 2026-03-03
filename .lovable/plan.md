

# Plano de Implementação v1.1.90 — Pipeline Unificado

## Verificação de Infraestrutura (Risco Eliminado)

O risco de ES Modules em Web Workers já está coberto:
- `usePlateWorker.ts` linha 103: `new Worker(new URL(...), { type: 'module' })`
- `vite.config.ts` linha 73: `worker: { format: 'es' }`

Imports de `../../shared/plateValidation` funcionarão sem alterações de infraestrutura.

---

## Execução (7 arquivos, 4 fases)

### Fase 1: Criar módulo canônico

**CRIAR `src/shared/plateValidation.ts`** (~450 linhas, zero deps de browser)

Consolida de `plateValidator.ts` (508 linhas) e `plateProcessor.worker.ts` (linhas 99-134, 546-700, 1492-1813):

- `PlateValidationResult` interface (formato `'antiga' | 'mercosul' | 'unknown'`)
- `MERCOSUL_REGEX`, `ANTIGA_REGEX`
- `FORBIDDEN_WORDS` + `isForbiddenText()` (do worker linhas 102-134)
- `CHAR_SUBSTITUTIONS` — merge canônico das duas tabelas divergentes:
  - Worker: `'W': ['V','M','N']`, `'B': ['8','6','3']`, `'H': ['4','N','M']`
  - plateValidator: `'W': ['V','M','N','H']`, `'B': ['8','6','3','D']`, `'H': ['4','N','M','W']`
  - Resultado: usa plateValidator (mais completo) como base
- `VISUAL_SIMILAR` (plateValidator linhas 50-78)
- `cleanPlateString()`, `isOldFormat()`, `isMercosulFormat()`, `isValidPlate()`, `formatPlateForDisplay()`
- `forceToLetter()`, `forceToNumber()`, `correctByPosition()` (com formatHint)
- `heuristicCorrection()` — 154 linhas do worker (linhas 546-700), retorna `{ text, detectedFormat }`
- `generateVariations()`, `generateAggressiveVariations()`, `generateDualVariations()`
- `extractPlateCandidate()` (worker linhas 1552-1605, adaptada para usar `validatePlateFormat` local)
- `validatePlateFormat()` (worker linhas 1607-1621)
- `validateAndCorrectPlate()` — versão de plateValidator (linhas 416-508, mais completa com `generateAggressiveVariations`)
- `rankCandidates()` (plateValidator linhas 370-399)
- `countChanges()` (plateValidator linhas 404-410, privada)

### Fase 2: Rewire dependências

**SIMPLIFICAR `src/react-app/utils/plateValidator.ts`** → ~15 linhas de re-export:
```typescript
export { cleanPlateString, isOldFormat, isMercosulFormat, isValidPlate,
  formatPlateForDisplay, validateAndCorrectPlate, correctByPosition,
  generateVariations, generateAggressiveVariations, generateDualVariations,
  rankCandidates, type PlateValidationResult } from '../../shared/plateValidation';
```

**LIMPAR `src/react-app/workers/plateProcessor.worker.ts`** — remover ~550 linhas:
- Linhas 22-29: `PlateValidationResult` interface local
- Linhas 99-134: `FORBIDDEN_WORDS` + `isForbiddenText()`
- Linhas 223-231: `CropParams`, `CROP_STANDARD`, `CROP_WIDE`
- Linhas 546-700: `heuristicCorrection()` inteira
- Linhas 1134-1168: `_addPadding()` (código morto)
- Linhas 1176-1190: `_unwarpPlate()` (código morto)
- Linhas 1492-1532: `MERCOSUL_REGEX`, `ANTIGA_REGEX`, `CHAR_SUBSTITUTIONS`
- Linhas 1534-1550: `generateVariations()`
- Linhas 1552-1605: `extractPlateCandidate()`
- Linhas 1607-1621: `validatePlateFormat()`
- Linhas 1627-1813: `validateAndCorrectPlate()`
- Linhas 2085-2128: Multi-Crop (2× OCR → 1× OCR)

Adicionar no topo:
```typescript
import { heuristicCorrection, validateAndCorrectPlate, isForbiddenText,
  extractPlateCandidate, type PlateValidationResult } from '../../shared/plateValidation';
```

Substituir Multi-Crop (linhas 2085-2128) por single pass:
```typescript
const result = await runONNXOCR(optimized.data, optimized.width, optimized.height);
const rawText = result.text;
const ocrConfidence = result.confidence;
const detectedFormat = result.detectedFormat;
const beamCandidates = result.candidates || [];
```

`runONNXOCR` perde o parâmetro `CropParams` — usa valores de `CROP_STANDARD` inline (cropTopRatio=0.15, cropBottomRatio=0.05, drawWidth=260).

Adicionar `solveHomographySystem()` + `applyProjectiveWarp()` (implementação fornecida pelo usuário, ~80 linhas) — **inativa** até modelo OBB.

### Fase 3: Limpar código morto

**REMOVER `src/react-app/utils/plateDetector.ts`** — 494 linhas de Sobel + Sliding Window.

**LIMPAR `src/react-app/hooks/usePlateRecognition.ts`**:
- Remover linha 8: `import { getPlateDetector } from '../utils/plateDetector'`
- Remover linhas 174-186: bloco `if (enableDebug)` que usa `getPlateDetector()`
- Debug images vêm do worker (`workerResult.debugImage` / `workerResult.debugImages`)

**LIMPAR `src/react-app/hooks/usePlateWorker.ts`**:
- Remover `MotionDetectionConfig` interface (linhas 42-46)
- Remover `detectMotion` de `UsePlateWorkerReturn` (linha 78)
- Remover `pendingMotionResolve` ref (linha 112)
- Remover handler `MOTION_RESULT` (linhas 152-156)
- Remover reset de `pendingMotionResolve` no handler ERROR (linhas 171-173)
- Remover função `detectMotion` (linhas 258-287)
- Remover `detectMotion` do retorno (linha 318)

### Fase 4: Versão

**`src/react-app/pages/Configuracoes.tsx`** linha 1314: `1.1.90` `(Pipeline Unificado)`

---

## Resumo de Impacto

| Arquivo | Ação |
|---------|------|
| `src/shared/plateValidation.ts` | CRIAR (~450 linhas) |
| `src/react-app/utils/plateValidator.ts` | SIMPLIFICAR (508 → ~15 linhas) |
| `src/react-app/workers/plateProcessor.worker.ts` | LIMPAR (~550 linhas removidas, ~80 adicionadas) |
| `src/react-app/utils/plateDetector.ts` | REMOVER (494 linhas) |
| `src/react-app/hooks/usePlateRecognition.ts` | LIMPAR (~15 linhas removidas) |
| `src/react-app/hooks/usePlateWorker.ts` | LIMPAR (~45 linhas removidas) |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.90 |

| Métrica | Antes | Depois |
|---------|-------|--------|
| Tempo OCR/frame | ~300ms (2× ONNX) | ~150ms (1× ONNX) |
| Linhas validação duplicadas | ~600 | 0 |
| Código morto | ~700 linhas | 0 |
| Tabelas de substituição divergentes | 2 | 1 |

