/**
 * Serviço de OCR otimizado para placas usando Tesseract.js
 * OTIMIZADO: Usa OEM=0 (Legacy, mais rápido) e canvas reutilizável
 */
import Tesseract from 'tesseract.js';
import { preprocessForOCR, preprocessLight } from './imagePreprocessing';
import { validateAndCorrectPlate, type PlateValidationResult } from './plateValidator';

let worker: Tesseract.Worker | null = null;
let isInitializing = false;

// Canvas singleton para reutilização (evita criar novo a cada OCR)
let processingCanvas: HTMLCanvasElement | null = null;
let processingCtx: CanvasRenderingContext2D | null = null;

function getProcessingCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  if (!processingCanvas) {
    processingCanvas = document.createElement('canvas');
    processingCtx = processingCanvas.getContext('2d');
  }
  
  if (processingCanvas.width !== width || processingCanvas.height !== height) {
    processingCanvas.width = width;
    processingCanvas.height = height;
  }
  
  return { canvas: processingCanvas, ctx: processingCtx! };
}

/**
 * Inicializa o worker do Tesseract (singleton)
 * Usa OEM=0 (Legacy) que é significativamente mais rápido que OEM=1 (LSTM)
 */
async function initWorker(): Promise<Tesseract.Worker> {
  if (worker) return worker;
  
  if (isInitializing) {
    // Aguardar inicialização em andamento
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (worker) return worker;
  }
  
  isInitializing = true;
  
  try {
    console.log('🔧 Inicializando Tesseract.js (modo rápido)...');
    
    // OEM=0 (Legacy) é 2-3x mais rápido que OEM=1 (LSTM)
    worker = await Tesseract.createWorker('eng', 0, {
      logger: (m) => {
        if (m.status === 'recognizing text' && m.progress === 1) {
          console.log(`📊 OCR: 100%`);
        }
      }
    });
    
    // Configurações otimizadas para placas
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE, // PSM 7: single line
    });
    
    console.log('✅ Tesseract.js inicializado (Legacy mode)');
    return worker;
  } finally {
    isInitializing = false;
  }
}

/**
 * Pre-carrega o worker do Tesseract (chame no startup do app)
 */
export async function preloadOCR(): Promise<void> {
  try {
    await initWorker();
    console.log('✅ OCR pré-carregado e pronto');
  } catch (e) {
    console.warn('⚠️ Falha ao pré-carregar OCR:', e);
  }
}

/**
 * Resultado do reconhecimento OCR
 */
export interface OCRResult {
  success: boolean;
  rawText: string;
  validation: PlateValidationResult;
  ocrConfidence: number;
  processingTimeMs: number;
}

/**
 * Reconhece texto de placa a partir de um canvas
 */
export async function recognizePlate(canvas: HTMLCanvasElement): Promise<OCRResult> {
  const startTime = performance.now();
  
  try {
    const tesseractWorker = await initWorker();
    
    // Usar canvas reutilizável
    const { canvas: processedCanvas, ctx } = getProcessingCanvas(canvas.width, canvas.height);
    ctx.drawImage(canvas, 0, 0);
    
    // Aplicar pré-processamento otimizado
    const processedImage = preprocessForOCR(processedCanvas);
    
    // Executar OCR
    console.log('🔍 Executando OCR...');
    const result = await tesseractWorker.recognize(processedImage);
    
    const rawText = result.data.text.trim();
    const ocrConfidence = result.data.confidence / 100;
    
    console.log(`📝 OCR resultado: "${rawText}" (confiança: ${Math.round(ocrConfidence * 100)}%)`);
    
    // Validar e corrigir placa
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
    console.error('❌ Erro no OCR:', error);
    const processingTimeMs = performance.now() - startTime;
    
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
      processingTimeMs,
    };
  }
}

/**
 * Versão rápida do OCR (menos pré-processamento)
 */
export async function recognizePlateFast(canvas: HTMLCanvasElement): Promise<OCRResult> {
  const startTime = performance.now();
  
  try {
    const tesseractWorker = await initWorker();
    
    // Usar canvas reutilizável
    const { canvas: processedCanvas, ctx } = getProcessingCanvas(canvas.width, canvas.height);
    ctx.drawImage(canvas, 0, 0);
    
    // Pré-processamento leve (mais rápido)
    const processedImage = preprocessLight(processedCanvas);
    
    // OCR
    const result = await tesseractWorker.recognize(processedImage);
    const rawText = result.data.text.trim();
    const ocrConfidence = result.data.confidence / 100;
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
    console.error('❌ Erro no OCR rápido:', error);
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

/**
 * Libera recursos do worker
 */
export async function terminateOCR(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
    console.log('🔧 Tesseract.js finalizado');
  }
}
