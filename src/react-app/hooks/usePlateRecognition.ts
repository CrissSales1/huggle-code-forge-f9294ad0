/**
 * Hook para reconhecimento de placas usando OCR local gratuito
 */
import { useState, useCallback, useRef } from 'react';
import { recognizePlate, terminateOCR, type OCRResult } from '../utils/plateOCR';

interface UsePlateRecognitionReturn {
  isProcessing: boolean;
  lastResult: OCRResult | null;
  error: string | null;
  statusMessage: string;
  recognizeFromCanvas: (canvas: HTMLCanvasElement) => Promise<OCRResult>;
  reset: () => void;
  cleanup: () => Promise<void>;
}

export function usePlateRecognition(): UsePlateRecognitionReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const attemptRef = useRef(0);

  const recognizeFromCanvas = useCallback(async (canvas: HTMLCanvasElement): Promise<OCRResult> => {
    attemptRef.current++;
    const currentAttempt = attemptRef.current;
    
    setIsProcessing(true);
    setError(null);
    setStatusMessage('Processando imagem...');
    
    try {
      setStatusMessage('Aplicando filtros...');
      
      const result = await recognizePlate(canvas);
      
      // Verificar se ainda é a tentativa atual
      if (currentAttempt !== attemptRef.current) {
        return result;
      }
      
      setLastResult(result);
      
      if (result.success) {
        const confidence = Math.round(result.validation.confidence * 100);
        setStatusMessage(`✅ Placa reconhecida: ${result.validation.formatted} (${confidence}% confiança)`);
        console.log(`✅ Placa: ${result.validation.formatted} em ${result.processingTimeMs.toFixed(0)}ms`);
      } else if (result.rawText) {
        setStatusMessage(`⚠️ Texto detectado: "${result.rawText}" - Formato inválido`);
        setError('Placa não reconhecida. Tente novamente com melhor enquadramento.');
      } else {
        setStatusMessage('❌ Nenhum texto detectado');
        setError('Nenhuma placa detectada. Verifique a iluminação e o ângulo.');
      }
      
      return result;
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
    recognizeFromCanvas,
    reset,
    cleanup,
  };
}
