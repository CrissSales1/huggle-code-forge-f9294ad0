

# Plano Final: Masked EMA com Dual-Worker, Slow Leak, Execution Lock e Buffer Ping-Pong

## Contexto

A arquitetura de dois workers com Masked EMA e Slow Leak ($\alpha_{fg}=0.0005$, $\alpha_{bg}=0.05$) foi aprovada. Este plano incorpora os dois requisitos táticos finais para evitar engasgos em produção.

## Os Dois Problemas Táticos

**1. Execution Lock**: O loop atual usa `setInterval` cego (linha 661 de `useContinuousMonitoring.ts`). Se o processamento do motion worker levar mais que 350ms (rede lenta, tab throttled), os callbacks se acumulam. Solução: flag `isProcessingMotion` que impede novo envio enquanto o anterior não retornou.

**2. Buffer Ping-Pong**: Quando a main thread envia `ImageData` via Transferable, o `ArrayBuffer` é zerado na main thread. Se o motion worker apenas descarta esse buffer, a main thread precisa alocar um novo `ImageData` a cada 350ms → pressão no GC. Solução: o motion worker devolve o `ArrayBuffer` vazio junto com o resultado via Transferable. A main thread reutiliza esse buffer para a próxima captura via `getImageData(x, y, w, h, { colorSpace: 'srgb' })` sobre o mesmo `ArrayBuffer`.

## Arquitetura Final

```text
Main Thread (setInterval 350ms + Execution Lock)
  │
  │  if (isProcessingMotion) return;  ← LOCK
  │  isProcessingMotion = true;
  │
  ├─ getImageData(area) → ImageData (reusa ArrayBuffer devolvido)
  │  [Transferable → ownership ao worker]
  │         │
  │         ▼
  │   motion.worker.ts
  │     ├─ Masked EMA per-pixel (i += 4, skip Alpha)
  │     │    mask=0 → α=0.05  (fundo adapta luz)
  │     │    mask=1 → α=0.0005 (slow leak)
  │     ├─ Calcula motionPercent
  │     └─ Retorna { motionPercent } + ArrayBuffer [Transferable de volta]
  │                │
  │  ◄─────────────┘
  │  isProcessingMotion = false;      ← UNLOCK
  │  Reutiliza ArrayBuffer devolvido
  │
  ├─ SE motionPercent > threshold E consecutiveFrames >= 2:
  │    Captura NOVO frame fresco do vídeo → captureArea()
  │    [Transferable → plateProcessor.worker.ts]
  │         │
  │         ▼
  │   plateProcessor.worker.ts (SEM MUDANÇA no core)
  │     └─ YOLO + ONNX OCR → PLATE_RESULT
  │                │
  │  ◄─────────────┘
  └─ Valida, deduplica, salva
```

## Implementação por Arquivo

### 1. CRIAR: `src/react-app/workers/motion.worker.ts`

Worker dedicado ao EMA mascarado. Estado interno:
- `backgroundModel: Float32Array | null`
- `minPixelDifference: number`

Mensagens:
- **`INIT`** — configura `minPixelDifference`
- **`INIT_BACKGROUND`** — recebe `ImageData` (Transferable), copia para `backgroundModel` Float32Array, **devolve o ArrayBuffer** via Transferable
- **`PROCESS_FRAME`** — recebe `ImageData` (Transferable), executa EMA mascarado, retorna `{ motionPercent }` + **devolve o ArrayBuffer** via Transferable
- **`UPDATE_CONFIG`** — atualiza `minPixelDifference`

Constantes: `ALPHA_BG = 0.05`, `ALPHA_FG = 0.0005`

Loop otimizado (skip Alpha canal):
```typescript
for (let i = 0; i < len; i += 4) {
  const diff = (Math.abs(data[i] - bg[i]) +
                Math.abs(data[i+1] - bg[i+1]) +
                Math.abs(data[i+2] - bg[i+2])) / 3;
  const alpha = diff > minPixelDiff ? ALPHA_FG : ALPHA_BG;
  const inv = 1 - alpha;
  bg[i]   = alpha * data[i]   + inv * bg[i];
  bg[i+1] = alpha * data[i+1] + inv * bg[i+1];
  bg[i+2] = alpha * data[i+2] + inv * bg[i+2];
  if (diff > minPixelDiff) fgCount++;
}
// Devolver buffer para reuso na main thread
postMessage({ type: 'MOTION_RESULT', payload: { motionPercent } }, [data.buffer]);
```

Sem `RECOVER_BACKGROUND`. Sem `vehicleExited`. O EMA se auto-regula.

### 2. CRIAR: `src/react-app/hooks/useMotionWorker.ts`

Hook para gerenciar o motion worker:
- Inicializa/termina worker no mount/unmount
- `initBackground(imageData: ImageData)` — envia primeiro frame (Transferable), recebe buffer de volta
- `processFrame(imageData: ImageData): Promise<{ motionPercent: number; returnedBuffer: ArrayBuffer }>` — envia frame, retorna resultado + buffer devolvido
- `updateConfig(config)` — atualiza `minPixelDifference`
- `returnedBufferRef: React.MutableRefObject<ArrayBuffer | null>` — armazena buffer devolvido para reuso
- `isReady: boolean`

### 3. SIMPLIFICAR: `src/react-app/utils/motionDetection.ts`

**Remover**:
- `referenceFrame`, `previousFrame`, `compareFrames` interno
- `captureReference()`, `hasReference()` baseado em referenceFrame
- `AUTO_UPDATE_DELAY_MS`, `INTERMEDIATE_UPDATE_DELAY_MS`, `intermediateZoneStart`
- `lastCleanTime`, `referenceUpdatePending`
- `shouldUpdateReference`, `vehicleExited` nos retornos
- Toda lógica de comparação de frames dentro de `processFrame()`
- Constantes `DETECTION_THRESHOLD`, `CLEAN_THRESHOLD`, `VEHICLE_EXIT_THRESHOLD`

**Manter**:
- Interfaces, tipos, presets de sensibilidade, funções de geometria e persistência
- `captureArea()` — para frame fresco ao OCR
- `extractAreaPixels()` — tornar pública (extrair ImageData da área virtual)
- Controle OCR: `ocrAttempted`, `ocrSucceeded`, `markOcrAttempted()`, `markOcrSuccess()`, `resetOcrAttempt()`
- `consecutiveMotionFrames`, `isStabilizing`, `lastMotionTime`, `config.stabilizationMs`

**Novo método**: `processMotionResult(motionPercent: number, detectionThreshold: number)` — recebe resultado do worker, aplica lógica de estado (consecutiveMotionFrames >= 2, shouldAttemptOCR com cooldown de 800ms). Retorna `{ hasMotion, shouldAttemptOCR }`.

### 4. ADAPTAR: `src/react-app/hooks/useContinuousMonitoring.ts`

Mudanças principais:

- Importar e usar `useMotionWorker()`
- Adicionar `isProcessingMotionRef = useRef(false)` — **Execution Lock**
- Adicionar `reusableBufferRef = useRef<ArrayBuffer | null>(null)` — **Buffer Ping-Pong**
- Na inicialização (webcam/HLS): capturar primeiro frame via `extractAreaPixels()`, enviar ao motion worker via `initBackground()`, armazenar buffer devolvido
- No loop `processFrame` (350ms via `setInterval`):
  1. `if (isProcessingMotionRef.current) return;` — Lock
  2. `isProcessingMotionRef.current = true;`
  3. Capturar `ImageData` da área virtual (reutilizando `reusableBufferRef` se disponível)
  4. Enviar ao motion worker via `processFrame()` [Transferable]
  5. Receber `{ motionPercent, returnedBuffer }` — armazenar buffer em `reusableBufferRef`
  6. `isProcessingMotionRef.current = false;` — Unlock
  7. Passar `motionPercent` ao `MotionDetector.processMotionResult()` para obter `shouldAttemptOCR`
  8. Se `shouldAttemptOCR`: capturar **novo frame fresco** via `captureArea()`, enviar ao plate worker
- Remover: `captureReferenceFrame()`, `recaptureReference()` baseado em `captureReference()`, `result.shouldUpdateReference`, `result.vehicleExited`
- O botão "recapturar referência" agora envia `INIT_BACKGROUND` ao motion worker com frame atual
- Manter intacto: buffer OCR, consistência temporal, deduplicação por placa, timeout de validação (15s), detecção de troca YOLO

### 5. LIMPAR: `src/react-app/hooks/usePlateWorker.ts`

- Remover `detectMotion()`, `pendingMotionResolve`, interface `MotionDetectionConfig` local, `MOTION_RESULT` do handler
- Manter: `processPlate()`, `loadYoloModel()`, `terminate()`, tudo de OCR/YOLO

### 6. LIMPAR: `src/react-app/workers/plateProcessor.worker.ts`

- Remover handler `DETECT_MOTION` do `onmessage` e tipo de `WorkerMessage`
- Remover `MOTION_RESULT` de `WorkerResponse`
- Manter: todo o pipeline YOLO + ONNX OCR intacto

### 7. VERSÃO: `src/react-app/pages/Configuracoes.tsx`

- Atualizar para `1.1.89 (Masked EMA)`

## Arquivos Afetados

| Arquivo | Ação |
|---------|------|
| `src/react-app/workers/motion.worker.ts` | CRIAR |
| `src/react-app/hooks/useMotionWorker.ts` | CRIAR |
| `src/react-app/utils/motionDetection.ts` | SIMPLIFICAR |
| `src/react-app/hooks/useContinuousMonitoring.ts` | ADAPTAR (loop assíncrono + lock + ping-pong) |
| `src/react-app/hooks/usePlateWorker.ts` | LIMPAR (remover detectMotion) |
| `src/react-app/workers/plateProcessor.worker.ts` | LIMPAR (remover DETECT_MOTION) |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.89 |

