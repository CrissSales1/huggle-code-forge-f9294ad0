/**
 * Web Worker para processamento de imagem em background
 * Move OCR (Tesseract.js), detecção de placa e motion detection para thread separada
 * Evita bloqueio da UI durante processamento pesado
 * 
 * FASE 1: Processamento completo no worker incluindo fallback API e debug images
 * FASE 2: Integração com TensorFlow.js + YOLOv8 para detecção de placas
 */

import Tesseract from 'tesseract.js';
import * as tf from '@tensorflow/tfjs';

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
  usedFallback?: boolean;
  usedYolo?: boolean;
  debugImage?: string;
  plateRegion?: BoundingBox; // Região da placa detectada pelo YOLO/heurística
}

interface MotionDetectionConfig {
  threshold: number;
  minPixelDifference: number;
  stabilizationMs: number;
}

interface ProcessPlateOptions {
  enableDebug?: boolean;
  enableFallback?: boolean;
  fallbackApiUrl?: string;
  fallbackApiToken?: string;
}

// ============ MENSAGENS ============

type WorkerMessage = 
  | { type: 'INIT' }
  | { type: 'LOAD_YOLO_MODEL' }
  | { type: 'PROCESS_PLATE'; payload: { imageData: ImageData; width: number; height: number; options?: ProcessPlateOptions } }
  | { type: 'DETECT_MOTION'; payload: { currentData: Uint8ClampedArray; referenceData: Uint8ClampedArray; config: MotionDetectionConfig } }
  | { type: 'TERMINATE' };

type WorkerResponse = 
  | { type: 'READY' }
  | { type: 'MODEL_LOADED'; payload: { success: boolean; permanentFailure?: boolean; error?: string } }
  | { type: 'PLATE_RESULT'; payload: OCRResult }
  | { type: 'MOTION_RESULT'; payload: { motionPercent: number } }
  | { type: 'ERROR'; payload: { message: string } }
  | { type: 'PROGRESS'; payload: { stage: string; progress: number } };

// ============ ESTADO DO WORKER ============

let tesseractWorker: Tesseract.Worker | null = null;

// Estado do modelo YOLO (TensorFlow.js)
let yoloModel: any = null;
let modelLoading = false;
let modelReady = false;
let modelFailed = false; // Marca falha permanente para evitar loop infinito
// TensorFlow.js é importado estaticamente no topo do arquivo

// Constantes YOLO
const YOLO_INPUT_SIZE = 640;
const YOLO_CONFIDENCE_THRESHOLD = 0.6; // 60% confiança mínima após sigmoid
const YOLO_MIN_RAW_CONFIDENCE = 0.5; // sigmoid(0.5) ≈ 62% - permite detecções com raw 0.5+

// ============ FUNÇÕES YOLO (TensorFlow.js) ============

async function checkModelExists(): Promise<boolean> {
  try {
    const response = await fetch('/models/yolov8n-plates/model.json', { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

async function loadYoloModel(): Promise<boolean> {
  if (modelReady) return true;
  if (modelLoading) return false;
  if (modelFailed) return false; // Não tentar novamente após falha permanente
  
  modelLoading = true;
  
  try {
    // Verificar se os arquivos do modelo existem
    const modelExists = await checkModelExists();
    if (!modelExists) {
      console.log('ℹ️ Modelo YOLO não disponível, usando detecção heurística');
      modelLoading = false;
      modelFailed = true; // Marcar como falha permanente
      self.postMessage({ 
        type: 'MODEL_LOADED', 
        payload: { success: false, permanentFailure: true, error: 'Modelo não encontrado' } 
      });
      return false;
    }
    
    self.postMessage({ type: 'PROGRESS', payload: { 
      stage: 'Inicializando TensorFlow.js...', 
      progress: 0 
    }});
    
    // TensorFlow.js já está importado estaticamente no topo do arquivo
    
    // Configurar backend WebGL para GPU (fallback para CPU se não disponível)
    try {
      await tf.setBackend('webgl');
    } catch {
      console.log('⚠️ WebGL não disponível, usando CPU');
      await tf.setBackend('cpu');
    }
    await tf.ready();
    
    self.postMessage({ type: 'PROGRESS', payload: { 
      stage: 'Baixando modelo YOLO...', 
      progress: 0.3 
    }});
    
    // Carregar modelo do diretório public
    yoloModel = await tf.loadGraphModel('/models/yolov8n-plates/model.json');
    
    self.postMessage({ type: 'PROGRESS', payload: { 
      stage: 'Preparando modelo...', 
      progress: 0.8 
    }});
    
    // Warmup - primeira inferência é mais lenta
    const warmupTensor = tf.zeros([1, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE, 3]);
    await yoloModel.predict(warmupTensor);
    warmupTensor.dispose();
    
    modelReady = true;
    modelLoading = false;
    
    self.postMessage({ type: 'PROGRESS', payload: { 
      stage: 'Modelo YOLO pronto!', 
      progress: 1 
    }});
    
    console.log('✅ Modelo YOLO carregado com sucesso');
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ Erro ao carregar modelo YOLO:', errorMsg);
    modelLoading = false;
    modelFailed = true; // Marcar como falha permanente
    self.postMessage({ 
      type: 'MODEL_LOADED', 
      payload: { success: false, permanentFailure: true, error: errorMsg } 
    });
    return false;
  }
}

async function detectPlateWithYOLO(
  imageData: ImageData, 
  width: number, 
  height: number
): Promise<BoundingBox | null> {
  if (!modelReady || !yoloModel || !tf) return null;
  
  try {
    // 1. Criar tensor a partir de ImageData
    const imageTensor = tf.browser.fromPixels({
      data: new Uint8Array(imageData.data.buffer),
      width: width,
      height: height,
    });
    
    // 2. Redimensionar para 640x640 (entrada padrão YOLO)
    const resized = tf.image.resizeBilinear(imageTensor, [YOLO_INPUT_SIZE, YOLO_INPUT_SIZE]);
    
    // 3. Normalizar para [0, 1]
    const normalized = resized.div(255.0);
    
    // 4. Adicionar dimensão de batch
    const batched = normalized.expandDims(0);
    
    // 5. Executar inferência
    const predictions = await yoloModel.predict(batched);
    
    // 6. Processar saída do YOLOv8
    // Output shape típico: [1, 5, 8400] ou [1, 8400, 5] dependendo do export
    // onde 5 = 4 (box: cx, cy, w, h) + 1 (confidence para classe "plate")
    const outputData = await predictions.array();
    
    // Determinar formato da saída
    let detections: number[][] = [];
    
    if (Array.isArray(outputData[0]) && Array.isArray(outputData[0][0])) {
      // Formato [1, num_classes+4, num_boxes] - transpor para [num_boxes, num_classes+4]
      const data = outputData[0];
      if (data.length < 8400) {
        // Formato [1, 5, 8400]
        const numBoxes = data[0].length;
        for (let i = 0; i < numBoxes; i++) {
          const box = data.map((row: number[]) => row[i]);
          detections.push(box);
        }
      } else {
        // Formato [1, 8400, 5]
        detections = data;
      }
    }
    
    // 7. Verificar se há detecções reais (YOLO retorna 0 quando não detecta)
    let maxRawConfidence = -Infinity;
    for (const detection of detections) {
      if (detection.length >= 5) {
        maxRawConfidence = Math.max(maxRawConfidence, detection[4]);
      }
    }
    
    // Log para diagnóstico - mostrar top 5 detecções
    if (detections.length > 0) {
      const sample = detections[0];
      console.log(`📊 Amostra de detecção raw: [${sample.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
      console.log(`📊 Máx confiança raw: ${maxRawConfidence.toFixed(4)} (mínimo necessário: ${YOLO_MIN_RAW_CONFIDENCE})`);
      
      // Top 5 detecções para debug
      const topDetections = detections
        .filter(d => d.length >= 5 && d[4] > 0.3)
        .sort((a, b) => b[4] - a[4])
        .slice(0, 5);
      
      if (topDetections.length > 0) {
        console.log(`🔍 Top ${topDetections.length} detecções:`, topDetections.map(d => ({
          cx: d[0].toFixed(1),
          cy: d[1].toFixed(1),
          w: d[2].toFixed(1),
          h: d[3].toFixed(1),
          raw: d[4].toFixed(3),
          conf: `${(100 / (1 + Math.exp(-d[4]))).toFixed(1)}%`
        })));
      }
    }
    
    // Se nenhuma detecção tem confiança raw suficiente, YOLO não detectou nada
    if (maxRawConfidence < YOLO_MIN_RAW_CONFIDENCE) {
      console.log(`⚠️ YOLO não detectou placa (max raw: ${maxRawConfidence.toFixed(3)}). Usando fallback heurístico.`);
      
      // Cleanup tensors antes de retornar
      imageTensor.dispose();
      resized.dispose();
      normalized.dispose();
      batched.dispose();
      if (predictions.dispose) predictions.dispose();
      
      return null; // Sinaliza para usar fallback heurístico
    }
    
    // 8. Encontrar melhor detecção
    let bestBox: BoundingBox | null = null;
    let bestConfidence = YOLO_CONFIDENCE_THRESHOLD;
    
    for (const detection of detections) {
      // Formato esperado: [cx, cy, w, h, confidence_logit]
      if (detection.length < 5) continue;
      
      let [cx, cy, w, h, confidenceRaw] = detection;
      
      // Pular detecções com confiança muito baixa
      if (confidenceRaw < YOLO_MIN_RAW_CONFIDENCE) continue;
      
      // YOLOv8 retorna logits brutos - aplicar sigmoid para obter probabilidade
      const confidence = 1 / (1 + Math.exp(-confidenceRaw));
      
      // Detectar se coordenadas são normalizadas (0-1) ou em pixels (0-640)
      const maxCoord = Math.max(cx, cy, w, h);
      const isNormalized = maxCoord <= 1.0;
      
      if (isNormalized) {
        // Converter de normalizado (0-1) para pixels (0-640)
        cx *= YOLO_INPUT_SIZE;
        cy *= YOLO_INPUT_SIZE;
        w *= YOLO_INPUT_SIZE;
        h *= YOLO_INPUT_SIZE;
      }
      
      // FILTRO ROI: Ignorar detecções no topo da imagem (timestamp da câmera)
      const centerYRatio = cy / YOLO_INPUT_SIZE;
      if (centerYRatio < 0.20) {
        console.log(`⚠️ Detecção no topo da imagem (y=${(centerYRatio*100).toFixed(1)}%) - provavelmente timestamp`);
        continue;
      }
      
      console.log(`📍 Detecção: cx=${cx.toFixed(1)}, cy=${cy.toFixed(1)}, w=${w.toFixed(1)}, h=${h.toFixed(1)}, raw=${confidenceRaw.toFixed(3)}, conf=${(confidence*100).toFixed(1)}%`);
      
      if (confidence > bestConfidence) {
        // Converter de coords em pixels (0-640) para tamanho original da imagem
        const scaleX = width / YOLO_INPUT_SIZE;
        const scaleY = height / YOLO_INPUT_SIZE;
        
        const boxX = Math.round((cx - w/2) * scaleX);
        const boxY = Math.round((cy - h/2) * scaleY);
        const boxW = Math.round(w * scaleX);
        const boxH = Math.round(h * scaleY);
        
        // Validar proporção típica de placa brasileira (2.0:1 a 5.0:1)
        const aspectRatio = boxW / boxH;
        console.log(`📦 Box: x=${boxX}, y=${boxY}, ${boxW}x${boxH}px, proporção=${aspectRatio.toFixed(2)}`);
        
        if (aspectRatio < 2.0 || aspectRatio > 5.0) {
          console.log(`⚠️ Proporção inválida: ${aspectRatio.toFixed(2)} - ignorando detecção`);
          continue;
        }
        
        bestBox = {
          x: boxX,
          y: boxY,
          width: boxW,
          height: boxH,
          confidence: confidence,
        };
        bestConfidence = confidence;
      }
    }
    
    // Cleanup tensors
    imageTensor.dispose();
    resized.dispose();
    normalized.dispose();
    batched.dispose();
    if (predictions.dispose) predictions.dispose();
    
    return bestBox;
  } catch (error) {
    console.error('Erro na detecção YOLO:', error);
    return null;
  }
}

// ============ CONSTANTES DE DETECÇÃO (Heurística) ============

const PLATE_ASPECT_RATIO_IDEAL = 3.0;
const PLATE_ASPECT_RATIO_MIN = 2.5;
const PLATE_ASPECT_RATIO_MAX = 4.0;
const MIN_PLATE_WIDTH_RATIO = 0.08;
const MAX_PLATE_WIDTH_RATIO = 0.5;
const MIN_PLATE_HEIGHT_RATIO = 0.03;
const MAX_PLATE_HEIGHT_RATIO = 0.2;
const EDGE_THRESHOLD = 30;

// Parâmetros refinados para reduzir falsos positivos
const MIN_EDGE_DENSITY = 0.20;
const MIN_CONTRAST_SCORE = 0.4;
const MAX_SATURATION = 0.50;
const MIN_Y_RATIO = 0.35; // Aumentado para ignorar topo da imagem
const MAX_Y_RATIO = 0.85; // Reduzido para ignorar rodapé
const MIN_X_RATIO = 0.20; // Foco no centro horizontal
const MAX_X_RATIO = 0.80;

// Threshold de confiança para fallback
const FALLBACK_CONFIDENCE_THRESHOLD = 0.60;

// ============ FUNÇÕES DE PROCESSAMENTO DE IMAGEM ============

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

function calculateRegionSaturation(
  data: Uint8ClampedArray,
  imageWidth: number,
  x: number, y: number,
  width: number, height: number
): number {
  let totalSaturation = 0;
  let pixelCount = 0;
  
  for (let dy = 0; dy < height; dy += 2) {
    for (let dx = 0; dx < width; dx += 2) {
      const idx = ((y + dy) * imageWidth + (x + dx)) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      
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

function calculateInternalContrast(
  grayscale: Uint8ClampedArray,
  imageWidth: number,
  x: number, y: number,
  width: number, height: number
): number {
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
  
  const normalized = bins.map(b => b / pixelCount);
  const darkPixels = normalized[0] + normalized[1];
  const lightPixels = normalized[2] + normalized[3];
  const contrastScore = Math.min(darkPixels, lightPixels) * 2;
  
  return Math.min(1, contrastScore);
}

function hasInternalVerticalEdges(
  edges: Uint8ClampedArray,
  imageWidth: number,
  x: number, y: number,
  width: number, height: number
): boolean {
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
  
  return columnsWithEdges >= 4;
}

function findBestPlateRegion(
  imageData: ImageData,
  width: number,
  height: number
): BoundingBox | null {
  const maxProcessSize = 480;
  let scale = 1;
  let processWidth = width;
  let processHeight = height;
  
  if (width > maxProcessSize || height > maxProcessSize) {
    scale = maxProcessSize / Math.max(width, height);
    processWidth = Math.round(width * scale);
    processHeight = Math.round(height * scale);
  }
  
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
  
  const windowWidth = Math.round(processWidth * 0.2);
  const windowHeight = Math.round(windowWidth / PLATE_ASPECT_RATIO_IDEAL);
  const stepX = Math.round(windowWidth / 3);
  const stepY = Math.round(windowHeight / 3);
  
  const minY = Math.round(processHeight * MIN_Y_RATIO);
  const maxY = Math.round(processHeight * MAX_Y_RATIO) - windowHeight;
  const minX = Math.round(processWidth * MIN_X_RATIO);
  const maxX = Math.round(processWidth * MAX_X_RATIO) - windowWidth;
  
  let bestRegion: BoundingBox | null = null;
  let bestScore = 0;
  
  for (let y = minY; y < maxY; y += stepY) {
    for (let x = minX; x < maxX; x += stepX) {
      const aspectRatio = windowWidth / windowHeight;
      if (aspectRatio < PLATE_ASPECT_RATIO_MIN || aspectRatio > PLATE_ASPECT_RATIO_MAX) {
        continue;
      }
      
      const relativeWidth = windowWidth / processWidth;
      const relativeHeight = windowHeight / processHeight;
      if (relativeWidth < MIN_PLATE_WIDTH_RATIO || relativeWidth > MAX_PLATE_WIDTH_RATIO ||
          relativeHeight < MIN_PLATE_HEIGHT_RATIO || relativeHeight > MAX_PLATE_HEIGHT_RATIO) {
        continue;
      }
      
      const density = calculateEdgeDensity(edges, processWidth, x, y, windowWidth, windowHeight);
      if (density < MIN_EDGE_DENSITY) continue;
      
      const saturation = calculateRegionSaturation(processData, processWidth, x, y, windowWidth, windowHeight);
      if (saturation > MAX_SATURATION) continue;
      
      const contrast = calculateInternalContrast(grayscale, processWidth, x, y, windowWidth, windowHeight);
      if (contrast < MIN_CONTRAST_SCORE) continue;
      
      if (!hasInternalVerticalEdges(edges, processWidth, x, y, windowWidth, windowHeight)) continue;
      
      const aspectScore = 1 - Math.abs(aspectRatio - PLATE_ASPECT_RATIO_IDEAL) / PLATE_ASPECT_RATIO_IDEAL;
      const positionBonus = 1 - Math.abs((y / processHeight) - 0.6) * 0.5;
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

/**
 * Pré-processa a imagem para OCR
 * @param data - Dados da imagem RGBA
 * @param useBinarization - Se true, aplica binarização Otsu. Se false, retorna grayscale com contraste
 */
function preprocessImageData(data: Uint8ClampedArray, useBinarization: boolean = true): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);
  
  // Fator de contraste mais suave para não destruir detalhes
  const factor = useBinarization ? 1.3 : 1.2;
  const intercept = 128 * (1 - factor);
  
  // Se não usar binarização, retornar grayscale com contraste melhorado
  if (!useBinarization) {
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      const contrasted = Math.max(0, Math.min(255, gray * factor + intercept));
      result[i] = contrasted;
      result[i + 1] = contrasted;
      result[i + 2] = contrasted;
      result[i + 3] = 255;
    }
    return result;
  }
  
  // Binarização com Otsu
  const histogram = new Array(256).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    const contrasted = Math.max(0, Math.min(255, gray * factor + intercept));
    histogram[Math.round(contrasted)]++;
  }
  
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

/**
 * Pré-processamento específico para placas azuis Mercosul
 * Detecta pixels azuis (fundo) e os converte para preto,
 * enquanto preserva texto branco/claro
 */
function preprocessForBluePlate(data: Uint8ClampedArray): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Detectar se é azul (placa Mercosul) - azul dominante
    const isBlue = b > r * 1.2 && b > g && b > 80;
    
    // Calcular luminância
    const luminance = (r * 0.299 + g * 0.587 + b * 0.114);
    
    let value: number;
    if (isBlue) {
      // Fundo azul vira preto
      value = 0;
    } else if (luminance > 160) {
      // Texto branco/claro vira branco puro
      value = 255;
    } else if (luminance > 100) {
      // Zona intermediária - aumentar contraste
      value = luminance > 130 ? 255 : 0;
    } else {
      // Escuro vira preto
      value = 0;
    }
    
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
  'A': ['4'],
  '4': ['A'],
  'E': ['3'],
  '3': ['E'],
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

/**
 * Extrai candidatos de 7 caracteres de texto OCR com ruído
 * Quando OCR retorna texto com mais de 7 caracteres (ex: "I12 333EI"),
 * tenta extrair a subsequência mais provável de placa válida
 */
function extractPlateCandidate(rawText: string): string {
  const cleaned = rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Se já tem 7, retornar
  if (cleaned.length === 7) return cleaned;
  
  // Se tem menos de 7, não há como formar placa
  if (cleaned.length < 7) return cleaned;
  
  // Se tem mais de 7, tentar extrair os 7 mais prováveis
  let candidate = cleaned;
  
  // Remover 'I' ou '1' das extremidades (comum em OCR de placas)
  while (candidate.length > 7 && (candidate[0] === 'I' || candidate[0] === '1')) {
    candidate = candidate.slice(1);
  }
  while (candidate.length > 7 && (candidate.slice(-1) === 'I' || candidate.slice(-1) === '1' || candidate.slice(-1) === 'E')) {
    candidate = candidate.slice(0, -1);
  }
  
  if (candidate.length === 7) {
    // Verificar se é válido com esta extração
    const tempValidation = validatePlateFormat(candidate);
    if (tempValidation.isValid) return candidate;
  }
  
  // Se ainda tem mais de 7, tentar todas as subsequências de 7 caracteres
  if (candidate.length > 7) {
    const candidates: string[] = [];
    for (let i = 0; i <= candidate.length - 7; i++) {
      candidates.push(candidate.slice(i, i + 7));
    }
    
    // Também tentar com o cleaned original
    for (let i = 0; i <= cleaned.length - 7; i++) {
      candidates.push(cleaned.slice(i, i + 7));
    }
    
    // Retornar a primeira que parecer válida
    for (const c of candidates) {
      const tempValidation = validatePlateFormat(c);
      if (tempValidation.isValid) {
        console.log(`🔍 Extraído candidato válido: "${c}" de "${cleaned}"`);
        return c;
      }
    }
    
    // Se nenhuma é válida, tentar aplicar variações em cada candidato
    for (const c of candidates) {
      const variations = generateVariations(c);
      for (const v of variations) {
        const tempValidation = validatePlateFormat(v);
        if (tempValidation.isValid) {
          console.log(`🔍 Extraído candidato com variação: "${v}" de "${cleaned}"`);
          return v;
        }
      }
    }
    
    // Retornar os primeiros 7 caracteres como fallback
    return candidate.slice(0, 7);
  }
  
  return candidate;
}

/**
 * Valida apenas o formato da placa (sem correções)
 */
function validatePlateFormat(plate: string): { isValid: boolean; format: 'mercosul' | 'antiga' | 'unknown' } {
  if (plate.length !== 7) {
    return { isValid: false, format: 'unknown' };
  }
  
  if (MERCOSUL_REGEX.test(plate)) {
    return { isValid: true, format: 'mercosul' };
  }
  
  if (ANTIGA_REGEX.test(plate)) {
    return { isValid: true, format: 'antiga' };
  }
  
  return { isValid: false, format: 'unknown' };
}

function validateAndCorrectPlate(rawText: string): PlateValidationResult {
  const cleaned = rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Usar extração inteligente de candidato
  const candidate = extractPlateCandidate(rawText);
  
  console.log(`📝 OCR: "${rawText}" → limpo: "${cleaned}" (${cleaned.length} chars) → candidato: "${candidate}"`);
  
  if (candidate.length !== 7) {
    return {
      isValid: false,
      original: rawText,
      corrected: candidate,
      formatted: candidate,
      format: 'unknown',
      confidence: 0,
    };
  }
  
  const variations = generateVariations(candidate);
  
  for (const variation of variations) {
    if (MERCOSUL_REGEX.test(variation)) {
      const formatted = variation.substring(0, 3) + '-' + variation.substring(3);
      console.log(`✅ Validação: ${formatted} (Mercosul)`);
      return {
        isValid: true,
        original: rawText,
        corrected: variation,
        formatted,
        format: 'mercosul',
        confidence: variation === candidate ? 0.95 : 0.85,
      };
    }
    
    if (ANTIGA_REGEX.test(variation)) {
      const formatted = variation.substring(0, 3) + '-' + variation.substring(3);
      console.log(`✅ Validação: ${formatted} (Antiga)`);
      return {
        isValid: true,
        original: rawText,
        corrected: variation,
        formatted,
        format: 'antiga',
        confidence: variation === candidate ? 0.95 : 0.85,
      };
    }
  }
  
  console.log(`❌ Validação: INVÁLIDO - "${candidate}"`);
  return {
    isValid: false,
    original: rawText,
    corrected: candidate,
    formatted: candidate,
    format: 'unknown',
    confidence: 0.3,
  };
}

// ============ GERAÇÃO DE DEBUG IMAGE ============

function generateDebugImage(
  imageData: ImageData,
  width: number,
  height: number,
  plateRegion: BoundingBox | null
): string | undefined {
  try {
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d');
    if (!ctx) return undefined;
    
    // Desenhar imagem original
    const clonedData = new Uint8ClampedArray(imageData.data);
    const newImageData = new ImageData(clonedData, width, height);
    ctx.putImageData(newImageData, 0, 0);
    
    // Desenhar bounding box se detectou placa
    if (plateRegion) {
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 3;
      ctx.strokeRect(plateRegion.x, plateRegion.y, plateRegion.width, plateRegion.height);
      
      // Label com confiança
      ctx.fillStyle = '#00FF00';
      ctx.font = 'bold 14px Arial';
      const label = `Placa (${Math.round(plateRegion.confidence * 100)}%)`;
      ctx.fillText(label, plateRegion.x, plateRegion.y - 5);
    } else {
      // Nenhuma região detectada
      ctx.fillStyle = '#FF0000';
      ctx.font = 'bold 16px Arial';
      ctx.fillText('Nenhuma placa detectada', 10, 25);
    }
    
    // Converter para base64 usando blob
    // Note: OffscreenCanvas.convertToBlob é async, então usamos toDataURL via hack
    // Na verdade, OffscreenCanvas não tem toDataURL, então criamos um ImageBitmap
    // Para simplificar, retornamos undefined se não conseguirmos
    
    // Alternativa: Criar um canvas virtual usando ImageData
    const tempCanvas = new OffscreenCanvas(width, height);
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return undefined;
    
    tempCtx.drawImage(offscreen as unknown as CanvasImageSource, 0, 0);
    
    // Não podemos usar toDataURL em OffscreenCanvas
    // Vamos retornar os dados como base64 de outra forma
    // Por enquanto, desabilitamos debug image no worker
    return undefined;
  } catch (error) {
    console.error('Erro ao gerar debug image:', error);
    return undefined;
  }
}

// ============ FALLBACK API ============

async function callFallbackAPI(
  imageData: ImageData,
  width: number,
  height: number,
  options: ProcessPlateOptions
): Promise<OCRResult | null> {
  if (!options.enableFallback || !options.fallbackApiUrl || !options.fallbackApiToken) {
    return null;
  }
  
  try {
    // Criar canvas para converter para JPEG
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;
    
    const clonedData = new Uint8ClampedArray(imageData.data);
    const newImageData = new ImageData(clonedData, width, height);
    ctx.putImageData(newImageData, 0, 0);
    
    // Converter para blob JPEG
    const blob = await offscreen.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    
    // Converter blob para base64
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    
    // Chamar API
    const response = await fetch(options.fallbackApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${options.fallbackApiToken}`,
      },
      body: JSON.stringify({
        upload: `data:image/jpeg;base64,${base64}`,
        regions: ['br'],
      }),
    });
    
    if (!response.ok) {
      console.error('Fallback API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      const plate = result.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      return {
        success: true,
        rawText: result.plate,
        validation: {
          isValid: true,
          original: result.plate,
          corrected: plate,
          formatted: plate.length === 7 ? `${plate.slice(0, 3)}-${plate.slice(3)}` : plate,
          format: plate.length === 7 && /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(plate) ? 'mercosul' : 'antiga',
          confidence: result.score || 0.9,
        },
        ocrConfidence: result.score || 0.9,
        processingTimeMs: 0,
        usedFallback: true,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Fallback API error:', error);
    return null;
  }
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

async function processPlate(
  imageData: ImageData,
  width: number,
  height: number,
  options?: ProcessPlateOptions
): Promise<OCRResult> {
  const startTime = performance.now();
  let usedYolo = false;
  
  try {
    if (!tesseractWorker) {
      await initTesseract();
    }
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Detectando placa...', progress: 0.1 } });
    
    // 1. Tentar detecção com YOLO primeiro (se modelo disponível)
    let plateRegion: BoundingBox | null = null;
    
    if (modelReady) {
      plateRegion = await detectPlateWithYOLO(imageData, width, height);
      usedYolo = plateRegion !== null;
      if (usedYolo) {
        console.log(`🧠 YOLO detectou placa com ${Math.round((plateRegion?.confidence || 0) * 100)}% confiança`);
      }
    }
    
    // 2. Fallback para heurística se YOLO não detectar
    if (!plateRegion) {
      plateRegion = findBestPlateRegion(imageData, width, height);
    }
    
    let processData: Uint8ClampedArray;
    let processWidth: number;
    let processHeight: number;
    
    if (plateRegion) {
      // Recortar região da placa com padding maior para melhor OCR
      const padding = 20; // Aumentado de 5 para 20 pixels
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
    
    // Log do tamanho da região para diagnóstico
    if (plateRegion) {
      console.log(`📍 Recortando região: x=${plateRegion.x}, y=${plateRegion.y}, ${plateRegion.width}x${plateRegion.height}px`);
    }
    console.log(`📏 Região para OCR: ${processWidth}x${processHeight}px`);
    
    // Upscaling: garantir tamanho mínimo para OCR
    const MIN_OCR_WIDTH = 300;
    if (processWidth < MIN_OCR_WIDTH && processWidth > 0) {
      const scale = MIN_OCR_WIDTH / processWidth;
      const newWidth = Math.round(processWidth * scale);
      const newHeight = Math.round(processHeight * scale);
      
      // Upscale bilinear
      const upscaledData = new Uint8ClampedArray(newWidth * newHeight * 4);
      const xRatio = processWidth / newWidth;
      const yRatio = processHeight / newHeight;
      
      for (let y = 0; y < newHeight; y++) {
        for (let x = 0; x < newWidth; x++) {
          const srcX = Math.floor(x * xRatio);
          const srcY = Math.floor(y * yRatio);
          const srcIdx = (srcY * processWidth + srcX) * 4;
          const dstIdx = (y * newWidth + x) * 4;
          
          upscaledData[dstIdx] = processData[srcIdx];
          upscaledData[dstIdx + 1] = processData[srcIdx + 1];
          upscaledData[dstIdx + 2] = processData[srcIdx + 2];
          upscaledData[dstIdx + 3] = 255;
        }
      }
      
      processData = upscaledData;
      processWidth = newWidth;
      processHeight = newHeight;
      console.log(`🔍 Upscaled para OCR: ${processWidth}x${processHeight}px`);
    }
    
    // Helper para executar OCR com um preprocessamento específico
    const runOCRWithPreprocess = async (
      preprocessFn: (data: Uint8ClampedArray) => Uint8ClampedArray,
      methodName: string
    ): Promise<{ rawText: string; ocrConfidence: number; validation: PlateValidationResult }> => {
      const preprocessed = preprocessFn(processData);
      const dataArray = new Uint8ClampedArray(processWidth * processHeight * 4);
      for (let i = 0; i < preprocessed.length; i++) {
        dataArray[i] = preprocessed[i];
      }
      const imgData = new ImageData(dataArray, processWidth, processHeight);
      
      const offscreen = new OffscreenCanvas(processWidth, processHeight);
      const ctx = offscreen.getContext('2d');
      if (!ctx) throw new Error('Falha ao criar OffscreenCanvas');
      ctx.putImageData(imgData, 0, 0);
      
      const result = await tesseractWorker!.recognize(offscreen as unknown as Tesseract.ImageLike);
      const rawText = result.data.text.trim();
      const ocrConfidence = result.data.confidence / 100;
      const validation = validateAndCorrectPlate(rawText);
      
      console.log(`📝 OCR [${methodName}]: "${rawText}" (confiança: ${Math.round(ocrConfidence * 100)}%)`);
      
      return { rawText, ocrConfidence, validation };
    };
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Executando OCR...', progress: 0.4 } });
    
    // Array para armazenar resultados de todas as tentativas
    interface OCRAttempt {
      rawText: string;
      ocrConfidence: number;
      validation: PlateValidationResult;
      method: string;
    }
    const attempts: OCRAttempt[] = [];
    
    // Tentativa 1: Binarização padrão
    try {
      const attempt1 = await runOCRWithPreprocess(
        (data) => preprocessImageData(data, true),
        'binarização'
      );
      attempts.push({ ...attempt1, method: 'binarização' });
    } catch (e) {
      console.error('Erro OCR binarização:', e);
    }
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'OCR alternativo...', progress: 0.55 } });
    
    // Tentativa 2: Grayscale com contraste (se primeira falhou ou baixa confiança)
    const firstValid = attempts[0]?.validation?.isValid;
    const firstConfidence = attempts[0]?.ocrConfidence || 0;
    
    if (!firstValid || firstConfidence < 0.6) {
      try {
        const attempt2 = await runOCRWithPreprocess(
          (data) => preprocessImageData(data, false),
          'grayscale'
        );
        attempts.push({ ...attempt2, method: 'grayscale' });
      } catch (e) {
        console.error('Erro OCR grayscale:', e);
      }
    }
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'OCR placa azul...', progress: 0.7 } });
    
    // Tentativa 3: Específico para placa azul Mercosul (se ainda não encontrou válida)
    const anyValid = attempts.some(a => a.validation.isValid);
    if (!anyValid) {
      try {
        const attempt3 = await runOCRWithPreprocess(
          (data) => preprocessForBluePlate(data),
          'placa azul'
        );
        attempts.push({ ...attempt3, method: 'placa azul' });
      } catch (e) {
        console.error('Erro OCR placa azul:', e);
      }
    }
    
    // Escolher o melhor resultado
    let bestAttempt: OCRAttempt | null = null;
    
    // Prioridade 1: resultado válido com maior confiança
    const validAttempts = attempts.filter(a => a.validation.isValid);
    if (validAttempts.length > 0) {
      bestAttempt = validAttempts.reduce((best, current) => 
        current.ocrConfidence > best.ocrConfidence ? current : best
      );
      console.log(`✅ Usando resultado [${bestAttempt.method}]: "${bestAttempt.validation.formatted}"`);
    } else {
      // Prioridade 2: maior confiança OCR entre inválidos
      bestAttempt = attempts.reduce((best, current) => 
        current.ocrConfidence > best.ocrConfidence ? current : best
      , attempts[0]);
      console.log(`⚠️ Nenhum válido, usando [${bestAttempt?.method}]: "${bestAttempt?.rawText}"`);
    }
    
    const rawText = bestAttempt?.rawText || '';
    const ocrConfidence = bestAttempt?.ocrConfidence || 0;
    const validation = bestAttempt?.validation || {
      isValid: false,
      original: '',
      corrected: '',
      formatted: '',
      format: 'unknown' as const,
      confidence: 0,
    };
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Validando...', progress: 0.9 } });
    
    const processingTimeMs = performance.now() - startTime;
    
    // 6. Verificar se precisa de fallback
    const combinedConfidence = (ocrConfidence + validation.confidence) / 2;
    
    if (!validation.isValid || combinedConfidence < FALLBACK_CONFIDENCE_THRESHOLD) {
      // Tentar fallback se configurado
      if (options?.enableFallback && options?.fallbackApiUrl && options?.fallbackApiToken) {
        self.postMessage({ type: 'PROGRESS', payload: { stage: 'Consultando API...', progress: 0.95 } });
        
        const fallbackResult = await callFallbackAPI(imageData, width, height, options);
        if (fallbackResult) {
          fallbackResult.processingTimeMs = performance.now() - startTime;
          // Gerar debug image se habilitado
          if (options.enableDebug) {
            fallbackResult.debugImage = generateDebugImage(imageData, width, height, plateRegion);
          }
          return fallbackResult;
        }
      }
    }
    
    // Gerar debug image se habilitado
    let debugImage: string | undefined;
    if (options?.enableDebug) {
      debugImage = generateDebugImage(imageData, width, height, plateRegion);
    }
    
    return {
      success: validation.isValid,
      rawText,
      validation,
      ocrConfidence,
      processingTimeMs,
      usedFallback: false,
      usedYolo,
      debugImage,
      plateRegion: plateRegion || undefined,
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
      usedFallback: false,
      usedYolo: false,
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
        
      case 'LOAD_YOLO_MODEL': {
        const success = await loadYoloModel();
        self.postMessage({ type: 'MODEL_LOADED', payload: { success } } as WorkerResponse);
        break;
      }
        
      case 'PROCESS_PLATE': {
        const { imageData, width, height, options } = event.data.payload;
        const result = await processPlate(imageData, width, height, options);
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
        // Limpar modelo YOLO se carregado
        if (yoloModel) {
          yoloModel.dispose?.();
          yoloModel = null;
        }
        modelReady = false;
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    self.postMessage({ type: 'ERROR', payload: { message } } as WorkerResponse);
  }
};

// Notificar que o worker está carregado
console.log('🔧 PlateProcessor Worker carregado');
