

# Plano: Detecção de Pessoas com MediaPipe (Nova Aba "Vigilância")

## Viabilidade

Sim, é totalmente possível. O **MediaPipe Vision (Pose/Object Detection)** roda 100% no navegador via WebAssembly, similar ao que já fazemos com TF.js/ONNX para placas. A task `ObjectDetector` do MediaPipe já detecta "person" nativamente usando o modelo EfficientDet-Lite, sem treinar nada.

O projeto já tem toda a infraestrutura necessária: área virtual poligonal (`motionDetection.ts`), streaming de câmera (WebRTC/webcam), e o padrão de desenho de área no canvas (`CameraMonitor`).

## Mudanças

### 1. Instalar dependência
```
@mediapipe/tasks-vision
```

### 2. Nova página `src/react-app/pages/Vigilancia.tsx`
- Seleção de câmera (webcam ou IP via WebRTC) — reutilizar lógica existente
- Vídeo com overlay canvas para desenhar área poligonal (reutilizar componentes de área virtual do Monitoramento)
- Loop de detecção: a cada ~300ms, rodar `ObjectDetector.detectForVideo()` no frame
- Para cada pessoa detectada (classe "person"), verificar se o bounding box intersecta a área virtual usando `isPointInPolygon()` já existente
- Se sim → disparo de alerta (som + toast + indicador visual)
- Cooldown configurável para não alertar repetidamente (ex: 10s)

### 3. Adicionar rota e menu
- `App.tsx`: Nova rota `/vigilancia`
- `Header.tsx`: Novo item no menu com ícone `Shield` (Lucide)

### 4. Utilitário `src/react-app/utils/personDetector.ts`
- Wrapper do MediaPipe ObjectDetector
- Inicialização do modelo (download ~4MB do CDN MediaPipe)
- Função `detectPersonsInArea(video, area)` que retorna lista de detecções dentro da área

### 5. Hook `src/react-app/hooks/usePersonDetection.ts`
- Gerencia ciclo de vida do detector
- Loop de processamento com `requestAnimationFrame` / `setInterval`
- Estado: isDetecting, personsInArea, lastAlert
- Lógica de cooldown e som de alerta

### 6. Versão
`1.3.0 (Vigilância - Detecção de Pessoas MediaPipe)`

## Arquitetura

```text
Camera (video) → Canvas snapshot (300ms)
                      ↓
              MediaPipe ObjectDetector
              (EfficientDet-Lite, WASM)
                      ↓
              Filtrar classe "person"
                      ↓
              Verificar interseção com
              área virtual (isPointInPolygon)
                      ↓
              Alerta ao porteiro
              (som + toast + visual)
```

## Observações
- O modelo MediaPipe (~4MB) é baixado do CDN oficial na primeira vez e cacheado pelo Service Worker
- Não conflita com o monitoramento LPR existente — são páginas independentes
- A área virtual poligonal usa o mesmo sistema já implementado (`motionDetection.ts`)
- Performance esperada: ~10-15 FPS no navegador com WebGL backend

