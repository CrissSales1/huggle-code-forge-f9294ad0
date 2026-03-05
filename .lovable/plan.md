

# Analise da Contra-Analise: GPU via OffscreenCanvas + Otimizacoes CPU

## Verificacao dos Pontos Levantados

### Ponto 1: "128 MB e so alocacao minima, HD 530 usa ate 4GB"

**Correto.** A HD 530 usa UMA (Unified Memory Architecture) e pode alocar dinamicamente ate metade da RAM. Os 128 MB sao a reserva da BIOS. O gargalo real sao as 24 EUs (Execution Units) e a largura de banda compartilhada com a CPU via barramento de memoria DDR4.

### Ponto 2: "OffscreenCanvas permite WebGL dentro de Worker"

**Correto, e o sistema ja usa OffscreenCanvas.** O worker atual (`plateProcessor.worker.ts`) ja cria dezenas de `OffscreenCanvas` para pre-processamento de imagem (linhas 269, 276, 1467, 1474, etc.). Porem, o TF.js usa `tf.browser.fromPixels()` que internamente cria tensores a partir de dados brutos - nao precisa de DOM canvas. O backend WebGL do TF.js **ja funciona** dentro do Worker porque o Chrome suporta WebGL em OffscreenCanvas desde 2019. Na verdade, na linha 801, o worker **ja tenta** `tf.setBackend('webgl')` antes de cair para CPU. Se estiver funcionando, o YOLO ja roda na GPU.

### Ponto 3: "YOLO 320px perde recall para placas pequenas"

**Valido.** E uma observacao correta. A reducao so deve ser aplicada quando a placa ocupa area significativa do frame. Como o sistema usa area virtual (ROI recortada), a placa geralmente ocupa boa parte do crop, minimizando o risco. Mas deve ser configuravel, nao forcado.

### Ponto 4: "Decodificacao de video ja usa GPU via QuickSync"

**Correto.** O elemento `<video>` nativo do HTML ja usa decodificacao por hardware automaticamente. Nao ha nada a fazer aqui - o navegador ja otimiza isso.

## O que realmente vale implementar

Com base na contra-analise, ha 3 mudancas concretas que fazem sentido:

### 1. ONNX Multi-Thread (2 threads)

O worker usa `numThreads = 1` (linha 188). O i5-6500 tem 4 cores. Mudar para 2 threads reduz o tempo de OCR em ~30-40% sem impactar a UI (que roda nos outros 2 cores).

**Mudanca**: Linha 188 de `plateProcessor.worker.ts`: `numThreads = 1` → `numThreads = 2`

### 2. YOLO 320px como opcao configuravel

Adicionar opcao nas configuracoes para escolher resolucao YOLO (320 ou 640). Maquinas fracas usam 320, maquinas fortes mantém 640. O modelo aceita qualquer resolucao multipla de 32.

**Mudancas**:
- `plateProcessor.worker.ts`: Nova mensagem `SET_CONFIG` para receber `yoloInputSize`, usar variavel em vez de constante
- `usePlateWorker.ts`: Novo metodo `setConfig()` para enviar preferencias ao worker
- `Configuracoes.tsx`: Seletor de resolucao YOLO (320/640) salvo no localStorage
- `useContinuousMonitoring.ts`: Enviar config ao worker no inicio do monitoramento

### 3. Monitor de backend ativo no PerformanceIndicator

Mostrar qual backend o TF.js esta usando (WebGL ou CPU) e o tempo de inferencia YOLO separado do OCR. Isso responde a pergunta "a GPU esta sendo usada?" sem precisar abrir o console.

**Mudancas**:
- `plateProcessor.worker.ts`: Incluir `backend` e `yoloTimeMs` no resultado de `PLATE_RESULT` e reportar backend ativo apos carregar modelo
- `PerformanceIndicator.tsx`: Exibir backend (WebGL/CPU) e tempo YOLO
- `usePlateWorker.ts`: Propagar info de backend do worker

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/react-app/workers/plateProcessor.worker.ts` | `numThreads=2`, mensagem `SET_CONFIG`, YOLO_INPUT_SIZE variavel, reportar backend+yoloTimeMs |
| `src/react-app/hooks/usePlateWorker.ts` | Novo metodo `setConfig()`, propagar backend info |
| `src/react-app/hooks/useContinuousMonitoring.ts` | Enviar config YOLO ao worker |
| `src/react-app/pages/Configuracoes.tsx` | Seletor resolucao YOLO (320/640) + versao 1.1.89 |
| `src/react-app/components/PerformanceIndicator.tsx` | Mostrar backend ativo e YOLO ms |

## Detalhes Tecnicos

### Worker - SET_CONFIG + variavel YOLO

```typescript
// Estado configuravel
let currentYoloInputSize = 640;

// Nova mensagem
case 'SET_CONFIG': {
  const { yoloInputSize } = event.data.payload;
  if (yoloInputSize) currentYoloInputSize = yoloInputSize;
  break;
}

// Em detectPlateWithYOLO: substituir YOLO_INPUT_SIZE por currentYoloInputSize
// Em loadYoloModel: warmup com currentYoloInputSize
```

### Worker - Reportar backend e YOLO timing

```typescript
// Apos carregar modelo YOLO:
const activeBackend = tf.getBackend(); // 'webgl' ou 'cpu'
self.postMessage({ 
  type: 'MODEL_LOADED', 
  payload: { success: true, backend: activeBackend } 
});

// Em detectPlateWithYOLO: medir tempo
const yoloStart = performance.now();
// ... inferencia ...
const yoloTimeMs = Math.round(performance.now() - yoloStart);
// Incluir yoloTimeMs no resultado
```

### Configuracoes - Seletor YOLO

```typescript
const YOLO_RESOLUTION_KEY = 'portacerta_yolo_resolution';

// Toggle entre 320 e 640
// Label: "Resolucao YOLO" com explicacao:
// 320px = mais rapido, ideal para cameras proximas
// 640px = mais preciso, necessario para cameras distantes
```

### PerformanceIndicator - Backend info

```typescript
// Novo indicador:
// "GPU ✓" (verde) se backend === 'webgl'
// "CPU" (cinza) se backend === 'cpu'
// "YOLO 45ms" tempo da ultima inferencia
```

### Versao: 1.1.89 (Hardware Optimization)

## Nota sobre GPU

O sistema **ja tenta usar WebGL** (GPU) para o YOLO. A contra-analise esta correta que OffscreenCanvas permite isso, mas o codigo ja faz isso. A diferenca real e que agora o usuario **vai saber** se a GPU esta ativa ou nao, e pode ajustar a resolucao YOLO para otimizar o tradeoff velocidade/precisao para seu hardware especifico.

