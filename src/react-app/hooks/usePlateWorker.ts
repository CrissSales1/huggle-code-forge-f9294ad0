/**
 * Hook para gerenciar o Web Worker de processamento de placas
 * Fornece interface simples para processar frames em background
 */
import { useState, useCallback, useRef, useEffect } from 'react';

interface PlateValidationResult {
  isValid: boolean;
  original: string;
  corrected: string;
  formatted: string;
  format: 'mercosul' | 'antiga' | 'unknown';
  confidence: number;
}

interface OCRResult {
  success: boolean;
  rawText: string;
  validation: PlateValidationResult;
  ocrConfidence: number;
  processingTimeMs: number;
}

interface MotionDetectionConfig {
  threshold: number;
  minPixelDifference: number;
  stabilizationMs: number;
}

interface ProcessingProgress {
  stage: string;
  progress: number;
}

type WorkerResponse = 
  | { type: 'READY' }
  | { type: 'PLATE_RESULT'; payload: OCRResult }
  | { type: 'MOTION_RESULT'; payload: { motionPercent: number } }
  | { type: 'ERROR'; payload: { message: string } }
  | { type: 'PROGRESS'; payload: ProcessingProgress };

interface UsePlateWorkerReturn {
  isReady: boolean;
  isProcessing: boolean;
  progress: ProcessingProgress | null;
  error: string | null;
  processPlate: (canvas: HTMLCanvasElement) => Promise<OCRResult | null>;
  detectMotion: (currentData: Uint8ClampedArray, referenceData: Uint8ClampedArray, config: MotionDetectionConfig) => Promise<number>;
  terminate: () => void;
}

export function usePlateWorker(): UsePlateWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Callbacks pendentes para resolver promises
  const pendingPlateResolve = useRef<((result: OCRResult | null) => void) | null>(null);
  const pendingMotionResolve = useRef<((percent: number) => void) | null>(null);
  
  // Inicializar worker
  useEffect(() => {
    try {
      workerRef.current = new Worker(
        new URL('../workers/plateProcessor.worker.ts', import.meta.url),
        { type: 'module' }
      );
      
      workerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { type } = event.data;
        
        switch (type) {
          case 'READY':
            setIsReady(true);
            setError(null);
            console.log('✅ PlateProcessor Worker pronto');
            break;
            
          case 'PLATE_RESULT':
            setIsProcessing(false);
            setProgress(null);
            if (pendingPlateResolve.current) {
              pendingPlateResolve.current(event.data.payload);
              pendingPlateResolve.current = null;
            }
            break;
            
          case 'MOTION_RESULT':
            if (pendingMotionResolve.current) {
              pendingMotionResolve.current(event.data.payload.motionPercent);
              pendingMotionResolve.current = null;
            }
            break;
            
          case 'PROGRESS':
            setProgress(event.data.payload);
            break;
            
          case 'ERROR':
            setError(event.data.payload.message);
            setIsProcessing(false);
            setProgress(null);
            if (pendingPlateResolve.current) {
              pendingPlateResolve.current(null);
              pendingPlateResolve.current = null;
            }
            if (pendingMotionResolve.current) {
              pendingMotionResolve.current(0);
              pendingMotionResolve.current = null;
            }
            break;
        }
      };
      
      workerRef.current.onerror = (err) => {
        console.error('Worker error:', err);
        setError(`Erro no worker: ${err.message}`);
        setIsReady(false);
      };
      
      // Inicializar Tesseract no worker
      workerRef.current.postMessage({ type: 'INIT' });
      
    } catch (err) {
      console.error('Erro ao criar worker:', err);
      setError('Falha ao inicializar processamento em background');
    }
    
    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'TERMINATE' });
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);
  
  // Processar placa usando o worker
  const processPlate = useCallback(async (canvas: HTMLCanvasElement): Promise<OCRResult | null> => {
    if (!workerRef.current || !isReady) {
      console.warn('Worker não está pronto');
      return null;
    }
    
    if (isProcessing) {
      console.warn('Processamento já em andamento');
      return null;
    }
    
    setIsProcessing(true);
    setError(null);
    
    return new Promise((resolve) => {
      pendingPlateResolve.current = resolve;
      
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        setIsProcessing(false);
        resolve(null);
        return;
      }
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Usar Transferable para zero-copy
      workerRef.current!.postMessage(
        {
          type: 'PROCESS_PLATE',
          payload: {
            imageData,
            width: canvas.width,
            height: canvas.height,
          },
        },
        [imageData.data.buffer]
      );
    });
  }, [isReady, isProcessing]);
  
  // Detectar movimento usando o worker
  const detectMotion = useCallback(async (
    currentData: Uint8ClampedArray,
    referenceData: Uint8ClampedArray,
    config: MotionDetectionConfig
  ): Promise<number> => {
    if (!workerRef.current || !isReady) {
      return 0;
    }
    
    return new Promise((resolve) => {
      pendingMotionResolve.current = resolve;
      
      // Clonar dados antes de transferir
      const currentCopy = new Uint8ClampedArray(currentData);
      const referenceCopy = new Uint8ClampedArray(referenceData);
      
      workerRef.current!.postMessage(
        {
          type: 'DETECT_MOTION',
          payload: {
            currentData: currentCopy,
            referenceData: referenceCopy,
            config,
          },
        },
        [currentCopy.buffer, referenceCopy.buffer]
      );
    });
  }, [isReady]);
  
  // Terminar worker
  const terminate = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'TERMINATE' });
      workerRef.current.terminate();
      workerRef.current = null;
      setIsReady(false);
    }
  }, []);
  
  return {
    isReady,
    isProcessing,
    progress,
    error,
    processPlate,
    detectMotion,
    terminate,
  };
}
