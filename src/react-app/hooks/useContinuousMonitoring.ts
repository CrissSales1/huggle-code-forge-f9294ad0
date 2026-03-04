/**
 * Hook para monitoramento contínuo com webcam local ou stream HLS (IPCamLive)
 * Detecta movimento em área virtual e dispara OCR híbrido
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import Hls from 'hls.js';
import { supabase } from '@/integrations/supabase/client';
import { usePlateRecognition } from './usePlateRecognition';
import { useMotionWorker } from './useMotionWorker';
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
  extractAreaPixels,
} from '../utils/motionDetection';

export type SourceMode = 'webcam' | 'hls';

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

export type MonitoringStatus = 'idle' | 'starting' | 'monitoring' | 'motion_detected' | 'processing' | 'error';

export type ProcessingStage = 'idle' | 'capturing' | 'preprocessing' | 'ocr' | 'validating' | 'done';

interface Detection {
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

interface UseContinuousMonitoringReturn {
  status: MonitoringStatus;
  statusMessage: string;
  isActive: boolean;
  virtualArea: VirtualArea;
  lastDetection: Detection | null;
  recentDetections: Detection[];
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  startMonitoring: (deviceId?: string) => Promise<void>;
  stopMonitoring: () => void;
  updateVirtualArea: (area: VirtualArea) => void;
  availableCameras: MediaDeviceInfo[];
  selectedCamera: string;
  setSelectedCamera: (deviceId: string) => void;
  motionPercent: number;
  // Novas propriedades
  processingInfo: ProcessingInfo;
  selectedResolution: CameraResolution;
  setSelectedResolution: (resolution: CameraResolution) => void;
  // Propriedades de referência
  hasReference: boolean;
  recaptureReference: () => void;
  // HLS/RTSP streaming
  sourceMode: SourceMode;
  setSourceMode: (mode: SourceMode) => void;
  hlsUrl: string;
  setHlsUrl: (url: string) => void;
  hlsStatus: 'idle' | 'connecting' | 'connected' | 'error';
  startMonitoringHLS: () => Promise<void>;
}

const COOLDOWN_MS = 30000; // 30 segundos entre detecções da mesma placa
const FRAME_INTERVAL_MS = 350; // Processar frame a cada 350ms (otimizado)

// Fast-Track: Constantes de Consistência Temporal
const CONSISTENCY_THRESHOLD = 3; // Precisa de 3 leituras iguais
const OCR_BUFFER_SIZE = 5; // Janela deslizante de últimas 5 leituras
const MIN_CONFIDENCE_FOR_BUFFER = 80; // Confiança mínima para entrar no buffer

// v1.1.87: Timeout de validação e detecção de troca YOLO
const VALIDATION_TIMEOUT_MS = 15000; // 15s → forçar reset do fastTrackValidated
const YOLO_POSITION_THRESHOLD = 0.4; // 40% de deslocamento = veículo diferente
const YOLO_SIZE_THRESHOLD = 0.5; // 50% de mudança de tamanho = veículo diferente

export function useContinuousMonitoring(): UseContinuousMonitoringReturn {
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
  
  // Estados HLS/RTSP
  const [sourceMode, setSourceModeState] = useState<SourceMode>(loadSourceMode());
  const [hlsUrl, setHlsUrlState] = useState<string>(loadHlsUrl());
  const [hlsStatus, setHlsStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  
  // Estado de métricas de processamento
  const [processingInfo, setProcessingInfo] = useState<ProcessingInfo>({
    stage: 'idle',
    stageLabel: 'Aguardando',
    currentTimeMs: 0,
    lastOcrTimeMs: 0,
    avgTimeMs: 0,
  });
  
  // Ref para calcular média de tempo
  const processingTimesRef = useRef<number[]>([]);
  const processingStartRef = useRef<number>(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const motionDetectorRef = useRef<MotionDetector>(new MotionDetector(getSensitivityConfig(loadMotionSensitivity())));
  const frameIntervalRef = useRef<number | null>(null);
  const recentPlatesRef = useRef<Map<string, number>>(new Map());
  const isProcessingMotionRef = useRef(false); // Execution Lock
  
  // Fast-Track: Buffer de consistência temporal para leituras OCR
  const ocrBufferRef = useRef<Array<{ placa: string; confidence: number; timestamp: number }>>([]);
  const fastTrackValidatedRef = useRef<boolean>(false);
  
  // v1.1.87: Timeout de validação e detecção de troca YOLO
  const lastValidationTimeRef = useRef<number>(0);
  const lastPlateRegionRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  
  const { recognizeFromCanvas, reset: resetOCR, usedFallback } = usePlateRecognition();
  
  // Motion Worker para Masked EMA
  const handleMotionResult = useCallback((mp: number) => {
    isProcessingMotionRef.current = false; // Unlock
    setMotionPercent(mp);
    
    const result = motionDetectorRef.current.processMotionResult(mp);
    
    if (result.hasMotion) {
      setStatus(prev => (prev === 'monitoring' || prev === 'motion_detected') ? 'motion_detected' : prev);
      setStatusMessage('🟡 Veículo detectado...');
      setProcessingInfo(prev => ({ ...prev, stage: 'idle', stageLabel: 'Veículo detectado!' }));
    } else {
      setStatus(prev => prev === 'motion_detected' ? 'monitoring' : prev);
      setStatusMessage('🟢 Monitorando...');
      setProcessingInfo(prev => ({ ...prev, stage: 'idle', stageLabel: 'Monitorando área...' }));
    }
    
    if (result.shouldAttemptOCR) {
      processFrameForOCRRef.current?.();
    }
  }, []);
  
  // Ref para processFrameForOCR (resolve circular dependency)
  const processFrameForOCRRef = useRef<(() => Promise<boolean>) | null>(null);
  
  const {
    initBackground: motionWorkerInitBackground,
    processFrame: motionWorkerProcessFrame,
  } = useMotionWorker(handleMotionResult);
  
  // Carregar lista de câmeras e câmera salva
  useEffect(() => {
    async function loadCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        setAvailableCameras(cameras);
        
        // Tentar usar câmera salva
        const savedCamera = loadSelectedCamera();
        if (savedCamera && cameras.find(c => c.deviceId === savedCamera)) {
          setSelectedCameraState(savedCamera);
        } else if (cameras.length > 0) {
          setSelectedCameraState(cameras[0].deviceId);
        }
      } catch (e) {
        console.warn('Erro ao listar câmeras:', e);
      }
    }
    loadCameras();
  }, []);
  
  // Carregar sensibilidade de movimento do localStorage e aplicar ao detector
  useEffect(() => {
    const handleSensitivityChange = () => {
      const sensitivity = loadMotionSensitivity();
      const config = getSensitivityConfig(sensitivity);
      motionDetectorRef.current.updateConfig(config);
      console.log('🎚️ Sensibilidade atualizada:', sensitivity);
    };
    
    // Escutar mudanças no localStorage
    window.addEventListener('storage', handleSensitivityChange);
    return () => window.removeEventListener('storage', handleSensitivityChange);
  }, []);
  
  // Função para salvar câmera selecionada
  const setSelectedCamera = useCallback((deviceId: string) => {
    setSelectedCameraState(deviceId);
    saveSelectedCamera(deviceId);
  }, []);
  
  // Função para salvar resolução selecionada
  const setSelectedResolution = useCallback((resolution: CameraResolution) => {
    setSelectedResolutionState(resolution);
    saveCameraResolution(resolution);
  }, []);
  
  // Funções HLS
  const setSourceMode = useCallback((mode: SourceMode) => {
    setSourceModeState(mode);
    saveSourceMode(mode);
  }, []);
  
  const setHlsUrl = useCallback((url: string) => {
    setHlsUrlState(url);
    saveHlsUrl(url);
  }, []);
  
  // Funções de métricas de processamento
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
    // Manter apenas as últimas 10 medições
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
    
    // Reset após 1.5s
    setTimeout(() => {
      setProcessingInfo(prev => ({
        ...prev,
        stage: 'idle',
        stageLabel: 'Aguardando',
        currentTimeMs: 0,
      }));
    }, 1500);
  }, []);
  
  // Verificar se placa foi detectada recentemente (deduplicação)
  const isPlateRecent = useCallback((placa: string): boolean => {
    const now = Date.now();
    const lastTime = recentPlatesRef.current.get(placa);
    
    if (lastTime && (now - lastTime) < COOLDOWN_MS) {
      return true;
    }
    
    // Limpar placas antigas
    for (const [plate, time] of recentPlatesRef.current.entries()) {
      if (now - time >= COOLDOWN_MS) {
        recentPlatesRef.current.delete(plate);
      }
    }
    
    return false;
  }, []);
  
  // Marcar placa como detectada
  const markPlateDetected = useCallback((placa: string) => {
    recentPlatesRef.current.set(placa, Date.now());
  }, []);
  
  // Fast-Track: Verificar consistência temporal do buffer OCR
  const checkOcrConsistency = useCallback((plateText: string, confidence: number): { hasConsensus: boolean; matchCount: number } => {
    // Só aceita leituras com confiança mínima
    if (confidence < MIN_CONFIDENCE_FOR_BUFFER) {
      return { hasConsensus: false, matchCount: 0 };
    }
    
    // Adiciona ao buffer (FIFO)
    ocrBufferRef.current.push({
      placa: plateText,
      confidence,
      timestamp: Date.now(),
    });
    
    // Mantém apenas as últimas N leituras
    if (ocrBufferRef.current.length > OCR_BUFFER_SIZE) {
      ocrBufferRef.current.shift();
    }
    
    // Conta quantas vezes a placa atual aparece no buffer
    const matchCount = ocrBufferRef.current.filter(entry => entry.placa === plateText).length;
    const hasConsensus = matchCount >= CONSISTENCY_THRESHOLD;
    
    console.log(`🔄 Buffer OCR: "${plateText}" aparece ${matchCount}/${OCR_BUFFER_SIZE} (consenso=${hasConsensus})`);
    
    return { hasConsensus, matchCount };
  }, []);
  
  // Fast-Track: Limpar buffer quando veículo é validado ou sai da área
  const resetOcrBuffer = useCallback(() => {
    ocrBufferRef.current = [];
    fastTrackValidatedRef.current = false;
    console.log('🧹 Buffer OCR limpo');
  }, []);
  
  // Verificar se é morador
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
      console.error('Erro ao verificar morador:', e);
      return { isMorador: false };
    }
  }, []);
  
  // Salvar detecção no banco
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
      console.log('✅ Detecção salva:', placa, `(${fonteDeteccao})`);
    } catch (e) {
      console.error('Erro ao salvar detecção:', e);
    }
  }, []);
  
  // Processar frame para OCR com Fast-Track
  const processFrameForOCR = useCallback(async (): Promise<boolean> => {
    if (!videoRef.current || (status !== 'monitoring' && status !== 'motion_detected')) return false;
    
    // Fast-Track: Se já validou este veículo, ignora
    if (fastTrackValidatedRef.current) {
      return true;
    }
    
    setStatus('processing');
    setStatusMessage('🔍 Reconhecendo placa...');
    
    // Marcar que tentativa de OCR foi feita
    motionDetectorRef.current.markOcrAttempted();
    
    // Iniciar timer de processamento
    startProcessingTimer();
    
    try {
      // Etapa 1: Capturar
      updateProcessingStage('capturing', 'Capturando frame...');
      const capturedCanvas = motionDetectorRef.current.captureArea(
        videoRef.current,
        virtualArea
      );
      
      // Etapa 2: Pre-processamento (acontece dentro do OCR)
      updateProcessingStage('preprocessing', 'Pré-processando...');
      
      // Etapa 3: OCR
      updateProcessingStage('ocr', 'Executando OCR...');
      const result = await recognizeFromCanvas(capturedCanvas);
      
      // v1.1.87: Detecção de troca de veículo via YOLO
      if (result.plateRegion && lastPlateRegionRef.current) {
        const prev = lastPlateRegionRef.current;
        const curr = result.plateRegion;
        const canvasW = capturedCanvas.width || 1;
        const canvasH = capturedCanvas.height || 1;
        const dx = Math.abs(curr.x - prev.x) / canvasW;
        const dy = Math.abs(curr.y - prev.y) / canvasH;
        const dw = prev.w > 0 ? Math.abs(curr.width - prev.w) / prev.w : 0;
        if (dx > YOLO_POSITION_THRESHOLD || dy > YOLO_POSITION_THRESHOLD || dw > YOLO_SIZE_THRESHOLD) {
          console.log('🔄 Troca de veículo detectada via YOLO (posição mudou)');
          ocrBufferRef.current = [];
        }
      }
      if (result.plateRegion) {
        lastPlateRegionRef.current = {
          x: result.plateRegion.x, y: result.plateRegion.y,
          w: result.plateRegion.width, h: result.plateRegion.height,
        };
      }
      
      // Etapa 4: Validação
      updateProcessingStage('validating', 'Validando placa...');
      
      if (result.success && result.validation.isValid) {
        const placa = result.validation.corrected;
        const confidence = result.validation.confidence;
        
        // Fast-Track: Verificar consistência temporal
        const { hasConsensus, matchCount } = checkOcrConsistency(placa, confidence);
        
        if (hasConsensus) {
          // === SUCESSO VIA FAST-TRACK ===
          console.log(`🚀 Fast-Track: Placa ${placa} validada por consistência (${matchCount}/${OCR_BUFFER_SIZE})`);
          
          // v1.1.87: Marcar validação com timestamp para timeout
          fastTrackValidatedRef.current = true;
          lastValidationTimeRef.current = Date.now();
          
          // v1.1.87: Cooldown por placa - verificar deduplicação
          if (isPlateRecent(placa)) {
            console.log(`⏳ Placa ${placa} detectada recentemente, ignorando...`);
            finishProcessingTimer();
            setStatus('monitoring');
            setStatusMessage('🟢 Monitorando...');
            motionDetectorRef.current.markOcrSuccess();
            return true;
          }
          
          markPlateDetected(placa);
          
          // Verificar se é morador
          const { isMorador, casa } = await checkIfMorador(placa);
          
          const fonteDeteccao = usedFallback ? 'api' : 'local';
          const detection: Detection = {
            placa,
            timestamp: new Date().toISOString(),
            isMorador,
            casa,
            confidence,
            usedFallback,
            fonteDeteccao,
          };
          
          setLastDetection(detection);
          setRecentDetections(prev => [detection, ...prev.slice(0, 9)]);
          
          // Salvar no banco
          await saveDetection(placa, isMorador, casa, confidence, fonteDeteccao);
          
          finishProcessingTimer();
          motionDetectorRef.current.markOcrSuccess();
          
          if (isMorador) {
            setStatusMessage(`🚀 Morador: ${placa} - Casa ${casa} (Fast-Track)`);
          } else {
            setStatusMessage(`⚠️ Não cadastrado: ${placa} (Fast-Track)`);
          }
          
          return true;
        } else {
          // Sem consenso ainda, continuar coletando leituras
          console.log(`⏳ Aguardando consenso: ${placa} (${matchCount}/${CONSISTENCY_THRESHOLD} necessário)`);
          finishProcessingTimer();
          setStatus('monitoring');
          setStatusMessage(`🔄 Leituras: ${matchCount}/${CONSISTENCY_THRESHOLD}`);
          return false;
        }
      } else {
        finishProcessingTimer();
        setStatusMessage('❌ Não reconhecida');
        console.log('❌ OCR falhou, permitindo re-tentativa...');
        return false;
      }
    } catch (e) {
      console.error('Erro ao processar OCR:', e);
      finishProcessingTimer();
      setStatusMessage('❌ Erro OCR');
      return false;
    }
    
    // Voltar ao monitoramento após 2 segundos
    // (movido para processFrame para manter o fluxo)
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
    checkOcrConsistency,
  ]);
  
  // Inicializar background no motion worker a partir do frame atual
  const initBackgroundFromVideo = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return false;
    
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return false;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    ctx.drawImage(video, 0, 0);
    
    const area = loadVirtualArea() || getDefaultVirtualArea();
    const imageData = extractAreaPixels(ctx, video.videoWidth, video.videoHeight, area);
    
    motionWorkerInitBackground(imageData);
    setHasReference(true);
    
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
    
    return true;
  }, [motionWorkerInitBackground]);
  
  // Recapturar referência manualmente
  const recaptureReference = useCallback(() => {
    if (isActive && videoRef.current && canvasRef.current) {
      initBackgroundFromVideo();
    }
  }, [isActive, initBackgroundFromVideo]);
  
  // Guardar ref do processFrameForOCR
  useEffect(() => {
    processFrameForOCRRef.current = processFrameForOCR;
  }, [processFrameForOCR]);
  
  // Loop de processamento de frames (motion worker + Execution Lock)
  const processFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (status !== 'monitoring' && status !== 'motion_detected') return;
    if (!hasReference) return;
    
    // Execution Lock
    if (isProcessingMotionRef.current) return;
    isProcessingMotionRef.current = true;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || video.videoWidth === 0) {
      isProcessingMotionRef.current = false;
      return;
    }
    
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    
    ctx.drawImage(video, 0, 0);
    
    // Extrair ImageData e enviar ao motion worker (Transferable)
    const imageData = extractAreaPixels(ctx, video.videoWidth, video.videoHeight, virtualArea);
    motionWorkerProcessFrame(imageData); // Result via handleMotionResult callback
    
    // v1.1.87: Timeout de validação
    if (fastTrackValidatedRef.current && lastValidationTimeRef.current > 0) {
      const elapsed = Date.now() - lastValidationTimeRef.current;
      if (elapsed > VALIDATION_TIMEOUT_MS) {
        console.log('⏰ Timeout de validação - permitindo nova detecção');
        fastTrackValidatedRef.current = false;
        ocrBufferRef.current = [];
        lastPlateRegionRef.current = null;
        initBackgroundFromVideo();
        motionDetectorRef.current.resetOcrAttempt();
      }
    }
  }, [status, virtualArea, hasReference, motionWorkerProcessFrame, initBackgroundFromVideo]);
  
  // Iniciar loop de frames
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
  
  // Iniciar monitoramento
  const startMonitoring = useCallback(async (deviceId?: string) => {
    try {
      setStatus('starting');
      setStatusMessage('Iniciando câmera...');
      
      // Usar resolução selecionada
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
      resetOcrBuffer(); // Fast-Track: Limpar buffer ao iniciar
      setHasReference(false);
      
      // Resetar métricas
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
        initBackgroundFromVideo();
      }, 1000);
      
    } catch (e) {
      console.error('Erro ao iniciar câmera:', e);
      setStatus('error');
      setStatusMessage('❌ Erro ao acessar câmera');
    }
  }, [selectedCamera, selectedResolution, resetOCR, resetOcrBuffer]);
  
  // Parar monitoramento
  const stopMonitoring = useCallback(() => {
    // Parar webcam se ativa
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Parar HLS se ativo
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
  
  // Iniciar monitoramento via HLS (IPCamLive)
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
      
      // Verificar suporte a HLS
      if (!Hls.isSupported() && !videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        throw new Error('Navegador não suporta HLS');
      }
      
      // Parar qualquer monitoramento anterior
      stopMonitoring();
      
      motionDetectorRef.current.fullReset();
      recentPlatesRef.current.clear();
      resetOCR();
      resetOcrBuffer(); // Fast-Track: Limpar buffer ao iniciar
      setHasReference(false);
      
      // Resetar métricas
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
          console.log('✅ HLS: Manifest carregado');
          videoRef.current?.play();
        });
        
        hls.on(Hls.Events.ERROR, (_event, data) => {
          console.error('❌ HLS Error:', data);
          if (data.fatal) {
            setHlsStatus('error');
            setStatus('error');
            setStatusMessage(`❌ Erro no stream: ${data.type}`);
            
            // Tentar reconectar após 5 segundos
            setTimeout(() => {
              if (hlsRef.current && isActive) {
                console.log('🔄 Tentando reconectar...');
                hls.startLoad();
              }
            }, 5000);
          }
        });
        
        // Aguardar vídeo iniciar
        videoRef.current!.onplaying = () => {
          console.log('🎥 HLS: Reprodução iniciada');
          setHlsStatus('connected');
          setIsActive(true);
          setStatus('monitoring');
          setStatusMessage('📸 Capturando referência...');
          
          // Aguardar vídeo estabilizar e capturar referência
          setTimeout(() => {
            initBackgroundFromVideo();
          }, 1500);
        };
        
      } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari nativo
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
      console.error('Erro ao iniciar HLS:', e);
      setStatus('error');
      setHlsStatus('error');
      setStatusMessage(`❌ ${e instanceof Error ? e.message : 'Erro ao conectar'}`);
    }
  }, [hlsUrl, stopMonitoring, resetOCR, resetOcrBuffer, isActive]);
  
  // Atualizar área virtual
  const updateVirtualArea = useCallback((area: VirtualArea) => {
    setVirtualArea(area);
    saveVirtualArea(area);
  }, []);
  
  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, [stopMonitoring]);
  
  return {
    status,
    statusMessage,
    isActive,
    virtualArea,
    lastDetection,
    recentDetections,
    videoRef,
    canvasRef,
    startMonitoring,
    stopMonitoring,
    updateVirtualArea,
    availableCameras,
    selectedCamera,
    setSelectedCamera,
    motionPercent,
    // Novas propriedades
    processingInfo,
    selectedResolution,
    setSelectedResolution,
    // Propriedades de referência
    hasReference,
    recaptureReference,
    // HLS/RTSP streaming
    sourceMode,
    setSourceMode,
    hlsUrl,
    setHlsUrl,
    hlsStatus,
    startMonitoringHLS,
  };
}
