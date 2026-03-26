/**
 * Contexto global para monitoramento contínuo
 * v1.4.0 - Substituiu MotionDetector por MediaPipe ObjectDetector para trigger de veículos
 * Usa Web Worker para processamento pesado (OCR, detecção) em background
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import Hls from 'hls.js';
import { supabase } from '@/integrations/supabase/client';
import { usePlateWorker } from '@/react-app/hooks/usePlateWorker';
import { usePerformanceMetrics, PerformanceMetrics } from '@/react-app/hooks/usePerformanceMetrics';
import logger from '@/react-app/utils/logger';
import { 
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
  getPolygonPoints,
  isPointInPolygon,
  captureAreaFromVideo,
  cropVehicleRegion,
} from '@/react-app/utils/motionDetection';
import {
  initObjectDetector,
  detectObjects,
  filterByCategories,
  VEHICLE_CATEGORIES,
  type ObjectDetection,
} from '@/react-app/utils/objectDetector';

export type SourceMode = 'webcam' | 'hls' | 'stream';
export type MonitoringStatus = 'idle' | 'starting' | 'monitoring' | 'motion_detected' | 'processing' | 'error';
export type WebRTCStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'fallback_hls';
export type StreamProtocol = 'none' | 'webrtc' | 'hls';
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
  if (saved === 'hls' || saved === 'stream') return saved;
  if (saved === 'whep') return 'stream'; // migração legado
  return 'webcam';
}

export function saveSourceMode(mode: SourceMode): void {
  localStorage.setItem(SOURCE_MODE_KEY, mode);
}

export interface Detection {
  placa: string;
  timestamp: string;
  isMorador: boolean;
  isVisitante?: boolean;
  nomeVisitante?: string;
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
  debugImage?: string;
  rawText?: string;
  ocrConfidence?: number;
  usedYolo?: boolean;
  plateRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  };
  detectedPlate?: string;
  debugImages?: {
    original?: string;
    cropped?: string;
    preprocessed?: string;
    final?: string;
  };
}

interface MonitoringContextType {
  // Estado
  status: MonitoringStatus;
  statusMessage: string;
  isActive: boolean;
  virtualArea: VirtualArea;
  lastDetection: Detection | null;
  recentDetections: Detection[];
  vehicleDetected: boolean;
  vehicleBBox: ObjectDetection | null;
  processingInfo: ProcessingInfo;
  debugImage: string | null;
  debugModeEnabled: boolean;
  setDebugModeEnabled: (enabled: boolean) => void;
  forceNightMode: boolean;
  setForceNightMode: (enabled: boolean) => void;
  
  // Performance
  performanceMetrics: PerformanceMetrics;
  workerReady: boolean;
  modelLoaded: boolean;
  modelLoading: boolean;
  yoloBackend: string;
  
  // MediaPipe
  mediapipeLoading: boolean;
  mediapipeReady: boolean;
  
  // Câmera
  availableCameras: MediaDeviceInfo[];
  selectedCamera: string;
  setSelectedCamera: (deviceId: string) => void;
  selectedResolution: CameraResolution;
  setSelectedResolution: (resolution: CameraResolution) => void;
  
   // HLS / WebRTC (go2rtc)
  sourceMode: SourceMode;
  setSourceMode: (mode: SourceMode) => void;
  hlsUrl: string;
  setHlsUrl: (url: string) => void;
  hlsStatus: 'idle' | 'connecting' | 'connected' | 'error';
  webrtcStatus: WebRTCStatus;
  activeProtocol: StreamProtocol;
  
  // Refs
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  
  // Ações
  startMonitoring: (deviceId?: string) => Promise<void>;
  startMonitoringHLS: () => Promise<void>;
  startMonitoringStream: () => Promise<void>;
  stopMonitoring: () => void;
  updateVirtualArea: (area: VirtualArea) => void;
  reconnectStream: () => void;
  manualCapture: () => Promise<boolean>;
}

const MonitoringContext = createContext<MonitoringContextType | null>(null);

const COOLDOWN_MS = 15000;
const VEHICLE_DETECTION_INTERVAL_MS = 300; // MediaPipe detection interval

// Fast-Track: Constantes de Consistência Temporal
const CONSISTENCY_THRESHOLD = 3;
const OCR_BUFFER_SIZE = 5;
const MIN_CONFIDENCE_FOR_BUFFER = 0.70;
const MIN_REDETECTION_INTERVAL = 30000;
const OCR_RETRY_DELAY_MS = 800;

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
  const [vehicleDetected, setVehicleDetected] = useState(false);
  const [vehicleBBox, setVehicleBBox] = useState<ObjectDetection | null>(null);
  const [selectedResolution, setSelectedResolutionState] = useState<CameraResolution>(loadCameraResolution());
  
  // MediaPipe state
  const [mediapipeLoading, setMediapipeLoading] = useState(false);
  const [mediapipeReady, setMediapipeReady] = useState(false);
  
  const [sourceMode, setSourceModeState] = useState<SourceMode>(loadSourceMode());
  const [hlsUrl, setHlsUrlState] = useState<string>(loadHlsUrl());
  const [hlsStatus, setHlsStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [webrtcStatus, setWebRTCStatus] = useState<WebRTCStatus>('idle');
  const [activeProtocol, setActiveProtocol] = useState<StreamProtocol>('none');
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const webrtcRetryCountRef = useRef<number>(0);
  const MAX_WEBRTC_RETRIES = 5;
  
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
  const recentPlatesRef = useRef<Map<string, number>>(new Map());
  const isActiveRef = useRef(false);
  const statusRef = useRef<MonitoringStatus>('idle');
  
  // Vehicle detection refs
  const vehicleDetectionIntervalRef = useRef<number | null>(null);
  const isOcrInProgressRef = useRef(false);
  const lastOcrAttemptTimeRef = useRef(0);
  const vehicleBBoxRef = useRef<ObjectDetection | null>(null);
  
  // Fast-Track v1.1.29: Buffer de consistência temporal para OCR + Auto-Reset
  const ocrBufferRef = useRef<Array<{ placa: string; confidence: number; timestamp: number }>>([]);
  const fastTrackValidatedRef = useRef<boolean>(false);
  const noMotionCounterRef = useRef<number>(0);
  const lastValidationTimeRef = useRef<number>(0);
  const lastValidatedPlateRef = useRef<string>('');
  const VALIDATION_TIMEOUT_MS = 8000;
  
  // Hooks para processamento em background e métricas de performance
  const { 
    isReady: workerReady, 
    isProcessing: workerProcessing,
    error: workerError,
    modelLoaded,
    modelLoading,
    modelFailed,
    yoloBackend,
    processPlate: processPlateWorker,
    loadYoloModel,
    setConfig: setWorkerConfig,
  } = usePlateWorker();
  
  const {
    metrics: performanceMetrics,
    recordFrameStart,
    recordFrameEnd,
    recordOcrTime,
    setWorkerStatus,
  } = usePerformanceMetrics();
  
  // Sincronizar status do worker com métricas
  useEffect(() => {
    if (workerError) {
      setWorkerStatus('error');
    } else if (workerProcessing) {
      setWorkerStatus('processing');
    } else if (workerReady) {
      setWorkerStatus('ready');
    } else {
      setWorkerStatus('initializing');
    }
  }, [workerReady, workerProcessing, workerError, setWorkerStatus]);
  
  // Carregar modelo YOLO quando monitoramento iniciar
  useEffect(() => {
    if (isActive && workerReady && !modelLoaded && !modelLoading && !modelFailed) {
      logger.log('🧠 Tentando carregar modelo YOLO...');
      loadYoloModel();
    }
  }, [isActive, workerReady, modelLoaded, modelLoading, modelFailed, loadYoloModel]);
  
  // Enviar configuração YOLO ao worker quando pronto
  useEffect(() => {
    if (!workerReady) return;
    
    const sendConfig = () => {
      try {
        const savedResolution = localStorage.getItem('portacerta_yolo_resolution');
        const yoloInputSize = savedResolution ? parseInt(savedResolution) : 640;
        setWorkerConfig({ yoloInputSize });
      } catch { /* ignore */ }
    };
    
    sendConfig();
    
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'portacerta_yolo_resolution') sendConfig();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [workerReady, setWorkerConfig]);
  
  const [_usedFallback, setUsedFallback] = useState(false);
  const [debugImage, setDebugImage] = useState<string | null>(null);
  
  const resetOCRState = useCallback(() => {
    setUsedFallback(false);
    setDebugImage(null);
  }, []);
  
  // Estado para modo debug
  const [debugModeEnabled, setDebugModeEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('portacerta_debug_mode') === 'true';
    } catch { return false; }
  });
  
  const setDebugModeEnabledWithPersist = useCallback((enabled: boolean) => {
    setDebugModeEnabled(enabled);
    try {
      localStorage.setItem('portacerta_debug_mode', enabled ? 'true' : 'false');
    } catch { }
  }, []);
  
  // v1.1.50: Estado para forçar modo noturno
  const [forceNightMode, setForceNightMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('portacerta_force_night_mode') === 'true';
    } catch { return false; }
  });
  
  const setForceNightModeWithPersist = useCallback((enabled: boolean) => {
    setForceNightMode(enabled);
    try {
      localStorage.setItem('portacerta_force_night_mode', enabled ? 'true' : 'false');
    } catch { }
  }, []);
  
  // Manter refs sincronizadas com estado
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);
  
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  
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
  
  // v1.1.39: Verificação ATÔMICA
  const checkAndMarkPlate = useCallback((placa: string): boolean => {
    const now = Date.now();
    
    for (const [plate, time] of recentPlatesRef.current.entries()) {
      if (now - time >= COOLDOWN_MS) {
        recentPlatesRef.current.delete(plate);
      }
    }
    
    const lastTime = recentPlatesRef.current.get(placa);
    const wasRecent = lastTime !== undefined && (now - lastTime) < COOLDOWN_MS;
    
    recentPlatesRef.current.set(placa, now);
    
    if (wasRecent) {
      logger.log(`⏳ Anti-Duplicata Atômico: ${placa} detectada há ${((now - lastTime!) / 1000).toFixed(1)}s (cooldown: ${COOLDOWN_MS / 1000}s)`);
    }
    
    return wasRecent;
  }, []);
  
  // v1.1.50: Verificar similaridade visual entre placas
  const arePlatesSimilar = useCallback((plate1: string, plate2: string): boolean => {
    if (plate1.length !== plate2.length) return false;
    if (plate1 === plate2) return true;
    
    const VISUAL_PAIRS: Record<string, string[]> = {
      '0': ['O', 'Q', 'D'],
      'O': ['0', 'Q', 'D', 'U'],
      'U': ['V', 'O', '0'],
      '1': ['I', 'L', 'T', '7', '4'],
      'I': ['1', 'L', 'T', 'J'],
      'J': ['I', '1'],
      '2': ['Z', '7', '9'],
      '9': ['2', '0', 'Q'],
      '7': ['1', '2', 'T'],
      '4': ['A', 'H', '1'],
      '5': ['S', '6'],
      '6': ['G', '8', '5'],
      '8': ['B', '6', '0'],
      'A': ['4', 'H'],
      'B': ['8', '6', 'D'],
      'D': ['0', 'O', 'B'],
      'E': ['F'],
      'G': ['6', 'C'],
      'H': ['4', 'A'],
      'Q': ['0', 'O', '9'],
      'S': ['5'],
      'T': ['1', '7', 'I'],
      'Z': ['2'],
    };
    
    let differences = 0;
    
    for (let i = 0; i < plate1.length; i++) {
      if (plate1[i] === plate2[i]) continue;
      
      const alts = VISUAL_PAIRS[plate1[i]] || [];
      if (alts.includes(plate2[i])) {
        differences++;
      } else {
        differences += 2;
      }
    }
    
    return differences <= 2;
  }, []);

  // Fast-Track: Verificar consistência temporal do buffer OCR
  const checkOcrConsistency = useCallback((plateText: string, confidence: number): { hasConsensus: boolean; matchCount: number; bestPlate: string } => {
    if (confidence < MIN_CONFIDENCE_FOR_BUFFER) {
      logger.log(`⚠️ Fast-Track: Confiança ${(confidence * 100).toFixed(1)}% abaixo do mínimo (${(MIN_CONFIDENCE_FOR_BUFFER * 100).toFixed(0)}%), ignorando leitura`);
      return { hasConsensus: false, matchCount: 0, bestPlate: '' };
    }
    
    if (fastTrackValidatedRef.current && lastValidatedPlateRef.current) {
      if (!arePlatesSimilar(plateText, lastValidatedPlateRef.current)) {
        logger.log(`🔄 Fast-Track: Placa muito diferente detectada (${plateText} != ${lastValidatedPlateRef.current}), resetando buffer para novo veículo`);
        ocrBufferRef.current = [];
        fastTrackValidatedRef.current = false;
      }
    }
    
    ocrBufferRef.current.push({ placa: plateText, confidence, timestamp: Date.now() });
    
    if (ocrBufferRef.current.length > OCR_BUFFER_SIZE) {
      ocrBufferRef.current.shift();
    }
    
    const voteMap = new Map<string, { count: number; totalConf: number; maxConf: number; variants: Set<string>; bestVariant: string; bestVariantConf: number }>();
    
    for (const entry of ocrBufferRef.current) {
      let matchedGroup: string | null = null;
      
      for (const [groupPlate] of voteMap) {
        if (arePlatesSimilar(entry.placa, groupPlate)) {
          matchedGroup = groupPlate;
          break;
        }
      }
      
      const targetGroup = matchedGroup || entry.placa;
      const existing = voteMap.get(targetGroup) || { 
        count: 0, 
        totalConf: 0, 
        maxConf: 0, 
        variants: new Set<string>(),
        bestVariant: entry.placa,
        bestVariantConf: 0
      };
      
      existing.variants.add(entry.placa);
      
      if (entry.confidence > existing.bestVariantConf) {
        existing.bestVariant = entry.placa;
        existing.bestVariantConf = entry.confidence;
      }
      
      voteMap.set(targetGroup, {
        count: existing.count + 1,
        totalConf: existing.totalConf + entry.confidence,
        maxConf: Math.max(existing.maxConf, entry.confidence),
        variants: existing.variants,
        bestVariant: existing.bestVariant,
        bestVariantConf: existing.bestVariantConf
      });
      
      if (matchedGroup && matchedGroup !== entry.placa) {
        console.log(`🔗 Agrupando "${entry.placa}" com "${matchedGroup}" (similar visual)`);
      }
    }
    
    let bestGroupPlate = '';
    let bestScore = 0;
    let bestGroupData: typeof voteMap extends Map<string, infer V> ? V : never = null as any;
    
    for (const [groupPlate, votes] of voteMap) {
      const avgConf = votes.totalConf / votes.count;
      const score = votes.count * avgConf;
      
      const variantsList = [...votes.variants].join(', ');
      console.log(`📊 Grupo ${groupPlate}: ${votes.count}x [${variantsList}], avg=${(avgConf * 100).toFixed(1)}%, best=${votes.bestVariant}@${(votes.bestVariantConf * 100).toFixed(1)}%`);
      
      if (score > bestScore) {
        bestScore = score;
        bestGroupPlate = groupPlate;
        bestGroupData = votes;
      }
    }
    
    const currentBelongsToBestGroup = arePlatesSimilar(plateText, bestGroupPlate);
    const matchCount = bestGroupData?.count || 0;
    const hasConsensus = currentBelongsToBestGroup && matchCount >= CONSISTENCY_THRESHOLD;
    
    const finalBestPlate = hasConsensus ? bestGroupData.bestVariant : plateText;
    
    if (hasConsensus) {
      console.log(`✅ Consenso v1.1.64: Grupo "${bestGroupPlate}" com ${matchCount}x → Melhor variante: "${finalBestPlate}" (${(bestGroupData.bestVariantConf * 100).toFixed(1)}%)`);
    } else {
      logger.log(`🔄 Fast-Track Buffer: "${plateText}" score=${bestScore.toFixed(2)} (consenso=${hasConsensus ? '✅' : '❌'})`);
    }
    
    return { hasConsensus, matchCount, bestPlate: finalBestPlate };
  }, [arePlatesSimilar]);
  
  const resetOcrBuffer = useCallback(() => {
    if (ocrBufferRef.current.length > 0 || fastTrackValidatedRef.current) {
      logger.log('🧹 Fast-Track: Buffer OCR limpo');
    }
    ocrBufferRef.current = [];
    fastTrackValidatedRef.current = false;
    noMotionCounterRef.current = 0;
  }, []);
  
  // Verificar se é morador
  const checkIfMorador = useCallback(async (placa: string): Promise<{ isMorador: boolean; casa?: string; placaCadastrada?: string }> => {
    try {
      const placaLimpa = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      const { data: exactMatch, error } = await supabase
        .from('veiculos_moradores')
        .select('casa, placa_veiculo')
        .eq('placa_veiculo', placaLimpa)
        .maybeSingle();
      
      if (error) throw error;
      
      if (exactMatch) {
        return { isMorador: true, casa: exactMatch.casa, placaCadastrada: exactMatch.placa_veiculo };
      }
      
      const { generateVariations, generateAggressiveVariations } = await import('@/react-app/utils/plateValidator');
      const variacoesSimples = generateVariations(placaLimpa);
      const variacoesAgressivas = generateAggressiveVariations(placaLimpa);
      
      const todasVariacoes = [...new Set([...variacoesSimples, ...variacoesAgressivas])];
      
      console.log(`🔍 Fuzzy: ${placaLimpa} → ${todasVariacoes.length} variações`);
      
      logger.log(`🔍 Buscando morador com ${todasVariacoes.length} variações de "${placaLimpa}"`);
      
      if (todasVariacoes.length > 1) {
        const { data: fuzzyMatch, error: fuzzyError } = await supabase
          .from('veiculos_moradores')
          .select('casa, placa_veiculo')
          .in('placa_veiculo', todasVariacoes)
          .limit(1)
          .maybeSingle();
        
        if (fuzzyError) throw fuzzyError;
        
        if (fuzzyMatch) {
          logger.log(`🔄 Match fuzzy v1.1.38: ${placaLimpa} → ${fuzzyMatch.placa_veiculo} (Casa ${fuzzyMatch.casa})`);
          return { isMorador: true, casa: fuzzyMatch.casa, placaCadastrada: fuzzyMatch.placa_veiculo };
        }
      }
      
      return { isMorador: false };
    } catch (e) {
      logger.error('Erro ao verificar morador:', e);
      return { isMorador: false };
    }
  }, []);
  
  // Verificar se é visitante ativo
  const checkIfVisitanteAtivo = useCallback(async (placa: string): Promise<{ 
    isVisitante: boolean; 
    nome?: string;
    casa?: string;
    placaCadastrada?: string;
  }> => {
    try {
      const placaLimpa = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      const { data: exactMatch, error } = await supabase
        .from('visitantes')
        .select('nome, casa_visitada, placa_veiculo')
        .eq('is_ativo', true)
        .eq('placa_veiculo', placaLimpa)
        .maybeSingle();
      
      if (error) throw error;
      
      if (exactMatch) {
        return { 
          isVisitante: true, 
          nome: exactMatch.nome,
          casa: exactMatch.casa_visitada,
          placaCadastrada: exactMatch.placa_veiculo
        };
      }
      
      const { generateVariations, generateAggressiveVariations } = await import('@/react-app/utils/plateValidator');
      const variacoes = [...new Set([
        ...generateVariations(placaLimpa),
        ...generateAggressiveVariations(placaLimpa)
      ])];
      
      console.log(`🔍 Fuzzy visitante: ${placaLimpa} → ${variacoes.length} variações`);
      
      if (variacoes.length > 1) {
        const { data: fuzzyMatch, error: fuzzyError } = await supabase
          .from('visitantes')
          .select('nome, casa_visitada, placa_veiculo')
          .eq('is_ativo', true)
          .in('placa_veiculo', variacoes)
          .limit(1)
          .maybeSingle();
        
        if (fuzzyError) throw fuzzyError;
        
        if (fuzzyMatch) {
          logger.log(`🔄 Match fuzzy visitante: ${placaLimpa} → ${fuzzyMatch.placa_veiculo} (${fuzzyMatch.nome})`);
          return { 
            isVisitante: true, 
            nome: fuzzyMatch.nome,
            casa: fuzzyMatch.casa_visitada,
            placaCadastrada: fuzzyMatch.placa_veiculo
          };
        }
      }
      
      return { isVisitante: false };
    } catch (e) {
      logger.error('Erro ao verificar visitante:', e);
      return { isVisitante: false };
    }
  }, []);

  const saveDetection = useCallback(async (
    placa: string, 
    isMorador: boolean, 
    casa: string | undefined,
    confidence: number,
    fonteDeteccao: 'local' | 'api',
    isVisitante?: boolean,
    nomeVisitante?: string
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
          is_visitante: isVisitante || false,
          nome_visitante: nomeVisitante || null,
        });
      
      if (error) throw error;
      logger.log('✅ Detecção salva:', placa, `(${fonteDeteccao})`, isVisitante ? `Visitante: ${nomeVisitante}` : '');
    } catch (e) {
      logger.error('Erro ao salvar detecção:', e);
    }
  }, []);
  
  const processFrameForOCR = useCallback(async (): Promise<boolean> => {
    if (!videoRef.current || statusRef.current !== 'monitoring' && statusRef.current !== 'motion_detected') return false;
    if (!workerReady) return false;
    
    // Fast-Track: Se já validou, verificar timeout
    if (fastTrackValidatedRef.current) {
      const timeSinceValidation = Date.now() - lastValidationTimeRef.current;
      
      if (timeSinceValidation >= VALIDATION_TIMEOUT_MS) {
        logger.log(`⏱️ Fast-Track: Timeout ${VALIDATION_TIMEOUT_MS/1000}s - permitindo novo veículo`);
        resetOcrBuffer();
      } else {
        return true;
      }
    }
    
    setStatus('processing');
    setStatusMessage('🔍 Reconhecendo placa...');
    
    startProcessingTimer();
    
    try {
      updateProcessingStage('capturing', 'Capturando frame...');
      // v1.7.2: Smart Crop — usar bounding box do veículo se disponível
      const vbb = vehicleBBoxRef.current;
      let capturedCanvas: HTMLCanvasElement;

      if (vbb) {
        capturedCanvas = cropVehicleRegion(videoRef.current, vbb, 0.15);
      } else {
        capturedCanvas = captureAreaFromVideo(videoRef.current, virtualArea);
      }
      
      updateProcessingStage('ocr', 'Executando OCR no Worker...');
      const result = await processPlateWorker(capturedCanvas, { 
        enableDebug: debugModeEnabled,
        forceNightMode,
      });
      
      if (!result) {
        finishProcessingTimer();
        setStatusMessage('❌ Erro no processamento');
        setStatus('monitoring');
        return false;
      }
      
      setUsedFallback(result.usedFallback || false);
      if (result.debugImage) {
        setDebugImage(result.debugImage);
      }
      
      setProcessingInfo(prev => ({
        ...prev,
        rawText: result.rawText || '',
        ocrConfidence: result.ocrConfidence || 0,
        plateRegion: result.plateRegion,
        usedYolo: result.usedYolo,
        detectedPlate: result.validation?.isValid ? result.validation.formatted : undefined,
        debugImages: result.debugImages,
      }));
      
      setTimeout(() => {
        setProcessingInfo(prev => ({
          ...prev,
          plateRegion: undefined,
          detectedPlate: undefined,
        }));
      }, 3000);
      
      updateProcessingStage('validating', 'Validando placa...');
      
      if (result.success && result.validation.isValid) {
        const placa = result.validation.corrected;
        const confidence = result.validation.confidence;
        
        const { hasConsensus, matchCount, bestPlate } = checkOcrConsistency(placa, confidence);
        
        if (!hasConsensus) {
          finishProcessingTimer();
          setStatus('monitoring');
          setStatusMessage(`🔄 Leituras: ${matchCount}/${CONSISTENCY_THRESHOLD}`);
          return false;
        }
        
        const placaConfirmada = bestPlate || placa;
        
        logger.log(`🚀 Fast-Track: Placa ${placaConfirmada} validada por consistência (${matchCount}/${OCR_BUFFER_SIZE})`);
        
        const isSamePlate = lastValidatedPlateRef.current && arePlatesSimilar(placaConfirmada, lastValidatedPlateRef.current);
        if (isSamePlate) {
          const timeSinceLastValidation = Date.now() - lastValidationTimeRef.current;
          
          if (timeSinceLastValidation < MIN_REDETECTION_INTERVAL) {
            logger.log(`🔁 Fast-Track: Mesma placa ${placaConfirmada} detectada após ${(timeSinceLastValidation/1000).toFixed(1)}s - ignorando (mín: ${MIN_REDETECTION_INTERVAL/1000}s)`);
            finishProcessingTimer();
            setStatus('monitoring');
            setStatusMessage('🟢 Monitorando...');
            return true;
          }
        }
        
        fastTrackValidatedRef.current = true;
        lastValidationTimeRef.current = Date.now();
        lastValidatedPlateRef.current = placaConfirmada;
        
        const wasAlreadyDetected = checkAndMarkPlate(placaConfirmada);
        if (wasAlreadyDetected) {
          logger.log(`⏳ Placa ${placaConfirmada} detectada recentemente (anti-duplicata atômico), ignorando...`);
          finishProcessingTimer();
          setStatus('monitoring');
          setStatusMessage('🟢 Monitorando...');
          return true;
        }
        
        // Beam Search BATCH
        let isMorador = false;
        let casa: string | undefined;
        let placaCadastrada: string | undefined;
        let isVisitante = false;
        let nomeVisitante: string | undefined;
        let casaFinal: string | undefined;
        
        const { generateVariations, generateAggressiveVariations } = await import('@/react-app/utils/plateValidator');
        const allCandidatePlates = [placaConfirmada];
        
        if (result.candidates && result.candidates.length > 1) {
          for (const c of result.candidates) {
            if (c.text !== placaConfirmada) allCandidatePlates.push(c.text);
          }
        }
        
        const allVariations = new Set<string>();
        for (const candidatePlate of allCandidatePlates) {
          const clean = candidatePlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
          allVariations.add(clean);
          for (const v of generateVariations(clean)) allVariations.add(v);
          for (const v of generateAggressiveVariations(clean)) allVariations.add(v);
        }
        
        const variacoesArray = [...allVariations];
        console.log(`🔍 Batch Beam: ${allCandidatePlates.length} candidatos → ${variacoesArray.length} variações únicas`);
        
        const { data: moradorMatch, error: moradorErr } = await supabase
          .from('veiculos_moradores')
          .select('casa, placa_veiculo')
          .in('placa_veiculo', variacoesArray)
          .limit(1)
          .maybeSingle();
        
        if (!moradorErr && moradorMatch) {
          isMorador = true;
          casa = moradorMatch.casa;
          placaCadastrada = moradorMatch.placa_veiculo;
          console.log(`🎯 Batch Match morador: ${moradorMatch.placa_veiculo} (Casa ${casa})`);
        }
        
        casaFinal = casa;
        let placaFinal = placaCadastrada || placaConfirmada;
        
        if (!isMorador) {
          const { data: visitanteMatch, error: visitanteErr } = await supabase
            .from('visitantes')
            .select('nome, casa_visitada, placa_veiculo')
            .eq('is_ativo', true)
            .in('placa_veiculo', variacoesArray)
            .limit(1)
            .maybeSingle();
          
          if (!visitanteErr && visitanteMatch) {
            isVisitante = true;
            nomeVisitante = visitanteMatch.nome;
            casaFinal = visitanteMatch.casa_visitada;
            placaFinal = visitanteMatch.placa_veiculo;
            console.log(`🎯 Batch Match visitante: ${visitanteMatch.placa_veiculo} (${nomeVisitante})`);
          }
        }
        
        // Atualizar status_presenca do morador
        if (isMorador && placaCadastrada) {
          supabase
            .from('veiculos_moradores')
            .update({ status_presenca: 'presente', ultima_movimentacao: new Date().toISOString() })
            .eq('placa_veiculo', placaCadastrada)
            .then(({ error: updateErr }) => {
              if (updateErr) console.error('Erro ao atualizar status_presenca:', updateErr);
              else console.log(`📍 Status presença atualizado: ${placaCadastrada} → presente`);
            });
        }
        
        const fallbackUsed = result.usedFallback || false;
        const fonteDeteccao = fallbackUsed ? 'api' : 'local';
        const detection: Detection = {
          placa: placaFinal,
          timestamp: new Date().toISOString(),
          isMorador,
          isVisitante,
          nomeVisitante,
          casa: casaFinal,
          confidence: result.validation.confidence,
          usedFallback: fallbackUsed,
          fonteDeteccao,
        };
        
        setLastDetection(detection);
        setRecentDetections(prev => [detection, ...prev.slice(0, 9)]);
        
        await saveDetection(placaFinal, isMorador, casaFinal, result.validation.confidence, fonteDeteccao, isVisitante, nomeVisitante);
        
        finishProcessingTimer();
        
        if (isMorador) {
          setStatusMessage(`✅ ${placaFinal} - Casa ${casa}`);
        } else if (isVisitante) {
          const primeiroNome = nomeVisitante?.split(' ')[0] || 'Visitante';
          setStatusMessage(`🧑 ${primeiroNome} - Casa ${casaFinal}`);
        } else {
          setStatusMessage(`⚠️ ${placaConfirmada}`);
        }
        
        return true;
      } else {
        finishProcessingTimer();
        setStatusMessage('❌ Não reconhecida');
        setStatus('monitoring');
        return false;
      }
    } catch (e) {
      console.error('Erro ao processar OCR:', e);
      finishProcessingTimer();
      setStatusMessage('❌ Erro OCR');
      setStatus('monitoring');
      return false;
    }
  }, [
    virtualArea, 
    workerReady,
    processPlateWorker, 
    checkAndMarkPlate,
    checkIfMorador, 
    checkIfVisitanteAtivo,
    saveDetection, 
    startProcessingTimer,
    updateProcessingStage,
    finishProcessingTimer,
    debugModeEnabled,
    checkOcrConsistency,
    resetOcrBuffer,
    arePlatesSimilar,
    forceNightMode,
  ]);
  
  // Leitura manual instantânea
  const manualCapture = useCallback(async (): Promise<boolean> => {
    if (!videoRef.current) {
      setStatusMessage('⚠️ Câmera não disponível');
      return false;
    }
    
    if (!workerReady) {
      setStatusMessage('⚠️ Worker não está pronto');
      return false;
    }
    
    setStatus('processing');
    setStatusMessage('📷 Leitura manual em progresso...');
    startProcessingTimer();
    
    try {
      updateProcessingStage('capturing', 'Capturando frame...');
      
      // v1.4.0: Usar captureAreaFromVideo standalone
      const capturedCanvas = captureAreaFromVideo(
        videoRef.current,
        virtualArea
      );
      
      updateProcessingStage('ocr', 'Executando OCR no Worker...');
      const result = await processPlateWorker(capturedCanvas, { 
        enableDebug: debugModeEnabled,
        forceNightMode,
      });
      
      if (!result) {
        finishProcessingTimer();
        setStatusMessage('❌ Erro no processamento');
        setStatus(isActive ? 'monitoring' : 'idle');
        return false;
      }
      
      setUsedFallback(result.usedFallback || false);
      if (result.debugImage) {
        setDebugImage(result.debugImage);
      }
      
      setProcessingInfo(prev => ({
        ...prev,
        rawText: result.rawText || '',
        ocrConfidence: result.ocrConfidence || 0,
        plateRegion: result.plateRegion,
        usedYolo: result.usedYolo,
        detectedPlate: result.validation?.isValid ? result.validation.formatted : undefined,
        debugImages: result.debugImages,
      }));
      
      updateProcessingStage('validating', 'Validando placa...');
      
      if (result.success && result.validation.isValid) {
        const placa = result.validation.corrected;
        
        if (isPlateRecent(placa)) {
          console.log(`⏳ Placa ${placa} detectada recentemente, ignorando duplicata...`);
          finishProcessingTimer();
          setStatus(isActive ? 'monitoring' : 'idle');
          setStatusMessage(`⏳ ${placa} já detectada recentemente`);
          setTimeout(() => {
            setStatusMessage(isActive ? '🟢 Monitorando...' : 'Parado');
          }, 2000);
          return true;
        }
        
        markPlateDetected(placa);
        
        const { isMorador, casa } = await checkIfMorador(placa);
        
        let isVisitante = false;
        let nomeVisitante: string | undefined;
        let casaFinal = casa;
        
        if (!isMorador) {
          const visitanteResult = await checkIfVisitanteAtivo(placa);
          if (visitanteResult.isVisitante) {
            isVisitante = true;
            nomeVisitante = visitanteResult.nome;
            casaFinal = visitanteResult.casa;
          }
        }
        
        const fallbackUsed = result.usedFallback || false;
        const fonteDeteccao = fallbackUsed ? 'api' : 'local';
        const detection: Detection = {
          placa,
          timestamp: new Date().toISOString(),
          isMorador,
          isVisitante,
          nomeVisitante,
          casa: casaFinal,
          confidence: result.validation.confidence,
          usedFallback: fallbackUsed,
          fonteDeteccao,
        };
        
        setLastDetection(detection);
        setRecentDetections(prev => [detection, ...prev.slice(0, 9)]);
        
        await saveDetection(placa, isMorador, casaFinal, result.validation.confidence, fonteDeteccao, isVisitante, nomeVisitante);
        
        finishProcessingTimer();
        
        if (isMorador) {
          setStatusMessage(`✅ ${placa} - Casa ${casa}`);
        } else if (isVisitante) {
          const primeiroNome = nomeVisitante?.split(' ')[0] || 'Visitante';
          setStatusMessage(`🧑 ${primeiroNome} - Casa ${casaFinal}`);
        } else {
          setStatusMessage(`⚠️ ${placa}`);
        }
        
        setTimeout(() => {
          if (isActiveRef.current) {
            setStatus('monitoring');
          }
        }, 2000);
        
        return true;
      } else {
        finishProcessingTimer();
        setStatusMessage('❌ Não reconhecida');
        
        setTimeout(() => {
          if (isActiveRef.current) {
            setStatus('monitoring');
            setStatusMessage('🟢 Monitorando...');
          } else {
            setStatus('idle');
            setStatusMessage('Parado');
          }
        }, 2000);
        
        return false;
      }
    } catch (e) {
      console.error('Erro na leitura manual:', e);
      finishProcessingTimer();
      setStatusMessage('❌ Erro no processamento');
      setStatus(isActive ? 'monitoring' : 'idle');
      return false;
    }
  }, [
    isActive,
    virtualArea, 
    workerReady,
    processPlateWorker, 
    isPlateRecent, 
    markPlateDetected, 
    checkIfMorador, 
    checkIfVisitanteAtivo,
    saveDetection, 
    startProcessingTimer,
    updateProcessingStage,
    finishProcessingTimer,
    debugModeEnabled,
    forceNightMode,
  ]);
  
  // ========== v1.4.0: Vehicle Detection Loop (replaces MotionDetector) ==========
  const vehicleDetectionTick = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    if (!isActiveRef.current) return;
    
    // Record frame for performance metrics
    recordFrameStart();
    
    const allDetections = detectObjects(video, performance.now());
    const vehicles = filterByCategories(allDetections, VEHICLE_CATEGORIES);
    
    recordFrameEnd();
    
    // Check if any vehicle center is in the virtual area
    const areaPoints = getPolygonPoints(virtualArea);
    const vehiclesInArea = areaPoints.length >= 3
      ? vehicles.filter(v => isPointInPolygon(v.centerX, v.centerY, areaPoints))
      : [];
    
    const hasVehicle = vehiclesInArea.length > 0;
    
    setVehicleDetected(hasVehicle);
    const bestVehicle = hasVehicle ? vehiclesInArea[0] : null;
    setVehicleBBox(bestVehicle);
    vehicleBBoxRef.current = bestVehicle;
    
    if (hasVehicle) {
      noMotionCounterRef.current = 0;
      
      const currentStatus = statusRef.current;
      if (currentStatus === 'monitoring') {
        setStatus('motion_detected');
        setStatusMessage('🚗 Veículo detectado...');
        setProcessingInfo(prev => ({
          ...prev,
          stage: 'idle',
          stageLabel: 'Veículo detectado!',
        }));
      }
      
      // Trigger OCR if not already in progress
      const now = Date.now();
      const timeSinceLastOcr = now - lastOcrAttemptTimeRef.current;
      
      if (!isOcrInProgressRef.current && timeSinceLastOcr >= OCR_RETRY_DELAY_MS && workerReady) {
        isOcrInProgressRef.current = true;
        lastOcrAttemptTimeRef.current = now;
        
        const ocrStart = performance.now();
        processFrameForOCR().then((success) => {
          recordOcrTime(performance.now() - ocrStart);
          isOcrInProgressRef.current = false;
          
          setTimeout(() => {
            if (isActiveRef.current) {
              setStatus('monitoring');
              setStatusMessage(success ? '🟢 Monitorando...' : '🟡 Aguardando re-tentativa...');
            }
          }, 2000);
        }).catch(() => {
          isOcrInProgressRef.current = false;
        });
      }
    } else {
      noMotionCounterRef.current++;
      
      // After 3 ticks (~1s) without vehicle, reset OCR buffer
      if (noMotionCounterRef.current >= 3 && statusRef.current === 'motion_detected') {
        resetOcrBuffer();
        setStatus('monitoring');
        setStatusMessage('🟢 Monitorando...');
        setProcessingInfo(prev => ({
          ...prev,
          stage: 'idle',
          stageLabel: 'Monitorando área...',
        }));
      }
    }
  }, [virtualArea, workerReady, processFrameForOCR, recordFrameStart, recordFrameEnd, recordOcrTime, resetOcrBuffer]);
  
  // Start/stop vehicle detection loop when monitoring is active
  useEffect(() => {
    if (isActive && mediapipeReady && (status === 'monitoring' || status === 'motion_detected')) {
      vehicleDetectionIntervalRef.current = window.setInterval(vehicleDetectionTick, VEHICLE_DETECTION_INTERVAL_MS);
    }
    
    return () => {
      if (vehicleDetectionIntervalRef.current) {
        clearInterval(vehicleDetectionIntervalRef.current);
        vehicleDetectionIntervalRef.current = null;
      }
    };
  }, [isActive, mediapipeReady, status, vehicleDetectionTick]);
  
  // Initialize MediaPipe when monitoring starts
  const initMediaPipe = useCallback(async () => {
    if (mediapipeReady || mediapipeLoading) return;
    
    setMediapipeLoading(true);
    try {
      await initObjectDetector();
      setMediapipeReady(true);
      console.log('✅ MediaPipe ObjectDetector pronto para detecção de veículos');
    } catch (err) {
      console.error('❌ Falha ao inicializar MediaPipe:', err);
      setMediapipeReady(false);
    } finally {
      setMediapipeLoading(false);
    }
  }, [mediapipeReady, mediapipeLoading]);
  
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
      
      recentPlatesRef.current.clear();
      resetOCRState();
      resetOcrBuffer();
      
      processingTimesRef.current = [];
      setProcessingInfo({
        stage: 'idle',
        stageLabel: 'Inicializando MediaPipe...',
        currentTimeMs: 0,
        lastOcrTimeMs: 0,
        avgTimeMs: 0,
      });
      
      setIsActive(true);
      setStatus('monitoring');
      setStatusMessage('🧠 Carregando detector de veículos...');
      
      // Initialize MediaPipe for vehicle detection
      await initMediaPipe();
      
      setStatusMessage('🟢 Monitorando...');
      setProcessingInfo(prev => ({
        ...prev,
        stageLabel: 'Monitorando área...',
      }));
      
    } catch (e) {
      logger.error('Erro ao iniciar câmera:', e);
      setStatus('error');
      setStatusMessage('❌ Erro ao acessar câmera');
    }
  }, [selectedCamera, selectedResolution, resetOCRState, resetOcrBuffer, initMediaPipe]);
  
  const stopMonitoring = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = '';
    }
    
    if (vehicleDetectionIntervalRef.current) {
      clearInterval(vehicleDetectionIntervalRef.current);
      vehicleDetectionIntervalRef.current = null;
    }
    
    setVehicleDetected(false);
    setVehicleBBox(null);
    setIsActive(false);
    setStatus('idle');
    setStatusMessage('Parado');
    setVehicleDetected(false);
    setHlsStatus('idle');
    setWebRTCStatus('idle');
    setActiveProtocol('none');
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
      
      recentPlatesRef.current.clear();
      resetOCRState();
      resetOcrBuffer();
      
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
          manifestLoadingMaxRetry: 2,
          levelLoadingMaxRetry: 2,
          fragLoadingMaxRetry: 2,
        });
        
        hlsRef.current = hls;
        
        hls.loadSource(hlsUrl);
        hls.attachMedia(videoRef.current!);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoRef.current?.play();
        });
        
        let hlsErrorCount = 0;
        let hlsDestroyed = false;
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (hlsDestroyed) return;
          logger.error('❌ HLS Error:', data);
          if (data.fatal) {
            hlsDestroyed = true;
            hls.stopLoad();
            hls.destroy();
            hlsRef.current = null;
            setHlsStatus('error');
            setStatus('error');
            setStatusMessage(`❌ Erro no stream: ${data.type}`);
          } else {
            hlsErrorCount++;
            if (hlsErrorCount >= 3) {
              hlsDestroyed = true;
              logger.warn('⚠️ HLS: muitos erros non-fatal, destruindo');
              hls.stopLoad();
              hls.destroy();
              hlsRef.current = null;
              setHlsStatus('error');
              setStatus('error');
              setStatusMessage('❌ Stream HLS instável');
            }
          }
        });
        
        videoRef.current!.onplaying = async () => {
          setHlsStatus('connected');
          setIsActive(true);
          setStatus('monitoring');
          setStatusMessage('🧠 Carregando detector de veículos...');
          
          await initMediaPipe();
          
          setStatusMessage('🟢 Monitorando stream...');
          setProcessingInfo(prev => ({
            ...prev,
            stageLabel: 'Monitorando área...',
          }));
        };
        
      } else if (videoRef.current?.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = hlsUrl;
        videoRef.current.addEventListener('loadedmetadata', async () => {
          videoRef.current?.play();
          setHlsStatus('connected');
          setIsActive(true);
          setStatus('monitoring');
          await initMediaPipe();
          setStatusMessage('🟢 Monitorando stream...');
        });
      }
      
    } catch (e) {
      logger.error('Erro ao iniciar HLS:', e);
      setStatus('error');
      setHlsStatus('error');
      setStatusMessage(`❌ ${e instanceof Error ? e.message : 'Erro ao conectar'}`);
    }
  }, [hlsUrl, stopMonitoring, resetOCRState, resetOcrBuffer, initMediaPipe]);
  
  // ========== WebRTC via go2rtc ==========
  const connectWebRTC = useCallback(async (url: string): Promise<MediaStream> => {
    const pc = new RTCPeerConnection({
      iceServers: []
    });
    
    peerConnectionRef.current = pc;
    
    pc.addTransceiver('video', { direction: 'recvonly' });
    
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'offer',
        sdp: offer.sdp,
      }),
    });
    
    if (!res.ok) throw new Error(`WebRTC ${res.status}`);
    
    const answerData = await res.json();
    await pc.setRemoteDescription({
      type: 'answer',
      sdp: answerData.sdp || answerData,
    });
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pc.close();
        reject(new Error('WebRTC timeout (5s)'));
      }, 5000);
      
      pc.ontrack = (e) => {
        clearTimeout(timeout);
        resolve(e.streams[0]);
      };
      
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          clearTimeout(timeout);
          reject(new Error(`WebRTC connection ${pc.connectionState}`));
        }
      };
    });
  }, []);
  
  const normalizeStreamUrl = useCallback((url: string): string => {
    try {
      const u = new URL(url);
      if (u.pathname.includes('stream.html')) {
        u.pathname = '/api/webrtc';
        return u.toString();
      }
      return url;
    } catch {
      return url;
    }
  }, []);
  
  const deriveHlsFromWebRTC = useCallback((webrtcUrl: string): string => {
    try {
      const u = new URL(webrtcUrl);
      const srcParam = u.searchParams.get('src') || 'camera1';
      u.pathname = '/api/stream.m3u8';
      u.search = `?src=${srcParam}`;
      return u.toString();
    } catch {
      return webrtcUrl.replace(/\/api\/webrtc/, '/api/stream.m3u8');
    }
  }, []);
  
  const detectProtocol = useCallback((url: string): 'webrtc' | 'hls' => {
    if (url.includes('.m3u8')) return 'hls';
    return 'webrtc';
  }, []);
  
  const startMonitoringStream = useCallback(async () => {
    if (!hlsUrl) {
      setStatus('error');
      setStatusMessage('❌ URL do stream não configurada');
      return;
    }
    
    const protocol = detectProtocol(hlsUrl);
    const normalizedUrl = normalizeStreamUrl(hlsUrl);
    
    if (protocol === 'hls') {
      await startMonitoringHLS();
      setActiveProtocol('hls');
      return;
    }
    
    // Tentar WebRTC primeiro
    try {
      setStatus('starting');
      setStatusMessage('Conectando via WebRTC...');
      setWebRTCStatus('connecting');
      
      stopMonitoring();
      
      recentPlatesRef.current.clear();
      resetOCRState();
      resetOcrBuffer();
      
      processingTimesRef.current = [];
      setProcessingInfo({
        stage: 'idle',
        stageLabel: 'Conectando WebRTC...',
        currentTimeMs: 0,
        lastOcrTimeMs: 0,
        avgTimeMs: 0,
      });
      
      const stream = await connectWebRTC(normalizedUrl);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      streamRef.current = stream;
      setWebRTCStatus('connected');
      setActiveProtocol('webrtc');
      setIsActive(true);
      setStatus('monitoring');
      setStatusMessage('🧠 Carregando detector de veículos...');
      
      logger.log('✅ WebRTC conectado com sucesso (~200ms latência)');
      webrtcRetryCountRef.current = 0;
      
      // Monitorar conexão WebRTC
      if (peerConnectionRef.current) {
        peerConnectionRef.current.onconnectionstatechange = () => {
          const state = peerConnectionRef.current?.connectionState;
          if (state === 'disconnected' || state === 'failed') {
            logger.warn(`⚠️ WebRTC ${state} - reconectando...`);
            setStatusMessage(`⚠️ Conexão perdida, reconectando...`);
            setWebRTCStatus('connecting');
            
            if (peerConnectionRef.current) {
              peerConnectionRef.current.onconnectionstatechange = null;
              peerConnectionRef.current.close();
              peerConnectionRef.current = null;
            }
            
            webrtcRetryCountRef.current += 1;
            if (webrtcRetryCountRef.current > MAX_WEBRTC_RETRIES) {
              logger.error('❌ WebRTC: máximo de tentativas excedido');
              setStatusMessage('❌ Conexão perdida permanentemente');
              setWebRTCStatus('error');
              setStatus('error');
              return;
            }
            
            const delay = webrtcRetryCountRef.current * 3000;
            logger.log(`🔄 Reconectando em ${delay / 1000}s (tentativa ${webrtcRetryCountRef.current}/${MAX_WEBRTC_RETRIES})...`);
            
            setTimeout(() => {
              if (isActiveRef.current) {
                startMonitoringStream();
              }
            }, delay);
          }
        };
      }
      
      // Initialize MediaPipe for vehicle detection
      await initMediaPipe();
      
      setStatusMessage('🟢 Monitorando (WebRTC)...');
      setProcessingInfo(prev => ({
        ...prev,
        stageLabel: 'Monitorando área...',
      }));
      
    } catch (e) {
      logger.warn('⚠️ WebRTC falhou, tentando fallback HLS:', e);
      setWebRTCStatus('fallback_hls');
      
      const hlsFallbackUrl = deriveHlsFromWebRTC(normalizedUrl);
      logger.log(`🔄 Fallback HLS: ${hlsFallbackUrl}`);
      
      try {
        if (!videoRef.current) throw new Error('Elemento de vídeo não disponível');
        
        stopMonitoring();
        recentPlatesRef.current.clear();
        resetOCRState();
        resetOcrBuffer();
        
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 30,
            manifestLoadingMaxRetry: 2,
            levelLoadingMaxRetry: 2,
            fragLoadingMaxRetry: 2,
          });
          
          hlsRef.current = hls;
          hls.loadSource(hlsFallbackUrl);
          hls.attachMedia(videoRef.current);
          
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoRef.current?.play();
          });
          
          let hlsFallbackErrorCount = 0;
          let hlsFallbackDestroyed = false;
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (hlsFallbackDestroyed) return;
            logger.error('❌ HLS Fallback Error:', data);
            if (data.fatal) {
              hlsFallbackDestroyed = true;
              hls.stopLoad();
              hls.destroy();
              hlsRef.current = null;
              setHlsStatus('error');
              setStatus('error');
              setStatusMessage('❌ WebRTC e HLS falharam');
            } else {
              hlsFallbackErrorCount++;
              if (hlsFallbackErrorCount >= 3) {
                hlsFallbackDestroyed = true;
                logger.warn('⚠️ HLS Fallback: muitos erros non-fatal, destruindo');
                hls.stopLoad();
                hls.destroy();
                hlsRef.current = null;
                setHlsStatus('error');
                setStatus('error');
                setStatusMessage('❌ Stream HLS instável');
              }
            }
          });
          
          videoRef.current.onplaying = async () => {
            setHlsStatus('connected');
            setIsActive(true);
            setStatus('monitoring');
            
            await initMediaPipe();
            
            setStatusMessage('🟢 Monitorando (HLS fallback)...');
          };
        } else {
          throw new Error('Navegador não suporta HLS');
        }
        
        setActiveProtocol('hls');
        logger.log('✅ Fallback HLS conectado');
      } catch (hlsErr) {
        logger.error('❌ Fallback HLS também falhou:', hlsErr);
        setWebRTCStatus('error');
        setStatus('error');
        setStatusMessage('❌ WebRTC e HLS falharam');
      }
    }
  }, [hlsUrl, detectProtocol, normalizeStreamUrl, startMonitoringHLS, stopMonitoring, connectWebRTC, deriveHlsFromWebRTC, resetOCRState, resetOcrBuffer, initMediaPipe]);
  
  // Reconectar stream quando elemento de vídeo muda
  const reconnectStream = useCallback(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    const hls = hlsRef.current;
    
    if (!video || !isActive) return;
    
    if ((sourceMode === 'webcam' || activeProtocol === 'webrtc') && stream) {
      if (video.srcObject !== stream) {
        logger.log('🔄 Reconectando stream ao elemento de vídeo...');
        video.srcObject = stream;
        video.play().catch(e => logger.warn('Erro ao reproduzir vídeo:', e));
      }
    }
    
    if ((sourceMode === 'hls' || activeProtocol === 'hls') && hls) {
      if (hls.media !== video) {
        logger.log('🔄 Reconectando HLS ao elemento de vídeo...');
        hls.attachMedia(video);
        video.play().catch(e => logger.warn('Erro ao reproduzir vídeo HLS:', e));
      }
    }
  }, [isActive, sourceMode, activeProtocol]);
  
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
    vehicleDetected,
    vehicleBBox,
    processingInfo,
    debugImage,
    debugModeEnabled,
    setDebugModeEnabled: setDebugModeEnabledWithPersist,
    forceNightMode,
    setForceNightMode: setForceNightModeWithPersist,
    // Performance
    performanceMetrics,
    workerReady,
    modelLoaded,
    modelLoading,
    yoloBackend,
    // MediaPipe
    mediapipeLoading,
    mediapipeReady,
    // Câmera
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
    webrtcStatus,
    activeProtocol,
    videoRef,
    canvasRef,
    startMonitoring,
    startMonitoringHLS,
    startMonitoringStream,
    stopMonitoring,
    updateVirtualArea,
    reconnectStream,
    manualCapture,
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
    throw new Error('useMonitoring deve ser usado dentro de MonitoringProvider');
  }
  return context;
}
