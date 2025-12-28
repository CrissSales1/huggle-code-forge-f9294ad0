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
  getDefaultVirtualArea 
} from '../utils/motionDetection';

export type MonitoringStatus = 'idle' | 'starting' | 'monitoring' | 'motion_detected' | 'processing' | 'error';

interface Detection {
  placa: string;
  timestamp: string;
  isMorador: boolean;
  casa?: string;
  confidence: number;
  usedFallback: boolean;
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
}

const COOLDOWN_MS = 30000; // 30 segundos entre detecções da mesma placa
const FRAME_INTERVAL_MS = 200; // Processar frame a cada 200ms

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
  const [selectedCamera, setSelectedCamera] = useState<string>('');
  const [motionPercent, setMotionPercent] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const motionDetectorRef = useRef<MotionDetector>(new MotionDetector());
  const frameIntervalRef = useRef<number | null>(null);
  const recentPlatesRef = useRef<Map<string, number>>(new Map());
  
  const { recognizeFromCanvas, reset: resetOCR, usedFallback } = usePlateRecognition();
  
  // Carregar lista de câmeras
  useEffect(() => {
    async function loadCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        setAvailableCameras(cameras);
        if (cameras.length > 0 && !selectedCamera) {
          setSelectedCamera(cameras[0].deviceId);
        }
      } catch (e) {
        console.warn('Erro ao listar câmeras:', e);
      }
    }
    loadCameras();
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
    
    try {
      const capturedCanvas = motionDetectorRef.current.captureArea(
        videoRef.current,
        virtualArea
      );
      
      const result = await recognizeFromCanvas(capturedCanvas);
      
      if (result.success && result.validation.isValid) {
        const placa = result.validation.formatted;
        
        // Verificar deduplicação
        if (isPlateRecent(placa)) {
          console.log(`⏳ Placa ${placa} detectada recentemente, ignorando...`);
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
        
        if (isMorador) {
          setStatusMessage(`✅ Morador: ${placa} - Casa ${casa}`);
        } else {
          setStatusMessage(`⚠️ Não cadastrado: ${placa}`);
        }
      } else {
        setStatusMessage('❌ Placa não reconhecida');
      }
    } catch (e) {
      console.error('Erro ao processar OCR:', e);
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
    isActive
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
      
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: deviceId || selectedCamera ? { exact: deviceId || selectedCamera } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
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
      
      setIsActive(true);
      setStatus('monitoring');
      setStatusMessage('🟢 Monitorando...');
      
    } catch (e) {
      console.error('Erro ao iniciar câmera:', e);
      setStatus('error');
      setStatusMessage('❌ Erro ao acessar câmera');
    }
  }, [selectedCamera, resetOCR]);
  
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
  };
}
