/**
 * Utilitário para detecção de movimento em área virtual do vídeo
 * Suporta área poligonal definida por pontos
 * v1.1.89 - Masked EMA: Máquina de estado pura (cálculo delegado ao motion.worker.ts)
 */

// Ponto relativo (0-1) no vídeo
export interface Point {
  x: number;
  y: number;
}

// Área virtual poligonal
export interface VirtualAreaPolygon {
  type: 'polygon';
  points: Point[];
}

// Manter compatibilidade com área retangular legada
export interface VirtualAreaRect {
  type?: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

// Tipo unificado
export type VirtualArea = VirtualAreaPolygon | VirtualAreaRect;

export interface MotionDetectionConfig {
  threshold: number;
  minPixelDifference: number;
  stabilizationMs: number;
}

// === Presets de Sensibilidade ===
export type MotionSensitivity = 'baixa' | 'media' | 'alta' | 'custom';

export interface SensitivityPreset {
  label: string;
  description: string;
  threshold: number;
  minPixelDifference: number;
}

export const SENSITIVITY_PRESETS: Record<Exclude<MotionSensitivity, 'custom'>, SensitivityPreset> = {
  alta: {
    label: 'Alta',
    description: 'Detecta veículos mais facilmente',
    threshold: 0.08,
    minPixelDifference: 25,
  },
  media: {
    label: 'Média',
    description: 'Equilíbrio entre sensibilidade e precisão',
    threshold: 0.15,
    minPixelDifference: 35,
  },
  baixa: {
    label: 'Baixa',
    description: 'Só detecta veículos bem visíveis',
    threshold: 0.25,
    minPixelDifference: 50,
  },
};

const DEFAULT_CONFIG: MotionDetectionConfig = {
  threshold: SENSITIVITY_PRESETS.media.threshold,
  minPixelDifference: SENSITIVITY_PRESETS.media.minPixelDifference,
  stabilizationMs: 500,
};

// Número mínimo de frames consecutivos para confirmar movimento real
const MIN_CONSECUTIVE_MOTION_FRAMES = 2;

const STORAGE_KEY = 'portacerta_virtual_area';
const CAMERA_STORAGE_KEY = 'portacerta_selected_camera';
const RESOLUTION_STORAGE_KEY = 'portacerta_camera_resolution';
const SENSITIVITY_STORAGE_KEY = 'portacerta_motion_sensitivity';
const CUSTOM_SENSITIVITY_KEY = 'portacerta_custom_sensitivity';

// Fast-Track: Delay entre tentativas de OCR
const OCR_RETRY_DELAY_MS = 800;

// === Funções de persistência de sensibilidade ===

export interface CustomSensitivity {
  threshold: number;
  minPixelDifference: number;
}

export function loadMotionSensitivity(): MotionSensitivity {
  try {
    const saved = localStorage.getItem(SENSITIVITY_STORAGE_KEY);
    if (saved && (saved === 'baixa' || saved === 'media' || saved === 'alta' || saved === 'custom')) {
      return saved as MotionSensitivity;
    }
  } catch (e) {
    console.warn('Erro ao carregar sensibilidade:', e);
  }
  return 'media';
}

export function saveMotionSensitivity(sensitivity: MotionSensitivity): void {
  try {
    localStorage.setItem(SENSITIVITY_STORAGE_KEY, sensitivity);
  } catch (e) {
    console.warn('Erro ao salvar sensibilidade:', e);
  }
}

export function loadCustomSensitivity(): CustomSensitivity {
  try {
    const saved = localStorage.getItem(CUSTOM_SENSITIVITY_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Erro ao carregar sensibilidade customizada:', e);
  }
  return { threshold: 0.15, minPixelDifference: 35 };
}

export function saveCustomSensitivity(config: CustomSensitivity): void {
  try {
    localStorage.setItem(CUSTOM_SENSITIVITY_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Erro ao salvar sensibilidade customizada:', e);
  }
}

export function getSensitivityConfig(sensitivity: MotionSensitivity): Partial<MotionDetectionConfig> {
  if (sensitivity === 'custom') {
    const custom = loadCustomSensitivity();
    return {
      threshold: custom.threshold,
      minPixelDifference: custom.minPixelDifference,
    };
  }
  const preset = SENSITIVITY_PRESETS[sensitivity];
  return {
    threshold: preset.threshold,
    minPixelDifference: preset.minPixelDifference,
  };
}

// === Opções de resolução da câmera ===
export type CameraResolution = 'low' | 'medium' | 'high';

export interface ResolutionConfig {
  label: string;
  description: string;
  width: number;
  height: number;
}

export const RESOLUTION_OPTIONS: Record<CameraResolution, ResolutionConfig> = {
  low: {
    label: '480p',
    description: 'Mais rápido (menos delay)',
    width: 640,
    height: 480,
  },
  medium: {
    label: '720p',
    description: 'Equilibrado (padrão)',
    width: 1280,
    height: 720,
  },
  high: {
    label: '1080p',
    description: 'Melhor qualidade',
    width: 1920,
    height: 1080,
  },
};

export function loadCameraResolution(): CameraResolution {
  try {
    const saved = localStorage.getItem(RESOLUTION_STORAGE_KEY);
    if (saved && (saved === 'low' || saved === 'medium' || saved === 'high')) {
      return saved;
    }
  } catch (e) {
    console.warn('Erro ao carregar resolução:', e);
  }
  return 'medium';
}

export function saveCameraResolution(resolution: CameraResolution): void {
  try {
    localStorage.setItem(RESOLUTION_STORAGE_KEY, resolution);
  } catch (e) {
    console.warn('Erro ao salvar resolução:', e);
  }
}

// === Funções de persistência ===

export function loadVirtualArea(): VirtualArea | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.type && parsed.x !== undefined) {
        return { ...parsed, type: 'rect' } as VirtualAreaRect;
      }
      return parsed;
    }
  } catch (e) {
    console.warn('Erro ao carregar área virtual:', e);
  }
  return null;
}

export function saveVirtualArea(area: VirtualArea): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(area));
  } catch (e) {
    console.warn('Erro ao salvar área virtual:', e);
  }
}

export function loadSelectedCamera(): string | null {
  try {
    return localStorage.getItem(CAMERA_STORAGE_KEY);
  } catch (e) {
    console.warn('Erro ao carregar câmera:', e);
  }
  return null;
}

export function saveSelectedCamera(deviceId: string): void {
  try {
    localStorage.setItem(CAMERA_STORAGE_KEY, deviceId);
  } catch (e) {
    console.warn('Erro ao salvar câmera:', e);
  }
}

export function getDefaultVirtualArea(): VirtualAreaPolygon {
  return {
    type: 'polygon',
    points: [
      { x: 0.15, y: 0.3 },
      { x: 0.85, y: 0.3 },
      { x: 0.85, y: 0.7 },
      { x: 0.15, y: 0.7 },
    ],
  };
}

// === Funções de geometria ===

export function isPointInPolygon(px: number, py: number, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    
    if ((yi > py) !== (yj > py) && 
        px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function getPolygonBoundingBox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

export function isPolygonArea(area: VirtualArea): area is VirtualAreaPolygon {
  return (area as VirtualAreaPolygon).type === 'polygon';
}

export function rectToPolygon(rect: VirtualAreaRect): VirtualAreaPolygon {
  return {
    type: 'polygon',
    points: [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x + rect.width, y: rect.y + rect.height },
      { x: rect.x, y: rect.y + rect.height },
    ],
  };
}

export function getPolygonPoints(area: VirtualArea): Point[] {
  if (isPolygonArea(area)) {
    return area.points;
  }
  return rectToPolygon(area).points;
}

/**
 * Extrai pixels da área virtual de um canvas (suporta polígono)
 * PÚBLICO: usado pela Main Thread para capturar ImageData para o motion worker
 */
export function extractAreaPixels(
  ctx: CanvasRenderingContext2D,
  videoWidth: number,
  videoHeight: number,
  area: VirtualArea
): ImageData {
  const points = getPolygonPoints(area);
  const bbox = getPolygonBoundingBox(points);
  
  const x = Math.floor(bbox.minX * videoWidth);
  const y = Math.floor(bbox.minY * videoHeight);
  const width = Math.floor((bbox.maxX - bbox.minX) * videoWidth);
  const height = Math.floor((bbox.maxY - bbox.minY) * videoHeight);
  
  return ctx.getImageData(x, y, Math.max(1, width), Math.max(1, height));
}

/**
 * Compara dois frames e retorna percentual de diferença
 * Mantido para compatibilidade — NÃO usado no loop principal (delegado ao motion worker)
 */
export function compareFrames(
  previousData: ImageData,
  currentData: ImageData,
  config: MotionDetectionConfig = DEFAULT_CONFIG
): number {
  if (previousData.data.length !== currentData.data.length) {
    return 0;
  }
  
  let changedPixels = 0;
  const totalPixels = previousData.data.length / 4;
  
  for (let i = 0; i < previousData.data.length; i += 4) {
    const rDiff = Math.abs(previousData.data[i] - currentData.data[i]);
    const gDiff = Math.abs(previousData.data[i + 1] - currentData.data[i + 1]);
    const bDiff = Math.abs(previousData.data[i + 2] - currentData.data[i + 2]);
    
    const avgDiff = (rDiff + gDiff + bDiff) / 3;
    
    if (avgDiff > config.minPixelDifference) {
      changedPixels++;
    }
  }
  
  return changedPixels / totalPixels;
}

/**
 * Máquina de estado para detecção de movimento
 * v1.1.89: Não acessa vídeo/canvas diretamente — recebe motionPercent do worker
 */
export class MotionDetector {
  private config: MotionDetectionConfig;
  private consecutiveMotionFrames: number = 0;
  
  // Controle de re-tentativa de OCR
  private ocrAttempted: boolean = false;
  private lastOcrAttemptTime: number = 0;
  private ocrSucceeded: boolean = false;
  
  constructor(config: Partial<MotionDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Processa o resultado de motionPercent vindo do motion worker.
   * Aplica lógica de estado: frames consecutivos, cooldown OCR.
   * Retorna se deve disparar OCR.
   */
  processMotionResult(motionPercent: number): { 
    hasMotion: boolean; 
    shouldAttemptOCR: boolean;
  } {
    const now = Date.now();
    
    const vehiclePresent = motionPercent >= this.config.threshold;
    
    if (vehiclePresent) {
      this.consecutiveMotionFrames++;
    } else {
      // Área limpa — resetar OCR flags para próximo veículo
      if (this.consecutiveMotionFrames > 0) {
        if (!this.ocrAttempted) {
          // Nenhuma tentativa OCR foi feita neste ciclo
        }
        this.ocrAttempted = false;
        this.ocrSucceeded = false;
        this.lastOcrAttemptTime = 0;
      }
      this.consecutiveMotionFrames = 0;
    }
    
    const hasMotion = this.consecutiveMotionFrames >= MIN_CONSECUTIVE_MOTION_FRAMES;
    
    // Determinar se deve tentar OCR
    let shouldAttemptOCR = false;
    
    if (hasMotion && !this.ocrSucceeded) {
      const timeSinceLastAttempt = this.lastOcrAttemptTime > 0 
        ? now - this.lastOcrAttemptTime 
        : OCR_RETRY_DELAY_MS; // Primeira tentativa imediata
      
      if (timeSinceLastAttempt >= OCR_RETRY_DELAY_MS) {
        shouldAttemptOCR = true;
      }
    }
    
    return { hasMotion, shouldAttemptOCR };
  }
  
  /**
   * Marca que uma tentativa de OCR foi feita
   */
  markOcrAttempted(): void {
    this.ocrAttempted = true;
    this.lastOcrAttemptTime = Date.now();
  }
  
  /**
   * Marca que o OCR foi bem-sucedido (para de tentar)
   */
  markOcrSuccess(): void {
    this.ocrSucceeded = true;
  }
  
  /**
   * Reseta flags de OCR para permitir nova tentativa
   */
  resetOcrAttempt(): void {
    this.ocrAttempted = false;
    this.ocrSucceeded = false;
    this.lastOcrAttemptTime = 0;
  }
  
  /**
   * Captura a área virtual como canvas separado (para frame fresco ao OCR)
   */
  captureArea(
    video: HTMLVideoElement,
    area: VirtualArea
  ): HTMLCanvasElement {
    const points = getPolygonPoints(area);
    const bbox = getPolygonBoundingBox(points);
    
    const x = Math.floor(bbox.minX * video.videoWidth);
    const y = Math.floor(bbox.minY * video.videoHeight);
    const width = Math.floor((bbox.maxX - bbox.minX) * video.videoWidth);
    const height = Math.floor((bbox.maxY - bbox.minY) * video.videoHeight);
    
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(
        video,
        x, y, width, height,
        0, 0, canvas.width, canvas.height
      );
    }
    
    return canvas;
  }
  
  /**
   * Reseta o estado do detector
   */
  reset(): void {
    this.consecutiveMotionFrames = 0;
    this.ocrAttempted = false;
    this.ocrSucceeded = false;
    this.lastOcrAttemptTime = 0;
  }
  
  /**
   * Reseta completamente (alias para reset, sem referenceFrame)
   */
  fullReset(): void {
    this.reset();
  }
  
  /**
   * Atualiza configurações
   */
  updateConfig(config: Partial<MotionDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Retorna o config atual (para enviar ao motion worker)
   */
  getConfig(): MotionDetectionConfig {
    return { ...this.config };
  }
}
