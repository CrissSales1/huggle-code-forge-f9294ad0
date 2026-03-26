

# Plano: Eliminar Canvas Bridge, Suporte Direto a `<img>` MJPEG

## Problema raiz

`img.crossOrigin = 'anonymous'` (linha 117 de Vigilancia.tsx) exige headers CORS no stream. O `flask_cors` não injeta headers em streaming responses `multipart/x-mixed-replace` de forma consistente. O canvas bridge também falha porque `drawImage()` num img cross-origin "tainta" o canvas.

## Solução

Remover `crossOrigin`, eliminar o canvas bridge, e passar o `<img>` diretamente ao hook de detecção. MediaPipe `detectForVideo()` aceita `HTMLImageElement` como input nativo.

```text
MJPEG URL ──► <img src="..."> (sem crossOrigin)
                │
                ├──► Exibido ao usuário (visível)
                └──► usePersonDetection.processFrame(img, timestamp)
                       └──► detectForVideo(img, ts) ← MediaPipe aceita img
```

## Mudanças

### 1. `src/react-app/utils/objectDetector.ts`

Adicionar função `detectObjectsFromImage(source, timestampMs)` que aceita `HTMLImageElement`:
- Usa o mesmo `detector.detectForVideo(source, timestampMs)` (API MediaPipe aceita ImageSource)
- Usa `source.naturalWidth / naturalHeight` em vez de `videoWidth / videoHeight`

### 2. `src/react-app/hooks/usePersonDetection.ts`

- Mudar tipo de `videoRef` para `HTMLVideoElement | HTMLImageElement | null`
- Mudar `setVideo` para aceitar ambos os tipos
- Em `processFrame`: verificar tipo do elemento:
  - `HTMLVideoElement`: manter lógica atual (`readyState >= 2`)
  - `HTMLImageElement`: verificar `img.complete && img.naturalWidth > 0`, chamar `detectObjectsFromImage()`

### 3. `src/react-app/hooks/useVehicleDetection.ts`

- Mesma adaptação do tipo para consistência (aceitar `HTMLImageElement`)

### 4. `src/react-app/pages/Vigilancia.tsx`

- **Remover** `crossOrigin = 'anonymous'` (linha 117)
- **Remover** todo o canvas bridge (linhas 127-150): `mjpegCanvasRef`, `captureStream`, `setInterval`
- **Simplificar** bloco IP/MJPEG no `startCamera`:
  - Setar `img.src = ipUrl` (sem crossOrigin)
  - Aguardar `img.onload`
  - Chamar `setVideo(img)` passando o img diretamente
  - Não precisa de `<video>` neste modo
- **Remover** `<canvas ref={mjpegCanvasRef}>` do JSX
- Overlay canvas continua funcionando (lê do `containerRef`, não do img)

## Resultado

- Sem CORS: `<img>` sem `crossOrigin` carrega qualquer URL livremente
- Sem canvas bridge: menos complexidade, menos CPU, sem tainted canvas
- Detecção funciona: MediaPipe opera diretamente no `<img>` MJPEG
- Servidor Flask não precisa de alteração

