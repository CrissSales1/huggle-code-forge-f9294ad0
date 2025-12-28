/**
 * Serviço de OCR otimizado para placas usando Tesseract.js
 */
import Tesseract from 'tesseract.js';
import { preprocessForOCR, preprocessLight } from './imagePreprocessing';
import { validateAndCorrectPlate, type PlateValidationResult } from './plateValidator';

let worker: Tesseract.Worker | null = null;
let isInitializing = false;

/**
 * Inicializa o worker do Tesseract (singleton)
 */
async function initWorker(): Promise<Tesseract.Worker> {
  if (worker) return worker;
  
  if (isInitializing) {
    // Aguardar inicialização em andamento
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (worker) return worker;
  }
  
  isInitializing = true;
  
  try {
    console.log('🔧 Inicializando Tesseract.js...');
    
    worker = await Tesseract.createWorker('eng', 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log(`📊 OCR: ${Math.round(m.progress * 100)}%`);
        }
      }
    });
    
    // Configurações otimizadas para placas
    await worker.setParameters({
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE, // PSM 7: single line
    });
    
    console.log('✅ Tesseract.js inicializado');
    return worker;
  } finally {
    isInitializing = false;
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
    
    // Criar cópia do canvas para pré-processamento
    const processedCanvas = document.createElement('canvas');
    processedCanvas.width = canvas.width;
    processedCanvas.height = canvas.height;
    const ctx = processedCanvas.getContext('2d');
    
    if (!ctx) throw new Error('Erro ao criar canvas de processamento');
    
    ctx.drawImage(canvas, 0, 0);
    
    // Aplicar pré-processamento
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
    
    // Criar cópia do canvas para pré-processamento leve
    const processedCanvas = document.createElement('canvas');
    processedCanvas.width = canvas.width;
    processedCanvas.height = canvas.height;
    const ctx = processedCanvas.getContext('2d');
    
    if (!ctx) throw new Error('Erro ao criar canvas de processamento');
    
    ctx.drawImage(canvas, 0, 0);
    
    // Pré-processamento leve
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
