/**
 * Hook para monitoramento contínuo com webcam local OU câmera IP via go2rtc
 * Detecta movimento em área virtual e dispara OCR híbrido
 * Suporta tipo de câmera: entrada ou saída
 * Suporta fonte: webcam ou go2rtc (câmera IP via RTSP)
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePlateRecognition } from './usePlateRecognition';
import { loadGo2rtcConfig, loadStreamMode } from './useGo2rtcStream';
import { 
  MotionDetector, 
  VirtualArea, 
  getDefaultVirtualArea,
  CameraResolution,
  RESOLUTION_OPTIONS,
} from '../utils/motionDetection';

export type MonitoringStatus = 'idle' | 'starting' | 'connecting' | 'monitoring' | 'motion_detected' | 'processing' | 'error';

export type ProcessingStage = 'idle' | 'capturing' | 'preprocessing' | 'ocr' | 'validating' | 'done';

export type CameraType = 'entrada' | 'saida';

export type StreamSourceMode = 'webcam' | 'go2rtc';

interface Detection {
  placa: string;
  timestamp: string;
  isMorador: boolean;
  casa?: string;
  confidence: number;
  usedFallback: boolean;
  direcao: CameraType;
}

export interface ProcessingInfo {
  stage: ProcessingStage;
  stageLabel: string;
  currentTimeMs: number;
  lastOcrTimeMs: number;
  avgTimeMs: number;
}

interface UseContinuousMonitoringOptions {
  cameraType?: CameraType;
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
  processingInfo: ProcessingInfo;
  selectedResolution: CameraResolution;
  setSelectedResolution: (resolution: CameraResolution) => void;
  hasReference: boolean;
  recaptureReference: () => void;
  cameraType: CameraType;
  streamMode: StreamSourceMode;
  connectionMode: 'webrtc' | 'mse' | 'local' | 'none';
}

const COOLDOWN_MS = 30000; // 30 segundos entre detecções da mesma placa
const FRAME_INTERVAL_MS = 350; // Processar frame a cada 350ms (otimizado)

// Funções de storage com suporte a tipo de câmera
function getStorageKey(baseKey: string, cameraType: CameraType): string {
  return `${baseKey}_${cameraType}`;
}

function loadVirtualAreaForCamera(cameraType: CameraType): VirtualArea | null {
  try {
    const key = getStorageKey('portacerta_virtual_area', cameraType);
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.type && parsed.x !== undefined) {
        return { ...parsed, type: 'rect' };
      }
      return parsed;
    }
  } catch (e) {
    console.warn('Erro ao carregar área virtual:', e);
  }
  return null;
}

function saveVirtualAreaForCamera(area: VirtualArea, cameraType: CameraType): void {
  try {
    const key = getStorageKey('portacerta_virtual_area', cameraType);
    localStorage.setItem(key, JSON.stringify(area));
  } catch (e) {
    console.warn('Erro ao salvar área virtual:', e);
  }
}

function loadSelectedCameraForType(cameraType: CameraType): string | null {
  try {
    const key = getStorageKey('portacerta_selected_camera', cameraType);
    return localStorage.getItem(key);
  } catch (e) {
    console.warn('Erro ao carregar câmera:', e);
  }
  return null;
}

function saveSelectedCameraForType(deviceId: string, cameraType: CameraType): void {
  try {
    const key = getStorageKey('portacerta_selected_camera', cameraType);
    localStorage.setItem(key, deviceId);
  } catch (e) {
    console.warn('Erro ao salvar câmera:', e);
  }
}

function loadResolutionForCamera(cameraType: CameraType): CameraResolution {
  try {
    const key = getStorageKey('portacerta_camera_resolution', cameraType);
    const saved = localStorage.getItem(key);
    if (saved && (saved === 'low' || saved === 'medium' || saved === 'high')) {
      return saved;
    }
  } catch (e) {
    console.warn('Erro ao carregar resolução:', e);
  }
  return 'medium';
}

function saveResolutionForCamera(resolution: CameraResolution, cameraType: CameraType): void {
  try {
    const key = getStorageKey('portacerta_camera_resolution', cameraType);
    localStorage.setItem(key, resolution);
  } catch (e) {
    console.warn('Erro ao salvar resolução:', e);
  }
}

export function useContinuousMonitoring(
  options: UseContinuousMonitoringOptions = {}
): UseContinuousMonitoringReturn {
  const { cameraType = 'entrada' } = options;
  
  const [status, setStatus] = useState<MonitoringStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('Parado');
  const [isActive, setIsActive] = useState(false);
  const [virtualArea, setVirtualArea] = useState<VirtualArea>(
    loadVirtualAreaForCamera(cameraType) || getDefaultVirtualArea()
  );
  const [lastDetection, setLastDetection] = useState<Detection | null>(null);
  const [recentDetections, setRecentDetections] = useState<Detection[]>([]);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCameraState] = useState<string>('');
  const [motionPercent, setMotionPercent] = useState(0);
  const [selectedResolution, setSelectedResolutionState] = useState<CameraResolution>(
    loadResolutionForCamera(cameraType)
  );
  const [hasReference, setHasReference] = useState(false);
  
  // Novos estados para go2rtc
  const [streamMode, setStreamMode] = useState<StreamSourceMode>(() => loadStreamMode(cameraType));
  const [connectionMode, setConnectionMode] = useState<'webrtc' | 'mse' | 'local' | 'none'>('none');
  
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
  const motionDetectorRef = useRef<MotionDetector>(new MotionDetector());
  const frameIntervalRef = useRef<number | null>(null);
  const recentPlatesRef = useRef<Map<string, number>>(new Map());
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  const { recognizeFromCanvas, reset: resetOCR, usedFallback } = usePlateRecognition();
  
  // Atualizar streamMode quando mudar configuração
  useEffect(() => {
    setStreamMode(loadStreamMode(cameraType));
  }, [cameraType]);
  
  // Carregar lista de câmeras e câmera salva (apenas para webcam mode)
  useEffect(() => {
    async function loadCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter(d => d.kind === 'videoinput');
        setAvailableCameras(cameras);
        
        const savedCamera = loadSelectedCameraForType(cameraType);
        if (savedCamera && cameras.find(c => c.deviceId === savedCamera)) {
          setSelectedCameraState(savedCamera);
        } else if (cameras.length > 0) {
          // Para saída, tentar usar segunda câmera se disponível
          if (cameraType === 'saida' && cameras.length > 1) {
            setSelectedCameraState(cameras[1].deviceId);
          } else {
            setSelectedCameraState(cameras[0].deviceId);
          }
        }
      } catch (e) {
        console.warn('Erro ao listar câmeras:', e);
      }
    }
    loadCameras();
  }, [cameraType]);
  
  const setSelectedCamera = useCallback((deviceId: string) => {
    setSelectedCameraState(deviceId);
    saveSelectedCameraForType(deviceId, cameraType);
  }, [cameraType]);
  
  const setSelectedResolution = useCallback((resolution: CameraResolution) => {
    setSelectedResolutionState(resolution);
    saveResolutionForCamera(resolution, cameraType);
  }, [cameraType]);
  
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
  
  // Verificar se é morador
  const checkIfMorador = useCallback(async (placa: string): Promise<{ isMorador: boolean; casa?: string }> => {
    try {
      const { data, error } = await supabase
        .from('veiculos_moradores')
        .select('casa, status_presenca')
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
  
  // Atualizar status de presença do morador
  const updatePresencaStatus = useCallback(async (placa: string, novoStatus: 'dentro' | 'fora') => {
    try {
      const placaNormalizada = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const { error } = await supabase
        .from('veiculos_moradores')
        .update({
          status_presenca: novoStatus,
          ultima_movimentacao: new Date().toISOString(),
        })
        .eq('placa_veiculo', placaNormalizada);
      
      if (error) throw error;
      console.log(`✅ Status de presença atualizado: ${placa} -> ${novoStatus}`);
    } catch (e) {
      console.error('Erro ao atualizar status de presença:', e);
    }
  }, []);
  
  // Salvar detecção no banco com direção
  const saveDetection = useCallback(async (
    placa: string, 
    isMorador: boolean, 
    casa: string | undefined,
    confidence: number,
    direcao: CameraType
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
          direcao: direcao,
        });
      
      if (error) throw error;
      console.log(`✅ Detecção salva: ${placa} (${direcao})`);
      
      // Se é morador, atualizar status de presença
      if (isMorador) {
        const novoStatus = direcao === 'entrada' ? 'dentro' : 'fora';
        await updatePresencaStatus(placa, novoStatus);
      }
    } catch (e) {
      console.error('Erro ao salvar detecção:', e);
    }
  }, [updatePresencaStatus]);
  
  // Processar frame para OCR
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
          console.log(`⏳ Placa ${placa} detectada recentemente, ignorando...`);
          finishProcessingTimer();
          setStatus('monitoring');
          setStatusMessage('🟢 Monitorando...');
          motionDetectorRef.current.markOcrSuccess();
          return true;
        }
        
        markPlateDetected(placa);
        
        const { isMorador, casa } = await checkIfMorador(placa);
        
        const detection: Detection = {
          placa,
          timestamp: new Date().toISOString(),
          isMorador,
          casa,
          confidence: result.validation.confidence,
          usedFallback,
          direcao: cameraType,
        };
        
        setLastDetection(detection);
        setRecentDetections(prev => [detection, ...prev.slice(0, 9)]);
        
        await saveDetection(placa, isMorador, casa, result.validation.confidence, cameraType);
        
        finishProcessingTimer();
        motionDetectorRef.current.markOcrSuccess();
        
        const direcaoLabel = cameraType === 'entrada' ? '⬇️' : '⬆️';
        if (isMorador) {
          setStatusMessage(`${direcaoLabel} ✅ Morador: ${placa} - Casa ${casa}`);
        } else {
          setStatusMessage(`${direcaoLabel} ⚠️ Não cadastrado: ${placa}`);
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
    cameraType,
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
    if (!videoRef.current || !canvasRef.current) {
      return;
    }
    
    if (status !== 'monitoring' && status !== 'motion_detected') {
      return;
    }
    
    if (!motionDetectorRef.current.hasReference()) {
      return;
    }
    
    const result = motionDetectorRef.current.processFrame(
      videoRef.current,
      canvasRef.current,
      virtualArea
    );
    
    setMotionPercent(result.motionPercent);
    
    if (result.shouldUpdateReference) {
      console.log('🔄 Auto-atualizando referência...');
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
        if (isActive) {
          setStatus('monitoring');
          setStatusMessage(success ? '🟢 Monitorando...' : '🟡 Aguardando re-tentativa...');
        }
      }, 2000);
    }
  }, [status, virtualArea, processFrameForOCR, captureReferenceFrame, processingInfo.stage, processingInfo.stageLabel, isActive]);
  
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
  
  // Limpar conexões WebRTC/MSE
  const cleanupWebRTC = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);
  
  // Conectar via WebRTC ao go2rtc
  const connectWebRTC = useCallback(async (serverUrl: string, streamName: string): Promise<boolean> => {
    try {
      console.log(`🔌 Conectando WebRTC: ${serverUrl}/api/webrtc?src=${streamName}`);
      
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;
      
      // Handler para tracks recebidos
      pc.ontrack = (event) => {
        console.log('📹 Track recebido:', event.streams[0]);
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().catch(console.warn);
        }
      };
      
      // Handler para estado de conexão
      pc.onconnectionstatechange = () => {
        console.log('🔌 WebRTC state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          setConnectionMode('webrtc');
          setStatus('monitoring');
          setStatusMessage('📸 Capturando referência...');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setStatus('error');
          setStatusMessage('❌ Conexão WebRTC perdida');
        }
      };
      
      // Adicionar transceiver para receber vídeo
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      
      // Criar oferta
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      // Enviar oferta para go2rtc
      const apiUrl = `${serverUrl}/api/webrtc?src=${encodeURIComponent(streamName)}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const answerSdp = await response.text();
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });
      
      console.log('✅ WebRTC conectado!');
      return true;
    } catch (e) {
      console.warn('❌ WebRTC falhou:', e);
      return false;
    }
  }, []);
  
  // Conectar via MSE ao go2rtc (fallback)
  const connectMSE = useCallback(async (serverUrl: string, streamName: string): Promise<boolean> => {
    try {
      console.log(`🔌 Tentando MSE: ${serverUrl}/api/ws?src=${streamName}`);
      
      if (!('MediaSource' in window)) {
        throw new Error('MSE não suportado');
      }
      
      const wsUrl = `${serverUrl.replace('http', 'ws')}/api/ws?src=${encodeURIComponent(streamName)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      const mediaSource = new MediaSource();
      
      if (videoRef.current) {
        videoRef.current.src = URL.createObjectURL(mediaSource);
      }
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout de conexão MSE'));
        }, 10000);
        
        mediaSource.addEventListener('sourceopen', () => {
          try {
            const sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.640028"');
            
            ws.onmessage = async (event) => {
              if (event.data instanceof Blob) {
                const buffer = await event.data.arrayBuffer();
                if (!sourceBuffer.updating && mediaSource.readyState === 'open') {
                  sourceBuffer.appendBuffer(buffer);
                }
              }
            };
            
            ws.onopen = () => {
              clearTimeout(timeout);
              console.log('✅ MSE conectado!');
              setConnectionMode('mse');
              setStatus('monitoring');
              setStatusMessage('📸 Capturando referência...');
              videoRef.current?.play().catch(console.warn);
              resolve(true);
            };
            
            ws.onerror = () => {
              clearTimeout(timeout);
              reject(new Error('Erro de conexão WebSocket'));
            };
          } catch (e) {
            clearTimeout(timeout);
            reject(e);
          }
        });
      });
    } catch (e) {
      console.warn('❌ MSE falhou:', e);
      return false;
    }
  }, []);
  
  // Iniciar monitoramento - agora suporta webcam e go2rtc
  const startMonitoring = useCallback(async (deviceId?: string) => {
    try {
      // Verificar modo de stream atual
      const currentMode = loadStreamMode(cameraType);
      setStreamMode(currentMode);
      
      setStatus('starting');
      setStatusMessage('Iniciando...');
      
      if (currentMode === 'go2rtc') {
        // === MODO GO2RTC (CÂMERA IP) ===
        const config = loadGo2rtcConfig(cameraType);
        
        if (!config) {
          setStatus('error');
          setStatusMessage('❌ go2rtc não configurado. Vá em Configurações > Câmeras');
          return;
        }
        
        setStatus('connecting');
        setStatusMessage(`🔌 Conectando à ${cameraType === 'entrada' ? 'Entrada' : 'Saída'}...`);
        
        // Tentar WebRTC primeiro (menor latência)
        const webrtcSuccess = await connectWebRTC(config.serverUrl, config.streamName);
        
        if (!webrtcSuccess) {
          // Fallback para MSE
          const mseSuccess = await connectMSE(config.serverUrl, config.streamName);
          
          if (!mseSuccess) {
            setStatus('error');
            setStatusMessage('❌ Falha ao conectar. Verifique go2rtc e túnel.');
            return;
          }
        }
      } else {
        // === MODO WEBCAM (LOCAL) ===
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
        
        setConnectionMode('local');
        setStatus('monitoring');
        setStatusMessage('📸 Capturando referência...');
      }
      
      // Setup comum para ambos os modos
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
      
      // Capturar referência após vídeo iniciar
      setTimeout(() => {
        if (videoRef.current && canvasRef.current) {
          const currentArea = loadVirtualAreaForCamera(cameraType) || getDefaultVirtualArea();
          const success = motionDetectorRef.current.captureReference(
            videoRef.current,
            canvasRef.current,
            currentArea
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
      }, 1500); // Dar mais tempo para go2rtc carregar
      
    } catch (e) {
      console.error('Erro ao iniciar monitoramento:', e);
      setStatus('error');
      setStatusMessage('❌ Erro ao iniciar câmera');
    }
  }, [selectedCamera, selectedResolution, resetOCR, cameraType, connectWebRTC, connectMSE]);
  
  const stopMonitoring = useCallback(() => {
    // Parar webcam stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Limpar WebRTC/MSE
    cleanupWebRTC();
    
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
    setConnectionMode('none');
  }, [cleanupWebRTC]);
  
  const updateVirtualArea = useCallback((area: VirtualArea) => {
    setVirtualArea(area);
    saveVirtualAreaForCamera(area, cameraType);
  }, [cameraType]);
  
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
    processingInfo,
    selectedResolution,
    setSelectedResolution,
    hasReference,
    recaptureReference,
    cameraType,
    streamMode,
    connectionMode,
  };
}
