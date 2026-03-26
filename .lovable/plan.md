

# Plano: Adicionar `crossOrigin="anonymous"` + Throttle de Erros (v1.6.2)

## Problema

O canvas continua "tainted" porque o `<img>` que carrega o MJPEG de `https://localhost:8443/stream` nunca recebe o atributo `crossOrigin="anonymous"`. O servidor Flask ja tem `CORS(app)`, entao so falta o frontend pedir CORS.

## Mudancas

### 1. `src/react-app/contexts/VigilanciaContext.tsx` (linha ~252-254)
Antes de setar `img.src`, adicionar `img.crossOrigin = 'anonymous'`:
```typescript
img.crossOrigin = 'anonymous';
img.src = cfg.ipUrl;
```

### 2. `src/react-app/pages/Vigilancia.tsx` (linha ~371-375)
Adicionar `crossOrigin="anonymous"` no `<img>`:
```tsx
<img ref={imgRef} alt="Stream MJPEG" crossOrigin="anonymous" ... />
```

### 3. `src/react-app/components/BackgroundVigilancia.tsx` (linha ~51)
Adicionar `crossOrigin="anonymous"` no `<img>`:
```tsx
<img ref={imgRef} alt="" crossOrigin="anonymous" ... />
```

### 4. `src/react-app/utils/objectDetector.ts` (linhas ~139-156)
Throttle do log de `SecurityError` para evitar spam no console — logar apenas 1x a cada 10s:
```typescript
let lastSecurityErrorLog = 0;
// no catch: if SecurityError && Date.now() - lastSecurityErrorLog > 10000 → log, else skip
```

### 5. `src/react-app/pages/Configuracoes.tsx` (linha ~1333)
Atualizar versao para `1.6.2 (CORS MJPEG Fix)`.

## Resultado

```
img (crossOrigin=anonymous) + Flask CORS → canvas limpo → WebGL funciona → MediaPipe detecta pessoas
```

