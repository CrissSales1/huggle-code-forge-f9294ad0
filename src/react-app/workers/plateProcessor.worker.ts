/**
 * Web Worker para processamento de imagem em background
 * Move OCR (ONNX Runtime), detecção de placa e motion detection para thread separada
 * Evita bloqueio da UI durante processamento pesado
 * 
 * v1.1.64: Anti-Duplicatas + Métricas Inteligentes
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
  candidates?: Array<{ text: string; confidence: number; format: string }>; // v1.1.84: Beam Search top-3 candidatos
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
  forceNightMode?: boolean;  // v1.1.45: Forçar correções noturnas
}

// ============ MENSAGENS ============

type WorkerMessage = 
  | { type: 'INIT' }
  | { type: 'LOAD_YOLO_MODEL' }
  | { type: 'SET_CONFIG'; payload: { yoloInputSize?: number } }
  | { type: 'PROCESS_PLATE'; payload: { imageData: ImageData; width: number; height: number; options?: ProcessPlateOptions } }
  | { type: 'DETECT_MOTION'; payload: { currentData: Uint8ClampedArray; referenceData: Uint8ClampedArray; config: MotionDetectionConfig } }
  | { type: 'TERMINATE' };

type WorkerResponse = 
  | { type: 'READY' }
  | { type: 'MODEL_LOADED'; payload: { success: boolean; permanentFailure?: boolean; error?: string; backend?: string } }
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
const OCR_INPUT_HEIGHT = 48; // PaddleOCR PP-OCRv3/v4 usa altura 48px
// @ts-ignore - Mantido para referência histórica
const _OCR_MIN_WIDTH = 320;   // Não usado em v1.1.10 (tensor dinâmico)

// Estado do modelo YOLO (TensorFlow.js)
let yoloModel: any = null;
let modelLoading = false;
let modelReady = false;
let modelFailed = false; // Marca falha permanente para evitar loop infinito

// Constantes YOLO
const YOLO_DEFAULT_INPUT_SIZE = 640;
let currentYoloInputSize = 640; // Configurável via SET_CONFIG
const YOLO_CONFIDENCE_THRESHOLD = 0.6;
const YOLO_MIN_RAW_CONFIDENCE = 0.5;

// ============ FILTRO ANTI-FALSO-POSITIVO ============

// Palavras que indicam que o OCR leu texto da câmera/ambiente, não uma placa
const FORBIDDEN_WORDS = [
  'ENTRADA', 'SAIDA', 'VEICULO', 'VEICULOS', 'CAMERA', 'PORTARIA',
  'ESTACIONAMENTO', 'CONDOMINIO', 'RESIDENCIAL', 'COMERCIAL', 'GARAGEM',
  'PORTAO', 'ACESSO', 'VISITANTE', 'VISITANTES', 'MORADOR', 'MORADORES',
  'PROIBIDO', 'PERMITIDO', 'VELOCIDADE', 'PARE', 'ATENCAO', 'CUIDADO',
  'NTVEICU', 'NTVEICULOS', 'ENTVEICULOS', 'SAIDAVEICULOS'
];

/**
 * Verifica se o texto OCR é um falso positivo (texto de câmera/ambiente)
 * Retorna true se for texto proibido (não é placa)
 */
function isForbiddenText(rawText: string): boolean {
  if (!rawText || rawText.length < 3) return false;
  
  const upperText = rawText.toUpperCase().replace(/[^A-Z]/g, '');
  
  // Verifica se contém palavras proibidas
  for (const word of FORBIDDEN_WORDS) {
    if (upperText.includes(word) || word.includes(upperText)) {
      console.log(`🚫 OCR: Texto proibido detectado, ignorando: "${rawText}" (match: ${word})`);
      return true;
    }
  }
  
  // Texto muito longo para ser placa (placas têm 7 caracteres)
  if (upperText.length > 10) {
    console.log(`🚫 OCR: Texto muito longo para ser placa, ignorando: "${rawText}" (${upperText.length} chars)`);
    return true;
  }
  
  return false;
}

// ============ v1.1.36: UNWARP REMOVIDO ============
// O Unwarp v2 (Hough Transform) foi removido pois estava introduzindo artefatos
// em imagens pequenas, causando erros de OCR como E↔B e 0↔6.
// Substituído por upscale 2x para preservar detalhes dos caracteres.

// ============ FUNÇÕES ONNX OCR ============

async function loadCharset(): Promise<string[]> {
  try {
    const response = await fetch('/models/plate-ocr/dict.txt');
    const text = await response.text();
    // Cada linha é um caractere, adiciona blank token no início
    const chars = text.split('\n').filter(c => c.length > 0);
    const fullCharset = ['', ...chars]; // blank token + caracteres
    
    // PaddleOCR espera exatamente 504 classes - adicionar padding se necessário
    while (fullCharset.length < 504) {
      fullCharset.push(''); // Caractere vazio para índices extras
    }
    
    console.log(`📚 Charset carregado: ${fullCharset.length} caracteres (${chars.length} do dict + blank + padding)`);
    return fullCharset;
  } catch (error) {
    console.warn('⚠️ Falha ao carregar dict.txt, usando charset padrão');
    // Charset padrão para placas BR
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
    
    // Carregar charset
    charset = await loadCharset();
    
    // Configurar ONNX Runtime para WASM (CDN com versão correta)
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/';
    ort.env.wasm.numThreads = 2; // Multi-thread para i5-6500 (4 cores: 2 para worker, 2 para UI)
    
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

// v1.1.86: CropParams para Multi-Crop OCR
interface CropParams {
  cropTopRatio: number;    // % do topo a remover
  cropBottomRatio: number; // % da base a remover
  drawWidth: number;       // largura útil no tensor
}

const CROP_STANDARD: CropParams = { cropTopRatio: 0.15, cropBottomRatio: 0.05, drawWidth: 260 };
const CROP_WIDE: CropParams     = { cropTopRatio: 0.10, cropBottomRatio: 0.02, drawWidth: 280 };

// v1.1.24: Center Crop + Padding "Emagrecido" + Heurística + Remoção Ruído de Borda
// v1.1.86: Aceita CropParams para Multi-Crop

/**
 * Pré-processa imagem para PaddleOCR
 * - Tight Crop: Remove margem vertical (configurável via CropParams)
 * - Padding Horizontal: drawWidth útil centralizado
 * - Ordem BGR (padrão OpenCV/PaddleOCR)
 * - Normalização [-1, 1]: (pixel/255 - 0.5) / 0.5
 */
function preprocessForONNX(
  data: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  cropParams?: CropParams
): { tensor: Float32Array; width: number; height: number } {
  const params = cropParams || CROP_STANDARD;
  const targetWidth = 320;
  const targetHeight = OCR_INPUT_HEIGHT; // 48
  const drawWidth = params.drawWidth;
  const drawX = (targetWidth - drawWidth) / 2;
  
  // 1. TIGHT CROP VERTICAL
  const cropTop = Math.round(srcHeight * params.cropTopRatio);
  const cropBottom = Math.round(srcHeight * params.cropBottomRatio);
  const usefulHeight = srcHeight - cropTop - cropBottom;
  
  // 2. CRIAR CANVAS TEMPORÁRIO COM IMAGEM ORIGINAL
  const srcCanvas = new OffscreenCanvas(srcWidth, srcHeight);
  const srcCtx = srcCanvas.getContext('2d', { alpha: false })!;
  const srcImageData = srcCtx.createImageData(srcWidth, srcHeight);
  srcImageData.data.set(data);
  srcCtx.putImageData(srcImageData, 0, 0);
  
  // 3. CRIAR CANVAS DE DESTINO COM FUNDO NEUTRO
  const processCanvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = processCanvas.getContext('2d', { alpha: false })!;
  
  ctx.fillStyle = "#7f7f7f";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // 4. DESENHAR IMAGEM CENTRALIZADA COM PADDING
  ctx.drawImage(
    srcCanvas, 
    0, cropTop, srcWidth, usefulHeight,
    drawX, 0, drawWidth, targetHeight
  );
  
  // 5. EXTRAIR DADOS E CRIAR TENSOR
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
  const pixels = targetWidth * targetHeight;
  const tensor = new Float32Array(3 * pixels);
  
  // 6. NORMALIZAÇÃO [-1, 1] COM ORDEM BGR
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
 * Temperature > 1 "afia" a distribuição, aumentando confiança em logits baixos
 * @param logits - Array de logits (valores brutos do modelo)
 * @param temperature - Fator de escala (10 = calibração para modelos uncalibrated)
 */
function softmaxWithTemperature(logits: number[], temperature: number = 10): number[] {
  const maxLogit = Math.max(...logits); // Estabilidade numérica
  // Multiplica por temperatura ANTES do exp para "afiar" a distribuição
  const exps = logits.map(l => Math.exp((l - maxLogit) * temperature));
  const sumExps = exps.reduce((a, b) => a + b, 0);
  return exps.map(e => e / sumExps);
}

/**
 * Decodifica output CTC do PaddleOCR com Temperature Scaling
 * v1.1.52: Retorna também o formato detectado pelo hífen/traço
 */
function decodeCTC(output: Float32Array, outputShape: readonly number[]): { 
  text: string; 
  confidence: number;
  detectedFormat: 'antiga' | 'mercosul' | 'unknown';
} {
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
    return { text: '', confidence: 0, detectedFormat: 'unknown' };
  }
  
  let result = '';
  let lastIdx = 0; // blank token
  let totalConf = 0;
  let charCount = 0;
  
  // Temperature para calibração de confiança (logits do modelo são muito baixos)
  const TEMPERATURE = 10;
  
  for (let t = 0; t < seqLen; t++) {
    // Extrair logits para esta posição
    const logits: number[] = [];
    for (let c = 0; c < numClasses; c++) {
      logits.push(output[t * numClasses + c]);
    }
    
    // Encontrar índice com maior valor
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let c = 0; c < numClasses; c++) {
      if (logits[c] > maxVal) {
        maxVal = logits[c];
        maxIdx = c;
      }
    }
    
    // Aplicar softmax com temperature scaling para confiança calibrada
    const probs = softmaxWithTemperature(logits, TEMPERATURE);
    const prob = probs[maxIdx];
    
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
  
  // Guardar texto bruto para log
  const rawText = result.toUpperCase();
  
  // v1.1.52: Aplicar correção heurística com detecção de formato
  const { text: correctedText, detectedFormat } = heuristicCorrection(rawText);
  
  // v1.1.62: Log consolidado único
  if (correctedText.length >= 7) {
    console.log(`🔤 OCR: "${correctedText}" (${(confidence * 100).toFixed(0)}%)`);
  }
  
  return { text: correctedText, confidence, detectedFormat };
}

/**
 * v1.1.84: Beam Search CTC Decoder
 * Em vez de pegar apenas o melhor caractere em cada posição (greedy),
 * mantém os top-K candidatos e retorna até 3 placas alternativas.
 * 
 * Isso permite que erros de OCR como SSH→SSW sejam capturados como candidato #2,
 * sem depender de fuzzy matching pós-erro.
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
  
  // Coletar top-K probabilidades por posição temporal
  // Primeiro, decodificar greedy para saber quais posições temporais emitem caracteres
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
    
    // Encontrar melhor índice
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let c = 0; c < numClasses; c++) {
      if (logits[c] > maxVal) {
        maxVal = logits[c];
        maxIdx = c;
      }
    }
    
    // CTC: só emite em posições não-blank e não-repetição
    if (maxIdx !== 0 && maxIdx !== lastIdx) {
      const probs = softmaxWithTemperature(logits, TEMPERATURE);
      
      // Coletar top-K alternativas (excluindo blank idx=0)
      const candidates: Array<{ idx: number; prob: number; char: string }> = [];
      for (let c = 1; c < numClasses; c++) {
        if (c < charset.length && charset[c] !== '') {
          candidates.push({ idx: c, prob: probs[c], char: charset[c] });
        }
      }
      
      // Ordenar por probabilidade decrescente e pegar top-K
      candidates.sort((a, b) => b.prob - a.prob);
      emissions.push({
        timeStep: t,
        topK: candidates.slice(0, beamWidth),
      });
    }
    lastIdx = maxIdx;
  }
  
  if (emissions.length === 0) return [];
  
  // Gerar candidatos substituindo UMA posição por vez com alternativa #2 ou #3
  // Candidato 0: greedy (top-1 em todas as posições)
  const greedyChars = emissions.map(e => e.topK[0]);
  const greedyText = greedyChars.map(c => c.char).join('').toUpperCase();
  const greedyConf = greedyChars.reduce((sum, c) => sum + c.prob, 0) / greedyChars.length;
  
  const results: Array<{ text: string; confidence: number; detectedFormat: 'antiga' | 'mercosul' | 'unknown' }> = [];
  
  // Adicionar greedy como primeiro candidato
  const greedyCorrected = heuristicCorrection(greedyText);
  results.push({ 
    text: greedyCorrected.text, 
    confidence: greedyConf, 
    detectedFormat: greedyCorrected.detectedFormat 
  });
  
  // Gerar alternativas: para cada posição, substituir com 2ª melhor opção
  const altCandidates: Array<{ text: string; confidence: number; changedPos: number }> = [];
  
  for (let pos = 0; pos < emissions.length; pos++) {
    const emission = emissions[pos];
    
    // Tentar alternativas 2 e 3 para esta posição
    for (let altIdx = 1; altIdx < Math.min(emission.topK.length, beamWidth); altIdx++) {
      const alt = emission.topK[altIdx];
      
      // Só considerar se a alternativa tem probabilidade razoável (>5% da top)
      if (alt.prob < emission.topK[0].prob * 0.05) continue;
      
      // Construir texto alternativo
      const altChars = emissions.map((e, i) => i === pos ? alt : e.topK[0]);
      const altText = altChars.map(c => c.char).join('').toUpperCase();
      const altConf = altChars.reduce((sum, c) => sum + c.prob, 0) / altChars.length;
      
      altCandidates.push({ text: altText, confidence: altConf, changedPos: pos });
    }
  }
  
  // Ordenar alternativas por confiança e adicionar as melhores
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
 * Correção Heurística de Homoglifos para placas brasileiras v1.1.52
 * Corrige confusões de caracteres baseado na posição (formato BR)
 * Limpa ruído e garante máximo 7 caracteres
 * 
 * v1.1.52: Detecta formato pelo hífen/traço ANTES de limpar
 *          Se hífen detectado → Formato ANTIGO forçado (LLL-NNNN)
 *          Evita conversão errada de EIK-9134 → EIK9I34
 */
function heuristicCorrection(text: string): { text: string; detectedFormat: 'antiga' | 'mercosul' | 'unknown' } {
  // v1.1.52: DETECTAR FORMATO PELO HÍFEN/PONTO (ANTES de limpar!)
  // Placas antigas têm "ABC-1234" ou "ABC.1234" ou "ABC•1234", Mercosul não tem separador
  const hasSeparator = /[-.\•–—·]/.test(text);
  const detectedFormat: 'antiga' | 'mercosul' | 'unknown' = hasSeparator ? 'antiga' : 'unknown';
  
  // v1.1.62: Log de separador removido - muito verboso
  
  // 1. LIMPEZA BÁSICA - Remove caracteres não-alfanuméricos e converte para maiúsculo
  let clean = text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  
  // 2. REMOÇÃO DE RUÍDO DE BORDA (Ex: "BFC2846" -> "FC2846")
  // Se tiver 8+ chars, e removendo o primeiro parece uma placa válida (3 letras no início)
  // v1.1.62: Remoção de ruído de borda silenciosa
  if (clean.length > 7) {
    const withoutFirst = clean.substring(1);
    if (/^[A-Z]{3}/.test(withoutFirst)) {
      clean = withoutFirst;
    }
  }
  
  // Garante tamanho máximo de 7 (corta o final se sobrar)
  clean = clean.substring(0, 7);
  
  // Se muito curto, retornar como está
  if (clean.length < 3) return { text: clean, detectedFormat };
  
  // 3. MAPEAMENTOS DE CORREÇÃO (Homoglifos)
  // Número → Letra (para posições 0, 1, 2 que devem ser letras)
  const numToLetter: Record<string, string> = {
    '0': 'O', '1': 'I', '2': 'Z', '3': 'J', '4': 'A', '5': 'S', '6': 'G', '7': 'T', '8': 'B', '9': 'G'
  };
  
  // Letra → Número (para posições que devem ser números)
  const letterToNum: Record<string, string> = {
    'O': '0', 'I': '1', 'Z': '2', 'J': '3', 'A': '4', 'S': '5', 'G': '6', 'T': '7', 'B': '8', 'D': '0', 'Q': '0'
  };
  
  // v1.1.66: Mapeamento específico para posição 3 (4º caractere)
  // Prioriza confusões A/I → 1 porque OCR confunde 1 com A frequentemente
  const letterToNumPos3: Record<string, string> = {
    'O': '0', 'I': '1', 'L': '1', 
    'A': '1',  // v1.1.66: A parece 1, não 4 (confusão OCR comum)
    'Z': '2', 'J': '3', 'S': '5', 
    'G': '6', 'T': '7', 'B': '8', 'D': '0', 'Q': '0'
  };
  
  // v1.1.47: Confusões entre números (iluminação noturna/fonte similar)
  // Atualizado com 9↔2 bidirecional mais forte
  const numToNum: Record<string, string[]> = {
    '2': ['7', '9'],   // 2 parece 7 em fontes finas, 9 com base escura
    '7': ['2', '1'],   // 7 parece 2 ou 1
    '9': ['2', '6', '0'],   // v1.1.47: 9 parece 2, 6 ou 0
    '6': ['9', '0', '8'],   // v1.1.47: 6 parece 9, 0 ou 8
    '0': ['6', '8', '9'],   // v1.1.47: 0 parece 6, 8 ou 9
    '1': ['7', '4'],        // v1.1.66: 1 também parece 4
    '5': ['6', '8'],        // v1.1.47: 5 parece 6 ou 8
    '8': ['0', '6'],        // v1.1.47: 8 parece 0 ou 6
    '4': ['1', 'A'],        // v1.1.66: 4 parece 1 ou A
  };
  
  // Número → Letra (posição 4 específica para Mercosul)
  const numToLetterPos4: Record<string, string> = {
    '0': 'D', '1': 'I', '2': 'J', '3': 'J', '6': 'G', '8': 'B', '9': 'G'
  };
  
  const chars = clean.split('');
  
  // 4. CORREÇÃO BASEADA NA POSIÇÃO (Brasil: LLL-NLNN Mercosul ou LLL-NNNN antiga)
  
  // Posições 0, 1, 2: SEMPRE letras
  for (let i = 0; i < 3 && i < chars.length; i++) {
    if (/[0-9]/.test(chars[i]) && numToLetter[chars[i]]) {
      chars[i] = numToLetter[chars[i]];
    }
  }
  
  // Posição 3: SEMPRE número (tanto Mercosul quanto antiga)
  // v1.1.66: Usa letterToNumPos3 que prioriza A→1 ao invés de A→4
  if (chars.length > 3 && /[A-Z]/.test(chars[3]) && letterToNumPos3[chars[3]]) {
    chars[3] = letterToNumPos3[chars[3]];
  }
  
  // v1.1.52: Posição 4 - Detecção inteligente Mercosul vs Antiga
  if (chars.length > 4) {
    const char4 = chars[4];
    
    if (detectedFormat === 'antiga') {
      // Forçar posição 4 como número (formato antigo: LLL-NNNN)
      if (/[A-Z]/.test(char4) && letterToNum[char4]) {
        chars[4] = letterToNum[char4];
      }
    } else if (/[0-9]/.test(char4)) {
      // Verificar se convertendo para letra forma Mercosul válido
      if (numToLetterPos4[char4]) {
        const testMercosul = [...chars];
        testMercosul[4] = numToLetterPos4[char4];
        const testStr = testMercosul.join('');
        
        if (/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(testStr)) {
          chars[4] = numToLetterPos4[char4];
        }
      }
    }
  }
  
  // Posições 5, 6: SEMPRE números
  for (let i = 5; i <= 6 && i < chars.length; i++) {
    if (/[A-Z]/.test(chars[i]) && letterToNum[chars[i]]) {
      chars[i] = letterToNum[chars[i]];
    }
  }
  
  // v1.1.43: Correção de confusões numéricas em posições de números (3, 5, 6)
  // Aplica apenas se o resultado final não forma placa válida
  const currentResult = chars.join('');
  const isMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(currentResult);
  const isAntiga = /^[A-Z]{3}[0-9]{4}$/.test(currentResult);
  
  // Se já é válido, retornar com formato detectado
  // v1.1.52: Se formato antigo foi detectado pelo hífen, reportar 'antiga' mesmo que seja válido como Mercosul
  if (isMercosul || isAntiga) {
    const finalFormat = detectedFormat === 'antiga' ? 'antiga' : (isAntiga ? 'antiga' : 'mercosul');
    return { text: currentResult, detectedFormat: finalFormat };
  }
  
  // Tentar correções de confusão numérica nas posições de números
  const numPositions = [3, 5, 6];
  for (const pos of numPositions) {
    if (pos < chars.length && /[0-9]/.test(chars[pos])) {
      const alternatives = numToNum[chars[pos]];
      if (alternatives) {
        for (const alt of alternatives) {
          const testChars = [...chars];
          testChars[pos] = alt;
          const testStr = testChars.join('');
          
          if (/^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(testStr) || /^[A-Z]{3}[0-9]{4}$/.test(testStr)) {
            // v1.1.62: Correção silenciosa
            chars[pos] = alt;
            break;
          }
        }
      }
    }
  }
  
  // Retornar resultado final com formato detectado
  const finalResult = chars.join('');
  const finalIsMercosul = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(finalResult);
  const finalIsAntiga = /^[A-Z]{3}[0-9]{4}$/.test(finalResult);
  const finalFormat = detectedFormat === 'antiga' ? 'antiga' : (finalIsAntiga ? 'antiga' : (finalIsMercosul ? 'mercosul' : 'unknown'));
  
  return { text: finalResult, detectedFormat: finalFormat };
}

/**
 * Executa OCR com ONNX
 * v1.1.84: Retorna também candidatos do beam search
 * v1.1.86: Aceita CropParams para Multi-Crop
 */
async function runONNXOCR(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cropParams?: CropParams
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
    // Pré-processar imagem com CropParams
    const { tensor, width: processedWidth, height: processedHeight } = preprocessForONNX(data, width, height, cropParams);
    
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
    
    // v1.1.84: Decodificar com Beam Search para múltiplos candidatos
    const beamResults = decodeCTCBeam(outputData, outputShape, 3);
    
    // Também decodificar greedy (resultado principal)
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
    
    const warmupTensor = tf.zeros([1, currentYoloInputSize, currentYoloInputSize, 3]);
    await yoloModel.predict(warmupTensor);
    warmupTensor.dispose();
    
    modelReady = true;
    modelLoading = false;
    
    const activeBackend = tf.getBackend();
    
    self.postMessage({ type: 'PROGRESS', payload: { 
      stage: 'Modelo YOLO pronto!', 
      progress: 1 
    }});
    
    console.log(`✅ Modelo YOLO carregado (backend: ${activeBackend}, input: ${currentYoloInputSize}px)`);
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
    
    const resized = tf.image.resizeBilinear(imageTensor, [currentYoloInputSize, currentYoloInputSize]);
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
    
    // v1.1.62: Log condensado - removido spam de detecções brutas
    
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
        cx *= currentYoloInputSize;
        cy *= currentYoloInputSize;
        w *= currentYoloInputSize;
        h *= currentYoloInputSize;
      }
      
      if (confidence > bestConfidence) {
        const scaleX = width / currentYoloInputSize;
        const scaleY = height / currentYoloInputSize;
        
        const boxX = Math.round((cx - w/2) * scaleX);
        const boxY = Math.round((cy - h/2) * scaleY);
        const boxW = Math.round(w * scaleX);
        const boxH = Math.round(h * scaleY);
        
        const aspectRatio = boxW / boxH;
        
        // v1.1.62: Logs removidos - muito spam por frame
        // Filtros mais relaxados (1.5-8.0) pois YOLO pode incluir área ao redor
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

// v1.1.51: Constantes de heurística removidas - OCR apenas quando YOLO confirma placa
const FALLBACK_CONFIDENCE_THRESHOLD = 0.60;

// ============ FUNÇÕES DE PROCESSAMENTO DE IMAGEM ============

// ============ PIPELINE DE PRÉ-PROCESSAMENTO AVANÇADO v1.1.6 ============

/**
 * Converte RGB para espaço de cor LAB
 * PaddleOCR requer RGB preservado - usamos LAB para ajustar luminosidade sem perder cores
 */
function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // sRGB para linear
  let rn = r / 255;
  let gn = g / 255;
  let bn = b / 255;
  
  rn = rn > 0.04045 ? Math.pow((rn + 0.055) / 1.055, 2.4) : rn / 12.92;
  gn = gn > 0.04045 ? Math.pow((gn + 0.055) / 1.055, 2.4) : gn / 12.92;
  bn = bn > 0.04045 ? Math.pow((bn + 0.055) / 1.055, 2.4) : bn / 12.92;
  
  // RGB para XYZ (D65)
  const x = (rn * 0.4124 + gn * 0.3576 + bn * 0.1805) / 0.95047;
  const y = (rn * 0.2126 + gn * 0.7152 + bn * 0.0722) / 1.00000;
  const z = (rn * 0.0193 + gn * 0.1192 + bn * 0.9505) / 1.08883;
  
  // XYZ para LAB
  const fx = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
  const fy = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
  const fz = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;
  
  const L = (116 * fy) - 16;
  const A = 500 * (fx - fy);
  const B = 200 * (fy - fz);
  
  return [L, A, B];
}

/**
 * Converte LAB de volta para RGB
 */
function labToRgb(L: number, A: number, B: number): [number, number, number] {
  // LAB -> XYZ
  const fy = (L + 16) / 116;
  const fx = A / 500 + fy;
  const fz = fy - B / 200;
  
  const x = (fx > 0.206897 ? Math.pow(fx, 3) : (fx - 16/116) / 7.787) * 0.95047;
  const y = (fy > 0.206897 ? Math.pow(fy, 3) : (fy - 16/116) / 7.787) * 1.00000;
  const z = (fz > 0.206897 ? Math.pow(fz, 3) : (fz - 16/116) / 7.787) * 1.08883;
  
  // XYZ para RGB linear
  let rn = x *  3.2406 + y * -1.5372 + z * -0.4986;
  let gn = x * -0.9689 + y *  1.8758 + z *  0.0415;
  let bn = x *  0.0557 + y * -0.2040 + z *  1.0570;
  
  // Linear para sRGB
  rn = rn > 0.0031308 ? 1.055 * Math.pow(rn, 1/2.4) - 0.055 : 12.92 * rn;
  gn = gn > 0.0031308 ? 1.055 * Math.pow(gn, 1/2.4) - 0.055 : 12.92 * gn;
  bn = bn > 0.0031308 ? 1.055 * Math.pow(bn, 1/2.4) - 0.055 : 12.92 * bn;
  
  return [
    Math.max(0, Math.min(255, Math.round(rn * 255))),
    Math.max(0, Math.min(255, Math.round(gn * 255))),
    Math.max(0, Math.min(255, Math.round(bn * 255)))
  ];
}

/**
 * Aplica CLAHE (Contrast Limited Adaptive Histogram Equalization) apenas no canal L
 * Preserva cores originais - essencial para PaddleOCR que foi treinado com RGB
 * v1.1.44: Reativado para correção noturna
 */
function applyCLAHE(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  clipLimit: number = 2.5,
  tileSize: number = 8
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);
  const numPixels = width * height;
  
  // 1. Converter RGB para LAB
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
  
  // 2. Aplicar CLAHE apenas no canal L
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
      
      // Calcular histograma do tile (L vai de 0-100)
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
      
      // Aplicar clip limit
      const clipThreshold = Math.max(1, Math.round(clipLimit * pixelCount / 101));
      let excess = 0;
      for (let i = 0; i <= 100; i++) {
        if (histogram[i] > clipThreshold) {
          excess += histogram[i] - clipThreshold;
          histogram[i] = clipThreshold;
        }
      }
      
      // Redistribuir excesso uniformemente
      const increment = Math.floor(excess / 101);
      for (let i = 0; i <= 100; i++) {
        histogram[i] += increment;
      }
      
      // Calcular CDF
      const cdf = new Uint32Array(101);
      cdf[0] = histogram[0];
      for (let i = 1; i <= 100; i++) {
        cdf[i] = cdf[i - 1] + histogram[i];
      }
      
      // Aplicar equalização
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
  
  // 3. Converter de volta para RGB (preservando cores A e B)
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

/**
 * Adiciona padding assimétrico (margem) em volta da imagem
 * Mais lateral para caracteres respirarem, menos vertical para texto ocupar mais altura
 * NOTA: Não usado em v1.1.10 - mantido para uso futuro
 */
// @ts-ignore - Mantido para uso futuro
function _addPadding(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  padHorizontal: number = 12,
  padVertical: number = 4,
  padColor: [number, number, number] = [0, 0, 0]
): { data: Uint8ClampedArray; width: number; height: number } {
  const newWidth = width + padHorizontal * 2;
  const newHeight = height + padVertical * 2;
  const result = new Uint8ClampedArray(newWidth * newHeight * 4);
  
  // Preencher com cor de padding
  for (let i = 0; i < newWidth * newHeight; i++) {
    result[i * 4] = padColor[0];
    result[i * 4 + 1] = padColor[1];
    result[i * 4 + 2] = padColor[2];
    result[i * 4 + 3] = 255;
  }
  
  // Copiar imagem original no centro
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = ((y + padVertical) * newWidth + (x + padHorizontal)) * 4;
      result[dstIdx] = data[srcIdx];
      result[dstIdx + 1] = data[srcIdx + 1];
      result[dstIdx + 2] = data[srcIdx + 2];
      result[dstIdx + 3] = 255;
    }
  }
  
  return { data: result, width: newWidth, height: newHeight };
}

/**
 * Tenta detectar e corrigir perspectiva da placa (simplificado)
 * Se a placa estiver muito torta, tenta retificar
 * NOTA: Não usado em v1.1.10 - mantido para uso futuro
 */
// @ts-ignore - Mantido para uso futuro
function _unwarpPlate(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { data: Uint8ClampedArray; width: number; height: number } {
  // Implementação simplificada: verificar se precisa de correção
  // Por ora, apenas retorna a imagem original
  // A correção de perspectiva completa requer detecção de 4 cantos
  // que é computacionalmente cara no browser
  
  // Para v1.1.6, focamos nas outras otimizações que têm mais impacto
  // Perspectiva será implementada em versão futura se necessário
  
  return { data, width, height };
}

/**
 * v1.1.44: Detecta se a imagem foi capturada em condições noturnas
 * Baseado em:
 * - Luminância média baixa (imagem escura em geral)
 * - Alta variância de luminância (áreas muito claras e muito escuras)
 * - Histograma bimodal (picos em extremos - reflexos de farol + fundo escuro)
 */
function detectNightCondition(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { isNight: boolean; avgLuminance: number; luminanceVariance: number } {
  const numPixels = width * height;
  const histogram = new Uint32Array(256);
  let totalLuminance = 0;
  
  // Calcular luminância e histograma
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    // Luminância perceptual (BT.709)
    const luminance = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    histogram[Math.min(255, luminance)]++;
    totalLuminance += luminance;
  }
  
  const avgLuminance = totalLuminance / numPixels;
  
  // Calcular variância (desvio padrão)
  let varianceSum = 0;
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    const luminance = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
    varianceSum += (luminance - avgLuminance) ** 2;
  }
  const luminanceVariance = Math.sqrt(varianceSum / numPixels);
  
  // Contar pixels em extremos (< 30 = muito escuro, > 225 = reflexo/farol)
  let darkPixels = 0;
  let brightPixels = 0;
  for (let i = 0; i < 30; i++) darkPixels += histogram[i];
  for (let i = 225; i < 256; i++) brightPixels += histogram[i];
  
  const darkRatio = darkPixels / numPixels;
  const brightRatio = brightPixels / numPixels;
  
  // CRITÉRIOS DE DETECÇÃO NOTURNA:
  // 1. Luminância média baixa (< 80) - imagem geralmente escura OU
  // 2. Alta variância (> 60) + presença de extremos (bimodal) - reflexos de farol
  const isNight = 
    avgLuminance < 80 || 
    (luminanceVariance > 60 && darkRatio > 0.15 && brightRatio > 0.05);
  
  // v1.1.62: Log de detecção noturna removido - muito verboso
  
  return { isNight, avgLuminance, luminanceVariance };
}

/**
 * v1.1.47: Aplica sharpening leve para recuperar bordas após CLAHE
 * Kernel 3x3 conservador para não criar artefatos
 */
function applyLightSharpening(
  data: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data.length);
  // Kernel de sharpening leve (unsharp mask suave)
  // Centro = 1.5 (leve realce), vizinhos = -0.125 cada
  const SHARPEN_STRENGTH = 0.4; // 40% do efeito para não exagerar
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      
      for (let c = 0; c < 3; c++) {
        const center = data[idx + c];
        
        // Vizinhos cardinais
        const top = data[((y - 1) * width + x) * 4 + c];
        const bottom = data[((y + 1) * width + x) * 4 + c];
        const left = data[(y * width + (x - 1)) * 4 + c];
        const right = data[(y * width + (x + 1)) * 4 + c];
        
        // Média dos vizinhos
        const avgNeighbors = (top + bottom + left + right) / 4;
        
        // Unsharp mask: original + (original - blur) * strength
        const sharpened = center + (center - avgNeighbors) * SHARPEN_STRENGTH;
        
        result[idx + c] = Math.max(0, Math.min(255, Math.round(sharpened)));
      }
      result[idx + 3] = 255;
    }
  }
  
  // Copiar bordas sem modificação
  for (let x = 0; x < width; x++) {
    // Primeira linha
    const topIdx = x * 4;
    result[topIdx] = data[topIdx];
    result[topIdx + 1] = data[topIdx + 1];
    result[topIdx + 2] = data[topIdx + 2];
    result[topIdx + 3] = 255;
    // Última linha
    const bottomIdx = ((height - 1) * width + x) * 4;
    result[bottomIdx] = data[bottomIdx];
    result[bottomIdx + 1] = data[bottomIdx + 1];
    result[bottomIdx + 2] = data[bottomIdx + 2];
    result[bottomIdx + 3] = 255;
  }
  for (let y = 0; y < height; y++) {
    // Primeira coluna
    const leftIdx = y * width * 4;
    result[leftIdx] = data[leftIdx];
    result[leftIdx + 1] = data[leftIdx + 1];
    result[leftIdx + 2] = data[leftIdx + 2];
    result[leftIdx + 3] = 255;
    // Última coluna
    const rightIdx = (y * width + (width - 1)) * 4;
    result[rightIdx] = data[rightIdx];
    result[rightIdx + 1] = data[rightIdx + 1];
    result[rightIdx + 2] = data[rightIdx + 2];
    result[rightIdx + 3] = 255;
  }
  
  return result;
}

/**
 * v1.1.47: Aplica correções específicas para imagens noturnas (REFINADO)
 * 
 * Pipeline melhorado:
 * 1. Anti-Glare: Atenua reflexos de farol ANTES do gamma (evita saturação)
 * 2. Gamma suave: Máximo 1.5 (era 2.0) - menos "lavado"
 * 3. CLAHE conservador: clipLimit 1.5 (era 2.0) - menos over-enhancement
 * 4. Sharpening leve: Recupera bordas dos caracteres após CLAHE
 */
function applyNightCorrection(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  avgLuminance: number
): Uint8ClampedArray {
  const numPixels = width * height;
  const intermediate = new Uint8ClampedArray(data.length);
  
  // === v1.1.47: PARÂMETROS REFINADOS ===
  const GLARE_THRESHOLD = 220;    // Pixels acima disso são reflexos de farol
  const GLARE_REDUCTION = 0.5;    // Atenua 50% da intensidade do glare
  
  // Gamma mais suave (era max 2.0, agora max 1.5)
  // avgLuminance 40 → gamma 1.5
  // avgLuminance 80 → gamma 1.1
  const gamma = Math.max(1.1, Math.min(1.5, 1.6 - (avgLuminance / 160)));
  const gammaInv = 1 / gamma;
  
  console.log(`🔆 v1.1.47 Correção noturna: gamma=${gamma.toFixed(2)}, glare_thresh=${GLARE_THRESHOLD}`);
  
  // === PASSO 1: ANTI-GLARE (Antes do Gamma) ===
  // Detecta pixels super-brilhantes (faróis) e atenua gradualmente
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    
    // Calcular luminância do pixel
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    
    if (luminance > GLARE_THRESHOLD) {
      // Pixel muito brilhante (provavelmente reflexo de farol)
      // Atenuar proporcionalmente à intensidade
      const excessBrightness = (luminance - GLARE_THRESHOLD) / (255 - GLARE_THRESHOLD);
      const attenuation = 1 - (excessBrightness * GLARE_REDUCTION);
      
      intermediate[idx] = Math.round(r * attenuation);
      intermediate[idx + 1] = Math.round(g * attenuation);
      intermediate[idx + 2] = Math.round(b * attenuation);
    } else {
      // Pixel normal - copiar sem alteração
      intermediate[idx] = r;
      intermediate[idx + 1] = g;
      intermediate[idx + 2] = b;
    }
    intermediate[idx + 3] = 255;
  }
  
  // === PASSO 2: GAMMA SUAVE ===
  const afterGamma = new Uint8ClampedArray(data.length);
  for (let i = 0; i < numPixels; i++) {
    const idx = i * 4;
    
    for (let c = 0; c < 3; c++) {
      let value = intermediate[idx + c];
      // Gamma correction (expande tons escuros suavemente)
      value = 255 * Math.pow(value / 255, gammaInv);
      afterGamma[idx + c] = Math.max(0, Math.min(255, Math.round(value)));
    }
    afterGamma[idx + 3] = 255;
  }
  
  // === PASSO 3: CLAHE CONSERVADOR ===
  // clipLimit reduzido de 2.0 para 1.5 (menos redistribuição = menos lavagem)
  const afterCLAHE = applyCLAHE(afterGamma, width, height, 1.5, 8);
  
  // === PASSO 4: SHARPENING LEVE ===
  // Recupera bordas dos caracteres que podem ter sido suavizadas
  const final = applyLightSharpening(afterCLAHE, width, height);
  
  // v1.1.62: Log de correção noturna removido
  
  return final;
}

/**
 * Pipeline completo de otimização de imagem para OCR v1.1.47
 * 
 * Ordem de processamento:
 * 1. Detecção de condição noturna (análise de luminância)
 * 2. Correção noturna REFINADA se forceNightMode=true OU detecção automática
 *    - Anti-glare (atenua faróis)
 *    - Gamma suave (max 1.5)
 *    - CLAHE conservador (clipLimit 1.5)
 *    - Sharpening leve (recupera bordas)
 * 3. Upscale 2x para imagens pequenas (< 200px)
 * 
 * IMPORTANTE: Mantém RGB - PaddleOCR foi treinado com estatísticas ImageNet em 3 canais
 */
function optimizeImageForOCR(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { forceNightMode?: boolean }
): { data: Uint8ClampedArray; width: number; height: number } {
  // v1.1.62: Log de pipeline iniciado removido
  
  let processedData = data;
  
  // v1.1.45: Modo noturno forçado OU detecção automática
  const forceNight = options?.forceNightMode ?? false;
  const nightAnalysis = detectNightCondition(data, width, height);
  
  if (forceNight || nightAnalysis.isNight) {
    // v1.1.62: Log de modo noturno removido
    processedData = applyNightCorrection(
      data, width, height, 
      nightAnalysis.avgLuminance
    );
  }
  
  // v1.1.36: Upscale 2x para imagens pequenas (< 200px largura)
  // Melhora detalhes dos caracteres antes do resize para tensor
  // Resolve confusões como 0↔6, E↔B em placas distantes/pequenas
  const MIN_WIDTH_FOR_OCR = 200;
  const UPSCALE_FACTOR = 2;
  
  if (width < MIN_WIDTH_FOR_OCR) {
    const newWidth = width * UPSCALE_FACTOR;
    const newHeight = height * UPSCALE_FACTOR;
    
    // v1.1.62: Log de upscale removido
    
    // Criar canvas source com os dados processados
    const srcCanvas = new OffscreenCanvas(width, height);
    const srcCtx = srcCanvas.getContext('2d', { alpha: false })!;
    const srcImageData = srcCtx.createImageData(width, height);
    srcImageData.data.set(processedData);
    srcCtx.putImageData(srcImageData, 0, 0);
    
    // Criar canvas destino com upscale e interpolação de alta qualidade
    const dstCanvas = new OffscreenCanvas(newWidth, newHeight);
    const dstCtx = dstCanvas.getContext('2d', { alpha: false })!;
    dstCtx.imageSmoothingEnabled = true;
    dstCtx.imageSmoothingQuality = 'high'; // Interpolação bilinear de alta qualidade
    dstCtx.drawImage(srcCanvas, 0, 0, newWidth, newHeight);
    
    const upscaledData = dstCtx.getImageData(0, 0, newWidth, newHeight);
    
    // v1.1.62: Log removido
    
    return { 
      data: new Uint8ClampedArray(upscaledData.data), 
      width: newWidth, 
      height: newHeight 
    };
  }
  
  // v1.1.62: Logs removidos
  
  return { data: new Uint8ClampedArray(processedData), width, height };
}

// v1.1.51: Funções de heurística removidas - OCR apenas quando YOLO confirma placa
// toGrayscale, detectEdges, calculateEdgeDensity, calculateRegionSaturation,
// calculateInternalContrast, hasInternalVerticalEdges, findBestPlateRegion

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
        // v1.1.62: Log removido
        return c;
      }
    }
    
    for (const c of candidates) {
      const variations = generateVariations(c);
      for (const v of variations) {
        const tempValidation = validatePlateFormat(v);
        if (tempValidation.isValid) {
          // v1.1.62: Log removido
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

/**
 * Valida e corrige placa
 * v1.1.52: Aceita formatHint para respeitar formato detectado pelo hífen
 */
function validateAndCorrectPlate(rawText: string, formatHint?: 'antiga' | 'mercosul' | 'unknown'): PlateValidationResult {
  const cleaned = rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const candidate = extractPlateCandidate(rawText);
  
  // v1.1.62: Log de validação removido
  
  // v1.1.52: Se formatHint é 'antiga', priorizar formato antigo
  const preferOld = formatHint === 'antiga';
  
  // Se tem 8 caracteres, testar sem o primeiro
  if (cleaned.length === 8) {
    const withoutFirst = cleaned.slice(1);
    
    // v1.1.52: Se preferir antigo, testar antigo primeiro
    if (preferOld) {
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
    } else {
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
    }
    
    const variationsWithoutFirst = generateVariations(withoutFirst);
    for (const variation of variationsWithoutFirst) {
      if (preferOld) {
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
      } else {
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
    // v1.1.52: Se preferir antigo, testar antigo primeiro
    if (preferOld) {
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
    } else {
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
    let yoloTimeMs = 0;
    
    if (modelReady) {
      const yoloStart = performance.now();
      plateRegion = await detectPlateWithYOLO(imageData, width, height);
      yoloTimeMs = Math.round(performance.now() - yoloStart);
      usedYolo = plateRegion !== null;
      if (usedYolo && plateRegion) {
        console.log(`🧠 YOLO: ${plateRegion.width}x${plateRegion.height}px (${Math.round(plateRegion.confidence * 100)}%) ${yoloTimeMs}ms`);
      }
    }
    
    // v1.1.51: Sem YOLO = Sem OCR (elimina falsos positivos de heurística)
    if (!plateRegion) {
      const elapsed = performance.now() - startTime;
      // v1.1.62: Log silencioso quando não encontra placa
      
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
      
      // v1.1.62: Log de região recortada removido
      
      // v1.1.34: Unwarp desabilitado temporariamente - estava distorcendo ao invés de corrigir
      // O algoritmo aplicava transformação na imagem recortada bruta, encontrando cantos errados
      // Futuro: implementar Unwarp v2 com detecção de linhas (Hough Transform)
      // const unwarpResult = tryUnwarpPlate(processData, processWidth, processHeight);
      // if (unwarpResult.wasUnwarped) {
      //   processData = unwarpResult.data;
      //   processWidth = unwarpResult.width;
      //   processHeight = unwarpResult.height;
      // }
    } else {
      processData = imageData.data;
      processWidth = width;
      processHeight = height;
    }
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Otimizando imagem...', progress: 0.3 } });
    
    // Otimizar imagem com pipeline avançado v1.1.45 (CLAHE LAB + Padding + Night Mode)
    let optimized = optimizeImageForOCR(processData, processWidth, processHeight, {
      forceNightMode: options?.forceNightMode,
    });
    
    // v1.1.36: Unwarp removido - estava introduzindo artefatos em imagens pequenas
    // O upscale 2x em optimizeImageForOCR compensa a perda de detalhes
    
    self.postMessage({ type: 'PROGRESS', payload: { stage: 'Executando OCR ONNX...', progress: 0.4 } });
    
    // Debug images
    const debugImages: DebugImages = {};
    
    if (options?.enableDebug && processWidth > 0 && processHeight > 0) {
      debugImages.cropped = await generateImageFromData(processData, processWidth, processHeight);
      
      // Mostrar imagem otimizada (que realmente vai para o OCR - após unwarp se aplicado)
      debugImages.preprocessed = await generateImageFromData(optimized.data, optimized.width, optimized.height);
    }
    
    // 3. v1.1.86: Multi-Crop OCR com Consenso Cruzado
    // Roda OCR 2 vezes com crops diferentes para melhorar precisão
    const resultA = await runONNXOCR(optimized.data, optimized.width, optimized.height, CROP_STANDARD);
    const resultB = await runONNXOCR(optimized.data, optimized.width, optimized.height, CROP_WIDE);
    
    let rawText: string;
    let ocrConfidence: number;
    let detectedFormat: 'antiga' | 'mercosul' | 'unknown';
    let allCandidates: Array<{ text: string; confidence: number; detectedFormat: 'antiga' | 'mercosul' | 'unknown' }> = [];
    
    // Merge candidatos de ambos os crops
    const addCandidates = (candidates?: Array<{ text: string; confidence: number; detectedFormat: 'antiga' | 'mercosul' | 'unknown' }>) => {
      if (candidates) allCandidates.push(...candidates);
    };
    
    // Adicionar greedy de ambos + beam candidates de ambos
    if (resultA.text) allCandidates.push({ text: resultA.text, confidence: resultA.confidence, detectedFormat: resultA.detectedFormat });
    if (resultB.text && resultB.text !== resultA.text) allCandidates.push({ text: resultB.text, confidence: resultB.confidence, detectedFormat: resultB.detectedFormat });
    addCandidates(resultA.candidates);
    addCandidates(resultB.candidates);
    
    if (resultA.text === resultB.text) {
      // Consenso: ambos concordam
      rawText = resultA.text;
      ocrConfidence = Math.max(resultA.confidence, resultB.confidence);
      detectedFormat = resultA.detectedFormat;
      if (rawText.length >= 7) {
        console.log(`✅ Multi-Crop: consenso "${rawText}" (${(resultA.confidence * 100).toFixed(0)}%/${(resultB.confidence * 100).toFixed(0)}%)`);
      }
    } else {
      // Discordância: usar o mais confiante como principal, merge todos candidatos
      if (resultA.confidence >= resultB.confidence) {
        rawText = resultA.text;
        ocrConfidence = resultA.confidence;
        detectedFormat = resultA.detectedFormat;
      } else {
        rawText = resultB.text;
        ocrConfidence = resultB.confidence;
        detectedFormat = resultB.detectedFormat;
      }
      if (rawText.length >= 5) {
        console.log(`🔀 Multi-Crop: A="${resultA.text}" B="${resultB.text}" → merged ${allCandidates.length} candidatos`);
      }
    }
    
    // Deduplicar e ordenar candidatos por confiança
    const seenTexts = new Set<string>();
    const beamCandidates = allCandidates
      .filter(c => {
        if (!c.text || seenTexts.has(c.text)) return false;
        seenTexts.add(c.text);
        return true;
      })
      .sort((a, b) => b.confidence - a.confidence);
    
    // v1.1.84: Validar candidatos do beam search e incluir no resultado
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
    
    // 3.5. Filtrar falsos positivos (texto de câmera/ambiente)
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
    
    // 4. Validar e corrigir placa
    const validation = validateAndCorrectPlate(rawText, detectedFormat);
    
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
      candidates: validatedCandidates.length > 0 ? validatedCandidates : undefined, // v1.1.84
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
        const activeBackend = modelReady ? tf.getBackend() : 'unknown';
        self.postMessage({ type: 'MODEL_LOADED', payload: { success, backend: activeBackend } } as WorkerResponse);
        break;
      }
        
      case 'SET_CONFIG': {
        const { yoloInputSize } = event.data.payload;
        if (yoloInputSize && (yoloInputSize === 320 || yoloInputSize === 640)) {
          const oldSize = currentYoloInputSize;
          currentYoloInputSize = yoloInputSize;
          if (oldSize !== yoloInputSize) {
            console.log(`⚙️ YOLO input size: ${oldSize} → ${yoloInputSize}px`);
          }
        }
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
console.log('🔧 PlateProcessor Worker carregado (ONNX OCR v1.1.89 - Hardware Optimization)');
