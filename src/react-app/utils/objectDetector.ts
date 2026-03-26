/**
 * Detector de objetos genérico usando MediaPipe Vision ObjectDetector
 * Modelo EfficientDet-Lite baixado do CDN oficial (~4MB)
 * Detecta todas as 80 classes COCO - filtro por categoria no código
 * v1.4.0
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
export const VEHICLE_CATEGORIES = ['car', 'truck', 'bus', 'motorcycle'];
export const PERSON_CATEGORIES = ['person'];

let detector: ObjectDetector | null = null;
let isInitializing = false;

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
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
      scoreThreshold: 0.35,
      // Sem categoryAllowlist - detecta tudo, filtra depois
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
          centerX: (bb.originX + bb.width / 2) / vw,
          centerY: (bb.originY + bb.height / 2) / vh,
          category: d.categories![0].categoryName,
        };
      });
  } catch {
    return [];
  }
}

/**
 * Detecta objetos em um HTMLImageElement (para streams MJPEG)
 * Usa detectForVideo com timestamp — MediaPipe aceita HTMLImageElement como input
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
          centerX: (bb.originX + bb.width / 2) / vw,
          centerY: (bb.originY + bb.height / 2) / vh,
          category: d.categories![0].categoryName,
        };
      });
  } catch {
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
 * Libera recursos do detector
 */
export function disposeObjectDetector(): void {
  if (detector) {
    detector.close();
    detector = null;
    console.log('🧹 MediaPipe ObjectDetector liberado');
  }
}
