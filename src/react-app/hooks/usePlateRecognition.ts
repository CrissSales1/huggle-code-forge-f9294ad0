/**
 * Hook para reconhecimento de placas usando OCR ONNX no worker
 * v1.1.0: Migrado de Tesseract para PaddleOCR ONNX
 * v1.2.0: Removido fallback para API externa (segurança — token em localStorage)
 */
import { useState, useCallback, useRef } from 'react';
import { validateAndCorrectPlate } from '../utils/plateValidator';
import { getPlateDetector } from '../utils/plateDetector';
import { usePlateWorker, type OCRResult } from './usePlateWorker';
import { logger } from '@/react-app/utils/logger';

// Threshold para aceitar resultados do OCR local
const CONFIDENCE_THRESHOLD = 0.60;

/**
 * Stubs de compatibilidade — fallback foi removido.
 * Mantidos para não quebrar imports legados.
 */
export function loadFallbackEnabled(): boolean {
  return false;
}

export function saveFallbackEnabled(_enabled: boolean): void {
  // no-op: fallback removido por motivos de segurança
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

export function usePlateRecognition(): UsePlateRecognitionReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [debugImage, setDebugImage] = useState<string | null>(null);
  const attemptRef = useRef(0);

  // Usar o worker para processamento OCR
  const { processPlate, terminate } = usePlateWorker();

  const recognizeFromCanvas = useCallback(async (canvas: HTMLCanvasElement, enableDebug: boolean = false): Promise<OCRResult> => {
    attemptRef.current++;
    const currentAttempt = attemptRef.current;

    setIsProcessing(true);
    setError(null);
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
        logger.warn('Erro ao gerar imagem de debug:', e);
      }
    }

    try {
      // OCR via worker ONNX - passa o canvas diretamente
      setStatusMessage('🔍 Reconhecendo com OCR ONNX...');

      const workerResult = await processPlate(canvas, {
        enableDebug,
        enableFallback: false,
      });

      if (currentAttempt !== attemptRef.current) {
        return workerResult ?? createEmptyResult();
      }

      if (!workerResult) {
        setStatusMessage('❌ Erro no processamento');
        setError('Falha ao processar imagem');
        return createEmptyResult();
      }

      const localConfidence = workerResult.success ? workerResult.validation.confidence : 0;

      logger.log('🔍 OCR ONNX Debug:', {
        rawText: workerResult.rawText,
        confidence: Math.round(localConfidence * 100) + '%',
        isValid: workerResult.validation?.isValid,
        corrected: workerResult.validation?.corrected,
        format: workerResult.validation?.format,
      });

      logger.log(`📊 OCR ONNX: confiança ${Math.round(localConfidence * 100)}% (limite: ${CONFIDENCE_THRESHOLD * 100}%)`);

      if (workerResult.debugImage) {
        setDebugImage(workerResult.debugImage);
      }

      // Confiança >= threshold → resultado bom
      if (workerResult.success && localConfidence >= CONFIDENCE_THRESHOLD) {
        setLastResult(workerResult);
        setStatusMessage(`✅ Placa: ${workerResult.validation.formatted} (${Math.round(localConfidence * 100)}% - ONNX)`);
        logger.log(`✅ Usando OCR ONNX: ${workerResult.validation.formatted}`);
        return workerResult;
      }

      // Confiança baixa: tentar revalidação local antes de desistir
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
            setStatusMessage(`⚠️ Placa: ${revalidated.formatted} (${Math.round(revalidated.confidence * 100)}% - corrigida localmente)`);
            logger.log(`💰 Placa corrigida localmente: ${revalidated.formatted}`);
            return correctedResult;
          }
        }

        setLastResult(workerResult);
        const msg = workerResult.success
          ? `⚠️ Placa: ${workerResult.validation.formatted} (${Math.round(localConfidence * 100)}% - baixa confiança)`
          : `⚠️ Texto detectado: "${workerResult.rawText}" - Verificar manualmente`;
        setStatusMessage(msg);
        logger.log(`⚠️ OCR local com baixa confiança (${Math.round(localConfidence * 100)}%)`);
        return workerResult;
      }

      setStatusMessage('❌ Nenhuma placa detectada');
      return workerResult;
    } catch (err) {
      logger.error('Erro no reconhecimento:', err);
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
    usedFallback: false,
    debugImage,
    recognizeFromCanvas,
    reset,
    cleanup,
  };
}
