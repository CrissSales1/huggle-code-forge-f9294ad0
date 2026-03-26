/**
 * Hook para detecção contínua de pessoas em área virtual
 * Usa MediaPipe ObjectDetector + isPointInPolygon
 * Aceita HTMLVideoElement, HTMLImageElement, ou HTMLCanvasElement
 * v1.6.1 — Canvas support + heartbeat logging
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  initObjectDetector,
  detectObjects,
  detectObjectsFromImage,
  detectObjectsFromCanvas,
  filterByCategories,
  PERSON_CATEGORIES,
  type ObjectDetection,
} from '@/react-app/utils/objectDetector';
import { isPointInPolygon, type Point } from '@/react-app/utils/motionDetection';
import { playNotificationSound, unlockAudioContext } from '@/react-app/utils/notificationSounds';

// Re-export for backward compat
export type PersonDetection = ObjectDetection;

export type DetectionSource = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

export interface PersonDetectionState {
  isLoading: boolean;
  isDetecting: boolean;
  personsInArea: ObjectDetection[];
  allPersons: ObjectDetection[];
  lastAlertTime: number;
  error: string | null;
}

interface UsePersonDetectionOptions {
  cooldownMs?: number;
  intervalMs?: number;
  soundEnabled?: boolean;
}

export function usePersonDetection(options: UsePersonDetectionOptions = {}) {
  const {
    cooldownMs = 10000,
    intervalMs = 300,
    soundEnabled = true,
  } = options;

  const [state, setState] = useState<PersonDetectionState>({
    isLoading: false,
    isDetecting: false,
    personsInArea: [] as ObjectDetection[],
    allPersons: [] as ObjectDetection[],
    lastAlertTime: 0,
    error: null,
  });

  const sourceRef = useRef<DetectionSource | null>(null);
  const areaRef = useRef<Point[]>([]);
  const intervalRef = useRef<number | null>(null);
  const lastAlertRef = useRef(0);
  const detectingRef = useRef(false);
  const frameCountRef = useRef(0);

  const setVideo = useCallback((source: DetectionSource | null) => {
    sourceRef.current = source;
  }, []);

  const setArea = useCallback((points: Point[]) => {
    areaRef.current = points;
  }, []);

  const processFrame = useCallback(() => {
    const source = sourceRef.current;
    if (!source) return;

    // Check readiness based on element type
    if (source instanceof HTMLVideoElement) {
      if (source.readyState < 2) return;
    } else if (source instanceof HTMLImageElement) {
      if (!source.complete || source.naturalWidth === 0) return;
    } else if (source instanceof HTMLCanvasElement) {
      if (source.width === 0 || source.height === 0) return;
    }

    const timestampMs = performance.now();

    let allDetections: ObjectDetection[];
    if (source instanceof HTMLVideoElement) {
      allDetections = detectObjects(source, timestampMs);
    } else if (source instanceof HTMLCanvasElement) {
      allDetections = detectObjectsFromCanvas(source, timestampMs);
    } else {
      allDetections = detectObjectsFromImage(source as HTMLImageElement, timestampMs);
    }

    const allPersons = filterByCategories(allDetections, PERSON_CATEGORIES);

    if (allPersons.length > 0) {
      const sourceType = source instanceof HTMLVideoElement ? 'video' : source instanceof HTMLCanvasElement ? 'canvas' : 'img';
      console.log(`👁️ Pessoa(s) detectada(s): ${allPersons.length}, source=${sourceType}`);
    }
    const area = areaRef.current;

    let personsInArea: ObjectDetection[] = [];
    if (area.length >= 3) {
      personsInArea = allPersons.filter(p =>
        isPointInPolygon(p.centerX, p.centerY, area)
      );
    }

    const now = Date.now();
    const shouldAlert = personsInArea.length > 0 && (now - lastAlertRef.current > cooldownMs);

    if (shouldAlert) {
      lastAlertRef.current = now;
      if (soundEnabled) {
        playNotificationSound('desconhecido');
      }
      console.log(`🚨 Pessoa detectada na área! (${personsInArea.length} pessoa(s))`);
    }

    setState(prev => ({
      ...prev,
      allPersons,
      personsInArea,
      lastAlertTime: shouldAlert ? now : prev.lastAlertTime,
    }));
  }, [cooldownMs, soundEnabled]);

  const startDetection = useCallback(async () => {
    if (detectingRef.current) return;

    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      unlockAudioContext();
      await initObjectDetector();
      detectingRef.current = true;
      frameCountRef.current = 0;

      intervalRef.current = window.setInterval(processFrame, intervalMs);

      setState(prev => ({ ...prev, isLoading: false, isDetecting: true }));
      console.log('▶️ Detecção de pessoas iniciada');
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
      personsInArea: [],
      allPersons: [],
    }));
    console.log('⏹️ Detecção de pessoas parada');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
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
