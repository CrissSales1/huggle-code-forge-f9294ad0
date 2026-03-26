

# Plano: Remover motos e corrigir Smart Crop (v1.7.2)

## Problema

1. **Motos disparam OCR**: `VEHICLE_CATEGORIES` inclui `motorcycle`, que aciona o pipeline de leitura de placas. O usuário quer ignorar motos.
2. **Clock capturado como placa**: Quando o veículo dispara OCR, o sistema captura a **area poligonal inteira** (`captureAreaFromVideo`), que inclui o relogio sobreposto no topo do video. O YOLO detecta o texto do relogio como se fosse placa.

## Solucao

### 1. Remover `motorcycle` das categorias de veiculos

**Arquivo**: `src/react-app/utils/objectDetector.ts` (linha 22)

```typescript
// Antes
export const VEHICLE_CATEGORIES = ['car', 'truck', 'bus', 'motorcycle'];

// Depois
export const VEHICLE_CATEGORIES = ['car', 'truck', 'bus'];
```

### 2. Smart Crop: recortar a partir do bounding box do veiculo

**Arquivo**: `src/react-app/contexts/MonitoringContext.tsx`

Em `processFrameForOCR` (linha 788-792), em vez de capturar a area poligonal inteira, usar o bounding box do veiculo detectado (`vehicleBBox`) para recortar apenas a regiao do veiculo com margem de 15%. Isso elimina o relogio e outros artefatos fora do veiculo.

```typescript
// Antes: captura area poligonal inteira
const capturedCanvas = captureAreaFromVideo(videoRef.current, virtualArea);

// Depois: Smart Crop — recorta bounding box do veiculo com margem
const vbb = vehicleBBoxRef.current; // precisamos de um ref
let capturedCanvas: HTMLCanvasElement;

if (vbb) {
  // Crop ao redor do veiculo com 15% de margem
  capturedCanvas = cropVehicleRegion(videoRef.current, vbb, 0.15);
} else {
  // Fallback: area poligonal completa
  capturedCanvas = captureAreaFromVideo(videoRef.current, virtualArea);
}
```

Criar funcao helper `cropVehicleRegion` em `motionDetection.ts`:
- Recebe video, ObjectDetection (com x, y, width, height em pixels), e margem
- Calcula regiao com margem clamped aos limites do video
- Retorna canvas recortado

Adicionar `vehicleBBoxRef` (useRef) sincronizado com `vehicleBBox` state para acesso sincrono no callback.

### 3. Versao

**Arquivo**: `src/react-app/pages/Configuracoes.tsx` → `1.7.2`

## Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/react-app/utils/objectDetector.ts` | Remover `motorcycle` de VEHICLE_CATEGORIES |
| `src/react-app/utils/motionDetection.ts` | Nova funcao `cropVehicleRegion` |
| `src/react-app/contexts/MonitoringContext.tsx` | Smart Crop usando vehicleBBox + vehicleBBoxRef |
| `src/react-app/pages/Configuracoes.tsx` | Versao 1.7.2 |

