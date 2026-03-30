/**
 * Contexto global de Vigilância — mantém detecção ativa ao navegar entre páginas
 * v1.7.7 — enhancedDetection config + Multi-Scale support
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { usePersonDetection } from '@/react-app/hooks/usePersonDetection';
import { type Point } from '@/react-app/utils/motionDetection';
import { playNotificationSound, unlockAudioContext } from '@/react-app/utils/notificationSounds';

export type CameraSource = 'webcam' | 'ip';
export type VigilanciaStatus = 'idle' | 'active';

// localStorage keys
const LS = {
  CAMERA_SOURCE: 'portacerta_vig_camera_source',
  IP_URL: 'portacerta_vig_ip_url',
  COOLDOWN: 'portacerta_vig_cooldown',
  AREA_POINTS: 'portacerta_vig_area_points',
  SHOW_AREA: 'portacerta_vig_show_area',
  DEVICE_ID: 'portacerta_vig_device_id',
  ALERT_SCHEDULE: 'portacerta_vig_alert_schedule',
  ALERT_START: 'portacerta_vig_alert_start',
  ALERT_END: 'portacerta_vig_alert_end',
  ENHANCED_DETECTION: 'portacerta_vig_enhanced_detection',
} as const;

const DEFAULT_AREA: Point[] = [
  { x: 0.15, y: 0.15 },
  { x: 0.85, y: 0.15 },
  { x: 0.85, y: 0.85 },
  { x: 0.15, y: 0.85 },
];

// Helpers localStorage
function lsGet(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}
function lsGetBool(key: string, fallback: boolean): boolean {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === 'true'; } catch { return fallback; }
}
function lsGetNumber(key: string, fallback: number): number {
  try { const v = localStorage.getItem(key); return v === null ? fallback : Number(v); } catch { return fallback; }
}
function lsGetJson<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

/** Verifica se o horário atual está dentro da faixa de alerta */
function isWithinSchedule(start: string, end: string): boolean {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  if (startMin <= endMin) {
    return nowMinutes >= startMin && nowMinutes < endMin;
  }
  // Crosses midnight
  return nowMinutes >= startMin || nowMinutes < endMin;
}

export interface VigilanciaConfig {
  cameraSource: CameraSource;
  ipUrl: string;
  cooldown: number;
  areaPoints: Point[];
  showDetectionArea: boolean;
  selectedDeviceId: string;
  alertScheduleEnabled: boolean;
  alertStartTime: string;
  alertEndTime: string;
  enhancedDetection: boolean;
}

interface VigilanciaContextType {
  status: VigilanciaStatus;
  isActive: boolean;
  config: VigilanciaConfig;
  updateConfig: (partial: Partial<VigilanciaConfig>) => void;

  // Detection state (forwarded from usePersonDetection)
  isLoading: boolean;
  isDetecting: boolean;
  personsInArea: any[];
  allPersons: any[];
  lastAlertTime: number;
  error: string | null;

  // Refs for video/img/canvas (used by page & background)
  videoRef: React.RefObject<HTMLVideoElement | null>;
  imgRef: React.RefObject<HTMLImageElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;

  // Actions
  startVigilancia: () => Promise<void>;
  stopVigilancia: () => void;
  reconnectSource: () => void;

  // Camera helpers
  devices: MediaDeviceInfo[];
  isMjpeg: boolean;
  cameraStarted: boolean;
}

const VigilanciaContext = createContext<VigilanciaContextType | null>(null);

export function useVigilancia() {
  const ctx = useContext(VigilanciaContext);
  if (!ctx) throw new Error('useVigilancia must be inside VigilanciaProvider');
  return ctx;
}

export function VigilanciaProvider({ children }: { children: React.ReactNode }) {
  // Persisted config
  const [config, setConfigState] = useState<VigilanciaConfig>(() => ({
    cameraSource: lsGet(LS.CAMERA_SOURCE, 'webcam') as CameraSource,
    ipUrl: lsGet(LS.IP_URL, ''),
    cooldown: lsGetNumber(LS.COOLDOWN, 10000),
    areaPoints: lsGetJson(LS.AREA_POINTS, DEFAULT_AREA),
    showDetectionArea: lsGetBool(LS.SHOW_AREA, true),
    selectedDeviceId: lsGet(LS.DEVICE_ID, ''),
    alertScheduleEnabled: lsGetBool(LS.ALERT_SCHEDULE, false),
    alertStartTime: lsGet(LS.ALERT_START, '22:00'),
    alertEndTime: lsGet(LS.ALERT_END, '06:00'),
    enhancedDetection: lsGetBool(LS.ENHANCED_DETECTION, false),
  }));

  const [status, setStatus] = useState<VigilanciaStatus>('idle');
  const [cameraStarted, setCameraStarted] = useState(false);
  const [isMjpeg, setIsMjpeg] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const statusRef = useRef(status);
  statusRef.current = status;
  const reconnectingRef = useRef(false);

  // Hidden canvas for MJPEG → canvas → MediaPipe pipeline
  const mjpegCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mjpegDrawIntervalRef = useRef<number | null>(null);

  // Person detection hook — sound disabled here, we handle it with schedule logic
  const detection = usePersonDetection({
    cooldownMs: config.cooldown,
    soundEnabled: false,
    enhancedDetection: config.enhancedDetection,
  });
  const detectionRef = useRef(detection);
  detectionRef.current = detection;

  // Custom alert logic with schedule
  const lastCustomAlertRef = useRef(0);
  useEffect(() => {
    if (detection.personsInArea.length === 0) return;
    const now = Date.now();
    if (now - lastCustomAlertRef.current < config.cooldown) return;

    const cfg = configRef.current;
    const shouldSound = !cfg.alertScheduleEnabled || isWithinSchedule(cfg.alertStartTime, cfg.alertEndTime);

    if (shouldSound) {
      lastCustomAlertRef.current = now;
      playNotificationSound('desconhecido');
    }
  }, [detection.personsInArea, config.cooldown]);

  // Persist config changes
  const updateConfig = useCallback((partial: Partial<VigilanciaConfig>) => {
    setConfigState(prev => {
      const next = { ...prev, ...partial };
      if (partial.cameraSource !== undefined) lsSet(LS.CAMERA_SOURCE, next.cameraSource);
      if (partial.ipUrl !== undefined) lsSet(LS.IP_URL, next.ipUrl);
      if (partial.cooldown !== undefined) lsSet(LS.COOLDOWN, String(next.cooldown));
      if (partial.areaPoints !== undefined) lsSet(LS.AREA_POINTS, JSON.stringify(next.areaPoints));
      if (partial.showDetectionArea !== undefined) lsSet(LS.SHOW_AREA, String(next.showDetectionArea));
      if (partial.selectedDeviceId !== undefined) lsSet(LS.DEVICE_ID, next.selectedDeviceId);
      if (partial.alertScheduleEnabled !== undefined) lsSet(LS.ALERT_SCHEDULE, String(next.alertScheduleEnabled));
      if (partial.alertStartTime !== undefined) lsSet(LS.ALERT_START, next.alertStartTime);
      if (partial.alertEndTime !== undefined) lsSet(LS.ALERT_END, next.alertEndTime);
      if (partial.enhancedDetection !== undefined) lsSet(LS.ENHANCED_DETECTION, String(next.enhancedDetection));
      return next;
    });
  }, []);

  // Sync area points to detection hook
  useEffect(() => {
    detection.setArea(config.areaPoints);
  }, [config.areaPoints, detection.setArea]);

  // Enumerate cameras
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(devs => {
      const vids = devs.filter(d => d.kind === 'videoinput');
      setDevices(vids);
      if (vids.length > 0 && !config.selectedDeviceId) {
        updateConfig({ selectedDeviceId: vids[0].deviceId });
      }
    });
  }, []);

  /** Stop MJPEG canvas draw interval */
  const stopMjpegDrawLoop = useCallback(() => {
    if (mjpegDrawIntervalRef.current) {
      clearInterval(mjpegDrawIntervalRef.current);
      mjpegDrawIntervalRef.current = null;
    }
  }, []);

  /** Start drawing MJPEG img to canvas continuously so MediaPipe can read it */
  const startMjpegDrawLoop = useCallback((img: HTMLImageElement, canvas: HTMLCanvasElement) => {
    stopMjpegDrawLoop();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    mjpegDrawIntervalRef.current = window.setInterval(() => {
      if (!img.complete || img.naturalWidth === 0) return;
      if (canvas.width !== img.naturalWidth || canvas.height !== img.naturalHeight) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
      }
      ctx.drawImage(img, 0, 0);
    }, 100);
  }, [stopMjpegDrawLoop]);

  const connectSource = useCallback(async () => {
    const video = videoRef.current;
    const img = imgRef.current;
    const cfg = configRef.current;
    const det = detectionRef.current;

    if (cfg.cameraSource === 'webcam') {
      if (!video) return;
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: cfg.selectedDeviceId ? { exact: cfg.selectedDeviceId } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      setIsMjpeg(false);
      stopMjpegDrawLoop();
      det.setVideo(video);
    } else if (cfg.ipUrl && img) {
      setIsMjpeg(true);
      img.crossOrigin = 'anonymous';
      img.src = cfg.ipUrl;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout MJPEG')), 15000);
        img.onload = () => { clearTimeout(timeout); resolve(); };
        img.onerror = () => { clearTimeout(timeout); reject(new Error('Erro MJPEG')); };
      });

      // Create hidden canvas for MJPEG → canvas pipeline (avoids cross-origin WebGL issues)
      if (!mjpegCanvasRef.current) {
        mjpegCanvasRef.current = document.createElement('canvas');
      }
      const canvas = mjpegCanvasRef.current;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0);

      // Start continuous draw loop
      startMjpegDrawLoop(img, canvas);

      // Pass canvas to detector instead of img
      det.setVideo(canvas as unknown as HTMLVideoElement);
      console.log('📷 MJPEG: usando canvas intermediário para detecção');
    }
    setCameraStarted(true);
  }, [startMjpegDrawLoop, stopMjpegDrawLoop]);

  // Stable ref for connectSource to avoid reconnectSource instability
  const connectSourceRef = useRef(connectSource);
  connectSourceRef.current = connectSource;

  const startVigilancia = useCallback(async () => {
    if (statusRef.current === 'active') return;
    try {
      unlockAudioContext();
      await connectSourceRef.current();
      await detectionRef.current.startDetection();
      setStatus('active');
    } catch (err) {
      console.error('Erro ao iniciar vigilância:', err);
      alert('Erro ao iniciar vigilância. Verifique câmera/URL.');
    }
  }, []);

  const stopVigilancia = useCallback(() => {
    detectionRef.current.stopDetection();
    stopMjpegDrawLoop();
    if (imgRef.current) imgRef.current.src = '';
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsMjpeg(false);
    setCameraStarted(false);
    setStatus('idle');
  }, [stopMjpegDrawLoop]);

  const reconnectSource = useCallback(() => {
    if (statusRef.current !== 'active') return;
    if (reconnectingRef.current) return;
    reconnectingRef.current = true;

    setTimeout(async () => {
      try {
        await connectSourceRef.current();
      } catch (err) {
        console.warn('⚠️ Reconnect falhou:', err);
      } finally {
        reconnectingRef.current = false;
      }
    }, 150);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMjpegDrawLoop();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [stopMjpegDrawLoop]);

  return (
    <VigilanciaContext.Provider
      value={{
        status,
        isActive: status === 'active',
        config,
        updateConfig,
        isLoading: detection.isLoading,
        isDetecting: detection.isDetecting,
        personsInArea: detection.personsInArea,
        allPersons: detection.allPersons,
        lastAlertTime: detection.lastAlertTime,
        error: detection.error,
        videoRef,
        imgRef,
        canvasRef,
        startVigilancia,
        stopVigilancia,
        reconnectSource,
        devices,
        isMjpeg,
        cameraStarted,
      }}
    >
      {children}
    </VigilanciaContext.Provider>
  );
}
