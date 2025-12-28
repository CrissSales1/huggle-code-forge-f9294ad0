/**
 * Hook para reconhecimento de placas usando OCR local gratuito
 * Com fallback para Plate Recognizer API quando confiança < 75%
 */
import { useState, useCallback, useRef } from 'react';
import { recognizePlate, terminateOCR, type OCRResult } from '../utils/plateOCR';
import { validateAndCorrectPlate } from '../utils/plateValidator';

const CONFIDENCE_THRESHOLD = 0.75; // 75% - abaixo disso usa fallback
const PLATE_RECOGNIZER_URL = 'https://kbgftpiyzfmabrncpnas.supabase.co/functions/v1/detect-plate';

interface UsePlateRecognitionReturn {
  isProcessing: boolean;
  lastResult: OCRResult | null;
  error: string | null;
  statusMessage: string;
  usedFallback: boolean;
  recognizeFromCanvas: (canvas: HTMLCanvasElement) => Promise<OCRResult>;
  reset: () => void;
  cleanup: () => Promise<void>;
}

/**
 * Converte canvas para base64 comprimido
 */
function canvasToBase64(canvas: HTMLCanvasElement): string {
  const maxDimension = 1280;
  let targetCanvas = canvas;
  
  // Redimensionar se necessário
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
          confidence: data.confidence || 0.95, // API geralmente tem alta confiança
        },
        ocrConfidence: data.confidence || 0.95,
        processingTimeMs,
      };
    }
    
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
  const attemptRef = useRef(0);

  const recognizeFromCanvas = useCallback(async (canvas: HTMLCanvasElement): Promise<OCRResult> => {
    attemptRef.current++;
    const currentAttempt = attemptRef.current;
    
    setIsProcessing(true);
    setError(null);
    setUsedFallback(false);
    setStatusMessage('Processando imagem...');
    
    try {
      // Primeira tentativa: OCR local gratuito
      setStatusMessage('🔍 Reconhecendo com OCR local...');
      
      const localResult = await recognizePlate(canvas);
      
      // Verificar se ainda é a tentativa atual
      if (currentAttempt !== attemptRef.current) {
        return localResult;
      }
      
      const localConfidence = localResult.success ? localResult.validation.confidence : 0;
      console.log(`📊 OCR local: confiança ${Math.round(localConfidence * 100)}% (limite: ${CONFIDENCE_THRESHOLD * 100}%)`);
      
      // Se confiança >= 75%, usar resultado local
      if (localResult.success && localConfidence >= CONFIDENCE_THRESHOLD) {
        setLastResult(localResult);
        setStatusMessage(`✅ Placa: ${localResult.validation.formatted} (${Math.round(localConfidence * 100)}% - OCR local)`);
        console.log(`✅ Usando OCR local: ${localResult.validation.formatted}`);
        return localResult;
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
          // Se API também falhar, usar resultado local se tiver algo
          if (localResult.rawText) {
            setLastResult(localResult);
            setStatusMessage(`⚠️ Texto detectado: "${localResult.rawText}" - Baixa confiança`);
            setError('Placa detectada com baixa confiança. Verifique o resultado.');
            return localResult;
          }
          setStatusMessage('❌ Nenhuma placa detectada');
          setError('Nenhuma placa detectada. Tente novamente.');
        }
        
        return fallbackResult;
      } catch (fallbackError) {
        console.warn('⚠️ Fallback falhou, usando resultado local:', fallbackError);
        
        // Se fallback falhar, usar resultado local mesmo com baixa confiança
        if (localResult.success || localResult.rawText) {
          setLastResult(localResult);
          const msg = localResult.success 
            ? `⚠️ Placa: ${localResult.validation.formatted} (${Math.round(localConfidence * 100)}% - sem validação externa)`
            : `⚠️ Texto detectado: "${localResult.rawText}" - Formato inválido`;
          setStatusMessage(msg);
          if (!localResult.success) {
            setError('API de validação indisponível. Verifique o resultado manualmente.');
          }
          return localResult;
        }
        
        setStatusMessage('❌ Nenhuma placa detectada');
        setError('Nenhuma placa detectada e API de fallback indisponível.');
        return localResult;
      }
      
    } catch (err) {
      console.error('Erro no reconhecimento:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(`Erro no processamento: ${errorMessage}`);
      setStatusMessage('❌ Erro no processamento');
      
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
    } finally {
      if (currentAttempt === attemptRef.current) {
        setIsProcessing(false);
      }
    }
  }, []);

  const reset = useCallback(() => {
    setIsProcessing(false);
    setLastResult(null);
    setError(null);
    setStatusMessage('');
    setUsedFallback(false);
    attemptRef.current++;
  }, []);

  const cleanup = useCallback(async () => {
    reset();
    await terminateOCR();
  }, [reset]);

  return {
    isProcessing,
    lastResult,
    error,
    statusMessage,
    usedFallback,
    recognizeFromCanvas,
    reset,
    cleanup,
  };
}
