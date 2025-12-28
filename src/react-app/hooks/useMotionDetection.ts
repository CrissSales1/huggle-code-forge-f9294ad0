import { useState, useRef, useCallback, useEffect } from 'react';

export interface DetectionZone {
  x: number; // percentual 0-100
  y: number;
  width: number;
  height: number;
}

export interface MotionDetectionConfig {
  sensitivity: 'low' | 'medium' | 'high';
  debounceMs: number;
  checkIntervalMs: number;
  zone: DetectionZone;
}

export interface UseMotionDetectionReturn {
  isMonitoring: boolean;
  motionDetected: boolean;
  lastMotionTime: number | null;
  config: MotionDetectionConfig;
  startMonitoring: (getFrame: () => HTMLCanvasElement | null) => void;
  stopMonitoring: () => void;
  updateConfig: (newConfig: Partial<MotionDetectionConfig>) => void;
  motionLevel: number; // 0-100 percentual de movimento
}

const DEFAULT_CONFIG: MotionDetectionConfig = {
  sensitivity: 'medium',
  debounceMs: 3000,
  checkIntervalMs: 200,
  zone: { x: 10, y: 10, width: 80, height: 80 },
};

const SENSITIVITY_THRESHOLDS = {
  low: 25,
  medium: 15,
  high: 8,
};

export function useMotionDetection(
  onMotionDetected?: (frame: HTMLCanvasElement) => void
): UseMotionDetectionReturn {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [lastMotionTime, setLastMotionTime] = useState<number | null>(null);
  const [motionLevel, setMotionLevel] = useState(0);
  const [config, setConfig] = useState<MotionDetectionConfig>(() => {
    // Carregar config do localStorage
    const saved = localStorage.getItem('motionDetectionConfig');
    return saved ? { ...DEFAULT_CONFIG, ...JSON.parse(saved) } : DEFAULT_CONFIG;
  });

  const previousFrameRef = useRef<ImageData | null>(null);
  const intervalRef = useRef<number | null>(null);
  const lastDetectionRef = useRef<number>(0);
  const getFrameRef = useRef<(() => HTMLCanvasElement | null) | null>(null);

  // Salvar config no localStorage
  useEffect(() => {
    localStorage.setItem('motionDetectionConfig', JSON.stringify(config));
  }, [config]);

  // Calcular diferença entre frames na zona especificada
  const calculateMotion = useCallback((
    currentFrame: ImageData,
    previousFrame: ImageData,
    zone: DetectionZone
  ): number => {
    const { width, height, data: currentData } = currentFrame;
    const { data: previousData } = previousFrame;

    // Calcular área da zona em pixels
    const zoneStartX = Math.floor((zone.x / 100) * width);
    const zoneStartY = Math.floor((zone.y / 100) * height);
    const zoneWidth = Math.floor((zone.width / 100) * width);
    const zoneHeight = Math.floor((zone.height / 100) * height);

    let totalDiff = 0;
    let pixelCount = 0;

    for (let y = zoneStartY; y < zoneStartY + zoneHeight && y < height; y++) {
      for (let x = zoneStartX; x < zoneStartX + zoneWidth && x < width; x++) {
        const i = (y * width + x) * 4;
        
        // Calcular diferença em grayscale
        const currentGray = (currentData[i] + currentData[i + 1] + currentData[i + 2]) / 3;
        const previousGray = (previousData[i] + previousData[i + 1] + previousData[i + 2]) / 3;
        
        totalDiff += Math.abs(currentGray - previousGray);
        pixelCount++;
      }
    }

    // Retornar percentual de movimento (0-100)
    return pixelCount > 0 ? (totalDiff / pixelCount / 255) * 100 : 0;
  }, []);

  // Processar frame
  const processFrame = useCallback(() => {
    if (!getFrameRef.current) return;

    const canvas = getFrameRef.current();
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (previousFrameRef.current) {
      const motion = calculateMotion(currentFrame, previousFrameRef.current, config.zone);
      setMotionLevel(Math.round(motion));

      const threshold = SENSITIVITY_THRESHOLDS[config.sensitivity];
      const now = Date.now();

      if (motion > threshold) {
        // Verificar debounce
        if (now - lastDetectionRef.current > config.debounceMs) {
          setMotionDetected(true);
          setLastMotionTime(now);
          lastDetectionRef.current = now;

          // Aguardar um pouco para o veículo estabilizar, depois capturar
          setTimeout(() => {
            if (getFrameRef.current) {
              const stableFrame = getFrameRef.current();
              if (stableFrame && onMotionDetected) {
                onMotionDetected(stableFrame);
              }
            }
            setMotionDetected(false);
          }, 500);

          console.log(`🚗 Movimento detectado! Nível: ${motion.toFixed(1)}%`);
        }
      } else {
        setMotionDetected(false);
      }
    }

    previousFrameRef.current = currentFrame;
  }, [config, calculateMotion, onMotionDetected]);

  // Iniciar monitoramento
  const startMonitoring = useCallback((getFrame: () => HTMLCanvasElement | null) => {
    getFrameRef.current = getFrame;
    previousFrameRef.current = null;
    lastDetectionRef.current = 0;
    
    intervalRef.current = window.setInterval(processFrame, config.checkIntervalMs);
    setIsMonitoring(true);
    console.log('👁️ Monitoramento de movimento iniciado');
  }, [config.checkIntervalMs, processFrame]);

  // Parar monitoramento
  const stopMonitoring = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    previousFrameRef.current = null;
    getFrameRef.current = null;
    setIsMonitoring(false);
    setMotionDetected(false);
    setMotionLevel(0);
    console.log('👁️ Monitoramento de movimento parado');
  }, []);

  // Atualizar configuração
  const updateConfig = useCallback((newConfig: Partial<MotionDetectionConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  }, []);

  // Limpar ao desmontar
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    isMonitoring,
    motionDetected,
    lastMotionTime,
    config,
    startMonitoring,
    stopMonitoring,
    updateConfig,
    motionLevel,
  };
}
