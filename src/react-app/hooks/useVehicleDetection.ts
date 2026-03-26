/**
 * Hook para detecção contínua de veículos em área virtual
 * Usa MediaPipe ObjectDetector com filtro para categorias de veículos
 * v1.4.0
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  initObjectDetector,
  detectObjects,
  filterByCategories,
  disposeObjectDetector,
  VEHICLE_CATEGORIES,
  type ObjectDetection,
} from '@/react-app/utils/objectDetector';
import { isPointInPolygon, type Point } from '@/react-app/utils/motionDetection';

export interface VehicleDetectionState {
  isLoading: boolean;
  isDetecting: boolean;
  vehiclesInArea: ObjectDetection[];
  allVehicles: ObjectDetection[];
  error: string | null;
}

interface UseVehicleDetectionOptions {
  intervalMs?: number;        // Intervalo de detecção (default 300ms)
}

export function useVehicleDetection(options: UseVehicleDetectionOptions = {}) {
  const { intervalMs = 300 } = options;

  const [state, setState] = useState<VehicleDetectionState>({
    isLoading: false,
    isDetecting: false,
    vehiclesInArea: [],
    allVehicles: [],
    error: null,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const areaRef = useRef<Point[]>([]);
  const intervalRef = useRef<number | null>(null);
  const detectingRef = useRef(false);

  const setVideo = useCallback((video: HTMLVideoElement | null) => {
    videoRef.current = video;
  }, []);

  const setArea = useCallback((points: Point[]) => {
    areaRef.current = points;
  }, []);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const timestampMs = performance.now();
    const allDetections = detectObjects(video, timestampMs);
    const allVehicles = filterByCategories(allDetections, VEHICLE_CATEGORIES);
    const area = areaRef.current;

    let vehiclesInArea: ObjectDetection[] = [];
    if (area.length >= 3) {
      vehiclesInArea = allVehicles.filter(v =>
        isPointInPolygon(v.centerX, v.centerY, area)
      );
    }

    setState(prev => ({
      ...prev,
      allVehicles,
      vehiclesInArea,
    }));
  }, []);

  const startDetection = useCallback(async () => {
    if (detectingRef.current) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      await initObjectDetector();
      detectingRef.current = true;

      intervalRef.current = window.setInterval(processFrame, intervalMs);

      setState(prev => ({ ...prev, isLoading: false, isDetecting: true }));
      console.log('▶️ Detecção de veículos iniciada');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao inicializar detector';
      setState(prev => ({ ...prev, isLoading: false, error: msg }));
    }
  }, [processFrame, intervalMs]);

  const stopDetection = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    detectingRef.current = false;
    setState(prev => ({
      ...prev,
      isDetecting: false,
      vehiclesInArea: [],
      allVehicles: [],
    }));
    console.log('⏹️ Detecção de veículos parada');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      // Don't dispose detector here - it's shared singleton
    };
  }, []);

  return {
    ...state,
    setVideo,
    setArea,
    startDetection,
    stopDetection,
  };
}
