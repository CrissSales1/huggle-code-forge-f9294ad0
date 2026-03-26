

# Plano: Suporte a Câmera IP (MJPEG/HTTPS) na Vigilância

## Problema

O `<video>` HTML não consegue reproduzir streams MJPEG diretamente (`video.src = mjpegUrl` falha com `NotSupportedError`). MJPEG funciona apenas com `<img>`. O hook `usePersonDetection` espera um `HTMLVideoElement`.

## Solução

Usar um `<img>` para receber o MJPEG e um canvas oculto + `captureStream()` para alimentar o `<video>` com frames, mantendo o pipeline de detecção intacto.

```text
MJPEG URL ──► <img> (renderiza stream) 
                │
                ├──► canvas (desenha frames a 15fps)
                │       │
                │       └──► captureStream() ──► <video>.srcObject
                │                                    │
                │                                    └──► usePersonDetection (inalterado)
                │
                └──► Exibido ao usuário (visível)
```

## Mudanças

### `src/react-app/pages/Vigilancia.tsx`

1. **Adicionar refs**: `imgRef` (para o `<img>` MJPEG) e `mjpegCanvasRef` (canvas oculto de ponte).

2. **Modificar `startCamera`** (linhas 80-104): No bloco `else if (ipUrl)`:
   - Criar `<img>` com `src = ipUrl` (crossOrigin="anonymous")
   - No evento `onload` do img, iniciar um `setInterval` a ~15fps que:
     - Desenha o img no canvas oculto
     - Na primeira iteração, chama `canvas.captureStream(15)` e seta `video.srcObject = stream`
   - Chamar `video.play()` e `setVideo(video)`

3. **Modificar `stopCamera`**: Limpar o interval do MJPEG e remover o img.

4. **No JSX**: Adicionar `<canvas>` oculto para a ponte MJPEG. Para IP mode, mostrar o `<img>` visível no lugar do `<video>` (ou manter o video com o captureStream).

5. **Adicionar estado** `isMjpeg` para controlar qual elemento é visível.

### Alternativa mais simples (recomendada)

Em vez de `captureStream`, modificar `usePersonDetection` para aceitar `HTMLVideoElement | HTMLImageElement`:

- `setVideo` aceita `HTMLVideoElement | HTMLImageElement`
- `processFrame`: se for `<img>`, fazer `detectObjects(img, ...)` — MediaPipe aceita `HTMLImageElement` como input
- `readyState` check: para img, verificar `img.complete && img.naturalWidth > 0`

Isso evita o canvas intermediário e é mais eficiente.

## Arquivos

| Arquivo | Ação |
|---------|------|
| `src/react-app/hooks/usePersonDetection.ts` | Aceitar `HTMLImageElement` além de `HTMLVideoElement` |
| `src/react-app/pages/Vigilancia.tsx` | Usar `<img>` para IP/MJPEG, passar ao hook |

## Detalhes técnicos

- O `<img>` com src MJPEG atualiza automaticamente (o browser faz o streaming)
- MediaPipe `ObjectDetector.detect()` aceita `HTMLImageElement` nativamente
- O overlay canvas de bounding boxes usa `img.naturalWidth/Height` em vez de `video.videoWidth/Height`
- Para o desenho da área virtual, usar dimensões do `<img>` quando em modo MJPEG

