/**
 * Hook para métricas de performance em tempo real
 * Rastreia FPS, tempo de processamento, uso de memória e status do worker
 */
import { useState, useCallback, useRef, useEffect } from 'react';

export interface PerformanceMetrics {
  fps: number;                    // Frames processados por segundo
  frameTimeMs: number;            // Tempo médio por frame
  ocrTimeMs: number;              // Tempo do último OCR
  motionDetectionTimeMs: number;  // Tempo detecção de movimento
  memoryMB: number | null;        // Memória usada (MB) - null se não disponível
  workerStatus: 'initializing' | 'ready' | 'processing' | 'error';
  framesProcessed: number;        // Total de frames processados
}

interface UsePerformanceMetricsReturn {
  metrics: PerformanceMetrics;
  recordFrameStart: () => void;
  recordFrameEnd: () => void;
  recordOcrTime: (timeMs: number) => void;
  recordMotionTime: (timeMs: number) => void;
  setWorkerStatus: (status: PerformanceMetrics['workerStatus']) => void;
  reset: () => void;
}

const INITIAL_METRICS: PerformanceMetrics = {
  fps: 0,
  frameTimeMs: 0,
  ocrTimeMs: 0,
  motionDetectionTimeMs: 0,
  memoryMB: null,
  workerStatus: 'initializing',
  framesProcessed: 0,
};

export function usePerformanceMetrics(): UsePerformanceMetricsReturn {
  const [metrics, setMetrics] = useState<PerformanceMetrics>(INITIAL_METRICS);
  
  const frameTimesRef = useRef<number[]>([]);
  const frameStartRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  const lastSecondRef = useRef<number>(Date.now());
  
  // Calcular FPS e atualizar métricas a cada segundo
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastSecondRef.current;
      
      if (elapsed >= 1000) {
        const frameTimes = frameTimesRef.current;
        const fps = frameCountRef.current;
        const avgTime = frameTimes.length > 0 
          ? frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length 
          : 0;
        
        // Tentar obter uso de memória (Chrome only)
        let memoryMB: number | null = null;
        if ('memory' in performance) {
          const mem = (performance as unknown as { memory: { usedJSHeapSize: number } }).memory;
          if (mem?.usedJSHeapSize) {
            memoryMB = Math.round(mem.usedJSHeapSize / 1024 / 1024);
          }
        }
        
        setMetrics(prev => ({
          ...prev,
          fps,
          frameTimeMs: Math.round(avgTime),
          memoryMB,
          framesProcessed: prev.framesProcessed + frameCountRef.current,
        }));
        
        // Reset contadores
        frameTimesRef.current = [];
        frameCountRef.current = 0;
        lastSecondRef.current = now;
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  const recordFrameStart = useCallback(() => {
    frameStartRef.current = performance.now();
  }, []);
  
  const recordFrameEnd = useCallback(() => {
    const elapsed = performance.now() - frameStartRef.current;
    frameTimesRef.current.push(elapsed);
    frameCountRef.current++;
    
    // Manter apenas últimos 60 tempos
    if (frameTimesRef.current.length > 60) {
      frameTimesRef.current.shift();
    }
  }, []);
  
  const recordOcrTime = useCallback((timeMs: number) => {
    setMetrics(prev => ({ ...prev, ocrTimeMs: Math.round(timeMs) }));
  }, []);
  
  const recordMotionTime = useCallback((timeMs: number) => {
    setMetrics(prev => ({ ...prev, motionDetectionTimeMs: Math.round(timeMs) }));
  }, []);
  
  const setWorkerStatus = useCallback((status: PerformanceMetrics['workerStatus']) => {
    setMetrics(prev => ({ ...prev, workerStatus: status }));
  }, []);
  
  const reset = useCallback(() => {
    setMetrics(INITIAL_METRICS);
    frameTimesRef.current = [];
    frameCountRef.current = 0;
    lastSecondRef.current = Date.now();
  }, []);
  
  return {
    metrics,
    recordFrameStart,
    recordFrameEnd,
    recordOcrTime,
    recordMotionTime,
    setWorkerStatus,
    reset,
  };
}
