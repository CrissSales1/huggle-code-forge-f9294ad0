

# Fix: OCR não inicia automaticamente — Stale Closure em `processPlate`

## Causa Raiz

`usePlateWorker.ts` linha 188: `processPlate` usa `isProcessing` (React **state**) como guard, capturado no closure do `useCallback` com `[isReady, isProcessing]` como deps.

Cadeia de propagação após worker responder:
1. Worker responde → `setIsProcessing(false)` → re-render
2. Novo `processPlate` (com `isProcessing=false`) → re-render `usePlateRecognition`
3. Novo `recognizeFromCanvas` → re-render `useContinuousMonitoring`
4. Novo `processFrameForOCR` → useEffect atualiza ref

**Durante esses 3-4 renders (~50-100ms), o ref aponta para o callback antigo que captura `isProcessing = true`, retornando `null` silenciosamente.** O motion worker continua disparando `shouldAttemptOCR`, mas todas as chamadas morrem no `processPlate` com closure stale.

## Correção (1 arquivo: `usePlateWorker.ts`)

Substituir o guard de estado por um **ref síncrono** (mesmo padrão do `isProcessingOcrRef`):

1. **Adicionar ref:** `const isProcessingPlateRef = useRef(false);`
2. **Guard em `processPlate`:** trocar `if (isProcessing)` por `if (isProcessingPlateRef.current)`
3. **Lock:** `isProcessingPlateRef.current = true` (antes de enviar ao worker)
4. **Unlock em PLATE_RESULT:** `isProcessingPlateRef.current = false`
5. **Unlock em ERROR:** `isProcessingPlateRef.current = false`
6. **Remover `isProcessing` dos deps** do `useCallback` de `processPlate` → `[isReady]`
7. **Manter `setIsProcessing`** para UI (indicadores visuais)

### Bonus: Silenciar log flood

Em `motionDetection.ts`, o log "Fast-Track: Iniciando coleta OCR" só deve disparar na **primeira** tentativa (`!this.ocrAttempted`). Já existe esse guard na linha da condição, mas o log está **fora** do `if (!this.ocrAttempted)`. Mover para dentro.

## Arquivos Afetados

| Arquivo | Mudança |
|---------|---------|
| `src/react-app/hooks/usePlateWorker.ts` | Ref para guard de processamento (~6 linhas) |
| `src/react-app/utils/motionDetection.ts` | Silenciar log repetido (1 linha) |

