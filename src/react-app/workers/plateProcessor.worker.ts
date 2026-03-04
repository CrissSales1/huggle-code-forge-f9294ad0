/**
 * Web Worker para processamento de imagem em background
 * Move OCR (ONNX Runtime), detecção de placa e motion detection para thread separada
 * Evita bloqueio da UI durante processamento pesado
 * 
 * v1.2.0: Pipeline Unificado + Grid Thresholding — validação centralizada em shared/plateValidation
 */

import * as ort from 'onnxruntime-web';
import * as tf from '@tensorflow/tfjs';
import {
  heuristicCorrection,
  validateAndCorrectPlate,
  isForbiddenText,
  type PlateValidationResult,
} from '../../shared/plateValidation';

// ============ TIPOS ============

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

interface DebugImages {
  original?: string;
  cropped?: string;
  preprocessed?: string;
  final?: string;
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
  debugImages?: DebugImages;
  plateRegion?: BoundingBox;
  candidates?: Array<{ text: string; confidence: number; format: string }>;
}

interface ProcessPlateOptions {
  enableDebug?: boolean;
  enableFallback?: boolean;
  fallbackApiUrl?: string;
  fallbackApiToken?: string;
  forceNightMode?: boolean;
}

// ============ MENSAGENS ============

type WorkerMessage = 
  | { type: 'INIT' }
  | { type: 'LOAD_YOLO_MODEL' }
  | { type: 'PROCESS_PLATE'; payload: { imageData: ImageData; width: number; height: number; options?: ProcessPlateOptions } }
  | { type: 'TERMINATE' };

type WorkerResponse = 
  | { type: 'READY' }
  | { type: 'MODEL_LOADED'; payload: { success: boolean; permanentFailure?: boolean; error?: string } }
  | { type: 'PLATE_RESULT'; payload: OCRResult }
  | { type: 'ERROR'; payload: { message: string } }
  | { type: 'PROGRESS'; payload: { stage: string; progress: number } };

// ============ ESTADO DO WORKER ============

let onnxSession: ort.InferenceSession | null = null;
let onnxReady = false;
let onnxLoading = false;
let charset: string[] = [];

const OCR_INPUT_HEIGHT = 48;

let yoloModel: any = null;
let modelLoading = false;
let modelReady = false;
let modelFailed = false;

const YOLO_INPUT_SIZE = 640;
const YOLO_CONFIDENCE_THRESHOLD = 0.6;
const YOLO_MIN_RAW_CONFIDENCE = 0.5;

// ============ FUNÇÕES ONNX OCR ============

async function loadCharset(): Promise<string[]> {
  try {
    const response = await fetch('/models/plate-ocr/dict.txt');
    const text = await response.text();
    const chars = text.split('\n').filter(c => c.length > 0);
    const fullCharset = ['', ...chars];
    
    while (fullCharset.length < 504) {
      fullCharset.push('');
    }
    
    console.log(`📚 Charset carregado: ${fullCharset.length} caracteres (${chars.length} do dict + blank + padding)`);
    return fullCharset;
  } catch (error) {
    console.warn('⚠️ Falha ao carregar dict.txt, usando charset padrão');
    const fallbackChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    console.log(`📚 Charset fallback: ${fallbackChars.length + 1} caracteres`);
    return ['', ...fallbackChars];
  }
}

async function initONNX(): Promise<void> {
  if (onnxReady || onnxLoading) return;
  
  onnxLoading = true;
  
  try {
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Carregando OCR ONNX...', progress: 0 } });
    
    charset = await loadCharset();
    
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';
    ort.env.wasm.numThreads = 1;
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Baixando modelo OCR...', progress: 0.3 } });
    
    onnxSession = await ort.InferenceSession.create('/models/plate-ocr/rec.onnx', {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Preparando OCR...', progress: 0.8 } });
    
    const warmupWidth = 100;
    const warmupData = new Float32Array(3 * OCR_INPUT_HEIGHT * warmupWidth);
    const warmupTensor = new ort.Tensor('float32', warmupData, [1, 3, OCR_INPUT_HEIGHT, warmupWidth]);
    
    try {
      await onnxSession.run({ x: warmupTensor });
    } catch {
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
 * - Tight Crop: Remove margem vertical (15% topo, 5% base)
 * - Padding Horizontal: 260px úteis centralizados em 320px
 * - Ordem BGR (padrão OpenCV/PaddleOCR)
 * - Normalização [-1, 1]: (pixel/255 - 0.5) / 0.5
 */
function preprocessForONNX(
  data: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
): { tensor: Float32Array; width: number; height: number } {
  const targetWidth = 320;
  const targetHeight = OCR_INPUT_HEIGHT;
  const drawWidth = 260;
  const drawX = (targetWidth - drawWidth) / 2;
  
  const cropTop = Math.round(srcHeight * 0.15);
  const cropBottom = Math.round(srcHeight * 0.05);
  const usefulHeight = srcHeight - cropTop - cropBottom;
  
  const srcCanvas = new OffscreenCanvas(srcWidth, srcHeight);
  const srcCtx = srcCanvas.getContext('2d', { alpha: false })!;
  const srcImageData = srcCtx.createImageData(srcWidth, srcHeight);
  srcImageData.data.set(data);
  srcCtx.putImageData(srcImageData, 0, 0);
  
  const processCanvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = processCanvas.getContext('2d', { alpha: false })!;
  
  ctx.fillStyle = "#7f7f7f";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  ctx.drawImage(
    srcCanvas, 
    0, cropTop, srcWidth, usefulHeight,
    drawX, 0, drawWidth, targetHeight
  );
  
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const pixels = targetWidth * targetHeight;
  const tensor = new Float32Array(3 * pixels);
  
  for (let i = 0; i < pixels; i++) {
    const r = imageData.data[i * 4];
    const g = imageData.data[i * 4 + 1];
    const b = imageData.data[i * 4 + 2];
    
    tensor[0 * pixels + i] = ((b / 255.0) - 0.5) / 0.5;
    tensor[1 * pixels + i] = ((g / 255.0) - 0.5) / 0.5;
    tensor[2 * pixels + i] = ((r / 255.0) - 0.5) / 0.5;
  }
  
  return { tensor, width: targetWidth, height: targetHeight };
}

/**
 * Aplica Softmax com Temperature Scaling
 */
function softmaxWithTemperature(logits: number[], temperature: number = 10): number[] {
  const maxLogit = Math.max(...logits);
  const exps = logits.map(l => Math.exp((l - maxLogit) * temperature));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sumExps);
}

/**
 * Decodifica output CTC do PaddleOCR com Temperature Scaling
 */
function decodeCTC(output: Float32Array, outputShape: readonly number[]): { 
  text: string; 
  confidence: number;
  detectedFormat: 'antiga' | 'mercosul' | 'unknown';
} {
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
    return { text: '', confidence: 0, detectedFormat: 'unknown' };
  }
  
  let result = '';
  let lastIdx = 0;
  let totalConf = 0;
  let charCount = 0;
  
  const TEMPERATURE = 10;
  
  for (let t = 0; t < seqLen; t++) {
    const logits: number[] = [];
    for (let c = 0; c < numClasses; c++) {
      logits.push(output[t * numClasses + c]);
    }
    
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let c = 0; c < numClasses; c++) {
      if (logits[c] > maxVal) {
        maxVal = logits[c];
        maxIdx = c;
      }
    }
    
    const probs = softmaxWithTemperature(logits, TEMPERATURE);
    const prob = probs[maxIdx];
    
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
  const rawText = result.toUpperCase();
  
  const { text: correctedText, detectedFormat } = heuristicCorrection(rawText);
  
  if (correctedText.length >= 7) {
    console.log(`🔤 OCR: "${correctedText}" (${(confidence * 100).toFixed(0)}%)`);
  }
  
  return { text: correctedText, confidence, detectedFormat };
}

/**
 * Beam Search CTC Decoder
 */
function decodeCTCBeam(output: Float32Array, outputShape: readonly number[], beamWidth: number = 3): 
  Array<{ text: string; confidence: number; detectedFormat: 'antiga' | 'mercosul' | 'unknown' }> {
  
  let seqLen: number;
  let numClasses: number;
  
  if (outputShape.length === 3) {
    seqLen = outputShape[1];
    numClasses = outputShape[2];
  } else if (outputShape.length === 2) {
    seqLen = outputShape[0];
    numClasses = outputShape[1];
  } else {
    return [];
  }
  
  const TEMPERATURE = 10;
  
  interface CharEmission {
    timeStep: number;
    topK: Array<{ idx: number; prob: number; char: string }>;
  }
  
  const emissions: CharEmission[] = [];
  let lastIdx = 0;
  
  for (let t = 0; t < seqLen; t++) {
    const logits: number[] = [];
    for (let c = 0; c < numClasses; c++) {
      logits.push(output[t * numClasses + c]);
    }
    
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let c = 0; c < numClasses; c++) {
      if (logits[c] > maxVal) {
        maxVal = logits[c];
        maxIdx = c;
      }
    }
    
    if (maxIdx !== 0 && maxIdx !== lastIdx) {
      const probs = softmaxWithTemperature(logits, TEMPERATURE);
      
      const candidates: Array<{ idx: number; prob: number; char: string }> = [];
      for (let c = 1; c < numClasses; c++) {
        if (c < charset.length && charset[c] !== '') {
          candidates.push({ idx: c, prob: probs[c], char: charset[c] });
        }
      }
      
      candidates.sort((a, b) => b.prob - a.prob);
      emissions.push({
        timeStep: t,
        topK: candidates.slice(0, beamWidth),
      });
    }
    lastIdx = maxIdx;
  }
  
  if (emissions.length === 0) return [];
  
  const greedyChars = emissions.map(e => e.topK[0]);
  const greedyText = greedyChars.map(c => c.char).join('').toUpperCase();
  const greedyConf = greedyChars.reduce((sum, c) => sum + c.prob, 0) / greedyChars.length;
  
  const results: Array<{ text: string; confidence: number; detectedFormat: 'antiga' | 'mercosul' | 'unknown' }> = [];
  
  const greedyCorrected = heuristicCorrection(greedyText);
  results.push({ 
    text: greedyCorrected.text, 
    confidence: greedyConf, 
    detectedFormat: greedyCorrected.detectedFormat 
  });
  
  const altCandidates: Array<{ text: string; confidence: number; changedPos: number }> = [];
  
  for (let pos = 0; pos < emissions.length; pos++) {
    const emission = emissions[pos];
    
    for (let altIdx = 1; altIdx < Math.min(emission.topK.length, beamWidth); altIdx++) {
      const alt = emission.topK[altIdx];
      
      if (alt.prob < emission.topK[0].prob * 0.05) continue;
      
      const altChars = emissions.map((e, i) => i === pos ? alt : e.topK[0]);
      const altText = altChars.map(c => c.char).join('').toUpperCase();
      const altConf = altChars.reduce((sum, c) => sum + c.prob, 0) / altChars.length;
      
      altCandidates.push({ text: altText, confidence: altConf, changedPos: pos });
    }
  }
  
  altCandidates.sort((a, b) => b.confidence - a.confidence);
  
  const seenTexts = new Set<string>([greedyCorrected.text]);
  
  for (const alt of altCandidates) {
    if (results.length >= beamWidth) break;
    
    const corrected = heuristicCorrection(alt.text);
    if (seenTexts.has(corrected.text)) continue;
    seenTexts.add(corrected.text);
    
    results.push({
      text: corrected.text,
      confidence: alt.confidence,
      detectedFormat: corrected.detectedFormat,
    });
  }
  
  if (results.length > 1) {
    console.log(`🔍 Beam Search: ${results.map(r => `"${r.text}"(${(r.confidence * 100).toFixed(0)}%)`).join(' | ')}`);
  }
  
  return results;
}

/**
 * Executa OCR com ONNX (single pass)
 */
async function runONNXOCR(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<{ 
  text: string; 
  confidence: number; 
  detectedFormat: 'antiga' | 'mercosul' | 'unknown';
  candidates?: Array<{ text: string; confidence: number; detectedFormat: 'antiga' | 'mercosul' | 'unknown' }>;
}> {
  if (!onnxSession || !onnxReady) {
    await initONNX();
  }
  
  if (!onnxSession) {
    return { text: '', confidence: 0, detectedFormat: 'unknown' };
  }
  
  try {
    const { tensor, width: processedWidth, height: processedHeight } = preprocessForONNX(data, width, height);
    
    const inputTensor = new ort.Tensor('float32', tensor, [1, 3, processedHeight, processedWidth]);
    
    const inputName = onnxSession.inputNames[0];
    const outputs = await onnxSession.run({ [inputName]: inputTensor });
    
    const outputName = onnxSession.outputNames[0];
    const outputTensor = outputs[outputName];
    const outputData = outputTensor.data as Float32Array;
    const outputShape = outputTensor.dims;
    
    const beamResults = decodeCTCBeam(outputData, outputShape, 3);
    const { text, confidence, detectedFormat } = decodeCTC(outputData, outputShape);
    
    return { text, confidence, detectedFormat, candidates: beamResults.length > 0 ? beamResults : undefined };
  } catch (error) {
    console.error('❌ Erro no OCR ONNX:', error);
    return { text: '', confidence: 0, detectedFormat: 'unknown' };
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
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Inicializando TensorFlow.js...', progress: 0 }});
    
    try {
      await tf.setBackend('webgl');
    } catch {
      console.log('⚠️ WebGL não disponível, usando CPU');
      await tf.setBackend('cpu');
    }
    await tf.ready();
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Baixando modelo YOLO...', progress: 0.3 }});
    
    yoloModel = await tf.loadGraphModel('/models/yolov8n-plates/model.json');
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Preparando modelo...', progress: 0.8 }});
    
    const warmupTensor = tf.zeros([1, YOLO_INPUT_SIZE, YOLO_INPUT_SIZE, 3]);
    await yoloModel.predict(warmupTensor);
    warmupTensor.dispose();
    
    modelReady = true;
    modelLoading = false;
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Modelo YOLO pronto!', progress: 1 }});
    
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
        
        if (aspectRatio < 1.5 || aspectRatio > 8.0) continue;
        if (boxW < 50 || boxH < 12) continue;
        
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

const FALLBACK_CONFIDENCE_THRESHOLD = 0.60;

// ============ FUNÇÕES DE PROCESSAMENTO DE IMAGEM ============

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  let rn = r / 255;
  let gn = g / 255;
  let bn = b / 255;
  
  rn = rn > 0.04045 ? Math.pow((rn + 0.055) / 1.055, 2.4) : rn / 12.92;
  gn = gn > 0.04045 ? Math.pow((gn + 0.055) / 1.055, 2.4) : gn / 12.92;
  bn = bn > 0.04045 ? Math.pow((bn + 0.055) / 1.055, 2.4) : bn / 12.92;
  
  const x = (rn * 0.4124 + gn * 0.3576 + bn * 0.1805) / 0.95047;
  const y = (rn * 0.2126 + gn * 0.7152 + bn * 0.0722) / 1.00000;
  const z = (rn * 0.0193 + gn * 0.1192 + bn * 0.9505) / 1.08883;
  
  const fx = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
  const fy = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
  const fz = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;
  
  const L = (116 * fy) - 16;
  const A = 500 * (fx - fy);
  const B = 200 * (fy - fz);
  
  return [L, A, B];
}

function labToRgb(L: number, A: number, B: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = A / 500 + fy;
  const fz = fy - B / 200;
  
  const x = (fx > 0.206897 ? Math.pow(fx, 3) : (fx - 16/116) / 7.787) * 0.95047;
  const y = (fy > 0.206897 ? Math.pow(fy, 3) : (fy - 16/116) / 7.787) * 1.00000;
  const z = (fz > 0.206897 ? Math.pow(fz, 3) : (fz - 16/116) / 7.787) * 1.08883;
  
  let rn = x *  3.2406 + y * -1.5372 + z * -0.4986;
  let gn = x * -0.9689 + y *  1.8758 + z *  0.0415;
  let bn = x *  0.0557 + y * -0.2040 + z *  1.0570;
  
  rn = rn > 0.0031308 ? 1.055 * Math.pow(rn, 1/2.4) - 0.055 : 12.92 * rn;
  gn = gn > 0.0031308 ? 1.055 * Math.pow(gn, 1/2.4) - 0.055 : 12.92 * gn;
  bn = bn > 0.0031308 ? 1.055 * Math.pow(bn, 1/2.4) - 0.055 : 12.92 * bn;
  
  return [
    Math.max(0, Math.min(255, Math.round(rn * 255))),
    Math.max(0, Math.min(255, Math.round(gn * 255))),
    Math.max(0, Math.min(255, Math.round(bn * 255)))
  ];
}

function applyCLAHE(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  clipLimit: number = 2.5,
  tileSize: number = 8
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);
  const numPixels = width * height;
  
  const L = new Float32Array(numPixels);
  const A = new Float32Array(numPixels);
  const B = new Float32Array(numPixels);
  
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    const [l, a, b] = rgbToLab(data[idx], data[idx + 1], data[idx + 2]);
    L[i] = l;
    A[i] = a;
    B[i] = b;
  }
  
  const tilesX = Math.max(1, Math.ceil(width / tileSize));
  const tilesY = Math.max(1, Math.ceil(height / tileSize));
  const enhancedL = new Float32Array(numPixels);
  
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const startX = tx * tileSize;
      const startY = ty * tileSize;
      const endX = Math.min(startX + tileSize, width);
      const endY = Math.min(startY + tileSize, height);
      const tileWidth = endX - startX;
      const tileHeight = endY - startY;
      
      if (tileWidth <= 0 || tileHeight <= 0) continue;
      
      const histogram = new Uint32Array(101);
      let pixelCount = 0;
      
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const val = Math.max(0, Math.min(100, Math.round(L[y * width + x])));
          histogram[val]++;
          pixelCount++;
        }
      }
      
      if (pixelCount === 0) continue;
      
      const clipThreshold = Math.max(1, Math.round(clipLimit * pixelCount / 101));
      let excess = 0;
      for (let i = 0; i <= 100; i++) {
        if (histogram[i] > clipThreshold) {
          excess += histogram[i] - clipThreshold;
          histogram[i] = clipThreshold;
        }
      }
      
      const increment = Math.floor(excess / 101);
      for (let i = 0; i <= 100; i++) {
        histogram[i] += increment;
      }
      
      const cdf = new Uint32Array(101);
      cdf[0] = histogram[0];
      for (let i = 1; i <= 100; i++) {
        cdf[i] = cdf[i - 1] + histogram[i];
      }
      
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = y * width + x;
          const val = Math.max(0, Math.min(100, Math.round(L[idx])));
          const newVal = (cdf[val] / pixelCount) * 100;
          enhancedL[idx] = newVal;
        }
      }
    }
  }
  
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    const [r, g, b] = labToRgb(enhancedL[i], A[i], B[i]);
    result[idx] = r;
    result[idx + 1] = g;
    result[idx + 2] = b;
    result[idx + 3] = 255;
  }
  
  return result;
}

function detectNightCondition(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { isNight: boolean; avgLuminance: number; luminanceVariance: number } {
  const numPixels = width * height;
  const histogram = new Uint32Array(256);
  let totalLuminance = 0;
  
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const luminance = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    histogram[Math.min(255, luminance)]++;
    totalLuminance += luminance;
  }
  
  const avgLuminance = totalLuminance / numPixels;
  
  let varianceSum = 0;
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    const luminance = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
    varianceSum += (luminance - avgLuminance) ** 2;
  }
  const luminanceVariance = Math.sqrt(varianceSum / numPixels);
  
  let darkPixels = 0;
  let brightPixels = 0;
  for (let i = 0; i < 30; i++) darkPixels += histogram[i];
  for (let i = 225; i < 256; i++) brightPixels += histogram[i];
  
  const darkRatio = darkPixels / numPixels;
  const brightRatio = brightPixels / numPixels;
  
  const isNight = 
    avgLuminance < 80 || 
    (luminanceVariance > 60 && darkRatio > 0.15 && brightRatio > 0.05);
  
  return { isNight, avgLuminance, luminanceVariance };
}

function applyLightSharpening(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);
  const SHARPEN_STRENGTH = 0.4;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      for (let c = 0; c < 3; c++) {
        const center = data[idx + c];
        const top = data[((y - 1) * width + x) * 4 + c];
        const bottom = data[((y + 1) * width + x) * 4 + c];
        const left = data[(y * width + (x - 1)) * 4 + c];
        const right = data[(y * width + (x + 1)) * 4 + c];
        
        const avgNeighbors = (top + bottom + left + right) / 4;
        const sharpened = center + (center - avgNeighbors) * SHARPEN_STRENGTH;
        
        result[idx + c] = Math.max(0, Math.min(255, Math.round(sharpened)));
      }
      result[idx + 3] = 255;
    }
  }
  
  for (let x = 0; x < width; x++) {
    const topIdx = x * 4;
    result[topIdx] = data[topIdx];
    result[topIdx + 1] = data[topIdx + 1];
    result[topIdx + 2] = data[topIdx + 2];
    result[topIdx + 3] = 255;
    const bottomIdx = ((height - 1) * width + x) * 4;
    result[bottomIdx] = data[bottomIdx];
    result[bottomIdx + 1] = data[bottomIdx + 1];
    result[bottomIdx + 2] = data[bottomIdx + 2];
    result[bottomIdx + 3] = 255;
  }
  for (let y = 0; y < height; y++) {
    const leftIdx = y * width * 4;
    result[leftIdx] = data[leftIdx];
    result[leftIdx + 1] = data[leftIdx + 1];
    result[leftIdx + 2] = data[leftIdx + 2];
    result[leftIdx + 3] = 255;
    const rightIdx = (y * width + (width - 1)) * 4;
    result[rightIdx] = data[rightIdx];
    result[rightIdx + 1] = data[rightIdx + 1];
    result[rightIdx + 2] = data[rightIdx + 2];
    result[rightIdx + 3] = 255;
  }
  
  return result;
}

function applyNightCorrection(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  avgLuminance: number
): Uint8ClampedArray {
  const numPixels = width * height;
  const intermediate = new Uint8ClampedArray(data.length);
  
  const GLARE_THRESHOLD = 220;
  const GLARE_REDUCTION = 0.5;
  
  const gamma = Math.max(1.1, Math.min(1.5, 1.6 - (avgLuminance / 160)));
  const gammaInv = 1 / gamma;
  
  console.log(`🔆 Correção noturna: gamma=${gamma.toFixed(2)}, glare_thresh=${GLARE_THRESHOLD}`);
  
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    
    if (luminance > GLARE_THRESHOLD) {
      const excessBrightness = (luminance - GLARE_THRESHOLD) / (255 - GLARE_THRESHOLD);
      const attenuation = 1 - (excessBrightness * GLARE_REDUCTION);
      
      intermediate[idx] = Math.round(r * attenuation);
      intermediate[idx + 1] = Math.round(g * attenuation);
      intermediate[idx + 2] = Math.round(b * attenuation);
    } else {
      intermediate[idx] = r;
      intermediate[idx + 1] = g;
      intermediate[idx + 2] = b;
    }
    intermediate[idx + 3] = 255;
  }
  
  const afterGamma = new Uint8ClampedArray(data.length);
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    
    for (let c = 0; c < 3; c++) {
      let value = intermediate[idx + c];
      value = 255 * Math.pow(value / 255, gammaInv);
      afterGamma[idx + c] = Math.max(0, Math.min(255, Math.round(value)));
    }
    afterGamma[idx + 3] = 255;
  }
  
  const afterCLAHE = applyCLAHE(afterGamma, width, height, 1.5, 8);
  const final = applyLightSharpening(afterCLAHE, width, height);
  
  return final;
}

function optimizeImageForOCR(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { forceNightMode?: boolean }
): { data: Uint8ClampedArray; width: number; height: number } {
  let processedData = data;
  
  const forceNight = options?.forceNightMode ?? false;
  const nightAnalysis = detectNightCondition(data, width, height);
  
  if (forceNight || nightAnalysis.isNight) {
    processedData = applyNightCorrection(data, width, height, nightAnalysis.avgLuminance);
  }
  
  const MIN_WIDTH_FOR_OCR = 200;
  const UPSCALE_FACTOR = 2;
  
  if (width < MIN_WIDTH_FOR_OCR) {
    const newWidth = width * UPSCALE_FACTOR;
    const newHeight = height * UPSCALE_FACTOR;
    
    const srcCanvas = new OffscreenCanvas(width, height);
    const srcCtx = srcCanvas.getContext('2d', { alpha: false })!;
    const srcImageData = srcCtx.createImageData(width, height);
    srcImageData.data.set(processedData);
    srcCtx.putImageData(srcImageData, 0, 0);
    
    const dstCanvas = new OffscreenCanvas(newWidth, newHeight);
    const dstCtx = dstCanvas.getContext('2d', { alpha: false })!;
    dstCtx.imageSmoothingEnabled = true;
    dstCtx.imageSmoothingQuality = 'high';
    dstCtx.drawImage(srcCanvas, 0, 0, newWidth, newHeight);
    
    const upscaledData = dstCtx.getImageData(0, 0, newWidth, newHeight);
    
    return { 
      data: new Uint8ClampedArray(upscaledData.data), 
      width: newWidth, 
      height: newHeight 
    };
  }
  
  return { data: new Uint8ClampedArray(processedData), width, height };
}

// ============ HOMOGRAFIA PROJETIVA (inativa até modelo OBB) ============

/**
 * Resolve matriz 8x8 via Eliminação de Gauss com Pivoteamento Parcial
 * Otimizado com Float64Array para evitar perda de precisão em coordenadas de alta resolução.
 */
function solveHomographySystem(A: Float64Array, B: Float64Array): Float64Array | null {
  const n = 8;
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    let maxVal = Math.abs(A[i * n + i]);
    for (let k = i + 1; k < n; k++) {
      const val = Math.abs(A[k * n + i]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = k;
      }
    }

    if (maxVal < 1e-10) return null;

    if (maxRow !== i) {
      for (let j = i; j < n; j++) {
        const tempA = A[i * n + j];
        A[i * n + j] = A[maxRow * n + j];
        A[maxRow * n + j] = tempA;
      }
      const tempB = B[i];
      B[i] = B[maxRow];
      B[maxRow] = tempB;
    }

    for (let k = i + 1; k < n; k++) {
      const factor = A[k * n + i] / A[i * n + i];
      for (let j = i; j < n; j++) {
        A[k * n + j] -= factor * A[i * n + j];
      }
      B[k] -= factor * B[i];
    }
  }

  const H = new Float64Array(8);
  for (let i = n - 1; i >= 0; i--) {
    let sum = B[i];
    for (let j = i + 1; j < n; j++) {
      sum -= A[i * n + j] * H[j];
    }
    H[i] = sum / A[i * n + i];
  }
  return H;
}

/**
 * Aplica Transformação Projetiva Inversa via Mapeamento Bilinear.
 * @param srcData Uint8ClampedArray da imagem original
 * @param srcWidth Largura da imagem original
 * @param srcHeight Altura da imagem original
 * @param quad 4 vértices do OBB [{x,y}] (TopLeft, TopRight, BottomRight, BottomLeft)
 * @param destW Largura do tensor de destino (padrão 320)
 * @param destH Altura do tensor de destino (padrão 48)
 */
function applyProjectiveWarp(
  srcData: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  quad: { x: number, y: number }[],
  destW = 320,
  destH = 48
): ImageData {
  const dstPts = [
    { x: 0, y: 0 },
    { x: destW, y: 0 },
    { x: destW, y: destH },
    { x: 0, y: destH }
  ];

  const A = new Float64Array(64);
  const B = new Float64Array(8);

  for (let i = 0; i < 4; i++) {
    const u = dstPts[i].x;
    const v = dstPts[i].y;
    const x = quad[i].x;
    const y = quad[i].y;

    const row1 = i * 2;
    const row2 = row1 + 1;

    A[row1 * 8 + 0] = u; A[row1 * 8 + 1] = v; A[row1 * 8 + 2] = 1;
    A[row1 * 8 + 3] = 0; A[row1 * 8 + 4] = 0; A[row1 * 8 + 5] = 0;
    A[row1 * 8 + 6] = -u * x; A[row1 * 8 + 7] = -v * x;
    B[row1] = x;

    A[row2 * 8 + 0] = 0; A[row2 * 8 + 1] = 0; A[row2 * 8 + 2] = 0;
    A[row2 * 8 + 3] = u; A[row2 * 8 + 4] = v; A[row2 * 8 + 5] = 1;
    A[row2 * 8 + 6] = -u * y; A[row2 * 8 + 7] = -v * y;
    B[row2] = y;
  }

  const H = solveHomographySystem(A, B);
  const destData = new Uint8ClampedArray(destW * destH * 4);

  if (!H) return new ImageData(destData, destW, destH);

  const [h0, h1, h2, h3, h4, h5, h6, h7] = H;

  let destIdx = 0;
  for (let dy = 0; dy < destH; dy++) {
    for (let dx = 0; dx < destW; dx++) {
      const z = h6 * dx + h7 * dy + 1;
      const sx = (h0 * dx + h1 * dy + h2) / z;
      const sy = (h3 * dx + h4 * dy + h5) / z;

      const x0 = Math.floor(sx);
      const x1 = x0 + 1;
      const y0 = Math.floor(sy);
      const y1 = y0 + 1;

      if (x0 >= 0 && x1 < srcWidth && y0 >= 0 && y1 < srcHeight) {
        const wx1 = sx - x0;
        const wx0 = 1 - wx1;
        const wy1 = sy - y0;
        const wy0 = 1 - wy1;

        const w00 = wx0 * wy0;
        const w10 = wx1 * wy0;
        const w01 = wx0 * wy1;
        const w11 = wx1 * wy1;

        const idx00 = (y0 * srcWidth + x0) * 4;
        const idx10 = (y0 * srcWidth + x1) * 4;
        const idx01 = (y1 * srcWidth + x0) * 4;
        const idx11 = (y1 * srcWidth + x1) * 4;

        destData[destIdx]     = srcData[idx00] * w00 + srcData[idx10] * w10 + srcData[idx01] * w01 + srcData[idx11] * w11;
        destData[destIdx + 1] = srcData[idx00+1] * w00 + srcData[idx10+1] * w10 + srcData[idx01+1] * w01 + srcData[idx11+1] * w11;
        destData[destIdx + 2] = srcData[idx00+2] * w00 + srcData[idx10+2] * w10 + srcData[idx01+2] * w01 + srcData[idx11+2] * w11;
        destData[destIdx + 3] = 255;
      }
      destIdx += 4;
    }
  }

  return new ImageData(destData, destW, destH);
}

// Exportar para uso futuro com modelo OBB (manter referências para evitar tree-shaking)
void solveHomographySystem;
void applyProjectiveWarp;

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
    if (!onnxReady) {
      await initONNX();
    }
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Detectando placa...', progress: 0.1 } });
    
    let plateRegion: BoundingBox | null = null;
    
    if (modelReady) {
      plateRegion = await detectPlateWithYOLO(imageData, width, height);
      usedYolo = plateRegion !== null;
      if (usedYolo && plateRegion) {
        console.log(`🧠 YOLO: ${plateRegion.width}x${plateRegion.height}px (${Math.round(plateRegion.confidence * 100)}%)`);
      }
    }
    
    // Sem YOLO = Sem OCR (elimina falsos positivos)
    if (!plateRegion) {
      const elapsed = performance.now() - startTime;
      return {
        success: false,
        rawText: '',
        ocrConfidence: 0,
        processingTimeMs: elapsed,
        usedYolo: false,
        usedFallback: false,
        validation: {
          original: '',
          corrected: '',
          isValid: false,
          confidence: 0,
          format: 'unknown' as const,
          formatted: ''
        }
      };
    }
    
    let processData: Uint8ClampedArray;
    let processWidth: number;
    let processHeight: number;
    
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
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Otimizando imagem...', progress: 0.3 } });
    
    let optimized = optimizeImageForOCR(processData, processWidth, processHeight, {
      forceNightMode: options?.forceNightMode,
    });
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Executando OCR ONNX...', progress: 0.4 } });
    
    const debugImages: DebugImages = {};
    
    if (options?.enableDebug && processWidth > 0 && processHeight > 0) {
      debugImages.cropped = await generateImageFromData(processData, processWidth, processHeight);
      debugImages.preprocessed = await generateImageFromData(optimized.data, optimized.width, optimized.height);
    }
    
    // Single pass OCR (v1.2.0: Grid Thresholding)
    const result = await runONNXOCR(optimized.data, optimized.width, optimized.height);
    const rawText = result.text;
    const ocrConfidence = result.confidence;
    const detectedFormat = result.detectedFormat;
    const beamCandidates = result.candidates || [];
    
    // Validar candidatos do beam search
    const validatedCandidates: Array<{ text: string; confidence: number; format: string }> = [];
    if (beamCandidates.length > 0) {
      for (const candidate of beamCandidates) {
        const candidateValidation = validateAndCorrectPlate(candidate.text, candidate.detectedFormat);
        if (candidateValidation.isValid) {
          validatedCandidates.push({
            text: candidateValidation.corrected,
            confidence: candidate.confidence,
            format: candidateValidation.format,
          });
        }
      }
    }
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Validando...', progress: 0.8 } });
    
    // Filtrar falsos positivos
    if (isForbiddenText(rawText)) {
      const processingTimeMs = performance.now() - startTime;
      return {
        success: false,
        rawText,
        validation: {
          isValid: false,
          original: rawText,
          corrected: '',
          formatted: '',
          format: 'unknown',
          confidence: 0,
        },
        ocrConfidence: 0,
        processingTimeMs,
        usedFallback: false,
        usedYolo,
      };
    }
    
    // Validar e corrigir placa
    const validation = validateAndCorrectPlate(rawText, detectedFormat);
    
    const processingTimeMs = performance.now() - startTime;
    
    // Verificar se precisa de fallback
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
      candidates: validatedCandidates.length > 0 ? validatedCandidates : undefined,
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
        
      case 'TERMINATE':
        if (onnxSession) {
          onnxSession = null;
        }
        onnxReady = false;
        
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

console.log('🔧 PlateProcessor Worker carregado (ONNX OCR v1.2.0 - Grid Thresholding)');
