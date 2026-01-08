/**
 * Hook para reconhecimento de placas usando OCR local gratuito
 * Com fallback para Plate Recognizer API quando confiança < 90%
 * OTIMIZADO: Prioriza OCR local para economizar custos
 */
import { useState, useCallback, useRef } from 'react';
import { recognizePlateFast, terminateOCR, type OCRResult } from '../utils/plateOCR';
import { validateAndCorrectPlate } from '../utils/plateValidator';
import { getPlateDetector } from '../utils/plateDetector';

// Threshold reduzido para aceitar mais resultados do OCR local
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
  debugImage: string | null; // Data URL da imagem de debug com região detectada
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
  const [debugImage, setDebugImage] = useState<string | null>(null);
  const attemptRef = useRef(0);

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
      // Primeira tentativa: OCR local rápido (gratuito)
      setStatusMessage('🔍 Reconhecendo com OCR local...');
      
      const localResult = await recognizePlateFast(canvas);
      
      // Verificar se ainda é a tentativa atual
      if (currentAttempt !== attemptRef.current) {
        return localResult;
      }
      
      const localConfidence = localResult.success ? localResult.validation.confidence : 0;
      
      // Debug log para diagnóstico
      console.log('🔍 OCR Debug:', {
        rawText: localResult.rawText,
        confidence: Math.round(localConfidence * 100) + '%',
        isValid: localResult.validation?.isValid,
        corrected: localResult.validation?.corrected,
        format: localResult.validation?.format,
      });
      
      console.log(`📊 OCR local: confiança ${Math.round(localConfidence * 100)}% (limite: ${CONFIDENCE_THRESHOLD * 100}%)`);
      
      // Se confiança >= threshold, usar resultado local
      if (localResult.success && localConfidence >= CONFIDENCE_THRESHOLD) {
        setLastResult(localResult);
        setStatusMessage(`✅ Placa: ${localResult.validation.formatted} (${Math.round(localConfidence * 100)}% - OCR local)`);
        console.log(`✅ Usando OCR local: ${localResult.validation.formatted}`);
        return localResult;
      }
      
      // Verificar se fallback está habilitado
      const fallbackEnabled = loadFallbackEnabled();
      
      if (!fallbackEnabled) {
        // Modo econômico: tentar usar resultado local mesmo com baixa confiança
        // Se temos um texto com 7 caracteres alfanuméricos, pode ser uma placa
        const rawClean = localResult.rawText?.replace(/[^A-Z0-9]/gi, '') || '';
        const couldBePlate = rawClean.length === 7;
        
        if (localResult.success || couldBePlate) {
          // Se tem 7 caracteres, tentar validar/corrigir novamente
          if (couldBePlate && !localResult.success) {
            const revalidated = validateAndCorrectPlate(rawClean);
            if (revalidated.isValid) {
              const correctedResult = {
                ...localResult,
                success: true,
                validation: revalidated,
              };
              setLastResult(correctedResult);
              setStatusMessage(`⚠️ Placa: ${revalidated.formatted} (${Math.round(revalidated.confidence * 100)}% - modo econômico)`);
              console.log(`💰 Modo econômico - placa corrigida: ${revalidated.formatted}`);
              return correctedResult;
            }
          }
          
          setLastResult(localResult);
          const msg = localResult.success 
            ? `⚠️ Placa: ${localResult.validation.formatted} (${Math.round(localConfidence * 100)}% - modo econômico)`
            : `⚠️ Texto detectado: "${localResult.rawText}" - Verificar manualmente`;
          setStatusMessage(msg);
          console.log(`💰 Modo econômico: usando OCR local (${Math.round(localConfidence * 100)}%)`);
          return localResult;
        }
        setStatusMessage('❌ Nenhuma placa detectada (modo econômico)');
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
    setDebugImage(null);
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
    debugImage,
    recognizeFromCanvas,
    reset,
    cleanup,
  };
}
