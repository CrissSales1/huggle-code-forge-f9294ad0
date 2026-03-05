/**
 * Detector heurístico de placas de veículos
 * Encontra regiões retangulares com proporção ~3:1 típica de placas brasileiras
 * Não usa ML - baseado em análise de bordas e proporções
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface PlateDetectionResult {
  found: boolean;
  regions: BoundingBox[];
  bestRegion: BoundingBox | null;
  debugCanvas?: HTMLCanvasElement;
}

// Proporções de placas brasileiras (Mercosul e antiga)
const PLATE_ASPECT_RATIO_MIN = 2.5;  // Proporção mínima largura/altura
const PLATE_ASPECT_RATIO_MAX = 4.0;  // Proporção máxima largura/altura
const PLATE_ASPECT_RATIO_IDEAL = 3.0; // Proporção ideal

// Tamanhos relativos ao frame (para filtrar ruído)
const MIN_PLATE_WIDTH_RATIO = 0.08;  // Placa deve ter pelo menos 8% da largura do frame
const MAX_PLATE_WIDTH_RATIO = 0.5;   // Placa não deve ter mais que 50% da largura
const MIN_PLATE_HEIGHT_RATIO = 0.03; // Pelo menos 3% da altura
const MAX_PLATE_HEIGHT_RATIO = 0.2;  // Máximo 20% da altura

// Parâmetros para detecção de bordas
const EDGE_THRESHOLD = 30;
const MIN_EDGE_DENSITY = 0.15; // Placas têm bordas bem definidas

/**
 * Detector heurístico de placas
 */
export class PlateDetector {
  private processingCanvas: HTMLCanvasElement;
  private processingCtx: CanvasRenderingContext2D;
  private debugMode: boolean = false;
  
  constructor() {
    this.processingCanvas = document.createElement('canvas');
    this.processingCtx = this.processingCanvas.getContext('2d', { willReadFrequently: true })!;
  }
  
  /**
   * Ativa/desativa modo debug (retorna canvas com visualização)
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }
  
  /**
   * Detecta regiões candidatas a placa no canvas
   */
  detect(sourceCanvas: HTMLCanvasElement): PlateDetectionResult {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    
    // Redimensionar para processamento mais rápido se necessário
    const maxProcessSize = 640;
    let scale = 1;
    let processWidth = width;
    let processHeight = height;
    
    if (width > maxProcessSize || height > maxProcessSize) {
      scale = maxProcessSize / Math.max(width, height);
      processWidth = Math.round(width * scale);
      processHeight = Math.round(height * scale);
    }
    
    // Preparar canvas de processamento
    this.processingCanvas.width = processWidth;
    this.processingCanvas.height = processHeight;
    this.processingCtx.drawImage(sourceCanvas, 0, 0, processWidth, processHeight);
    
    // Obter dados da imagem
    const imageData = this.processingCtx.getImageData(0, 0, processWidth, processHeight);
    
    // 1. Converter para escala de cinza
    const grayscale = this.toGrayscale(imageData);
    
    // 2. Detectar bordas (Sobel simplificado)
    const edges = this.detectEdges(grayscale, processWidth, processHeight);
    
    // 3. Encontrar regiões candidatas usando análise de projeção horizontal
    const candidates = this.findCandidateRegions(edges, processWidth, processHeight, scale);
    
    // 4. Filtrar por proporção de placa
    const validRegions = candidates.filter(region => {
      const aspectRatio = region.width / region.height;
      return aspectRatio >= PLATE_ASPECT_RATIO_MIN && 
             aspectRatio <= PLATE_ASPECT_RATIO_MAX;
    });
    
    // 5. Ordenar por confiança (proximidade da proporção ideal)
    validRegions.sort((a, b) => b.confidence - a.confidence);
    
    // 6. Selecionar melhor região
    const bestRegion = validRegions.length > 0 ? validRegions[0] : null;
    
    const result: PlateDetectionResult = {
      found: bestRegion !== null,
      regions: validRegions,
      bestRegion,
    };
    
    // Debug: desenhar regiões detectadas
    if (this.debugMode) {
      result.debugCanvas = this.createDebugCanvas(sourceCanvas, validRegions, bestRegion);
    }
    
    return result;
  }
  
  /**
   * Converte para escala de cinza
   */
  private toGrayscale(imageData: ImageData): Uint8ClampedArray {
    const data = imageData.data;
    const grayscale = new Uint8ClampedArray(data.length / 4);
    
    for (let i = 0; i < data.length; i += 4) {
      grayscale[i / 4] = Math.round(
        data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      );
    }
    
    return grayscale;
  }
  
  /**
   * Detecta bordas usando Sobel simplificado
   */
  private detectEdges(grayscale: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
    const edges = new Uint8ClampedArray(width * height);
    
    // Sobel kernel simplificado
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // Gradiente horizontal (detecta bordas verticais - importantes para placas)
        const gx = 
          -grayscale[(y - 1) * width + (x - 1)] + grayscale[(y - 1) * width + (x + 1)] +
          -2 * grayscale[y * width + (x - 1)] + 2 * grayscale[y * width + (x + 1)] +
          -grayscale[(y + 1) * width + (x - 1)] + grayscale[(y + 1) * width + (x + 1)];
        
        // Gradiente vertical (detecta bordas horizontais)
        const gy = 
          -grayscale[(y - 1) * width + (x - 1)] - 2 * grayscale[(y - 1) * width + x] - grayscale[(y - 1) * width + (x + 1)] +
          grayscale[(y + 1) * width + (x - 1)] + 2 * grayscale[(y + 1) * width + x] + grayscale[(y + 1) * width + (x + 1)];
        
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edges[idx] = magnitude > EDGE_THRESHOLD ? 255 : 0;
      }
    }
    
    return edges;
  }
  
  /**
   * Encontra regiões candidatas usando análise de projeção horizontal e busca de contornos
   */
  private findCandidateRegions(
    edges: Uint8ClampedArray, 
    width: number, 
    height: number,
    scale: number
  ): BoundingBox[] {
    const candidates: BoundingBox[] = [];
    
    // Método 1: Análise de projeção horizontal (detecta linhas com muitas bordas)
    const horizontalProjection = new Array(height).fill(0);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (edges[y * width + x] > 0) {
          horizontalProjection[y]++;
        }
      }
    }
    
    // Encontrar picos na projeção (regiões com muitas bordas)
    const avgProjection = horizontalProjection.reduce((a, b) => a + b, 0) / height;
    const threshold = avgProjection * 1.5;
    
    let inRegion = false;
    let regionStart = 0;
    
    for (let y = 0; y < height; y++) {
      if (horizontalProjection[y] > threshold && !inRegion) {
        inRegion = true;
        regionStart = y;
      } else if ((horizontalProjection[y] <= threshold || y === height - 1) && inRegion) {
        inRegion = false;
        const regionHeight = y - regionStart;
        
        // Analisar esta faixa horizontal para encontrar regiões retangulares
        const faixaCandidates = this.findRegionsInStrip(
          edges, width, height, 
          regionStart, regionHeight,
          scale
        );
        
        candidates.push(...faixaCandidates);
      }
    }
    
    // Método 2: Sliding window para detectar regiões com alta densidade de bordas
    const windowWidth = Math.round(width * 0.15); // 15% da largura
    const windowHeight = Math.round(windowWidth / PLATE_ASPECT_RATIO_IDEAL);
    const stepX = Math.round(windowWidth / 4);
    const stepY = Math.round(windowHeight / 4);
    
    for (let y = 0; y < height - windowHeight; y += stepY) {
      for (let x = 0; x < width - windowWidth; x += stepX) {
        const density = this.calculateEdgeDensity(edges, width, x, y, windowWidth, windowHeight);
        
        if (density >= MIN_EDGE_DENSITY) {
          // Verificar se já não temos uma região similar
          const exists = candidates.some(c => 
            Math.abs(c.x / scale - x / scale) < windowWidth * 0.5 &&
            Math.abs(c.y / scale - y / scale) < windowHeight * 0.5
          );
          
          if (!exists) {
            const aspectRatio = windowWidth / windowHeight;
            const aspectScore = 1 - Math.abs(aspectRatio - PLATE_ASPECT_RATIO_IDEAL) / PLATE_ASPECT_RATIO_IDEAL;
            
            candidates.push({
              x: Math.round(x / scale),
              y: Math.round(y / scale),
              width: Math.round(windowWidth / scale),
              height: Math.round(windowHeight / scale),
              confidence: density * aspectScore,
            });
          }
        }
      }
    }
    
    return this.mergeOverlappingRegions(candidates);
  }
  
  /**
   * Encontra regiões em uma faixa horizontal
   */
  private findRegionsInStrip(
    edges: Uint8ClampedArray,
    width: number,
    height: number,
    stripY: number,
    stripHeight: number,
    scale: number
  ): BoundingBox[] {
    const regions: BoundingBox[] = [];
    
    // Projeção vertical na faixa
    const verticalProjection = new Array(width).fill(0);
    
    for (let x = 0; x < width; x++) {
      for (let y = stripY; y < Math.min(stripY + stripHeight, height); y++) {
        if (edges[y * width + x] > 0) {
          verticalProjection[x]++;
        }
      }
    }
    
    // Encontrar segmentos contínuos
    const avgV = verticalProjection.reduce((a, b) => a + b, 0) / width;
    const thresholdV = avgV * 0.8;
    
    let inSegment = false;
    let segmentStart = 0;
    
    for (let x = 0; x < width; x++) {
      if (verticalProjection[x] > thresholdV && !inSegment) {
        inSegment = true;
        segmentStart = x;
      } else if ((verticalProjection[x] <= thresholdV || x === width - 1) && inSegment) {
        inSegment = false;
        const segmentWidth = x - segmentStart;
        
        // Verificar proporção
        const aspectRatio = segmentWidth / stripHeight;
        if (aspectRatio >= PLATE_ASPECT_RATIO_MIN * 0.8 && 
            aspectRatio <= PLATE_ASPECT_RATIO_MAX * 1.2) {
          
          // Verificar tamanho relativo
          const relativeWidth = segmentWidth / width;
          const relativeHeight = stripHeight / height;
          
          if (relativeWidth >= MIN_PLATE_WIDTH_RATIO && 
              relativeWidth <= MAX_PLATE_WIDTH_RATIO &&
              relativeHeight >= MIN_PLATE_HEIGHT_RATIO &&
              relativeHeight <= MAX_PLATE_HEIGHT_RATIO) {
            
            const aspectScore = 1 - Math.abs(aspectRatio - PLATE_ASPECT_RATIO_IDEAL) / PLATE_ASPECT_RATIO_IDEAL;
            const density = this.calculateEdgeDensity(
              edges, width, segmentStart, stripY, segmentWidth, stripHeight
            );
            
            regions.push({
              x: Math.round(segmentStart / scale),
              y: Math.round(stripY / scale),
              width: Math.round(segmentWidth / scale),
              height: Math.round(stripHeight / scale),
              confidence: aspectScore * density,
            });
          }
        }
      }
    }
    
    return regions;
  }
  
  /**
   * Calcula densidade de bordas em uma região
   */
  private calculateEdgeDensity(
    edges: Uint8ClampedArray,
    imageWidth: number,
    x: number, y: number,
    width: number, height: number
  ): number {
    let edgeCount = 0;
    const totalPixels = width * height;
    
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const idx = (y + dy) * imageWidth + (x + dx);
        if (edges[idx] > 0) {
          edgeCount++;
        }
      }
    }
    
    return edgeCount / totalPixels;
  }
  
  /**
   * Mescla regiões sobrepostas
   */
  private mergeOverlappingRegions(regions: BoundingBox[]): BoundingBox[] {
    if (regions.length <= 1) return regions;
    
    const merged: BoundingBox[] = [];
    const used = new Set<number>();
    
    for (let i = 0; i < regions.length; i++) {
      if (used.has(i)) continue;
      
      let current = { ...regions[i] };
      used.add(i);
      
      for (let j = i + 1; j < regions.length; j++) {
        if (used.has(j)) continue;
        
        if (this.regionsOverlap(current, regions[j])) {
          // Mesclar: usar a região de maior confiança como base
          if (regions[j].confidence > current.confidence) {
            current = { ...regions[j] };
          }
          used.add(j);
        }
      }
      
      merged.push(current);
    }
    
    return merged;
  }
  
  /**
   * Verifica se duas regiões se sobrepõem significativamente
   */
  private regionsOverlap(a: BoundingBox, b: BoundingBox): boolean {
    const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const overlapArea = overlapX * overlapY;
    const minArea = Math.min(a.width * a.height, b.width * b.height);
    
    return overlapArea > minArea * 0.3; // 30% de sobreposição
  }
  
  /**
   * Cria canvas de debug com visualização das regiões detectadas
   */
  private createDebugCanvas(
    source: HTMLCanvasElement,
    regions: BoundingBox[],
    best: BoundingBox | null
  ): HTMLCanvasElement {
    const debug = document.createElement('canvas');
    debug.width = source.width;
    debug.height = source.height;
    const ctx = debug.getContext('2d')!;
    
    // Desenhar imagem original
    ctx.drawImage(source, 0, 0);
    
    // Desenhar todas as regiões em amarelo
    ctx.strokeStyle = 'yellow';
    ctx.lineWidth = 2;
    regions.forEach(r => {
      ctx.strokeRect(r.x, r.y, r.width, r.height);
      ctx.fillStyle = 'rgba(255, 255, 0, 0.2)';
      ctx.fillRect(r.x, r.y, r.width, r.height);
    });
    
    // Desenhar melhor região em verde
    if (best) {
      ctx.strokeStyle = 'lime';
      ctx.lineWidth = 3;
      ctx.strokeRect(best.x, best.y, best.width, best.height);
      ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
      ctx.fillRect(best.x, best.y, best.width, best.height);
      
      // Label
      ctx.fillStyle = 'lime';
      ctx.font = '14px Arial';
      ctx.fillText(`${Math.round(best.confidence * 100)}%`, best.x, best.y - 5);
    }
    
    return debug;
  }
  
  /**
   * Recorta a região da placa do canvas original
   */
  cropPlateRegion(
    source: HTMLCanvasElement, 
    region: BoundingBox,
    padding: number = 0.1 // 10% de padding
  ): HTMLCanvasElement {
    const padX = Math.round(region.width * padding);
    const padY = Math.round(region.height * padding);
    
    const x = Math.max(0, region.x - padX);
    const y = Math.max(0, region.y - padY);
    const width = Math.min(source.width - x, region.width + padX * 2);
    const height = Math.min(source.height - y, region.height + padY * 2);
    
    const cropped = document.createElement('canvas');
    cropped.width = width;
    cropped.height = height;
    const ctx = cropped.getContext('2d')!;
    
    ctx.drawImage(source, x, y, width, height, 0, 0, width, height);
    
    return cropped;
  }
}

// Singleton para reutilização
let detectorInstance: PlateDetector | null = null;

export function getPlateDetector(): PlateDetector {
  if (!detectorInstance) {
    detectorInstance = new PlateDetector();
  }
  return detectorInstance;
}

/**
 * Função utilitária para detectar e recortar placa em uma única chamada
 */
export function detectAndCropPlate(
  canvas: HTMLCanvasElement
): { success: boolean; croppedCanvas: HTMLCanvasElement | null; confidence: number } {
  const detector = getPlateDetector();
  const result = detector.detect(canvas);
  
  if (result.found && result.bestRegion) {
    const cropped = detector.cropPlateRegion(canvas, result.bestRegion);
    return {
      success: true,
      croppedCanvas: cropped,
      confidence: result.bestRegion.confidence,
    };
  }
  
  return {
    success: false,
    croppedCanvas: null,
    confidence: 0,
  };
}
