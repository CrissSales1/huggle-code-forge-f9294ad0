/**
 * Detector de objetos genérico usando MediaPipe Vision ObjectDetector
 * Modelo EfficientDet-Lite2 baixado do CDN oficial (~7MB)
 * Detecta todas as 80 classes COCO - filtro por categoria no código
 * v1.7.5 — EfficientDet-Lite2 + threshold 0.25
 */

import { ObjectDetector, FilesetResolver } from '@mediapipe/tasks-vision';

export interface ObjectDetection {
  x: number;       // bounding box x (pixels)
  y: number;       // bounding box y (pixels)
  width: number;   // bounding box width (pixels)
  height: number;  // bounding box height (pixels)
  confidence: number;
  centerX: number; // center point relative (0-1)
  centerY: number; // center point relative (0-1)
  category: string; // COCO class name
}

// Categorias pré-definidas
export const VEHICLE_CATEGORIES = ['car', 'truck', 'bus'];
export const PERSON_CATEGORIES = ['person'];

let detector: ObjectDetector | null = null;
let isInitializing = false;

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

/**
 * Inicializa o detector MediaPipe (lazy, singleton)
 * Sem categoryAllowlist - detecta tudo, filtra no código
 */
export async function initObjectDetector(): Promise<ObjectDetector> {
  if (detector) return detector;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (detector) return detector;
  }

  isInitializing = true;
  try {
    console.log('🧠 Inicializando MediaPipe ObjectDetector...');
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    detector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      maxResults: 20,
      scoreThreshold: 0.25,
    });
    console.log('✅ MediaPipe ObjectDetector pronto');
    return detector;
  } catch (err) {
    console.error('❌ Erro ao inicializar MediaPipe:', err);
    throw err;
  } finally {
    isInitializing = false;
  }
}

/** Helper to map detections to ObjectDetection[] */
function mapDetections(
  results: ReturnType<ObjectDetector['detectForVideo']>,
  sourceWidth: number,
  sourceHeight: number
): ObjectDetection[] {
  if (!results.detections) return [];
  return results.detections
    .filter(d => d.categories?.[0] && d.boundingBox)
    .map(d => {
      const bb = d.boundingBox!;
      return {
        x: bb.originX,
        y: bb.originY,
        width: bb.width,
        height: bb.height,
        confidence: d.categories![0].score,
        centerX: (bb.originX + bb.width / 2) / sourceWidth,
        centerY: (bb.originY + bb.height / 2) / sourceHeight,
        category: d.categories![0].categoryName,
      };
    });
}

/**
 * Detecta objetos em um frame de vídeo
 */
export function detectObjects(
  video: HTMLVideoElement,
  timestampMs: number
): ObjectDetection[] {
  if (!detector) return [];

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw === 0 || vh === 0) return [];

  try {
    const results = detector.detectForVideo(video, timestampMs);
    return mapDetections(results, vw, vh);
  } catch (err) {
    console.warn('⚠️ detectObjects error:', err);
    return [];
  }
}

/**
 * Detecta objetos em um HTMLImageElement (para streams MJPEG)
 */
export function detectObjectsFromImage(
  img: HTMLImageElement,
  timestampMs: number
): ObjectDetection[] {
  if (!detector) return [];

  const vw = img.naturalWidth;
  const vh = img.naturalHeight;
  if (vw === 0 || vh === 0) return [];

  try {
    const results = detector.detectForVideo(img as unknown as HTMLVideoElement, timestampMs);
    return mapDetections(results, vw, vh);
  } catch (err) {
    console.warn('⚠️ detectObjectsFromImage error (cross-origin?):', err);
    return [];
  }
}

/** Throttle para erros de SecurityError — logar apenas 1x a cada 10s */
let lastSecurityErrorLog = 0;

function logThrottled(msg: string, err: unknown) {
  const now = Date.now();
  if (err instanceof DOMException && err.name === 'SecurityError') {
    if (now - lastSecurityErrorLog > 10000) {
      lastSecurityErrorLog = now;
      console.warn(msg, err.message);
    }
    return;
  }
  console.warn(msg, err);
}

/**
 * Detecta objetos em um HTMLCanvasElement (para MJPEG via canvas intermediário)
 * Evita problemas de cross-origin WebGL com imagens tainted
 */
export function detectObjectsFromCanvas(
  canvas: HTMLCanvasElement,
  timestampMs: number
): ObjectDetection[] {
  if (!detector) return [];

  const vw = canvas.width;
  const vh = canvas.height;
  if (vw === 0 || vh === 0) return [];

  try {
    const results = detector.detectForVideo(canvas as unknown as HTMLVideoElement, timestampMs);
    return mapDetections(results, vw, vh);
  } catch (err) {
    logThrottled('⚠️ detectObjectsFromCanvas error:', err);
    return [];
  }
}

/**
 * Filtra detecções por categorias
 */
export function filterByCategories(
  detections: ObjectDetection[],
  categories: string[]
): ObjectDetection[] {
  return detections.filter(d => categories.includes(d.category));
}

/**
 * Detecção multi-scale: divide o frame em crops com overlap para detectar objetos distantes/pequenos.
 * Retorna detecções já convertidas para coordenadas do frame original, deduplicadas por IoU.
 */
export function detectObjectsMultiScale(
  source: HTMLVideoElement | HTMLCanvasElement,
  timestampMs: number,
  categories?: string[]
): ObjectDetection[] {
  if (!detector) return [];

  const isCanvas = source instanceof HTMLCanvasElement;
  const sourceW = isCanvas ? source.width : (source as HTMLVideoElement).videoWidth;
  const sourceH = isCanvas ? source.height : (source as HTMLVideoElement).videoHeight;
  if (sourceW === 0 || sourceH === 0) return [];

  // Pass 1: full frame (as today)
  let fullDetections: ObjectDetection[];
  if (isCanvas) {
    fullDetections = detectObjectsFromCanvas(source as HTMLCanvasElement, timestampMs);
  } else {
    fullDetections = detectObjects(source as HTMLVideoElement, timestampMs);
  }

  // Pass 2: 4 quadrants with 20% overlap
  const overlap = 0.2;
  const halfW = sourceW / 2;
  const halfH = sourceH / 2;
  const overlapW = halfW * overlap;
  const overlapH = halfH * overlap;

  const crops = [
    { x: 0, y: 0, w: halfW + overlapW, h: halfH + overlapH },                          // top-left
    { x: halfW - overlapW, y: 0, w: halfW + overlapW, h: halfH + overlapH },            // top-right
    { x: 0, y: halfH - overlapH, w: halfW + overlapW, h: halfH + overlapH },            // bottom-left
    { x: halfW - overlapW, y: halfH - overlapH, w: halfW + overlapW, h: halfH + overlapH }, // bottom-right
  ];

  // Get a temporary canvas for crops
  const cropCanvas = document.createElement('canvas');
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) return fullDetections;

  const cropDetections: ObjectDetection[] = [];

  for (const crop of crops) {
    const cw = Math.round(crop.w);
    const ch = Math.round(crop.h);
    cropCanvas.width = cw;
    cropCanvas.height = ch;
    cropCtx.clearRect(0, 0, cw, ch);

    // Draw the crop region from source
    if (isCanvas) {
      cropCtx.drawImage(source as HTMLCanvasElement, crop.x, crop.y, cw, ch, 0, 0, cw, ch);
    } else {
      cropCtx.drawImage(source as HTMLVideoElement, crop.x, crop.y, cw, ch, 0, 0, cw, ch);
    }

    // Increment timestamp slightly to avoid MediaPipe caching
    const cropTs = timestampMs + 1 + crops.indexOf(crop);
    try {
      const results = detector!.detectForVideo(cropCanvas as unknown as HTMLVideoElement, cropTs);
      if (results.detections) {
        for (const d of results.detections) {
          if (!d.categories?.[0] || !d.boundingBox) continue;
          const bb = d.boundingBox;
          // Convert back to original frame coordinates
          const origX = bb.originX + crop.x;
          const origY = bb.originY + crop.y;
          cropDetections.push({
            x: origX,
            y: origY,
            width: bb.width,
            height: bb.height,
            confidence: d.categories[0].score,
            centerX: (origX + bb.width / 2) / sourceW,
            centerY: (origY + bb.height / 2) / sourceH,
            category: d.categories[0].categoryName,
          });
        }
      }
    } catch {
      // ignore individual crop errors
    }
  }

  // Merge and deduplicate
  const all = [...fullDetections, ...cropDetections];
  const filtered = categories ? all.filter(d => categories.includes(d.category)) : all;
  return deduplicateByIoU(filtered, 0.4);
}

/** Calculate IoU between two bounding boxes */
function calcIoU(a: ObjectDetection, b: ObjectDetection): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (intersection === 0) return 0;
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  return intersection / (areaA + areaB - intersection);
}

/** Remove duplicate detections by IoU, keeping higher confidence */
function deduplicateByIoU(detections: ObjectDetection[], threshold: number): ObjectDetection[] {
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: ObjectDetection[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(sorted[i]);
    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue;
      if (sorted[i].category === sorted[j].category && calcIoU(sorted[i], sorted[j]) > threshold) {
        suppressed.add(j);
      }
    }
  }
  return kept;
}

/**
 * Libera recursos do detector
 */
export function disposeObjectDetector(): void {
  if (detector) {
    detector.close();
    detector = null;
    console.log('🧹 MediaPipe ObjectDetector liberado');
  }
}
