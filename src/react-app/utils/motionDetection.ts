/**
 * Utilitário para detecção de movimento em área virtual do vídeo
 * Suporta área poligonal definida por pontos
 * v1.1.28 - Fast-Track OCR Imediato (OCR inicia assim que movimento é detectado)
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
    threshold: 0.08,        // 8% de mudança
    minPixelDifference: 25, // Muito sensível
  },
  media: {
    label: 'Média',
    description: 'Equilíbrio entre sensibilidade e precisão',
    threshold: 0.15,        // 15% de mudança
    minPixelDifference: 35, // Moderado
  },
  baixa: {
    label: 'Baixa',
    description: 'Só detecta veículos bem visíveis',
    threshold: 0.25,        // 25% de mudança
    minPixelDifference: 50, // Menos sensível
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

// === Funções de persistência de sensibilidade ===

export interface CustomSensitivity {
  threshold: number; // 0.05 a 0.40 (5% a 40%)
  minPixelDifference: number; // 15 a 60
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
  return 'media'; // Padrão
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
  return { threshold: 0.15, minPixelDifference: 35 }; // Padrão = média
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
  return 'medium'; // Padrão
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
      // Migrar área retangular legada para o novo formato
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
  // Polígono padrão retangular no centro
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

/**
 * Verifica se um ponto está dentro de um polígono (Ray Casting Algorithm)
 */
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

/**
 * Calcula o bounding box de um polígono
 */
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

/**
 * Verifica se a área é um polígono
 */
export function isPolygonArea(area: VirtualArea): area is VirtualAreaPolygon {
  return (area as VirtualAreaPolygon).type === 'polygon';
}

/**
 * Converte área retangular para polígono
 */
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

/**
 * Obtém os pontos do polígono (converte retângulo se necessário)
 */
export function getPolygonPoints(area: VirtualArea): Point[] {
  if (isPolygonArea(area)) {
    return area.points;
  }
  return rectToPolygon(area).points;
}

/**
 * Extrai pixels da área virtual de um canvas (suporta polígono)
 */
function extractAreaPixels(
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

// Thresholds para detecção por referência
const DETECTION_THRESHOLD = 0.10; // 10% de diferença = veículo presente (v1.1.33)
const CLEAN_THRESHOLD = 0.05;     // 5% de diferença = área considerada limpa
const AUTO_UPDATE_DELAY_MS = 10000; // 10 segundos limpa = atualiza referência
const OCR_RETRY_DELAY_MS = 800;   // Fast-Track: 800ms entre tentativas para coleta de buffer

/**
 * Classe para gerenciar detecção de movimento contínua
 * Usa imagem de referência para detectar veículos (mais robusto)
 */
export class MotionDetector {
  private referenceFrame: ImageData | null = null;
  private previousFrame: ImageData | null = null;
  private config: MotionDetectionConfig;
  private lastMotionTime: number = 0;
  private isStabilizing: boolean = false;
  private consecutiveMotionFrames: number = 0;
  
  // Controle de referência
  private lastCleanTime: number = 0;
  private referenceUpdatePending: boolean = false;
  
  // Controle de re-tentativa de OCR
  private ocrAttempted: boolean = false;
  private lastOcrAttemptTime: number = 0;
  private ocrSucceeded: boolean = false;
  
  // Controle para evitar log excessivo de referência
  private lastReferenceCaptureTime: number = 0;
  private static readonly MIN_REFERENCE_LOG_INTERVAL = 5000; // 5 segundos entre logs
  
  constructor(config: Partial<MotionDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Verifica se há uma imagem de referência capturada
   */
  hasReference(): boolean {
    return this.referenceFrame !== null;
  }
  
  /**
   * Captura a imagem de referência da área virtual
   */
  captureReference(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    area: VirtualArea
  ): boolean {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) {
      return false;
    }
    
    const now = Date.now();
    
    // Evitar recaptura muito frequente (apenas atualiza silenciosamente)
    const shouldLog = now - this.lastReferenceCaptureTime >= MotionDetector.MIN_REFERENCE_LOG_INTERVAL;
    
    // Ajustar canvas para o tamanho do vídeo
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    // Desenhar frame atual no canvas
    ctx.drawImage(video, 0, 0);
    
    // Extrair pixels da área virtual como referência
    const points = getPolygonPoints(area);
    const bbox = getPolygonBoundingBox(points);
    
    const x = Math.floor(bbox.minX * video.videoWidth);
    const y = Math.floor(bbox.minY * video.videoHeight);
    const width = Math.floor((bbox.maxX - bbox.minX) * video.videoWidth);
    const height = Math.floor((bbox.maxY - bbox.minY) * video.videoHeight);
    
    this.referenceFrame = ctx.getImageData(x, y, Math.max(1, width), Math.max(1, height));
    this.lastCleanTime = now;
    this.referenceUpdatePending = false;
    
    // Só loga se passou tempo suficiente desde o último log
    if (shouldLog) {
      this.lastReferenceCaptureTime = now;
      console.log('📸 Referência capturada:', { width, height });
    }
    
    return true;
  }
  
  /**
   * Processa um frame e detecta presença de veículo comparando com referência
   */
  processFrame(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    area: VirtualArea
  ): { hasMotion: boolean; isStable: boolean; shouldAttemptOCR: boolean; motionPercent: number; shouldUpdateReference: boolean } {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) {
      return { hasMotion: false, isStable: false, shouldAttemptOCR: false, motionPercent: 0, shouldUpdateReference: false };
    }
    
    // Se não tem referência, retornar sem detecção
    if (!this.referenceFrame) {
      return { hasMotion: false, isStable: false, shouldAttemptOCR: false, motionPercent: 0, shouldUpdateReference: false };
    }
    
    // Ajustar canvas para o tamanho do vídeo
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    // Desenhar frame atual no canvas
    ctx.drawImage(video, 0, 0);
    
    // Extrair pixels da área virtual
    const currentFrame = extractAreaPixels(ctx, video.videoWidth, video.videoHeight, area);
    
    // Comparar com REFERÊNCIA (não com frame anterior)
    const diffPercent = compareFrames(this.referenceFrame, currentFrame, this.config);
    
    // Guardar frame anterior para detecção de estabilização
    const previousFrameDiff = this.previousFrame 
      ? compareFrames(this.previousFrame, currentFrame, this.config)
      : 0;
    this.previousFrame = currentFrame;
    
    const now = Date.now();
    let shouldUpdateReference = false;
    
    // Veículo detectado se diferença > threshold de detecção
    const vehiclePresent = diffPercent >= DETECTION_THRESHOLD;
    
    // Área limpa se diferença < threshold limpo
    const areaClean = diffPercent < CLEAN_THRESHOLD;
    
    if (vehiclePresent) {
      // Veículo presente
      this.consecutiveMotionFrames++;
      this.lastCleanTime = 0; // Resetar contador de área limpa
      this.referenceUpdatePending = false;
    } else if (areaClean) {
      // Área limpa - verificar se deve atualizar referência
      this.consecutiveMotionFrames = 0;
      
      // Veículo saiu - resetar flags de OCR para próximo veículo
      this.ocrAttempted = false;
      this.ocrSucceeded = false;
      this.lastOcrAttemptTime = 0;
      
      if (this.lastCleanTime === 0) {
        this.lastCleanTime = now;
      } else if (now - this.lastCleanTime >= AUTO_UPDATE_DELAY_MS && !this.referenceUpdatePending) {
        // Área limpa por tempo suficiente - sinalizar atualização de referência
        shouldUpdateReference = true;
        this.referenceUpdatePending = true;
      }
    } else {
      // Zona intermediária - pode ser ruído ou veículo saindo
      this.consecutiveMotionFrames = 0;
      this.lastCleanTime = 0;
    }
    
    // Presença confirmada se detectada em frames consecutivos
    const hasMotion = this.consecutiveMotionFrames >= MIN_CONSECUTIVE_MOTION_FRAMES;
    
    // Detecção de estabilização: veículo presente MAS não está se movendo
    if (hasMotion) {
      // Verificar se o veículo está parado (pouca diferença entre frames consecutivos)
      const isVehicleStatic = previousFrameDiff < 0.05; // Menos de 5% de mudança entre frames
      
      if (isVehicleStatic) {
        if (this.lastMotionTime === 0) {
          this.lastMotionTime = now;
        }
        this.isStabilizing = true;
      } else {
        this.lastMotionTime = now;
      }
    } else {
      this.lastMotionTime = 0;
      this.isStabilizing = false;
    }
    
    // Verificar se está estável (veículo parado por tempo suficiente)
    const isStable = this.isStabilizing && 
                     this.lastMotionTime > 0 &&
                     (now - this.lastMotionTime >= this.config.stabilizationMs);
    
    // Determinar se deve tentar OCR
    let shouldAttemptOCR = false;
    
    // Fast-Track v1.1.28: Começar OCR assim que movimento detectado (não esperar estabilizar)
    // Isso permite coletar leituras para consistência temporal enquanto veículo se aproxima
    if (hasMotion && !this.ocrSucceeded) {
      // Permitir tentativa a cada OCR_RETRY_DELAY_MS para Fast-Track
      const timeSinceLastAttempt = this.lastOcrAttemptTime > 0 
        ? now - this.lastOcrAttemptTime 
        : OCR_RETRY_DELAY_MS; // Primeira tentativa imediata
      
      if (timeSinceLastAttempt >= OCR_RETRY_DELAY_MS) {
        shouldAttemptOCR = true;
        if (!this.ocrAttempted) {
          console.log('🚀 Fast-Track: Iniciando coleta OCR (movimento detectado)');
        }
      }
    }
    
    return { hasMotion, isStable, shouldAttemptOCR, motionPercent: diffPercent, shouldUpdateReference };
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
   * Captura a área virtual como canvas separado (suporta polígono)
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
   * Reseta o estado do detector (mantém referência se existir)
   */
  reset(): void {
    this.previousFrame = null;
    this.lastMotionTime = 0;
    this.isStabilizing = false;
    this.consecutiveMotionFrames = 0;
    this.lastCleanTime = 0;
    this.referenceUpdatePending = false;
    this.ocrAttempted = false;
    this.ocrSucceeded = false;
    this.lastOcrAttemptTime = 0;
  }
  
  /**
   * Reseta completamente incluindo a referência
   */
  fullReset(): void {
    this.reset();
    this.referenceFrame = null;
  }
  
  /**
   * Atualiza configurações
   */
  updateConfig(config: Partial<MotionDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
