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
  // Propriedades de referência
  hasReference: boolean;
  recaptureReference: () => void;
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
  const [hasReference, setHasReference] = useState(false);
  
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
  const processFrameForOCR = useCallback(async (): Promise<boolean> => {
    if (!videoRef.current || status !== 'monitoring') return false;
    
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
          // Marcar como sucesso para não tentar novamente
          motionDetectorRef.current.markOcrSuccess();
          return true;
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
        
        // Marcar OCR como sucesso - não tentar novamente
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
        console.log('❌ OCR falhou, permitindo re-tentativa em 5s...');
        return false;
      }
    } catch (e) {
      console.error('Erro ao processar OCR:', e);
      finishProcessingTimer();
      setStatusMessage('❌ Erro no processamento - tentando novamente...');
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
  ]);
  
  // Função para capturar/recapturar referência
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
      
      // Mostrar mensagem por 2 segundos e depois voltar ao normal
      setTimeout(() => {
        setProcessingInfo(prev => ({
          ...prev,
          stageLabel: 'Monitorando área...',
        }));
      }, 2000);
    }
    
    return success;
  }, [virtualArea]);
  
  // Recapturar referência manualmente
  const recaptureReference = useCallback(() => {
    if (isActive && videoRef.current && canvasRef.current) {
      captureReferenceFrame();
    }
  }, [isActive, captureReferenceFrame]);
  
  // Loop de processamento de frames
  const processFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) {
      return;
    }
    
    // Só processar se está monitorando ou com movimento detectado
    if (status !== 'monitoring' && status !== 'motion_detected') {
      return;
    }
    
    // Verificar se tem referência
    if (!motionDetectorRef.current.hasReference()) {
      return;
    }
    
    const result = motionDetectorRef.current.processFrame(
      videoRef.current,
      canvasRef.current,
      virtualArea
    );
    
    setMotionPercent(result.motionPercent);
    
    // Auto-atualizar referência se necessário
    if (result.shouldUpdateReference) {
      console.log('🔄 Auto-atualizando referência...');
      captureReferenceFrame();
    }
    
    // Atualizar stageLabel baseado no estado atual
    if (result.hasMotion) {
      setStatus('motion_detected');
      setStatusMessage('🟡 Veículo detectado...');
      setProcessingInfo(prev => ({
        ...prev,
        stage: 'idle',
        stageLabel: 'Veículo detectado!',
      }));
    } else if (!result.hasMotion && status === 'motion_detected') {
      // Resetar para monitoramento quando não há mais veículo
      setStatus('monitoring');
      setStatusMessage('🟢 Monitorando...');
      setProcessingInfo(prev => ({
        ...prev,
        stage: 'idle',
        stageLabel: 'Monitorando área...',
      }));
    } else if (status === 'monitoring' && processingInfo.stage === 'idle' && processingInfo.stageLabel === 'Aguardando') {
      // Atualizar label inicial quando começar a monitorar
      setProcessingInfo(prev => ({
        ...prev,
        stageLabel: 'Monitorando área...',
      }));
    }
    
    // Se deve tentar OCR (primeira vez ou re-tentativa)
    if (result.shouldAttemptOCR) {
      const success = await processFrameForOCR();
      
      // Voltar ao monitoramento após 2 segundos
      setTimeout(() => {
        if (isActive) {
          setStatus('monitoring');
          setStatusMessage(success ? '🟢 Monitorando...' : '🟡 Aguardando re-tentativa...');
        }
      }, 2000);
    }
  }, [status, virtualArea, processFrameForOCR, captureReferenceFrame, processingInfo.stage, processingInfo.stageLabel, isActive]);
  
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
      
      // Aguardar vídeo estabilizar e capturar referência
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
      }, 1000); // Aguardar 1 segundo para estabilizar
      
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
    
    motionDetectorRef.current.fullReset();
    setHasReference(false);
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
    // Propriedades de referência
    hasReference,
    recaptureReference,
  };
}
