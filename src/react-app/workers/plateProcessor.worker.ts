/**
 * Web Worker para processamento de imagem em background
 * Move OCR (ONNX Runtime), detecção de placa e motion detection para thread separada
 * Evita bloqueio da UI durante processamento pesado
 * 
 * v1.1.0: Substituído Tesseract.js por PaddleOCR ONNX (muito mais preciso)
 */

import * as ort from 'onnxruntime-web';
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

interface DebugImages {
  original?: string;      // Frame original completo
  cropped?: string;       // Região recortada (antes do upscale)
  preprocessed?: string;  // Após pré-processamento
  final?: string;         // Resultado final com bounding box
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
  debugImages?: DebugImages; // Múltiplas imagens de debug do pipeline
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

// Estado ONNX OCR (substitui Tesseract)
let onnxSession: ort.InferenceSession | null = null;
let onnxReady = false;
let onnxLoading = false;
let charset: string[] = [];

// Constantes PaddleOCR
const OCR_INPUT_HEIGHT = 32; // PaddleOCR usa altura fixa 32px
const OCR_MIN_WIDTH = 100;   // Largura mínima para OCR

// Estado do modelo YOLO (TensorFlow.js)
let yoloModel: any = null;
let modelLoading = false;
let modelReady = false;
let modelFailed = false; // Marca falha permanente para evitar loop infinito

// Constantes YOLO
const YOLO_INPUT_SIZE = 640;
const YOLO_CONFIDENCE_THRESHOLD = 0.6;
const YOLO_MIN_RAW_CONFIDENCE = 0.5;

// ============ FUNÇÕES ONNX OCR ============

async function loadCharset(): Promise<string[]> {
  try {
    const response = await fetch('/models/plate-ocr/dict.txt');
    const text = await response.text();
    // Cada linha é um caractere, adiciona blank token no início
    const chars = text.split('\n').filter(c => c.length > 0);
    return ['', ...chars]; // blank token + caracteres
  } catch (error) {
    console.warn('⚠️ Falha ao carregar dict.txt, usando charset padrão');
    // Charset padrão para placas BR
    return ['', ...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
  }
}

async function initONNX(): Promise<void> {
  if (onnxReady || onnxLoading) return;
  
  onnxLoading = true;
  
  try {
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Carregando OCR ONNX...', progress: 0 } });
    
    // Carregar charset
    charset = await loadCharset();
    console.log(`📚 Charset carregado: ${charset.length} caracteres`);
    
    // Configurar ONNX Runtime para WASM
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.0/dist/';
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Baixando modelo OCR...', progress: 0.3 } });
    
    // Carregar modelo
    onnxSession = await ort.InferenceSession.create('/models/plate-ocr/rec.onnx', {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Preparando OCR...', progress: 0.8 } });
    
    // Warmup - primeira inferência
    const warmupWidth = 100;
    const warmupData = new Float32Array(3 * OCR_INPUT_HEIGHT * warmupWidth);
    const warmupTensor = new ort.Tensor('float32', warmupData, [1, 3, OCR_INPUT_HEIGHT, warmupWidth]);
    
    try {
      await onnxSession.run({ x: warmupTensor });
    } catch {
      // Tentar nome de entrada alternativo
      try {
        const inputName = onnxSession.inputNames[0];
        await onnxSession.run({ [inputName]: warmupTensor });
      } catch (e) {
        console.warn('⚠️ Warmup falhou, mas continuando:', e);
      }
    }
    
    onnxReady = true;
    onnxLoading = false;
    
    console.log('✅ ONNX OCR pronto (PaddleOCR)');
    console.log(`📊 Input names: ${onnxSession.inputNames.join(', ')}`);
    console.log(`📊 Output names: ${onnxSession.outputNames.join(', ')}`);
    
  } catch (error) {
    onnxLoading = false;
    console.error('❌ Erro ao inicializar ONNX:', error);
    throw error;
  }
}

/**
 * Pré-processa imagem para PaddleOCR
 * Input: ImageData RGBA
 * Output: Float32Array em formato CHW normalizado [-1, 1]
 */
function preprocessForONNX(
  data: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number
): { tensor: Float32Array; width: number; height: number } {
  // Calcular novo tamanho mantendo proporção
  const aspectRatio = srcWidth / srcHeight;
  const targetHeight = OCR_INPUT_HEIGHT;
  let targetWidth = Math.round(targetHeight * aspectRatio);
  
  // Garantir largura mínima
  if (targetWidth < OCR_MIN_WIDTH) {
    targetWidth = OCR_MIN_WIDTH;
  }
  
  // Largura deve ser múltiplo de 4 para alguns modelos
  targetWidth = Math.ceil(targetWidth / 4) * 4;
  
  // Redimensionar imagem (bilinear simples)
  const resizedRGBA = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const xRatio = srcWidth / targetWidth;
  const yRatio = srcHeight / targetHeight;
  
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(Math.floor(x * xRatio), srcWidth - 1);
      const srcY = Math.min(Math.floor(y * yRatio), srcHeight - 1);
      const srcIdx = (srcY * srcWidth + srcX) * 4;
      const dstIdx = (y * targetWidth + x) * 4;
      
      resizedRGBA[dstIdx] = data[srcIdx];
      resizedRGBA[dstIdx + 1] = data[srcIdx + 1];
      resizedRGBA[dstIdx + 2] = data[srcIdx + 2];
      resizedRGBA[dstIdx + 3] = 255;
    }
  }
  
  // Converter para tensor CHW normalizado [-1, 1]
  const pixels = targetWidth * targetHeight;
  const tensor = new Float32Array(3 * pixels);
  
  for (let i = 0; i < pixels; i++) {
    const r = resizedRGBA[i * 4] / 255.0;
    const g = resizedRGBA[i * 4 + 1] / 255.0;
    const b = resizedRGBA[i * 4 + 2] / 255.0;
    
    // Normalização PaddleOCR: (x - 0.5) / 0.5 = 2x - 1
    tensor[i] = r * 2 - 1;                    // R channel
    tensor[pixels + i] = g * 2 - 1;           // G channel
    tensor[2 * pixels + i] = b * 2 - 1;       // B channel
  }
  
  return { tensor, width: targetWidth, height: targetHeight };
}

/**
 * Decodifica output CTC do PaddleOCR
 */
function decodeCTC(output: Float32Array, outputShape: readonly number[]): { text: string; confidence: number } {
  // Shape: [1, seq_len, num_classes] ou [seq_len, num_classes]
  let seqLen: number;
  let numClasses: number;
  
  if (outputShape.length === 3) {
    seqLen = outputShape[1];
    numClasses = outputShape[2];
  } else if (outputShape.length === 2) {
    seqLen = outputShape[0];
    numClasses = outputShape[1];
  } else {
    console.error('Formato de output inesperado:', outputShape);
    return { text: '', confidence: 0 };
  }
  
  let result = '';
  let lastIdx = 0; // blank token
  let totalConf = 0;
  let charCount = 0;
  
  for (let t = 0; t < seqLen; t++) {
    // Encontrar índice com maior probabilidade
    let maxIdx = 0;
    let maxVal = -Infinity;
    
    for (let c = 0; c < numClasses; c++) {
      const val = output[t * numClasses + c];
      if (val > maxVal) {
        maxVal = val;
        maxIdx = c;
      }
    }
    
    // Aplicar softmax para obter probabilidade
    let expSum = 0;
    for (let c = 0; c < numClasses; c++) {
      expSum += Math.exp(output[t * numClasses + c] - maxVal);
    }
    const prob = 1 / expSum; // probabilidade do max após softmax
    
    // CTC: ignorar blank (índice 0) e repetições
    if (maxIdx !== 0 && maxIdx !== lastIdx) {
      if (maxIdx < charset.length) {
        result += charset[maxIdx];
        totalConf += prob;
        charCount++;
      }
    }
    lastIdx = maxIdx;
  }
  
  const confidence = charCount > 0 ? totalConf / charCount : 0;
  
  return { text: result.toUpperCase(), confidence };
}

/**
 * Executa OCR com ONNX
 */
async function runONNXOCR(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Promise<{ text: string; confidence: number }> {
  if (!onnxSession || !onnxReady) {
    await initONNX();
  }
  
  if (!onnxSession) {
    return { text: '', confidence: 0 };
  }
  
  try {
    // Pré-processar imagem
    const { tensor, width: processedWidth, height: processedHeight } = preprocessForONNX(data, width, height);
    
    // Criar tensor de entrada
    const inputTensor = new ort.Tensor('float32', tensor, [1, 3, processedHeight, processedWidth]);
    
    // Executar inferência
    const inputName = onnxSession.inputNames[0];
    const outputs = await onnxSession.run({ [inputName]: inputTensor });
    
    // Obter output
    const outputName = onnxSession.outputNames[0];
    const outputTensor = outputs[outputName];
    const outputData = outputTensor.data as Float32Array;
    const outputShape = outputTensor.dims;
    
    // Decodificar CTC
    const { text, confidence } = decodeCTC(outputData, outputShape);
    
    console.log(`🔤 ONNX OCR: "${text}" (conf: ${(confidence * 100).toFixed(1)}%)`);
    
    return { text, confidence };
  } catch (error) {
    console.error('❌ Erro no OCR ONNX:', error);
    return { text: '', confidence: 0 };
  }
}

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
  if (modelFailed) return false;
  
  modelLoading = true;
  
  try {
    const modelExists = await checkModelExists();
    if (!modelExists) {
      console.log('ℹ️ Modelo YOLO não disponível, usando detecção heurística');
      modelLoading = false;
      modelFailed = true;
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
    
    yoloModel = await tf.loadGraphModel('/models/yolov8n-plates/model.json');
    
    self.postMessage({ type: 'PROGRESS', payload: { 
      stage: 'Preparando modelo...', 
      progress: 0.8 
    }});
    
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
    modelFailed = true;
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
    const imageTensor = tf.browser.fromPixels({
      data: new Uint8Array(imageData.data.buffer),
      width: width,
      height: height,
    });
    
    const resized = tf.image.resizeBilinear(imageTensor, [YOLO_INPUT_SIZE, YOLO_INPUT_SIZE]);
    const normalized = resized.div(255.0);
    const batched = normalized.expandDims(0);
    
    const predictions = await yoloModel.predict(batched);
    const outputData = await predictions.array();
    
    let detections: number[][] = [];
    
    if (Array.isArray(outputData[0]) && Array.isArray(outputData[0][0])) {
      const data = outputData[0];
      if (data.length < 8400) {
        const numBoxes = data[0].length;
        for (let i = 0; i < numBoxes; i++) {
          const box = data.map((row: number[]) => row[i]);
          detections.push(box);
        }
      } else {
        detections = data;
      }
    }
    
    let maxRawConfidence = -Infinity;
    for (const detection of detections) {
      if (detection.length >= 5) {
        maxRawConfidence = Math.max(maxRawConfidence, detection[4]);
      }
    }
    
    if (maxRawConfidence < YOLO_MIN_RAW_CONFIDENCE) {
      imageTensor.dispose();
      resized.dispose();
      normalized.dispose();
      batched.dispose();
      if (predictions.dispose) predictions.dispose();
      return null;
    }
    
    let bestBox: BoundingBox | null = null;
    let bestConfidence = YOLO_CONFIDENCE_THRESHOLD;
    
    for (const detection of detections) {
      if (detection.length < 5) continue;
      
      let [cx, cy, w, h, confidenceRaw] = detection;
      
      if (confidenceRaw < YOLO_MIN_RAW_CONFIDENCE) continue;
      
      const confidence = 1 / (1 + Math.exp(-confidenceRaw));
      
      const maxCoord = Math.max(cx, cy, w, h);
      const isNormalized = maxCoord <= 1.0;
      
      if (isNormalized) {
        cx *= YOLO_INPUT_SIZE;
        cy *= YOLO_INPUT_SIZE;
        w *= YOLO_INPUT_SIZE;
        h *= YOLO_INPUT_SIZE;
      }
      
      if (confidence > bestConfidence) {
        const scaleX = width / YOLO_INPUT_SIZE;
        const scaleY = height / YOLO_INPUT_SIZE;
        
        const boxX = Math.round((cx - w/2) * scaleX);
        const boxY = Math.round((cy - h/2) * scaleY);
        const boxW = Math.round(w * scaleX);
        const boxH = Math.round(h * scaleY);
        
        const aspectRatio = boxW / boxH;
        
        if (aspectRatio < 2.5 || aspectRatio > 4.2) continue;
        if (boxW < 80 || boxH < 20) continue;
        
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

const MIN_EDGE_DENSITY = 0.20;
const MIN_CONTRAST_SCORE = 0.4;
const MAX_SATURATION = 0.50;
const MIN_Y_RATIO = 0.0;
const MAX_Y_RATIO = 1.0;
const MIN_X_RATIO = 0.0;
const MAX_X_RATIO = 1.0;

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

// ============ VALIDAÇÃO DE PLACA ============

const MERCOSUL_REGEX = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
const ANTIGA_REGEX = /^[A-Z]{3}[0-9]{4}$/;

const CHAR_SUBSTITUTIONS: Record<string, string[]> = {
  '0': ['O', 'Q', 'D', 'C'],
  '1': ['I', 'L', 'T', '7', '|'],
  '2': ['Z', '7'],
  '3': ['E', '8'],
  '4': ['A', 'H'],
  '5': ['S', '6'],
  '6': ['G', 'B', '5'],
  '7': ['T', 'Y', '1', '2'],
  '8': ['B', '3'],
  '9': ['G', 'Q', 'P'],
  'A': ['4', 'H'],
  'B': ['8', '6', '3'],
  'C': ['0', 'G'],
  'D': ['0', 'O'],
  'E': ['3', 'F'],
  'F': ['E', 'P', 'T'],
  'G': ['6', '9', 'C'],
  'H': ['4', 'N', 'M'],
  'I': ['1', 'L', 'T', '|'],
  'J': ['1'],
  'L': ['1', 'I', '7'],
  'M': ['N', 'H', 'W'],
  'N': ['M', 'H'],
  'O': ['0', 'Q', 'D', 'C'],
  'P': ['9', 'R'],
  'Q': ['0', 'O', '9'],
  'R': ['P', 'K'],
  'S': ['5', '8'],
  'T': ['7', '1', 'I', 'Y'],
  'U': ['V', 'W', '0'],
  'V': ['U', 'W', 'Y'],
  'W': ['V', 'M', 'N'],
  'Y': ['V', '7', 'T'],
  'Z': ['2', '7'],
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

function extractPlateCandidate(rawText: string): string {
  const cleaned = rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  if (cleaned.length === 7) return cleaned;
  if (cleaned.length < 7) return cleaned;
  
  let candidate = cleaned;
  
  while (candidate.length > 7 && (candidate[0] === 'I' || candidate[0] === '1')) {
    candidate = candidate.slice(1);
  }
  while (candidate.length > 7 && (candidate.slice(-1) === 'I' || candidate.slice(-1) === '1' || candidate.slice(-1) === 'E')) {
    candidate = candidate.slice(0, -1);
  }
  
  if (candidate.length === 7) {
    const tempValidation = validatePlateFormat(candidate);
    if (tempValidation.isValid) return candidate;
  }
  
  if (candidate.length > 7) {
    const candidates: string[] = [];
    for (let i = 0; i <= candidate.length - 7; i++) {
      candidates.push(candidate.slice(i, i + 7));
    }
    
    for (let i = 0; i <= cleaned.length - 7; i++) {
      candidates.push(cleaned.slice(i, i + 7));
    }
    
    for (const c of candidates) {
      const tempValidation = validatePlateFormat(c);
      if (tempValidation.isValid) {
        console.log(`🔍 Extraído candidato válido: "${c}" de "${cleaned}"`);
        return c;
      }
    }
    
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
    
    return candidate.slice(0, 7);
  }
  
  return candidate;
}

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
  const candidate = extractPlateCandidate(rawText);
  
  console.log(`📝 Validação: "${rawText}" → limpo: "${cleaned}" → candidato: "${candidate}"`);
  
  // Se tem 8 caracteres, testar sem o primeiro
  if (cleaned.length === 8) {
    const withoutFirst = cleaned.slice(1);
    
    if (MERCOSUL_REGEX.test(withoutFirst)) {
      const formatted = withoutFirst.substring(0, 3) + '-' + withoutFirst.substring(3);
      return {
        isValid: true,
        original: rawText,
        corrected: withoutFirst,
        formatted,
        format: 'mercosul',
        confidence: 0.75,
      };
    }
    
    if (ANTIGA_REGEX.test(withoutFirst)) {
      const formatted = withoutFirst.substring(0, 3) + '-' + withoutFirst.substring(3);
      return {
        isValid: true,
        original: rawText,
        corrected: withoutFirst,
        formatted,
        format: 'antiga',
        confidence: 0.75,
      };
    }
    
    const variationsWithoutFirst = generateVariations(withoutFirst);
    for (const variation of variationsWithoutFirst) {
      if (MERCOSUL_REGEX.test(variation)) {
        const formatted = variation.substring(0, 3) + '-' + variation.substring(3);
        return {
          isValid: true,
          original: rawText,
          corrected: variation,
          formatted,
          format: 'mercosul',
          confidence: 0.65,
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
          confidence: 0.65,
        };
      }
    }
  }
  
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

async function offscreenCanvasToBase64(canvas: OffscreenCanvas): Promise<string> {
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:image/jpeg;base64,' + btoa(binary);
}

async function generateDebugImage(
  imageData: ImageData,
  width: number,
  height: number,
  plateRegion: BoundingBox | null
): Promise<string | undefined> {
  try {
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d');
    if (!ctx) return undefined;
    
    const clonedData = new Uint8ClampedArray(imageData.data);
    const newImageData = new ImageData(clonedData, width, height);
    ctx.putImageData(newImageData, 0, 0);
    
    if (plateRegion) {
      ctx.strokeStyle = '#00FF00';
      ctx.lineWidth = 3;
      ctx.strokeRect(plateRegion.x, plateRegion.y, plateRegion.width, plateRegion.height);
      
      ctx.fillStyle = '#00FF00';
      ctx.font = 'bold 14px Arial';
      const label = `Placa (${Math.round(plateRegion.confidence * 100)}%)`;
      ctx.fillText(label, plateRegion.x, plateRegion.y - 5);
    } else {
      ctx.fillStyle = '#FF0000';
      ctx.font = 'bold 16px Arial';
      ctx.fillText('Nenhuma placa detectada', 10, 25);
    }
    
    return await offscreenCanvasToBase64(offscreen);
  } catch (error) {
    console.error('Erro ao gerar debug image:', error);
    return undefined;
  }
}

async function generateImageFromData(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Promise<string | undefined> {
  try {
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d');
    if (!ctx) return undefined;
    
    const imgData = new ImageData(new Uint8ClampedArray(data), width, height);
    ctx.putImageData(imgData, 0, 0);
    
    return await offscreenCanvasToBase64(offscreen);
  } catch (error) {
    console.error('Erro ao gerar imagem de dados:', error);
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
    const offscreen = new OffscreenCanvas(width, height);
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;
    
    const clonedData = new Uint8ClampedArray(imageData.data);
    const newImageData = new ImageData(clonedData, width, height);
    ctx.putImageData(newImageData, 0, 0);
    
    const blob = await offscreen.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    
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
    // Inicializar ONNX se necessário
    if (!onnxReady) {
      await initONNX();
    }
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Detectando placa...', progress: 0.1 } });
    
    // 1. Tentar detecção com YOLO primeiro
    let plateRegion: BoundingBox | null = null;
    
    if (modelReady) {
      plateRegion = await detectPlateWithYOLO(imageData, width, height);
      usedYolo = plateRegion !== null;
      if (usedYolo) {
        console.log(`🧠 YOLO detectou placa com ${Math.round((plateRegion?.confidence || 0) * 100)}% confiança`);
      }
    }
    
    // 2. Fallback para heurística
    if (!plateRegion) {
      plateRegion = findBestPlateRegion(imageData, width, height);
    }
    
    let processData: Uint8ClampedArray;
    let processWidth: number;
    let processHeight: number;
    
    if (plateRegion) {
      // Recortar região da placa com padding
      const padding = 15;
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
      
      console.log(`🔲 Região recortada: ${processWidth}x${processHeight}px`);
    } else {
      processData = imageData.data;
      processWidth = width;
      processHeight = height;
    }
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Executando OCR ONNX...', progress: 0.4 } });
    
    // Debug images
    const debugImages: DebugImages = {};
    
    if (options?.enableDebug && processWidth > 0 && processHeight > 0) {
      debugImages.cropped = await generateImageFromData(processData, processWidth, processHeight);
    }
    
    // 3. Executar OCR com ONNX
    const { text: rawText, confidence: ocrConfidence } = await runONNXOCR(
      processData,
      processWidth,
      processHeight
    );
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Validando...', progress: 0.8 } });
    
    // 4. Validar e corrigir placa
    const validation = validateAndCorrectPlate(rawText);
    
    const processingTimeMs = performance.now() - startTime;
    
    // 5. Verificar se precisa de fallback
    const combinedConfidence = (ocrConfidence + validation.confidence) / 2;
    
    if (!validation.isValid || combinedConfidence < FALLBACK_CONFIDENCE_THRESHOLD) {
      if (options?.enableFallback && options?.fallbackApiUrl && options?.fallbackApiToken) {
        self.postMessage({ type: 'PROGRESS', payload: { stage: 'Consultando API...', progress: 0.95 } });
        
        const fallbackResult = await callFallbackAPI(imageData, width, height, options);
        if (fallbackResult) {
          fallbackResult.processingTimeMs = performance.now() - startTime;
          if (options.enableDebug) {
            fallbackResult.debugImage = await generateDebugImage(imageData, width, height, plateRegion);
          }
          return fallbackResult;
        }
      }
    }
    
    // Gerar debug images finais
    let debugImage: string | undefined;
    if (options?.enableDebug) {
      debugImages.original = await generateImageFromData(imageData.data, width, height);
      debugImages.final = await generateDebugImage(imageData, width, height, plateRegion);
      debugImage = debugImages.final;
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
      debugImages: options?.enableDebug ? debugImages : undefined,
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
        await initONNX();
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
        // Limpar ONNX
        if (onnxSession) {
          // onnxSession não tem método dispose explícito em onnxruntime-web
          onnxSession = null;
        }
        onnxReady = false;
        
        // Limpar modelo YOLO
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
console.log('🔧 PlateProcessor Worker carregado (ONNX OCR v1.1.0)');
