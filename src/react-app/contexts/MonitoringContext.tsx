/**
 * Contexto global para monitoramento contínuo
 * Mantém o estado de monitoramento mesmo quando navega entre páginas
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import Hls from 'hls.js';
import { supabase } from '@/integrations/supabase/client';
import { usePlateRecognition } from '@/react-app/hooks/usePlateRecognition';
import logger from '@/react-app/utils/logger';
import { 
  MotionDetector, 
  VirtualArea, 
  loadVirtualArea, 
  saveVirtualArea,
  getDefaultVirtualArea,
  loadSelectedCamera,
  saveSelectedCamera,
  CameraResolution,
  RESOLUTION_OPTIONS,
  loadCameraResolution,
  saveCameraResolution,
  loadMotionSensitivity,
  getSensitivityConfig,
} from '@/react-app/utils/motionDetection';

export type SourceMode = 'webcam' | 'hls';
export type MonitoringStatus = 'idle' | 'starting' | 'monitoring' | 'motion_detected' | 'processing' | 'error';
export type ProcessingStage = 'idle' | 'capturing' | 'preprocessing' | 'ocr' | 'validating' | 'done';

// Helpers para persistência de configurações HLS
const HLS_URL_KEY = 'portacerta_hls_url';
const SOURCE_MODE_KEY = 'portacerta_source_mode';

export function loadHlsUrl(): string {
  return localStorage.getItem(HLS_URL_KEY) || '';
}

export function saveHlsUrl(url: string): void {
  localStorage.setItem(HLS_URL_KEY, url);
}

export function loadSourceMode(): SourceMode {
  const saved = localStorage.getItem(SOURCE_MODE_KEY);
  return (saved === 'hls' ? 'hls' : 'webcam') as SourceMode;
}

export function saveSourceMode(mode: SourceMode): void {
  localStorage.setItem(SOURCE_MODE_KEY, mode);
}

export interface Detection {
  placa: string;
  timestamp: string;
  isMorador: boolean;
  casa?: string;
  confidence: number;
  usedFallback: boolean;
  fonteDeteccao: 'local' | 'api';
}

export interface ProcessingInfo {
  stage: ProcessingStage;
  stageLabel: string;
  currentTimeMs: number;
  lastOcrTimeMs: number;
  avgTimeMs: number;
}

interface MonitoringContextType {
  // Estado
  status: MonitoringStatus;
  statusMessage: string;
  isActive: boolean;
  virtualArea: VirtualArea;
  lastDetection: Detection | null;
  recentDetections: Detection[];
  motionPercent: number;
  processingInfo: ProcessingInfo;
  hasReference: boolean;
  
  // Câmera
  availableCameras: MediaDeviceInfo[];
  selectedCamera: string;
  setSelectedCamera: (deviceId: string) => void;
  selectedResolution: CameraResolution;
  setSelectedResolution: (resolution: CameraResolution) => void;
  
  // HLS
  sourceMode: SourceMode;
  setSourceMode: (mode: SourceMode) => void;
  hlsUrl: string;
  setHlsUrl: (url: string) => void;
  hlsStatus: 'idle' | 'connecting' | 'connected' | 'error';
  
  // Refs
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  
  // Ações
  startMonitoring: (deviceId?: string) => Promise<void>;
  startMonitoringHLS: () => Promise<void>;
  stopMonitoring: () => void;
  updateVirtualArea: (area: VirtualArea) => void;
  recaptureReference: () => void;
  reconnectStream: () => void;
}

const MonitoringContext = createContext<MonitoringContextType | null>(null);

const COOLDOWN_MS = 30000;
const FRAME_INTERVAL_MS = 350;

export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<MonitoringStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('Parado');
  const [isActive, setIsActive] = useState(false);
  const [virtualArea, setVirtualArea] = useState<VirtualArea>(
    loadVirtualArea() || getDefaultVirtualArea()
  );
  const [lastDetection, setLastDetection] = useState<Detection | null>(null);
  const [recentDetections, setRecentDetections] = useState<Detection[]>([]);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCameraState] = useState<string>('');
  const [motionPercent, setMotionPercent] = useState(0);
  const [selectedResolution, setSelectedResolutionState] = useState<CameraResolution>(loadCameraResolution());
  const [hasReference, setHasReference] = useState(false);
  
  const [sourceMode, setSourceModeState] = useState<SourceMode>(loadSourceMode());
  const [hlsUrl, setHlsUrlState] = useState<string>(loadHlsUrl());
  const [hlsStatus, setHlsStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  
  const [processingInfo, setProcessingInfo] = useState<ProcessingInfo>({
    stage: 'idle',
    stageLabel: 'Aguardando',
    currentTimeMs: 0,
    lastOcrTimeMs: 0,
    avgTimeMs: 0,
  });
  
  const processingTimesRef = useRef<number[]>([]);
  const processingStartRef = useRef<number>(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const motionDetectorRef = useRef<MotionDetector>(new MotionDetector(getSensitivityConfig(loadMotionSensitivity())));
  const frameIntervalRef = useRef<number | null>(null);
  const recentPlatesRef = useRef<Map<string, number>>(new Map());
  const isActiveRef = useRef(false);
  
  const { recognizeFromCanvas, reset: resetOCR, usedFallback } = usePlateRecognition();
  
  // Manter ref sincronizada com estado
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);
  
  // Carregar câmeras
  useEffect(() => {
    async function loadCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        setAvailableCameras(cameras);
        
        const savedCamera = loadSelectedCamera();
        if (savedCamera && cameras.find(c => c.deviceId === savedCamera)) {
          setSelectedCameraState(savedCamera);
        } else if (cameras.length > 0) {
          setSelectedCameraState(cameras[0].deviceId);
        }
      } catch (e) {
        logger.warn('Erro ao listar câmeras:', e);
      }
    }
    loadCameras();
  }, []);
  
  // Escutar mudanças de sensibilidade
  useEffect(() => {
    const handleSensitivityChange = () => {
      const sensitivity = loadMotionSensitivity();
      const config = getSensitivityConfig(sensitivity);
      motionDetectorRef.current.updateConfig(config);
    };
    
    window.addEventListener('storage', handleSensitivityChange);
    return () => window.removeEventListener('storage', handleSensitivityChange);
  }, []);
  
  const setSelectedCamera = useCallback((deviceId: string) => {
    setSelectedCameraState(deviceId);
    saveSelectedCamera(deviceId);
  }, []);
  
  const setSelectedResolution = useCallback((resolution: CameraResolution) => {
    setSelectedResolutionState(resolution);
    saveCameraResolution(resolution);
  }, []);
  
  const setSourceMode = useCallback((mode: SourceMode) => {
    setSourceModeState(mode);
    saveSourceMode(mode);
  }, []);
  
  const setHlsUrl = useCallback((url: string) => {
    setHlsUrlState(url);
    saveHlsUrl(url);
  }, []);
  
  const updateProcessingStage = useCallback((stage: ProcessingStage, stageLabel: string) => {
    const currentTimeMs = stage === 'idle' ? 0 : Date.now() - processingStartRef.current;
    setProcessingInfo(prev => ({
      ...prev,
      stage,
      stageLabel,
      currentTimeMs,
    }));
  }, []);
  
  const startProcessingTimer = useCallback(() => {
    processingStartRef.current = Date.now();
    updateProcessingStage('capturing', 'Capturando frame...');
  }, [updateProcessingStage]);
  
  const finishProcessingTimer = useCallback(() => {
    const totalTime = Date.now() - processingStartRef.current;
    processingTimesRef.current.push(totalTime);
    if (processingTimesRef.current.length > 10) {
      processingTimesRef.current.shift();
    }
    const avgTime = processingTimesRef.current.reduce((a, b) => a + b, 0) / processingTimesRef.current.length;
    
    setProcessingInfo(prev => ({
      ...prev,
      stage: 'done',
      stageLabel: 'Concluído',
      currentTimeMs: totalTime,
      lastOcrTimeMs: totalTime,
      avgTimeMs: Math.round(avgTime),
    }));
    
    setTimeout(() => {
      setProcessingInfo(prev => ({
        ...prev,
        stage: 'idle',
        stageLabel: 'Aguardando',
        currentTimeMs: 0,
      }));
    }, 1500);
  }, []);
  
  const isPlateRecent = useCallback((placa: string): boolean => {
    const now = Date.now();
    const lastTime = recentPlatesRef.current.get(placa);
    
    if (lastTime && (now - lastTime) < COOLDOWN_MS) {
      return true;
    }
    
    for (const [plate, time] of recentPlatesRef.current.entries()) {
      if (now - time >= COOLDOWN_MS) {
        recentPlatesRef.current.delete(plate);
      }
    }
    
    return false;
  }, []);
  
  const markPlateDetected = useCallback((placa: string) => {
    recentPlatesRef.current.set(placa, Date.now());
  }, []);
  
  const checkIfMorador = useCallback(async (placa: string): Promise<{ isMorador: boolean; casa?: string }> => {
    try {
      const { data, error } = await supabase
        .from('veiculos_moradores')
        .select('casa')
        .eq('placa_veiculo', placa.toUpperCase().replace(/[^A-Z0-9]/g, ''))
        .maybeSingle();
      
      if (error) throw error;
      
      if (data) {
        return { isMorador: true, casa: data.casa };
      }
      return { isMorador: false };
    } catch (e) {
      logger.error('Erro ao verificar morador:', e);
      return { isMorador: false };
    }
  }, []);
  
  const saveDetection = useCallback(async (
    placa: string, 
    isMorador: boolean, 
    casa: string | undefined,
    confidence: number,
    fonteDeteccao: 'local' | 'api'
  ) => {
    try {
      const { error } = await supabase
        .from('lpr_deteccoes')
        .insert({
          placa_detectada: placa,
          timestamp: new Date().toISOString(),
          is_morador: isMorador,
          casa_morador: casa || null,
          confidence: confidence,
          fonte_deteccao: fonteDeteccao,
        });
      
      if (error) throw error;
      logger.log('✅ Detecção salva:', placa, `(${fonteDeteccao})`);
    } catch (e) {
      logger.error('Erro ao salvar detecção:', e);
    }
  }, []);
  
  const processFrameForOCR = useCallback(async (): Promise<boolean> => {
    if (!videoRef.current || status !== 'monitoring') return false;
    
    setStatus('processing');
    setStatusMessage('🔍 Reconhecendo placa...');
    
    motionDetectorRef.current.markOcrAttempted();
    startProcessingTimer();
    
    try {
      updateProcessingStage('capturing', 'Capturando frame...');
      const capturedCanvas = motionDetectorRef.current.captureArea(
        videoRef.current,
        virtualArea
      );
      
      updateProcessingStage('preprocessing', 'Pré-processando...');
      updateProcessingStage('ocr', 'Executando OCR...');
      const result = await recognizeFromCanvas(capturedCanvas);
      
      updateProcessingStage('validating', 'Validando placa...');
      
      if (result.success && result.validation.isValid) {
        const placa = result.validation.formatted;
        
        if (isPlateRecent(placa)) {
          logger.log(`⏳ Placa ${placa} detectada recentemente, ignorando...`);
          finishProcessingTimer();
          setStatus('monitoring');
          setStatusMessage('🟢 Monitorando...');
          motionDetectorRef.current.markOcrSuccess();
          return true;
        }
        
        markPlateDetected(placa);
        
        const { isMorador, casa } = await checkIfMorador(placa);
        
        const fonteDeteccao = usedFallback ? 'api' : 'local';
        const detection: Detection = {
          placa,
          timestamp: new Date().toISOString(),
          isMorador,
          casa,
          confidence: result.validation.confidence,
          usedFallback,
          fonteDeteccao,
        };
        
        setLastDetection(detection);
        setRecentDetections(prev => [detection, ...prev.slice(0, 9)]);
        
        await saveDetection(placa, isMorador, casa, result.validation.confidence, fonteDeteccao);
        
        finishProcessingTimer();
        motionDetectorRef.current.markOcrSuccess();
        
        if (isMorador) {
          setStatusMessage(`✅ Morador: ${placa} - Casa ${casa}`);
        } else {
          setStatusMessage(`⚠️ Não cadastrado: ${placa}`);
        }
        
        return true;
      } else {
        finishProcessingTimer();
        setStatusMessage('❌ Placa não reconhecida - tentando novamente...');
        return false;
      }
    } catch (e) {
      console.error('Erro ao processar OCR:', e);
      finishProcessingTimer();
      setStatusMessage('❌ Erro no processamento - tentando novamente...');
      return false;
    }
  }, [
    status, 
    virtualArea, 
    recognizeFromCanvas, 
    isPlateRecent, 
    markPlateDetected, 
    checkIfMorador, 
    saveDetection, 
    usedFallback,
    startProcessingTimer,
    updateProcessingStage,
    finishProcessingTimer,
  ]);
  
  const captureReferenceFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return false;
    
    const success = motionDetectorRef.current.captureReference(
      videoRef.current,
      canvasRef.current,
      virtualArea
    );
    
    setHasReference(success);
    
    if (success) {
      setProcessingInfo(prev => ({
        ...prev,
        stageLabel: 'Referência capturada!',
      }));
      
      setTimeout(() => {
        setProcessingInfo(prev => ({
          ...prev,
          stageLabel: 'Monitorando área...',
        }));
      }, 2000);
    }
    
    return success;
  }, [virtualArea]);
  
  const recaptureReference = useCallback(() => {
    if (isActive && videoRef.current && canvasRef.current) {
      captureReferenceFrame();
    }
  }, [isActive, captureReferenceFrame]);
  
  const processFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (status !== 'monitoring' && status !== 'motion_detected') return;
    if (!motionDetectorRef.current.hasReference()) return;
    
    const result = motionDetectorRef.current.processFrame(
      videoRef.current,
      canvasRef.current,
      virtualArea
    );
    
    setMotionPercent(result.motionPercent);
    
    if (result.shouldUpdateReference) {
      captureReferenceFrame();
    }
    
    if (result.hasMotion) {
      setStatus('motion_detected');
      setStatusMessage('🟡 Veículo detectado...');
      setProcessingInfo(prev => ({
        ...prev,
        stage: 'idle',
        stageLabel: 'Veículo detectado!',
      }));
    } else if (!result.hasMotion && status === 'motion_detected') {
      setStatus('monitoring');
      setStatusMessage('🟢 Monitorando...');
      setProcessingInfo(prev => ({
        ...prev,
        stage: 'idle',
        stageLabel: 'Monitorando área...',
      }));
    } else if (status === 'monitoring' && processingInfo.stage === 'idle' && processingInfo.stageLabel === 'Aguardando') {
      setProcessingInfo(prev => ({
        ...prev,
        stageLabel: 'Monitorando área...',
      }));
    }
    
    if (result.shouldAttemptOCR) {
      const success = await processFrameForOCR();
      
      setTimeout(() => {
        if (isActiveRef.current) {
          setStatus('monitoring');
          setStatusMessage(success ? '🟢 Monitorando...' : '🟡 Aguardando re-tentativa...');
        }
      }, 2000);
    }
  }, [status, virtualArea, processFrameForOCR, captureReferenceFrame, processingInfo.stage, processingInfo.stageLabel]);
  
  // Loop de frames
  useEffect(() => {
    if (isActive && (status === 'monitoring' || status === 'motion_detected')) {
      frameIntervalRef.current = window.setInterval(processFrame, FRAME_INTERVAL_MS);
    }
    
    return () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
    };
  }, [isActive, status, processFrame]);
  
  const startMonitoring = useCallback(async (deviceId?: string) => {
    try {
      setStatus('starting');
      setStatusMessage('Iniciando câmera...');
      
      const resConfig = RESOLUTION_OPTIONS[selectedResolution];
      
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: deviceId || selectedCamera ? { exact: deviceId || selectedCamera } : undefined,
          width: { ideal: resConfig.width },
          height: { ideal: resConfig.height },
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      motionDetectorRef.current.fullReset();
      recentPlatesRef.current.clear();
      resetOCR();
      setHasReference(false);
      
      processingTimesRef.current = [];
      setProcessingInfo({
        stage: 'idle',
        stageLabel: 'Capturando referência...',
        currentTimeMs: 0,
        lastOcrTimeMs: 0,
        avgTimeMs: 0,
      });
      
      setIsActive(true);
      setStatus('monitoring');
      setStatusMessage('📸 Capturando referência...');
      
      setTimeout(() => {
        if (videoRef.current && canvasRef.current) {
          const success = motionDetectorRef.current.captureReference(
            videoRef.current,
            canvasRef.current,
            loadVirtualArea() || getDefaultVirtualArea()
          );
          
          setHasReference(success);
          
          if (success) {
            setStatusMessage('🟢 Monitorando...');
            setProcessingInfo(prev => ({
              ...prev,
              stageLabel: 'Monitorando área...',
            }));
          } else {
            setStatusMessage('⚠️ Erro ao capturar referência');
          }
        }
      }, 1000);
      
    } catch (e) {
      logger.error('Erro ao iniciar câmera:', e);
      setStatus('error');
      setStatusMessage('❌ Erro ao acessar câmera');
    }
  }, [selectedCamera, selectedResolution, resetOCR]);
  
  const stopMonitoring = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = '';
    }
    
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    
    motionDetectorRef.current.fullReset();
    setHasReference(false);
    setIsActive(false);
    setStatus('idle');
    setStatusMessage('Parado');
    setMotionPercent(0);
    setHlsStatus('idle');
  }, []);
  
  const startMonitoringHLS = useCallback(async () => {
    if (!hlsUrl) {
      setStatus('error');
      setStatusMessage('❌ URL HLS não configurada');
      return;
    }
    
    try {
      setStatus('starting');
      setStatusMessage('Conectando ao stream...');
      setHlsStatus('connecting');
      
      if (!Hls.isSupported() && !videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        throw new Error('Navegador não suporta HLS');
      }
      
      stopMonitoring();
      
      motionDetectorRef.current.fullReset();
      recentPlatesRef.current.clear();
      resetOCR();
      setHasReference(false);
      
      processingTimesRef.current = [];
      setProcessingInfo({
        stage: 'idle',
        stageLabel: 'Conectando stream...',
        currentTimeMs: 0,
        lastOcrTimeMs: 0,
        avgTimeMs: 0,
      });
      
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
        });
        
        hlsRef.current = hls;
        
        hls.loadSource(hlsUrl);
        hls.attachMedia(videoRef.current!);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoRef.current?.play();
        });
        
        hls.on(Hls.Events.ERROR, (_event, data) => {
          logger.error('❌ HLS Error:', data);
          if (data.fatal) {
            setHlsStatus('error');
            setStatus('error');
            setStatusMessage(`❌ Erro no stream: ${data.type}`);
            
            setTimeout(() => {
              if (hlsRef.current && isActiveRef.current) {
                hls.startLoad();
              }
            }, 5000);
          }
        });
        
        videoRef.current!.onplaying = () => {
          setHlsStatus('connected');
          setIsActive(true);
          setStatus('monitoring');
          setStatusMessage('📸 Capturando referência...');
          
          setTimeout(() => {
            if (videoRef.current && canvasRef.current) {
              const success = motionDetectorRef.current.captureReference(
                videoRef.current,
                canvasRef.current,
                loadVirtualArea() || getDefaultVirtualArea()
              );
              
              setHasReference(success);
              
              if (success) {
                setStatusMessage('🟢 Monitorando stream...');
                setProcessingInfo(prev => ({
                  ...prev,
                  stageLabel: 'Monitorando área...',
                }));
              } else {
                setStatusMessage('⚠️ Erro ao capturar referência');
              }
            }
          }, 1500);
        };
        
      } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = hlsUrl;
        videoRef.current.addEventListener('loadedmetadata', () => {
          videoRef.current?.play();
          setHlsStatus('connected');
          setIsActive(true);
          setStatus('monitoring');
          setStatusMessage('🟢 Monitorando stream...');
        });
      }
      
    } catch (e) {
      logger.error('Erro ao iniciar HLS:', e);
      setStatus('error');
      setHlsStatus('error');
      setStatusMessage(`❌ ${e instanceof Error ? e.message : 'Erro ao conectar'}`);
    }
  }, [hlsUrl, stopMonitoring, resetOCR]);
  
  // Reconectar stream quando elemento de vídeo muda (navegação entre páginas)
  const reconnectStream = useCallback(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    const hls = hlsRef.current;
    
    if (!video || !isActive) return;
    
    // Para webcam: reconectar MediaStream
    if (sourceMode === 'webcam' && stream) {
      // Verificar se o stream não está conectado ou se é diferente
      if (video.srcObject !== stream) {
        logger.log('🔄 Reconectando stream webcam ao elemento de vídeo...');
        video.srcObject = stream;
        video.play().catch(e => logger.warn('Erro ao reproduzir vídeo:', e));
      }
    }
    
    // Para HLS: verificar se precisa reconectar
    if (sourceMode === 'hls' && hls) {
      // Verificar se o HLS não está attached ao vídeo atual
      if (hls.media !== video) {
        logger.log('🔄 Reconectando HLS ao elemento de vídeo...');
        hls.attachMedia(video);
        video.play().catch(e => logger.warn('Erro ao reproduzir vídeo HLS:', e));
      }
    }
  }, [isActive, sourceMode]);
  
  const updateVirtualArea = useCallback((area: VirtualArea) => {
    setVirtualArea(area);
    saveVirtualArea(area);
  }, []);
  
  const value: MonitoringContextType = {
    status,
    statusMessage,
    isActive,
    virtualArea,
    lastDetection,
    recentDetections,
    motionPercent,
    processingInfo,
    hasReference,
    availableCameras,
    selectedCamera,
    setSelectedCamera,
    selectedResolution,
    setSelectedResolution,
    sourceMode,
    setSourceMode,
    hlsUrl,
    setHlsUrl,
    hlsStatus,
    videoRef,
    canvasRef,
    startMonitoring,
    startMonitoringHLS,
    stopMonitoring,
    updateVirtualArea,
    recaptureReference,
    reconnectStream,
  };
  
  return (
    <MonitoringContext.Provider value={value}>
      {children}
    </MonitoringContext.Provider>
  );
}

export function useMonitoring() {
  const context = useContext(MonitoringContext);
  if (!context) {
    throw new Error('useMonitoring must be used within a MonitoringProvider');
  }
  return context;
}
