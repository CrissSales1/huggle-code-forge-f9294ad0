/**
 * Hook para reconhecimento de placas usando OCR ONNX no worker
 * Com fallback para Plate Recognizer API quando confiança < threshold
 * v1.1.0: Migrado de Tesseract para PaddleOCR ONNX
 */
import { useState, useCallback, useRef } from 'react';
import { validateAndCorrectPlate } from '../utils/plateValidator';
import { getPlateDetector } from '../utils/plateDetector';
import { usePlateWorker, type OCRResult } from './usePlateWorker';

// Threshold para aceitar resultados do OCR local
const CONFIDENCE_THRESHOLD = 0.60;
const PLATE_RECOGNIZER_URL = 'https://kbgftpiyzfmabrncpnas.supabase.co/functions/v1/detect-plate';

// Configuração para desativar fallback (economia máxima)
const FALLBACK_ENABLED_KEY = 'portacerta_fallback_enabled';

export function loadFallbackEnabled(): boolean {
  return localStorage.getItem(FALLBACK_ENABLED_KEY) !== 'false';
}

export function saveFallbackEnabled(enabled: boolean): void {
  localStorage.setItem(FALLBACK_ENABLED_KEY, enabled ? 'true' : 'false');
}

interface UsePlateRecognitionReturn {
  isProcessing: boolean;
  lastResult: OCRResult | null;
  error: string | null;
  statusMessage: string;
  usedFallback: boolean;
  debugImage: string | null;
  recognizeFromCanvas: (canvas: HTMLCanvasElement, enableDebug?: boolean) => Promise<OCRResult>;
  reset: () => void;
  cleanup: () => Promise<void>;
}

/**
 * Converte canvas para base64 comprimido
 */
function canvasToBase64(canvas: HTMLCanvasElement): string {
  const maxDimension = 1280;
  let targetCanvas = canvas;
  
  if (canvas.width > maxDimension || canvas.height > maxDimension) {
    const scale = maxDimension / Math.max(canvas.width, canvas.height);
    const newWidth = Math.round(canvas.width * scale);
    const newHeight = Math.round(canvas.height * scale);
    
    targetCanvas = document.createElement('canvas');
    targetCanvas.width = newWidth;
    targetCanvas.height = newHeight;
    const ctx = targetCanvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, newWidth, newHeight);
    }
  }
  
  const dataUrl = targetCanvas.toDataURL('image/jpeg', 0.75);
  return dataUrl.split(',')[1];
}

/**
 * Cria resultado vazio para erros
 */
function createEmptyResult(): OCRResult {
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
    processingTimeMs: 0,
  };
}

/**
 * Chama a API do Plate Recognizer como fallback
 */
async function callPlateRecognizerFallback(canvas: HTMLCanvasElement): Promise<OCRResult> {
  const startTime = performance.now();
  
  try {
    console.log('🔄 Usando fallback: Plate Recognizer API...');
    
    const imageBase64 = canvasToBase64(canvas);
    
    const response = await fetch(PLATE_RECOGNIZER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64 }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
    }
    
    const data = await response.json();
    const processingTimeMs = performance.now() - startTime;
    
    if (data.placa) {
      const validation = validateAndCorrectPlate(data.placa);
      
      return {
        success: true,
        rawText: data.placa,
        validation: {
          ...validation,
          confidence: data.confidence || 0.95,
        },
        ocrConfidence: data.confidence || 0.95,
        processingTimeMs,
      };
    }
    
    return {
      ...createEmptyResult(),
      processingTimeMs,
    };
  } catch (error) {
    console.error('❌ Erro no fallback Plate Recognizer:', error);
    throw error;
  }
}

export function usePlateRecognition(): UsePlateRecognitionReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [usedFallback, setUsedFallback] = useState(false);
  const [debugImage, setDebugImage] = useState<string | null>(null);
  const attemptRef = useRef(0);
  
  // Usar o worker para processamento OCR
  const { processPlate, terminate } = usePlateWorker();

  const recognizeFromCanvas = useCallback(async (canvas: HTMLCanvasElement, enableDebug: boolean = false): Promise<OCRResult> => {
    attemptRef.current++;
    const currentAttempt = attemptRef.current;
    
    setIsProcessing(true);
    setError(null);
    setUsedFallback(false);
    setDebugImage(null);
    setStatusMessage('Processando imagem...');
    
    // Gerar imagem de debug se solicitado
    if (enableDebug) {
      try {
        const detector = getPlateDetector();
        detector.setDebugMode(true);
        const detectionResult = detector.detect(canvas);
        detector.setDebugMode(false);
        
        if (detectionResult.debugCanvas) {
          setDebugImage(detectionResult.debugCanvas.toDataURL('image/jpeg', 0.8));
        }
      } catch (e) {
        console.warn('Erro ao gerar imagem de debug:', e);
      }
    }
    
    try {
      // OCR via worker ONNX - passa o canvas diretamente
      setStatusMessage('🔍 Reconhecendo com OCR ONNX...');
      
      const workerResult = await processPlate(canvas, {
        enableDebug,
        enableFallback: false, // Gerenciamos fallback aqui
      });
      
      // Verificar se ainda é a tentativa atual
      if (currentAttempt !== attemptRef.current) {
        return workerResult ?? createEmptyResult();
      }
      
      // Se worker retornou null, criar resultado vazio
      if (!workerResult) {
        setStatusMessage('❌ Erro no processamento');
        setError('Falha ao processar imagem');
        return createEmptyResult();
      }
      
      const localConfidence = workerResult.success ? workerResult.validation.confidence : 0;
      
      // Debug log
      console.log('🔍 OCR ONNX Debug:', {
        rawText: workerResult.rawText,
        confidence: Math.round(localConfidence * 100) + '%',
        isValid: workerResult.validation?.isValid,
        corrected: workerResult.validation?.corrected,
        format: workerResult.validation?.format,
      });
      
      console.log(`📊 OCR ONNX: confiança ${Math.round(localConfidence * 100)}% (limite: ${CONFIDENCE_THRESHOLD * 100}%)`);
      
      // Se debug image do worker disponível
      if (workerResult.debugImage) {
        setDebugImage(workerResult.debugImage);
      }
      
      // Se confiança >= threshold, usar resultado local
      if (workerResult.success && localConfidence >= CONFIDENCE_THRESHOLD) {
        setLastResult(workerResult);
        setStatusMessage(`✅ Placa: ${workerResult.validation.formatted} (${Math.round(localConfidence * 100)}% - ONNX)`);
        console.log(`✅ Usando OCR ONNX: ${workerResult.validation.formatted}`);
        return workerResult;
      }
      
      // Verificar se fallback está habilitado
      const fallbackEnabled = loadFallbackEnabled();
      
      if (!fallbackEnabled) {
        // Modo econômico: tentar usar resultado local mesmo com baixa confiança
        const rawClean = workerResult.rawText?.replace(/[^A-Z0-9]/gi, '') || '';
        const couldBePlate = rawClean.length === 7;
        
        if (workerResult.success || couldBePlate) {
          if (couldBePlate && !workerResult.success) {
            const revalidated = validateAndCorrectPlate(rawClean);
            if (revalidated.isValid) {
              const correctedResult: OCRResult = {
                ...workerResult,
                success: true,
                validation: revalidated,
              };
              setLastResult(correctedResult);
              setStatusMessage(`⚠️ Placa: ${revalidated.formatted} (${Math.round(revalidated.confidence * 100)}% - modo econômico)`);
              console.log(`💰 Modo econômico - placa corrigida: ${revalidated.formatted}`);
              return correctedResult;
            }
          }
          
          setLastResult(workerResult);
          const msg = workerResult.success 
            ? `⚠️ Placa: ${workerResult.validation.formatted} (${Math.round(localConfidence * 100)}% - modo econômico)`
            : `⚠️ Texto detectado: "${workerResult.rawText}" - Verificar manualmente`;
          setStatusMessage(msg);
          console.log(`💰 Modo econômico: usando OCR ONNX (${Math.round(localConfidence * 100)}%)`);
          return workerResult;
        }
        setStatusMessage('❌ Nenhuma placa detectada (modo econômico)');
        return workerResult;
      }
      
      // Fallback: usar Plate Recognizer API
      setStatusMessage('🔄 Confiança baixa, usando API externa...');
      setUsedFallback(true);
      
      try {
        const fallbackResult = await callPlateRecognizerFallback(canvas);
        
        if (currentAttempt !== attemptRef.current) {
          return fallbackResult;
        }
        
        setLastResult(fallbackResult);
        
        if (fallbackResult.success) {
          setStatusMessage(`✅ Placa: ${fallbackResult.validation.formatted} (API externa)`);
          console.log(`✅ Usando fallback API: ${fallbackResult.validation.formatted}`);
        } else {
          if (workerResult.rawText) {
            setLastResult(workerResult);
            setStatusMessage(`⚠️ Texto detectado: "${workerResult.rawText}" - Baixa confiança`);
            setError('Placa detectada com baixa confiança. Verifique o resultado.');
            return workerResult;
          }
          setStatusMessage('❌ Nenhuma placa detectada');
          setError('Nenhuma placa detectada. Tente novamente.');
        }
        
        return fallbackResult;
      } catch (fallbackError) {
        console.warn('⚠️ Fallback falhou, usando resultado ONNX:', fallbackError);
        
        if (workerResult.success || workerResult.rawText) {
          setLastResult(workerResult);
          const msg = workerResult.success 
            ? `⚠️ Placa: ${workerResult.validation.formatted} (${Math.round(localConfidence * 100)}% - sem validação externa)`
            : `⚠️ Texto detectado: "${workerResult.rawText}" - Formato inválido`;
          setStatusMessage(msg);
          if (!workerResult.success) {
            setError('API de validação indisponível. Verifique o resultado manualmente.');
          }
          return workerResult;
        }
        
        setStatusMessage('❌ Nenhuma placa detectada');
        setError('Nenhuma placa detectada e API de fallback indisponível.');
        return workerResult;
      }
      
    } catch (err) {
      console.error('Erro no reconhecimento:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(`Erro no processamento: ${errorMessage}`);
      setStatusMessage('❌ Erro no processamento');
      
      return createEmptyResult();
    } finally {
      if (currentAttempt === attemptRef.current) {
        setIsProcessing(false);
      }
    }
  }, [processPlate]);

  const reset = useCallback(() => {
    setIsProcessing(false);
    setLastResult(null);
    setError(null);
    setStatusMessage('');
    setUsedFallback(false);
    setDebugImage(null);
    attemptRef.current++;
  }, []);

  const cleanup = useCallback(async () => {
    reset();
    terminate();
  }, [reset, terminate]);

  return {
    isProcessing,
    lastResult,
    error,
    statusMessage,
    usedFallback,
    debugImage,
    recognizeFromCanvas,
    reset,
    cleanup,
  };
}
