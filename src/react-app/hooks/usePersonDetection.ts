/**
 * Hook para detecção contínua de pessoas em área virtual
 * Usa MediaPipe ObjectDetector + isPointInPolygon
 * v1.3.0
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { initPersonDetector, detectPersons, disposePersonDetector, type PersonDetection } from '@/react-app/utils/personDetector';
import { isPointInPolygon, type Point } from '@/react-app/utils/motionDetection';
import { playNotificationSound, unlockAudioContext } from '@/react-app/utils/notificationSounds';

export interface PersonDetectionState {
  isLoading: boolean;
  isDetecting: boolean;
  personsInArea: PersonDetection[];
  allPersons: PersonDetection[];
  lastAlertTime: number;
  error: string | null;
}

interface UsePersonDetectionOptions {
  cooldownMs?: number;        // Cooldown entre alertas (default 10s)
  intervalMs?: number;        // Intervalo de detecção (default 300ms)
  soundEnabled?: boolean;     // Tocar som no alerta
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
    personsInArea: [],
    allPersons: [],
    lastAlertTime: 0,
    error: null,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const areaRef = useRef<Point[]>([]);
  const intervalRef = useRef<number | null>(null);
  const lastAlertRef = useRef(0);
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
    const allPersons = detectPersons(video, timestampMs);
    const area = areaRef.current;

    let personsInArea: PersonDetection[] = [];
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
      await initPersonDetector();
      detectingRef.current = true;

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
      disposePersonDetector();
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
