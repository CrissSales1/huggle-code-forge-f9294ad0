

# Plano: Grid Thresholding + Execution Lock Funcional (v1.2.0)

## Problema 1: Motion Worker cego à forma

O `processFrame` atual soma todos os pixels foreground globalmente (`fgCount / totalPixels`). Chuva, reflexos e ruído de câmera geram milhares de pontos dispersos que ultrapassam o threshold, disparando OCR falso.

## Problema 2: Execution Lock ainda falhando

O log mostra "Fast-Track" repetido ~14 vezes. A causa: `handleMotionResult` chama `processFrameForOCRRef.current?.()` que pode falhar no guard de `status` (stale closure) ANTES de chamar `markOcrAttempted()`. Resultado: o MotionDetector nunca sabe que o OCR foi tentado e continua disparando `shouldAttemptOCR = true`.

---

## Correção 1: Grid Thresholding no `motion.worker.ts`

Após o loop per-pixel existente (que atualiza o background model), adicionar uma segunda passada por grade:

1. Calcular dimensões da imagem: `width = len / 4 / height` (receber width/height via mensagem)
2. Dividir em células de 8×8 pixels
3. Para cada pixel foreground, incrementar o contador da célula correspondente
4. Uma célula é "ativa" se >60% dos seus pixels são foreground
5. Verificar adjacência: pelo menos 2 células ativas vizinhas (4-connected)
6. `motionPercent` = proporção de células em clusters densos / total de células

**Mudanças no protocolo de mensagens:**
- `PROCESS_FRAME` passa a incluir `width` e `height` no payload (necessário para calcular grid)
- `extractAreaPixels` já retorna `ImageData` que tem `.width` e `.height`

**Arquivos afetados:**
- `src/react-app/workers/motion.worker.ts` — novo algoritmo de grid
- `src/react-app/hooks/useMotionWorker.ts` — enviar `width`/`height` junto com imageData

## Correção 2: Lock de OCR na camada correta

Mover `markOcrAttempted()` para DENTRO de `handleMotionResult`, ANTES de chamar `processFrameForOCRRef`. Isso garante que a flag é setada de forma síncrona e imediata, independente de o `processFrameForOCR` passar ou não nos seus guards internos.

**Arquivo:** `src/react-app/hooks/useContinuousMonitoring.ts`, função `handleMotionResult` (~linha 187):

```typescript
if (result.shouldAttemptOCR) {
  motionDetectorRef.current.markOcrAttempted(); // ANTES de chamar OCR
  processFrameForOCRRef.current?.();
}
```

E remover o `markOcrAttempted()` de dentro de `processFrameForOCR` (linha 428).

## Resumo de arquivos

| Arquivo | Mudança |
|---------|---------|
| `motion.worker.ts` | Grid Thresholding (substituir soma global por análise de densidade por célula com adjacência) |
| `useMotionWorker.ts` | Enviar `width`/`height` no payload de `PROCESS_FRAME` e `INIT_BACKGROUND` |
| `useContinuousMonitoring.ts` | Mover `markOcrAttempted()` para `handleMotionResult` (antes do dispatch) |

