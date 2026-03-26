

# Fix: BackgroundVigilancia Reconnect Spam + Detection Silent Failures

## Problems Identified

### 1. Infinite Reconnect Loop (Critical)
`BackgroundVigilancia` useEffect fires → calls `reconnectSource()` → which calls `connectSource()` → which calls `setIsMjpeg()`/`setCameraStarted()` → state change → `reconnectSource` reference changes → useEffect fires again → **infinite loop**.

The BackgroundVideo.tsx counterpart works because it uses `setTimeout` with cleanup, but the real issue is that `reconnectSource` in VigilanciaContext recreates on every render due to `connectSource` in its dependency chain (which depends on `detection` object that changes every render).

### 2. Detection Silent Failures
`detectObjectsFromImage` uses `detector.detectForVideo(img as unknown as HTMLVideoElement, timestampMs)` which may silently fail for cross-origin MJPEG images. The `catch {}` block swallows all errors with no logging.

---

## Changes

### 1. `src/react-app/components/BackgroundVigilancia.tsx`
- Add a **guard ref** (`hasReconnectedRef`) to ensure reconnect only fires **once** per navigation away, not on every render
- Add `setTimeout` with cleanup (matching BackgroundVideo pattern)
- Reset the guard when returning to the page

### 2. `src/react-app/contexts/VigilanciaContext.tsx`
- Stabilize `reconnectSource` by using a ref for `connectSource` instead of a dependency
- Add a `reconnectingRef` guard to prevent concurrent reconnect attempts
- In `connectSource` for MJPEG: after loading the image, draw it onto a hidden canvas and pass the **canvas** to the detector (avoids cross-origin WebGL issues)

### 3. `src/react-app/utils/objectDetector.ts`
- Add `console.warn` logging inside `catch` blocks of `detectObjects` and `detectObjectsFromImage` so errors are no longer silent
- Add a new `detectObjectsFromCanvas()` function that accepts `HTMLCanvasElement` as input

### 4. `src/react-app/hooks/usePersonDetection.ts`
- Support `HTMLCanvasElement` as a detection source type
- Add periodic heartbeat log (every 30 frames) to confirm detection loop is running
- For `HTMLImageElement` sources: use an intermediate canvas to draw the frame before detection

### 5. `src/react-app/pages/Configuracoes.tsx`
- Update version to `1.6.1 (Stable Background + MJPEG Fix)`

## Flow After Fix

```text
BackgroundVigilancia mounts (once per navigation)
  → reconnectSource (guarded, fires once)
    → connectSource
      → MJPEG: img.src = url → img.onload → canvas.drawImage(img) → detection.setVideo(canvas)
      → Webcam: getUserMedia → video.play → detection.setVideo(video)

processFrame (every 300ms)
  → detectObjects(canvas/video, timestamp) → filter persons → check area → alert if scheduled
```

