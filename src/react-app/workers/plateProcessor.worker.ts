/**
 * Web Worker para processamento de imagem em background
 * Move OCR (Tesseract.js), detecção de placa e motion detection para thread separada
 * Evita bloqueio da UI durante processamento pesado
 */

import Tesseract from 'tesseract.js';

// ============ TIPOS ============

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

interface PlateValidationResult {
  isValid: boolean;
  original: string;
  corrected: string;
  formatted: string;
  format: 'mercosul' | 'antiga' | 'unknown';
  confidence: number;
}

interface OCRResult {
  success: boolean;
  rawText: string;
  validation: PlateValidationResult;
  ocrConfidence: number;
  processingTimeMs: number;
}

interface MotionDetectionConfig {
  threshold: number;
  minPixelDifference: number;
  stabilizationMs: number;
}

// ============ MENSAGENS ============

type WorkerMessage = 
  | { type: 'INIT' }
  | { type: 'PROCESS_PLATE'; payload: { imageData: ImageData; width: number; height: number } }
  | { type: 'DETECT_MOTION'; payload: { currentData: Uint8ClampedArray; referenceData: Uint8ClampedArray; config: MotionDetectionConfig } }
  | { type: 'TERMINATE' };

type WorkerResponse = 
  | { type: 'READY' }
  | { type: 'PLATE_RESULT'; payload: OCRResult }
  | { type: 'MOTION_RESULT'; payload: { motionPercent: number } }
  | { type: 'ERROR'; payload: { message: string } }
  | { type: 'PROGRESS'; payload: { stage: string; progress: number } };

// ============ ESTADO DO WORKER ============

let tesseractWorker: Tesseract.Worker | null = null;

// ============ DETECÇÃO DE PLACAS (sem DOM) ============

const PLATE_ASPECT_RATIO_IDEAL = 3.0;
const PLATE_ASPECT_RATIO_MIN = 2.5;
const PLATE_ASPECT_RATIO_MAX = 4.0;
const MIN_PLATE_WIDTH_RATIO = 0.08;
const MAX_PLATE_WIDTH_RATIO = 0.5;
const MIN_PLATE_HEIGHT_RATIO = 0.03;
const MAX_PLATE_HEIGHT_RATIO = 0.2;
const EDGE_THRESHOLD = 30;

// Parâmetros refinados para reduzir falsos positivos
const MIN_EDGE_DENSITY = 0.20;       // Aumentado de 0.15 - placas têm mais bordas
const MIN_CONTRAST_SCORE = 0.4;      // Mínimo de contraste interno
const MAX_SATURATION = 0.50;         // Máximo de saturação (evita faixas amarelas)
const MIN_Y_RATIO = 0.30;            // Ignora 30% superior (céu, prédios)
const MAX_Y_RATIO = 0.92;            // Ignora extremo inferior (chão próximo)

function toGrayscale(data: Uint8ClampedArray): Uint8ClampedArray {
  const grayscale = new Uint8ClampedArray(data.length / 4);
  for (let i = 0; i < data.length; i += 4) {
    grayscale[i / 4] = Math.round(
      data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    );
  }
  return grayscale;
}

function detectEdges(grayscale: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const edges = new Uint8ClampedArray(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      const gx = 
        -grayscale[(y - 1) * width + (x - 1)] + grayscale[(y - 1) * width + (x + 1)] +
        -2 * grayscale[y * width + (x - 1)] + 2 * grayscale[y * width + (x + 1)] +
        -grayscale[(y + 1) * width + (x - 1)] + grayscale[(y + 1) * width + (x + 1)];
      
      const gy = 
        -grayscale[(y - 1) * width + (x - 1)] - 2 * grayscale[(y - 1) * width + x] - grayscale[(y - 1) * width + (x + 1)] +
        grayscale[(y + 1) * width + (x - 1)] + 2 * grayscale[(y + 1) * width + x] + grayscale[(y + 1) * width + (x + 1)];
      
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[idx] = magnitude > EDGE_THRESHOLD ? 255 : 0;
    }
  }
  
  return edges;
}

function calculateEdgeDensity(
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
 * Calcula a saturação média de uma região (para filtrar faixas amarelas)
 * Retorna valor entre 0 (sem saturação) e 1 (totalmente saturado)
 */
function calculateRegionSaturation(
  data: Uint8ClampedArray,
  imageWidth: number,
  x: number, y: number,
  width: number, height: number
): number {
  let totalSaturation = 0;
  let pixelCount = 0;
  
  for (let dy = 0; dy < height; dy += 2) { // Sample every 2 pixels for speed
    for (let dx = 0; dx < width; dx += 2) {
      const idx = ((y + dy) * imageWidth + (x + dx)) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      
      // Saturação HSL
      const l = (max + min) / 2;
      let s = 0;
      if (max !== min) {
        s = l > 127 
          ? (max - min) / (510 - max - min) 
          : (max - min) / (max + min);
      }
      
      totalSaturation += s;
      pixelCount++;
    }
  }
  
  return pixelCount > 0 ? totalSaturation / pixelCount : 0;
}

/**
 * Calcula contraste interno de uma região (placas têm alto contraste texto/fundo)
 * Retorna valor entre 0 (sem contraste) e 1 (alto contraste)
 */
function calculateInternalContrast(
  grayscale: Uint8ClampedArray,
  imageWidth: number,
  x: number, y: number,
  width: number, height: number
): number {
  // Construir histograma simplificado (4 bins)
  const bins = [0, 0, 0, 0];
  let pixelCount = 0;
  
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const idx = (y + dy) * imageWidth + (x + dx);
      const value = grayscale[idx];
      const bin = Math.min(3, Math.floor(value / 64));
      bins[bin]++;
      pixelCount++;
    }
  }
  
  if (pixelCount === 0) return 0;
  
  // Normalizar
  const normalized = bins.map(b => b / pixelCount);
  
  // Verificar se há distribuição bimodal (picos em extremos = bom contraste)
  const darkPixels = normalized[0] + normalized[1];
  const lightPixels = normalized[2] + normalized[3];
  
  // Bom contraste: muitos pixels claros E escuros, poucos no meio
  const contrastScore = Math.min(darkPixels, lightPixels) * 2;
  
  return Math.min(1, contrastScore);
}

/**
 * Verifica se a região tem bordas verticais internas (caracteres)
 */
function hasInternalVerticalEdges(
  edges: Uint8ClampedArray,
  imageWidth: number,
  x: number, y: number,
  width: number, height: number
): boolean {
  // Dividir região em 7 colunas (uma por caractere potencial)
  const colWidth = Math.floor(width / 7);
  let columnsWithEdges = 0;
  
  for (let col = 0; col < 7; col++) {
    const colX = x + col * colWidth;
    let edgeCount = 0;
    
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < colWidth; dx++) {
        const idx = (y + dy) * imageWidth + (colX + dx);
        if (edges[idx] > 0) edgeCount++;
      }
    }
    
    const colDensity = edgeCount / (colWidth * height);
    if (colDensity > 0.1) columnsWithEdges++;
  }
  
  // Placa real deve ter bordas em múltiplas colunas (caracteres)
  return columnsWithEdges >= 4;
}

function findBestPlateRegion(
  imageData: ImageData,
  width: number,
  height: number
): BoundingBox | null {
  // Redimensionar para processamento mais rápido
  const maxProcessSize = 480;
  let scale = 1;
  let processWidth = width;
  let processHeight = height;
  
  if (width > maxProcessSize || height > maxProcessSize) {
    scale = maxProcessSize / Math.max(width, height);
    processWidth = Math.round(width * scale);
    processHeight = Math.round(height * scale);
  }
  
  // Para redimensionamento, criar buffer escalado
  let processData: Uint8ClampedArray;
  if (scale < 1) {
    processData = new Uint8ClampedArray(processWidth * processHeight * 4);
    for (let y = 0; y < processHeight; y++) {
      for (let x = 0; x < processWidth; x++) {
        const srcX = Math.floor(x / scale);
        const srcY = Math.floor(y / scale);
        const srcIdx = (srcY * width + srcX) * 4;
        const dstIdx = (y * processWidth + x) * 4;
        processData[dstIdx] = imageData.data[srcIdx];
        processData[dstIdx + 1] = imageData.data[srcIdx + 1];
        processData[dstIdx + 2] = imageData.data[srcIdx + 2];
        processData[dstIdx + 3] = imageData.data[srcIdx + 3];
      }
    }
  } else {
    processData = imageData.data;
    processWidth = width;
    processHeight = height;
  }
  
  const grayscale = toGrayscale(processData);
  const edges = detectEdges(grayscale, processWidth, processHeight);
  
  // Sliding window para encontrar região com alta densidade de bordas
  const windowWidth = Math.round(processWidth * 0.2);
  const windowHeight = Math.round(windowWidth / PLATE_ASPECT_RATIO_IDEAL);
  const stepX = Math.round(windowWidth / 3);
  const stepY = Math.round(windowHeight / 3);
  
  // Limites verticais baseados em MIN_Y_RATIO e MAX_Y_RATIO
  const minY = Math.round(processHeight * MIN_Y_RATIO);
  const maxY = Math.round(processHeight * MAX_Y_RATIO) - windowHeight;
  
  let bestRegion: BoundingBox | null = null;
  let bestScore = 0;
  
  for (let y = minY; y < maxY; y += stepY) {
    for (let x = 0; x < processWidth - windowWidth; x += stepX) {
      // 1. Verificar proporção
      const aspectRatio = windowWidth / windowHeight;
      if (aspectRatio < PLATE_ASPECT_RATIO_MIN || aspectRatio > PLATE_ASPECT_RATIO_MAX) {
        continue;
      }
      
      // 2. Verificar tamanho relativo
      const relativeWidth = windowWidth / processWidth;
      const relativeHeight = windowHeight / processHeight;
      if (relativeWidth < MIN_PLATE_WIDTH_RATIO || relativeWidth > MAX_PLATE_WIDTH_RATIO ||
          relativeHeight < MIN_PLATE_HEIGHT_RATIO || relativeHeight > MAX_PLATE_HEIGHT_RATIO) {
        continue;
      }
      
      // 3. Calcular densidade de bordas
      const density = calculateEdgeDensity(edges, processWidth, x, y, windowWidth, windowHeight);
      if (density < MIN_EDGE_DENSITY) continue;
      
      // 4. Verificar saturação (filtrar faixas amarelas)
      const saturation = calculateRegionSaturation(processData, processWidth, x, y, windowWidth, windowHeight);
      if (saturation > MAX_SATURATION) continue;
      
      // 5. Verificar contraste interno
      const contrast = calculateInternalContrast(grayscale, processWidth, x, y, windowWidth, windowHeight);
      if (contrast < MIN_CONTRAST_SCORE) continue;
      
      // 6. Verificar bordas verticais internas (caracteres)
      if (!hasInternalVerticalEdges(edges, processWidth, x, y, windowWidth, windowHeight)) continue;
      
      // Calcular score composto
      const aspectScore = 1 - Math.abs(aspectRatio - PLATE_ASPECT_RATIO_IDEAL) / PLATE_ASPECT_RATIO_IDEAL;
      const positionBonus = 1 - Math.abs((y / processHeight) - 0.6) * 0.5; // Preferir região central-baixa
      const score = density * aspectScore * contrast * positionBonus * (1 - saturation * 0.5);
      
      if (score > bestScore) {
        bestScore = score;
        bestRegion = {
          x: Math.round(x / scale),
          y: Math.round(y / scale),
          width: Math.round(windowWidth / scale),
          height: Math.round(windowHeight / scale),
          confidence: score,
        };
      }
    }
  }
  
  return bestRegion;
}

// ============ PRÉ-PROCESSAMENTO DE IMAGEM ============

function preprocessImageData(data: Uint8ClampedArray): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);
  
  // Grayscale + Contrast
  const factor = 1.5;
  const intercept = 128 * (1 - factor);
  
  // Calcular histograma para Otsu
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    const contrasted = Math.max(0, Math.min(255, gray * factor + intercept));
    histogram[Math.round(contrasted)]++;
  }
  
  // Otsu threshold
  const totalPixels = data.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  
  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 128;
  
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    
    const wF = totalPixels - wB;
    if (wF === 0) break;
    
    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);
    
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }
  
  // Aplicar grayscale + contrast + threshold
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    const contrasted = Math.max(0, Math.min(255, gray * factor + intercept));
    const value = contrasted > threshold ? 255 : 0;
    
    result[i] = value;
    result[i + 1] = value;
    result[i + 2] = value;
    result[i + 3] = 255;
  }
  
  return result;
}

// ============ VALIDAÇÃO DE PLACA ============

const MERCOSUL_REGEX = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
const ANTIGA_REGEX = /^[A-Z]{3}[0-9]{4}$/;

const CHAR_SUBSTITUTIONS: Record<string, string[]> = {
  '0': ['O', 'Q', 'D'],
  'O': ['0', 'Q', 'D'],
  '1': ['I', 'L', 'T', '7'],
  'I': ['1', 'L', 'T'],
  '2': ['Z'],
  'Z': ['2'],
  '5': ['S'],
  'S': ['5'],
  '6': ['G', 'B'],
  'G': ['6', 'C'],
  '8': ['B'],
  'B': ['8', '6'],
  'Q': ['0', 'O'],
  'D': ['0', 'O'],
};

function generateVariations(plate: string): string[] {
  const variations = new Set<string>([plate]);
  
  for (let i = 0; i < plate.length; i++) {
    const char = plate[i];
    const subs = CHAR_SUBSTITUTIONS[char];
    
    if (subs) {
      for (const sub of subs) {
        const variation = plate.substring(0, i) + sub + plate.substring(i + 1);
        variations.add(variation);
      }
    }
  }
  
  return Array.from(variations);
}

function validateAndCorrectPlate(rawText: string): PlateValidationResult {
  const cleaned = rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  if (cleaned.length !== 7) {
    return {
      isValid: false,
      original: rawText,
      corrected: cleaned,
      formatted: cleaned,
      format: 'unknown',
      confidence: 0,
    };
  }
  
  // Tentar variações
  const variations = generateVariations(cleaned);
  
  for (const variation of variations) {
    if (MERCOSUL_REGEX.test(variation)) {
      const formatted = variation.substring(0, 3) + '-' + variation.substring(3);
      return {
        isValid: true,
        original: rawText,
        corrected: variation,
        formatted,
        format: 'mercosul',
        confidence: variation === cleaned ? 0.95 : 0.85,
      };
    }
    
    if (ANTIGA_REGEX.test(variation)) {
      const formatted = variation.substring(0, 3) + '-' + variation.substring(3);
      return {
        isValid: true,
        original: rawText,
        corrected: variation,
        formatted,
        format: 'antiga',
        confidence: variation === cleaned ? 0.95 : 0.85,
      };
    }
  }
  
  return {
    isValid: false,
    original: rawText,
    corrected: cleaned,
    formatted: cleaned,
    format: 'unknown',
    confidence: 0.3,
  };
}

// ============ DETECÇÃO DE MOVIMENTO ============

function compareFrames(
  previousData: Uint8ClampedArray,
  currentData: Uint8ClampedArray,
  config: MotionDetectionConfig
): number {
  if (previousData.length !== currentData.length) {
    return 0;
  }
  
  let changedPixels = 0;
  const totalPixels = previousData.length / 4;
  
  for (let i = 0; i < previousData.length; i += 4) {
    const rDiff = Math.abs(previousData[i] - currentData[i]);
    const gDiff = Math.abs(previousData[i + 1] - currentData[i + 1]);
    const bDiff = Math.abs(previousData[i + 2] - currentData[i + 2]);
    
    const avgDiff = (rDiff + gDiff + bDiff) / 3;
    
    if (avgDiff > config.minPixelDifference) {
      changedPixels++;
    }
  }
  
  return changedPixels / totalPixels;
}

// ============ INICIALIZAÇÃO DO TESSERACT ============

async function initTesseract(): Promise<void> {
  if (tesseractWorker) return;
  
  self.postMessage({ type: 'PROGRESS', payload: { stage: 'Carregando OCR...', progress: 0 } });
  
  tesseractWorker = await Tesseract.createWorker('eng', 0, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        self.postMessage({ 
          type: 'PROGRESS', 
          payload: { stage: 'Reconhecendo texto...', progress: m.progress } 
        });
      }
    }
  });
  
  await tesseractWorker.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
  });
}

// ============ PROCESSAMENTO DE PLACA ============

async function processPlate(imageData: ImageData, width: number, height: number): Promise<OCRResult> {
  const startTime = performance.now();
  
  try {
    if (!tesseractWorker) {
      await initTesseract();
    }
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Detectando placa...', progress: 0.1 } });
    
    // 1. Detectar região da placa
    const plateRegion = findBestPlateRegion(imageData, width, height);
    
    let processData: Uint8ClampedArray;
    let processWidth: number;
    let processHeight: number;
    
    if (plateRegion) {
      // Recortar região da placa
      const padding = 5;
      const x = Math.max(0, plateRegion.x - padding);
      const y = Math.max(0, plateRegion.y - padding);
      const w = Math.min(width - x, plateRegion.width + padding * 2);
      const h = Math.min(height - y, plateRegion.height + padding * 2);
      
      processWidth = w;
      processHeight = h;
      processData = new Uint8ClampedArray(w * h * 4);
      
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const srcIdx = ((y + py) * width + (x + px)) * 4;
          const dstIdx = (py * w + px) * 4;
          processData[dstIdx] = imageData.data[srcIdx];
          processData[dstIdx + 1] = imageData.data[srcIdx + 1];
          processData[dstIdx + 2] = imageData.data[srcIdx + 2];
          processData[dstIdx + 3] = 255;
        }
      }
    } else {
      processData = imageData.data;
      processWidth = width;
      processHeight = height;
    }
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Pré-processando...', progress: 0.3 } });
    
    // 2. Pré-processar imagem
    const preprocessed = preprocessImageData(processData);
    
    // 3. Converter para formato que Tesseract aceita usando OffscreenCanvas
    const offscreen = new OffscreenCanvas(processWidth, processHeight);
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) throw new Error('Falha ao criar OffscreenCanvas');
    
    // Criar novo ArrayBuffer para evitar problemas com SharedArrayBuffer
    const dataArray = new Uint8ClampedArray(processWidth * processHeight * 4);
    for (let i = 0; i < preprocessed.length; i++) {
      dataArray[i] = preprocessed[i];
    }
    const processedImageData = new ImageData(dataArray, processWidth, processHeight);
    offCtx.putImageData(processedImageData, 0, 0);
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Executando OCR...', progress: 0.5 } });
    
    // 4. OCR usando OffscreenCanvas
    const result = await tesseractWorker!.recognize(offscreen as unknown as Tesseract.ImageLike);
    
    const rawText = result.data.text.trim();
    const ocrConfidence = result.data.confidence / 100;
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Validando...', progress: 0.9 } });
    
    // 5. Validar placa
    const validation = validateAndCorrectPlate(rawText);
    
    const processingTimeMs = performance.now() - startTime;
    
    return {
      success: validation.isValid,
      rawText,
      validation,
      ocrConfidence,
      processingTimeMs,
    };
  } catch (error) {
    console.error('Erro no processamento:', error);
    return {
      success: false,
      rawText: '',
      validation: {
        isValid: false,
        original: '',
        corrected: '',
        formatted: '',
        format: 'unknown',
        confidence: 0,
      },
      ocrConfidence: 0,
      processingTimeMs: performance.now() - startTime,
    };
  }
}

// ============ HANDLER DE MENSAGENS ============

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data;
  
  try {
    switch (type) {
      case 'INIT':
        await initTesseract();
        self.postMessage({ type: 'READY' } as WorkerResponse);
        break;
        
      case 'PROCESS_PLATE': {
        const { imageData, width, height } = event.data.payload;
        const result = await processPlate(imageData, width, height);
        self.postMessage({ type: 'PLATE_RESULT', payload: result } as WorkerResponse);
        break;
      }
        
      case 'DETECT_MOTION': {
        const { currentData, referenceData, config } = event.data.payload;
        const motionPercent = compareFrames(referenceData, currentData, config);
        self.postMessage({ type: 'MOTION_RESULT', payload: { motionPercent } } as WorkerResponse);
        break;
      }
        
      case 'TERMINATE':
        if (tesseractWorker) {
          await tesseractWorker.terminate();
          tesseractWorker = null;
        }
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    self.postMessage({ type: 'ERROR', payload: { message } } as WorkerResponse);
  }
};

// Notificar que o worker está carregado
console.log('🔧 PlateProcessor Worker carregado');
