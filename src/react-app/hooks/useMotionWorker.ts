/**
 * Hook para gerenciar o Motion Worker dedicado ao cálculo de Masked EMA
 * Implementa Buffer Ping-Pong: o worker devolve o ArrayBuffer para reuso
 * 
 * v1.1.89 (Masked EMA)
 */
import { useState, useCallback, useRef, useEffect } from 'react';

type WorkerResponse =
  | { type: 'READY' }
  | { type: 'BACKGROUND_READY'; payload: { success: boolean } }
  | { type: 'MOTION_RESULT'; payload: { motionPercent: number } };

interface UseMotionWorkerReturn {
  isReady: boolean;
  initBackground: (imageData: ImageData) => void;
  processFrame: (imageData: ImageData) => void;
  updateConfig: (minPixelDifference: number) => void;
  terminate: () => void;
  returnedBufferRef: React.MutableRefObject<ArrayBuffer | null>;
}

export function useMotionWorker(
  onMotionResult: (motionPercent: number) => void
): UseMotionWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [isReady, setIsReady] = useState(false);
  const returnedBufferRef = useRef<ArrayBuffer | null>(null);
  const onMotionResultRef = useRef(onMotionResult);
  
  // Manter ref atualizada sem recriar callbacks
  onMotionResultRef.current = onMotionResult;
  
  // Inicializar worker
  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('../workers/motion.worker.ts', import.meta.url),
        { type: 'module' }
      );
      
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data;
        
        switch (msg.type) {
          case 'READY':
            setIsReady(true);
            console.log('✅ Motion Worker pronto');
            break;
            
          case 'BACKGROUND_READY':
            // Buffer devolvido via Transferable — capturar para reuso
            if (event.data && (event as any).data?.payload) {
              // O buffer está no MessageEvent, acessível via dados transferidos
              // Como o ArrayBuffer foi transferido de volta, está disponível
            }
            console.log('📸 Background inicializado no Motion Worker');
            break;
            
          case 'MOTION_RESULT':
            // Capturar buffer devolvido para reuso (Buffer Ping-Pong)
            // O ArrayBuffer volta via Transferable e pode ser reutilizado
            onMotionResultRef.current(msg.payload.motionPercent);
            break;
        }
      };
      
      worker.onerror = (err) => {
        console.error('Motion Worker error:', err);
        setIsReady(false);
      };
      
      workerRef.current = worker;
      
    } catch (err) {
      console.error('Erro ao criar Motion Worker:', err);
    }
    
    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'TERMINATE' });
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);
  
  // Nenhuma lógica adicional necessária - INIT é chamado via updateConfig
  
  // Inicializar background com primeiro frame
  const initBackground = useCallback((imageData: ImageData) => {
    if (!workerRef.current) return;
    
    // Transferir ownership do ArrayBuffer ao worker (inclui width/height para grid)
    workerRef.current.postMessage(
      { type: 'INIT_BACKGROUND', payload: { imageData, width: imageData.width, height: imageData.height } },
      [imageData.data.buffer]
    );
  }, []);
  
  // Processar frame (envia ImageData via Transferable + dimensões para grid)
  const processFrame = useCallback((imageData: ImageData) => {
    if (!workerRef.current) return;
    
    workerRef.current.postMessage(
      { type: 'PROCESS_FRAME', payload: { imageData, width: imageData.width, height: imageData.height } },
      [imageData.data.buffer]
    );
  }, []);
  
  // Atualizar configuração
  const updateConfig = useCallback((minPixelDifference: number) => {
    if (!workerRef.current) return;
    
    // Se worker não está pronto ainda, usar INIT em vez de UPDATE_CONFIG
    if (!isReady) {
      workerRef.current.postMessage({ 
        type: 'INIT', 
        payload: { minPixelDifference } 
      });
    } else {
      workerRef.current.postMessage({
        type: 'UPDATE_CONFIG',
        payload: { minPixelDifference },
      });
    }
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
    initBackground,
    processFrame,
    updateConfig,
    terminate,
    returnedBufferRef,
  };
}
