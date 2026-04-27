/**
 * Hook para gerenciar o Web Worker de processamento de placas
 * Fornece interface simples para processar frames em background
 * FASE 1: Interface principal para OCR - substitui usePlateRecognition
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { logger } from '@/react-app/utils/logger';

interface PlateValidationResult {
  isValid: boolean;
  original: string;
  corrected: string;
  formatted: string;
  format: 'mercosul' | 'antiga' | 'unknown';
  confidence: number;
}

export interface OCRResult {
  success: boolean;
  rawText: string;
  validation: PlateValidationResult;
  ocrConfidence: number;
  processingTimeMs: number;
  usedFallback?: boolean;
  usedYolo?: boolean; // Indica se usou detecção YOLO
  debugImage?: string; // Base64 da imagem com bounding box
  debugImages?: { // Múltiplas imagens de debug do pipeline
    original?: string;      // Frame original completo
    cropped?: string;       // Região recortada (antes do upscale)
    preprocessed?: string;  // Após pré-processamento
    final?: string;         // Resultado final com bounding box
  };
  plateRegion?: { // Região da placa detectada pelo YOLO/heurística
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  };
  candidates?: Array<{ text: string; confidence: number; format: string }>; // v1.1.84: Beam Search top-3 candidatos
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

export interface ProcessPlateOptions {
  enableDebug?: boolean;
  enableFallback?: boolean;
  fallbackApiUrl?: string;
  fallbackApiToken?: string;
  forceNightMode?: boolean;  // v1.1.50: Forçar correções noturnas em todas as leituras
}

type WorkerResponse = 
  | { type: 'READY' }
  | { type: 'MODEL_LOADED'; payload: { success: boolean; permanentFailure?: boolean; error?: string; backend?: string } }
  | { type: 'PLATE_RESULT'; payload: OCRResult }
  | { type: 'MOTION_RESULT'; payload: { motionPercent: number } }
  | { type: 'ERROR'; payload: { message: string } }
  | { type: 'PROGRESS'; payload: ProcessingProgress };

interface UsePlateWorkerReturn {
  isReady: boolean;
  isProcessing: boolean;
  progress: ProcessingProgress | null;
  error: string | null;
  modelLoaded: boolean;
  modelLoading: boolean;
  modelFailed: boolean;
  yoloBackend: string;
  processPlate: (canvas: HTMLCanvasElement, options?: ProcessPlateOptions) => Promise<OCRResult | null>;
  detectMotion: (currentData: Uint8ClampedArray, referenceData: Uint8ClampedArray, config: MotionDetectionConfig) => Promise<number>;
  loadYoloModel: () => void;
  setConfig: (config: { yoloInputSize?: number }) => void;
  terminate: () => void;
}

// SECURITY: O fallback OCR via API externa foi removido.
// Limpamos chaves antigas do localStorage para não deixar credenciais residuais.
const LEGACY_FALLBACK_KEYS = [
  'portacerta_fallback_enabled',
  'portacerta_fallback_url',
  'portacerta_fallback_token',
] as const;

function purgeLegacyFallbackKeys(): void {
  try {
    for (const key of LEGACY_FALLBACK_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export function usePlateWorker(): UsePlateWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelFailed, setModelFailed] = useState(false);
  const [yoloBackend, setYoloBackend] = useState<string>('unknown');
  
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
            logger.log('✅ PlateProcessor Worker pronto');
            break;
            
          case 'MODEL_LOADED':
            setModelLoading(false);
            setModelLoaded(event.data.payload.success);
            if (event.data.payload.backend) {
              setYoloBackend(event.data.payload.backend);
            }
            if (event.data.payload.permanentFailure) {
              setModelFailed(true);
              logger.log('⚠️ Modelo YOLO falhou permanentemente:', event.data.payload.error || 'erro desconhecido');
            } else if (event.data.payload.success) {
              logger.log(`🧠 Modelo YOLO carregado no worker (backend: ${event.data.payload.backend})`);
            }
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
        logger.error('Worker error:', err);
        setError(`Erro no worker: ${err.message}`);
        setIsReady(false);
      };
      
      // SECURITY: Limpar credenciais legadas do localStorage e inicializar
      purgeLegacyFallbackKeys();
      workerRef.current.postMessage({ type: 'INIT' });
      
    } catch (err) {
      logger.error('Erro ao criar worker:', err);
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
  const processPlate = useCallback(async (
    canvas: HTMLCanvasElement,
    options?: ProcessPlateOptions
  ): Promise<OCRResult | null> => {
    if (!workerRef.current || !isReady) {
      logger.warn('Worker não está pronto');
      return null;
    }
    
    if (isProcessing) {
      logger.warn('Processamento já em andamento');
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
      
      // SECURITY: Fallback externo desativado — sempre false, sem ler localStorage
      const finalOptions: ProcessPlateOptions = {
        enableDebug: options?.enableDebug ?? false,
        enableFallback: false,
        fallbackApiUrl: undefined,
        fallbackApiToken: undefined,
        forceNightMode: options?.forceNightMode ?? false,
      };
      
      // Usar Transferable para zero-copy
      workerRef.current!.postMessage(
        {
          type: 'PROCESS_PLATE',
          payload: {
            imageData,
            width: canvas.width,
            height: canvas.height,
            options: finalOptions,
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
  
  // Carregar modelo YOLO
  const loadYoloModel = useCallback(() => {
    if (!workerRef.current || modelLoaded || modelLoading) return;
    
    setModelLoading(true);
    workerRef.current.postMessage({ type: 'LOAD_YOLO_MODEL' });
  }, [modelLoaded, modelLoading]);
  
  // Enviar configuração ao worker
  const setConfig = useCallback((config: { yoloInputSize?: number }) => {
    if (!workerRef.current || !isReady) return;
    workerRef.current.postMessage({ type: 'SET_CONFIG', payload: config });
  }, [isReady]);
  
  // Terminar worker
  const terminate = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'TERMINATE' });
      workerRef.current.terminate();
      workerRef.current = null;
      setIsReady(false);
      setModelLoaded(false);
    }
  }, []);
  
  return {
    isReady,
    isProcessing,
    progress,
    error,
    modelLoaded,
    modelLoading,
    modelFailed,
    yoloBackend,
    processPlate,
    detectMotion,
    loadYoloModel,
    setConfig,
    terminate,
  };
}
