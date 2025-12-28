/**
 * Utilitário para detecção de movimento em área virtual do vídeo
 */

export interface VirtualArea {
  x: number;      // Posição X relativa (0-1)
  y: number;      // Posição Y relativa (0-1)
  width: number;  // Largura relativa (0-1)
  height: number; // Altura relativa (0-1)
}

export interface MotionDetectionConfig {
  threshold: number;           // Percentual de pixels diferentes para considerar movimento (0-1)
  minPixelDifference: number;  // Diferença mínima de cor para considerar pixel diferente
  stabilizationMs: number;     // Tempo de estabilização após detectar movimento
}

const DEFAULT_CONFIG: MotionDetectionConfig = {
  threshold: 0.10,         // 10% dos pixels devem mudar
  minPixelDifference: 30,  // Diferença mínima de cor RGB
  stabilizationMs: 500,    // 500ms de estabilização
};

const STORAGE_KEY = 'portacerta_virtual_area';

/**
 * Carrega a área virtual salva no localStorage
 */
export function loadVirtualArea(): VirtualArea | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Erro ao carregar área virtual:', e);
  }
  return null;
}

/**
 * Salva a área virtual no localStorage
 */
export function saveVirtualArea(area: VirtualArea): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(area));
  } catch (e) {
    console.warn('Erro ao salvar área virtual:', e);
  }
}

/**
 * Retorna área virtual padrão (centro do vídeo)
 */
export function getDefaultVirtualArea(): VirtualArea {
  return {
    x: 0.15,
    y: 0.3,
    width: 0.7,
    height: 0.4,
  };
}

/**
 * Extrai pixels da área virtual de um canvas
 */
function extractAreaPixels(
  ctx: CanvasRenderingContext2D,
  videoWidth: number,
  videoHeight: number,
  area: VirtualArea
): ImageData {
  const x = Math.floor(area.x * videoWidth);
  const y = Math.floor(area.y * videoHeight);
  const width = Math.floor(area.width * videoWidth);
  const height = Math.floor(area.height * videoHeight);
  
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

/**
 * Classe para gerenciar detecção de movimento contínua
 */
export class MotionDetector {
  private previousFrame: ImageData | null = null;
  private config: MotionDetectionConfig;
  private lastMotionTime: number = 0;
  private isStabilizing: boolean = false;
  
  constructor(config: Partial<MotionDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Processa um frame e detecta movimento na área virtual
   */
  processFrame(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    area: VirtualArea
  ): { hasMotion: boolean; isStable: boolean; motionPercent: number } {
    const ctx = canvas.getContext('2d');
    if (!ctx || video.videoWidth === 0 || video.videoHeight === 0) {
      return { hasMotion: false, isStable: false, motionPercent: 0 };
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
    
    // Se não tem frame anterior, salvar e retornar
    if (!this.previousFrame) {
      this.previousFrame = currentFrame;
      return { hasMotion: false, isStable: false, motionPercent: 0 };
    }
    
    // Comparar com frame anterior
    const motionPercent = compareFrames(this.previousFrame, currentFrame, this.config);
    const hasMotion = motionPercent >= this.config.threshold;
    
    // Salvar frame atual para próxima comparação
    this.previousFrame = currentFrame;
    
    const now = Date.now();
    
    // Se detectou movimento, atualizar timestamp
    if (hasMotion) {
      this.lastMotionTime = now;
      this.isStabilizing = true;
    }
    
    // Verificar se está estável (sem movimento por tempo suficiente após detecção)
    const isStable = this.isStabilizing && 
                     (now - this.lastMotionTime >= this.config.stabilizationMs);
    
    // Se está estável, resetar flag
    if (isStable) {
      this.isStabilizing = false;
    }
    
    return { hasMotion, isStable, motionPercent };
  }
  
  /**
   * Captura a área virtual como canvas separado
   */
  captureArea(
    video: HTMLVideoElement,
    area: VirtualArea
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const x = Math.floor(area.x * video.videoWidth);
    const y = Math.floor(area.y * video.videoHeight);
    const width = Math.floor(area.width * video.videoWidth);
    const height = Math.floor(area.height * video.videoHeight);
    
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(
        video,
        x, y, width, height,  // Fonte
        0, 0, canvas.width, canvas.height  // Destino
      );
    }
    
    return canvas;
  }
  
  /**
   * Reseta o estado do detector
   */
  reset(): void {
    this.previousFrame = null;
    this.lastMotionTime = 0;
    this.isStabilizing = false;
  }
  
  /**
   * Atualiza configurações
   */
  updateConfig(config: Partial<MotionDetectionConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
