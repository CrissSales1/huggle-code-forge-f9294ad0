/**
 * Hook para monitoramento contínuo com webcam local
 * Detecta movimento em área virtual e dispara OCR híbrido
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePlateRecognition } from './usePlateRecognition';
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
} from '../utils/motionDetection';

export type MonitoringStatus = 'idle' | 'starting' | 'monitoring' | 'motion_detected' | 'processing' | 'error';

export type ProcessingStage = 'idle' | 'capturing' | 'preprocessing' | 'ocr' | 'validating' | 'done';

interface Detection {
  placa: string;
  timestamp: string;
  isMorador: boolean;
  casa?: string;
  confidence: number;
  usedFallback: boolean;
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
}

const COOLDOWN_MS = 30000; // 30 segundos entre detecções da mesma placa
const FRAME_INTERVAL_MS = 350; // Processar frame a cada 350ms (otimizado)

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
  const motionDetectorRef = useRef<MotionDetector>(new MotionDetector());
  const frameIntervalRef = useRef<number | null>(null);
  const recentPlatesRef = useRef<Map<string, number>>(new Map());
  
  const { recognizeFromCanvas, reset: resetOCR, usedFallback } = usePlateRecognition();
  
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
    confidence: number
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
        });
      
      if (error) throw error;
      console.log('✅ Detecção salva:', placa);
    } catch (e) {
      console.error('Erro ao salvar detecção:', e);
    }
  }, []);
  
  // Processar frame para OCR
  const processFrameForOCR = useCallback(async () => {
    if (!videoRef.current || status !== 'monitoring') return;
    
    setStatus('processing');
    setStatusMessage('🔍 Reconhecendo placa...');
    
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
      
      // Etapa 4: Validação
      updateProcessingStage('validating', 'Validando placa...');
      
      if (result.success && result.validation.isValid) {
        const placa = result.validation.formatted;
        
        // Verificar deduplicação
        if (isPlateRecent(placa)) {
          console.log(`⏳ Placa ${placa} detectada recentemente, ignorando...`);
          finishProcessingTimer();
          setStatus('monitoring');
          setStatusMessage('🟢 Monitorando...');
          return;
        }
        
        markPlateDetected(placa);
        
        // Verificar se é morador
        const { isMorador, casa } = await checkIfMorador(placa);
        
        const detection: Detection = {
          placa,
          timestamp: new Date().toISOString(),
          isMorador,
          casa,
          confidence: result.validation.confidence,
          usedFallback,
        };
        
        setLastDetection(detection);
        setRecentDetections(prev => [detection, ...prev.slice(0, 9)]);
        
        // Salvar no banco
        await saveDetection(placa, isMorador, casa, result.validation.confidence);
        
        finishProcessingTimer();
        
        if (isMorador) {
          setStatusMessage(`✅ Morador: ${placa} - Casa ${casa}`);
        } else {
          setStatusMessage(`⚠️ Não cadastrado: ${placa}`);
        }
      } else {
        finishProcessingTimer();
        setStatusMessage('❌ Placa não reconhecida');
      }
    } catch (e) {
      console.error('Erro ao processar OCR:', e);
      finishProcessingTimer();
      setStatusMessage('❌ Erro no processamento');
    }
    
    // Voltar ao monitoramento após 2 segundos
    setTimeout(() => {
      if (isActive) {
        setStatus('monitoring');
        setStatusMessage('🟢 Monitorando...');
      }
    }, 2000);
  }, [
    status, 
    virtualArea, 
    recognizeFromCanvas, 
    isPlateRecent, 
    markPlateDetected, 
    checkIfMorador, 
    saveDetection, 
    usedFallback,
    isActive,
    startProcessingTimer,
    updateProcessingStage,
    finishProcessingTimer,
  ]);
  
  // Loop de processamento de frames
  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || status !== 'monitoring') {
      return;
    }
    
    const result = motionDetectorRef.current.processFrame(
      videoRef.current,
      canvasRef.current,
      virtualArea
    );
    
    setMotionPercent(result.motionPercent);
    
    if (result.hasMotion) {
      setStatus('motion_detected');
      setStatusMessage('🟡 Movimento detectado...');
    }
    
    // Se estabilizou após movimento, processar OCR
    if (result.isStable) {
      processFrameForOCR();
    }
  }, [status, virtualArea, processFrameForOCR]);
  
  // Iniciar loop de frames
  useEffect(() => {
    if (isActive && status === 'monitoring') {
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
      
      motionDetectorRef.current.reset();
      recentPlatesRef.current.clear();
      resetOCR();
      
      // Resetar métricas
      processingTimesRef.current = [];
      setProcessingInfo({
        stage: 'idle',
        stageLabel: 'Aguardando',
        currentTimeMs: 0,
        lastOcrTimeMs: 0,
        avgTimeMs: 0,
      });
      
      setIsActive(true);
      setStatus('monitoring');
      setStatusMessage('🟢 Monitorando...');
      
    } catch (e) {
      console.error('Erro ao iniciar câmera:', e);
      setStatus('error');
      setStatusMessage('❌ Erro ao acessar câmera');
    }
  }, [selectedCamera, selectedResolution, resetOCR]);
  
  // Parar monitoramento
  const stopMonitoring = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    
    motionDetectorRef.current.reset();
    setIsActive(false);
    setStatus('idle');
    setStatusMessage('Parado');
    setMotionPercent(0);
  }, []);
  
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
  };
}
