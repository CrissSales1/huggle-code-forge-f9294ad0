

# Plano v1.4.0: MediaPipe como trigger de veículos para LPR

## O que muda

Hoje o monitoramento LPR usa um sistema de **comparação de frames** (MotionDetector) para detectar "algo mudou na área" e então disparar OCR. Isso tem limitações: iluminação muda e gera falsos positivos, precisa de referência, tem zona morta.

A proposta é substituir essa detecção de movimento por **MediaPipe ObjectDetector** detectando veículos (`car`, `truck`, `bus`, `motorcycle`) continuamente no vídeo. Quando um veículo é detectado **dentro da área virtual**, o fluxo OCR é disparado.

## Vantagens
- Sem falsos positivos por iluminação (o modelo sabe o que é um veículo)
- Não precisa de frame de referência (elimina toda a lógica de referência/EMA)
- Detecção semântica: sabe que é um carro, não apenas "algo mudou"
- O vídeo continua rodando em fluxo contínuo, sem snapshot frame-a-frame

## Arquitetura

```text
Vídeo contínuo (HTMLVideoElement)
        ↓ (a cada 300ms)
MediaPipe ObjectDetector
(detectForVideo - classes: car,truck,bus,motorcycle)
        ↓
Veículo na área virtual? (isPointInPolygon)
        ↓ SIM
Disparar pipeline OCR existente
(YOLO placa + PaddleOCR no Worker)
        ↓
Validação + Banco (sem mudança)
```

## Mudanças

### 1. `src/react-app/utils/personDetector.ts` → renomear para `objectDetector.ts`
- Renomear para nome genérico (detecta pessoas E veículos)
- Adicionar função `initVehicleDetector()` com `categoryAllowlist: ['car', 'truck', 'bus', 'motorcycle']`
- Manter `initPersonDetector()` para Vigilância (com `['person']`)
- Ou: criar um `initObjectDetector(categories: string[])` genérico com instâncias separadas

**Problema**: MediaPipe ObjectDetector é singleton por design (uma instância por vez). Precisamos de **duas instâncias** (Vigilância=person, Monitoramento=vehicle) ou um detector genérico que filtra depois.

**Solução**: Usar um único detector sem `categoryAllowlist` (detecta tudo) e filtrar no código. Assim a mesma instância serve para ambas as páginas. O modelo já é o mesmo (EfficientDet-Lite0).

### 2. `src/react-app/hooks/useVehicleDetection.ts` (novo)
- Similar ao `usePersonDetection.ts` mas filtrado para veículos
- Em vez de alertar, retorna `{ vehicleInArea: boolean, vehicleBBox: {...} }`
- Loop contínuo a cada 300ms usando `detectForVideo()`

### 3. `src/react-app/contexts/MonitoringContext.tsx` (refatoração grande)
**Remover**:
- Import e uso de `MotionDetector` (classe inteira)
- `motionDetectorRef`, `captureReference`, `hasReference`
- Toda a lógica de `processFrame` baseada em comparação de frames
- Estados: `hasReference`, `motionPercent` (substituir por `vehicleDetected`)

**Adicionar**:
- Import do `useVehicleDetection` ou inicialização do MediaPipe detector
- Loop de detecção: a cada 300ms, rodar `detectForVideo()` no vídeo
- Quando veículo detectado na área → disparar `processFrameForOCR()` (já existe, sem mudança)
- Novo estado `vehicleInArea` no lugar de `hasMotion`
- Manter cooldown e consistência temporal (buffer OCR) como estão

**Manter intacto**:
- `processFrameForOCR()` - não muda nada
- `processPlateWorker()` - Web Worker YOLO+OCR intacto
- Validação, fuzzy match, banco - tudo igual
- Sons, detecções, deduplicação - sem mudança

### 4. `src/react-app/components/CameraMonitor.tsx`
- Remover botão "Recapturar Referência" (não existe mais referência)
- Remover indicador de `motionPercent` (barra de %)
- Adicionar overlay de bounding box do veículo detectado pelo MediaPipe
- Status simplificado: "Monitorando..." → "Veículo detectado!" → "Lendo placa..."

### 5. `src/react-app/utils/motionDetection.ts`
- Manter as funções de área virtual (polygon, persistência, resolução, câmera)
- Remover ou depreciar a classe `MotionDetector` e `compareFrames`
- Manter: `loadVirtualArea`, `saveVirtualArea`, `getDefaultVirtualArea`, `isPointInPolygon`, etc.

### 6. Versão
`1.4.0 (MediaPipe Vehicle Detection)`

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| MediaPipe + YOLO+OCR Worker concorrendo por GPU | MediaPipe usa WebGL, Worker usa WebGL separado. Testar performance. Se necessário, pausar MediaPipe durante OCR |
| Modelo EfficientDet-Lite não detectar carros a distância | Threshold ajustável (0.3-0.5). Modelo COCO detecta carros bem em ângulos comuns |
| Duas instâncias (Vigilância + Monitoramento) | Detector único sem allowlist, filtrar no código por categoria |

## Arquivos

| Arquivo | Ação |
|---------|------|
| `src/react-app/utils/personDetector.ts` | Renomear → `objectDetector.ts`, generalizar para multi-classe |
| `src/react-app/hooks/useVehicleDetection.ts` | Novo hook para detecção de veículos na área |
| `src/react-app/hooks/usePersonDetection.ts` | Atualizar import do detector generalizado |
| `src/react-app/contexts/MonitoringContext.tsx` | Substituir MotionDetector por MediaPipe vehicle detection |
| `src/react-app/components/CameraMonitor.tsx` | Remover referência, adicionar overlay veículo |
| `src/react-app/utils/motionDetection.ts` | Manter utilidades de área, remover classe MotionDetector |
| `src/react-app/pages/Vigilancia.tsx` | Atualizar import do detector |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.4.0 |

