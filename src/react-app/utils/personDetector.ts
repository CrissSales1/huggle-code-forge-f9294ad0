/**
 * Detector de pessoas usando MediaPipe Vision ObjectDetector
 * Modelo EfficientDet-Lite baixado do CDN oficial (~4MB)
 * v1.3.0
 */

import { ObjectDetector, FilesetResolver } from '@mediapipe/tasks-vision';

export interface PersonDetection {
  x: number;       // bounding box x (pixels)
  y: number;       // bounding box y (pixels)
  width: number;   // bounding box width (pixels)
  height: number;  // bounding box height (pixels)
  confidence: number;
  centerX: number; // center point relative (0-1)
  centerY: number; // center point relative (0-1)
}

let detector: ObjectDetector | null = null;
let isInitializing = false;

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';

/**
 * Inicializa o detector MediaPipe (lazy, singleton)
 */
export async function initPersonDetector(): Promise<ObjectDetector> {
  if (detector) return detector;
  if (isInitializing) {
    // Aguardar inicialização em andamento
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
      maxResults: 10,
      scoreThreshold: 0.4,
      categoryAllowlist: ['person'],
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
 * Detecta pessoas em um frame de vídeo
 */
export function detectPersons(
  video: HTMLVideoElement,
  timestampMs: number
): PersonDetection[] {
  if (!detector) return [];

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw === 0 || vh === 0) return [];

  try {
    const results = detector.detectForVideo(video, timestampMs);
    if (!results.detections) return [];

    return results.detections
      .filter(d => d.categories?.[0]?.categoryName === 'person')
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
        };
      });
  } catch {
    return [];
  }
}

/**
 * Libera recursos do detector
 */
export function disposePersonDetector(): void {
  if (detector) {
    detector.close();
    detector = null;
    console.log('🧹 MediaPipe ObjectDetector liberado');
  }
}
