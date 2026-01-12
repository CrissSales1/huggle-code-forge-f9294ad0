/**
 * Contexto global para monitoramento contínuo
 * Mantém o estado de monitoramento mesmo quando navega entre páginas
 * Usa Web Worker para processamento pesado (OCR, detecção) em background
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import Hls from 'hls.js';
import { supabase } from '@/integrations/supabase/client';
import { usePlateWorker } from '@/react-app/hooks/usePlateWorker';
import { usePerformanceMetrics, PerformanceMetrics } from '@/react-app/hooks/usePerformanceMetrics';
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
  debugImage?: string; // Data URL da imagem de debug com região detectada
  rawText?: string; // Texto bruto lido pelo OCR (para diagnóstico)
  ocrConfidence?: number; // Confiança do OCR (0-1)
  usedYolo?: boolean; // Se usou YOLO ou heurística
  // Bounding box da placa detectada (para overlay visual em tempo real)
  plateRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  };
  detectedPlate?: string; // Texto da placa formatada para exibir no overlay
  // Múltiplas imagens de debug do pipeline de processamento
  debugImages?: {
    original?: string;      // Frame original completo
    cropped?: string;       // Região recortada (antes do upscale)
    preprocessed?: string;  // Após pré-processamento
    final?: string;         // Resultado final com bounding box
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
  motionPercent: number;
  processingInfo: ProcessingInfo;
  hasReference: boolean;
  debugImage: string | null; // Imagem de debug com região da placa detectada
  debugModeEnabled: boolean;
  setDebugModeEnabled: (enabled: boolean) => void;
  
  // Performance
  performanceMetrics: PerformanceMetrics;
  workerReady: boolean;
  modelLoaded: boolean;
  modelLoading: boolean;
  
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
  manualCapture: () => Promise<boolean>;
}

const MonitoringContext = createContext<MonitoringContextType | null>(null);

// v1.1.38: Cooldown aumentado para evitar detecções duplicadas
const COOLDOWN_MS = 15000;  // 15 segundos - maior que VALIDATION_TIMEOUT_MS (8s)
const FRAME_INTERVAL_MS = 350;

// Fast-Track: Constantes de Consistência Temporal
const CONSISTENCY_THRESHOLD = 3;       // Precisa de 3 leituras iguais para validar
const OCR_BUFFER_SIZE = 5;             // Janela deslizante de últimas 5 leituras
const MIN_CONFIDENCE_FOR_BUFFER = 0.70;  // Confiança mínima 70% (escala 0-1 do Worker)

// v1.1.38: Intervalo mínimo de re-detecção da mesma placa (evita duplicatas)
const MIN_REDETECTION_INTERVAL = 30000; // 30 segundos mínimo entre mesma placa

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
  
  // Fast-Track v1.1.29: Buffer de consistência temporal para OCR + Auto-Reset
  const ocrBufferRef = useRef<Array<{ placa: string; confidence: number; timestamp: number }>>([]);
  const fastTrackValidatedRef = useRef<boolean>(false);
  const noMotionCounterRef = useRef<number>(0); // Contador de frames sem movimento
  const lastValidationTimeRef = useRef<number>(0);        // Timestamp da última validação
  const lastValidatedPlateRef = useRef<string>('');       // Placa que foi validada
  const VALIDATION_TIMEOUT_MS = 8000;                      // 8 segundos para reset automático
  
  // Hooks para processamento em background e métricas de performance
  const { 
    isReady: workerReady, 
    isProcessing: workerProcessing,
    error: workerError,
    modelLoaded,
    modelLoading,
    modelFailed,
    processPlate: processPlateWorker,
    loadYoloModel,
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
  
  // Carregar modelo YOLO quando monitoramento iniciar (apenas uma vez)
  useEffect(() => {
    if (isActive && workerReady && !modelLoaded && !modelLoading && !modelFailed) {
      logger.log('🧠 Tentando carregar modelo YOLO...');
      loadYoloModel();
    }
  }, [isActive, workerReady, modelLoaded, modelLoading, modelFailed, loadYoloModel]);
  
  const [_usedFallback, setUsedFallback] = useState(false);
  const [debugImage, setDebugImage] = useState<string | null>(null);
  
  // Função para resetar estado de OCR
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
  
  // Persistir modo debug
  const setDebugModeEnabledWithPersist = useCallback((enabled: boolean) => {
    setDebugModeEnabled(enabled);
    try {
      localStorage.setItem('portacerta_debug_mode', enabled ? 'true' : 'false');
    } catch { }
  }, []);
  
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
  
  // v1.1.39: Verificação ATÔMICA - check E mark em uma única operação
  // Isso resolve a race condition onde duas validações podiam passar ao mesmo tempo
  const checkAndMarkPlate = useCallback((placa: string): boolean => {
    const now = Date.now();
    
    // Limpar placas antigas primeiro
    for (const [plate, time] of recentPlatesRef.current.entries()) {
      if (now - time >= COOLDOWN_MS) {
        recentPlatesRef.current.delete(plate);
      }
    }
    
    // Verificar se já existe (ANTES de marcar)
    const lastTime = recentPlatesRef.current.get(placa);
    const wasRecent = lastTime !== undefined && (now - lastTime) < COOLDOWN_MS;
    
    // SEMPRE marcar (atualizar timestamp) - isso é a parte "atômica"
    recentPlatesRef.current.set(placa, now);
    
    if (wasRecent) {
      logger.log(`⏳ Anti-Duplicata Atômico: ${placa} detectada há ${((now - lastTime!) / 1000).toFixed(1)}s (cooldown: ${COOLDOWN_MS / 1000}s)`);
    }
    
    return wasRecent;
  }, []);
  
  // Fast-Track: Verificar consistência temporal do buffer OCR
  // v1.1.37: VOTAÇÃO PONDERADA POR CONFIANÇA
  const checkOcrConsistency = useCallback((plateText: string, confidence: number): { hasConsensus: boolean; matchCount: number } => {
    // Só aceita leituras com confiança mínima para o buffer
    if (confidence < MIN_CONFIDENCE_FOR_BUFFER) {
      logger.log(`⚠️ Fast-Track: Confiança ${(confidence * 100).toFixed(1)}% abaixo do mínimo (${(MIN_CONFIDENCE_FOR_BUFFER * 100).toFixed(0)}%), ignorando leitura`);
      return { hasConsensus: false, matchCount: 0 };
    }
    
    // v1.1.34: Se a placa for DIFERENTE da última validada, resetar buffer
    // Isso resolve o problema de carros que saem e outros entram imediatamente sem queda de movimento
    if (fastTrackValidatedRef.current && lastValidatedPlateRef.current) {
      if (plateText !== lastValidatedPlateRef.current) {
        logger.log(`🔄 Fast-Track: Placa diferente detectada (${plateText} != ${lastValidatedPlateRef.current}), resetando buffer para novo veículo`);
        ocrBufferRef.current = [];
        fastTrackValidatedRef.current = false;
        // NÃO reseta noMotionCounterRef - movimento continua
        // NÃO reseta lastValidatedPlateRef - será atualizado quando o novo veículo for validado
      }
    }
    
    // Adiciona ao buffer (FIFO)
    ocrBufferRef.current.push({ placa: plateText, confidence, timestamp: Date.now() });
    
    // Mantém apenas as últimas N leituras
    if (ocrBufferRef.current.length > OCR_BUFFER_SIZE) {
      ocrBufferRef.current.shift();
    }
    
    // v1.1.37: Agrupa por placa e calcula score ponderado (count × avgConf)
    const voteMap = new Map<string, { count: number; totalConf: number; maxConf: number }>();
    
    for (const entry of ocrBufferRef.current) {
      const existing = voteMap.get(entry.placa) || { count: 0, totalConf: 0, maxConf: 0 };
      voteMap.set(entry.placa, {
        count: existing.count + 1,
        totalConf: existing.totalConf + entry.confidence,
        maxConf: Math.max(existing.maxConf, entry.confidence)
      });
    }
    
    // Encontra a placa com maior pontuação ponderada
    let bestPlate = '';
    let bestScore = 0;
    
    for (const [plate, votes] of voteMap) {
      // Score = contagem × confiança média
      const avgConf = votes.totalConf / votes.count;
      const score = votes.count * avgConf;
      
      logger.log(`   📊 ${plate}: ${votes.count}x, avg=${(avgConf * 100).toFixed(1)}%, max=${(votes.maxConf * 100).toFixed(1)}%, score=${score.toFixed(2)}`);
      
      if (score > bestScore) {
        bestScore = score;
        bestPlate = plate;
      }
    }
    
    // Consenso: placa atual é a melhor E tem >= CONSISTENCY_THRESHOLD leituras
    const currentVotes = voteMap.get(plateText);
    const matchCount = currentVotes?.count || 0;
    const hasConsensus = plateText === bestPlate && matchCount >= CONSISTENCY_THRESHOLD;
    
    logger.log(`🔄 Fast-Track Buffer: "${plateText}" bestScore=${bestScore.toFixed(2)} (consenso=${hasConsensus ? '✅' : '❌'})`);
    
    return { hasConsensus, matchCount };
  }, []);
  
  // Fast-Track: Limpar buffer quando veículo sai da área ou é validado
  const resetOcrBuffer = useCallback(() => {
    if (ocrBufferRef.current.length > 0 || fastTrackValidatedRef.current) {
      logger.log('🧹 Fast-Track: Buffer OCR limpo');
    }
    ocrBufferRef.current = [];
    fastTrackValidatedRef.current = false;
    noMotionCounterRef.current = 0;
  }, []);
  
  // v1.1.38: checkIfMorador com variações agressivas (confusões 0↔6, E↔B, etc.)
  const checkIfMorador = useCallback(async (placa: string): Promise<{ isMorador: boolean; casa?: string; placaCadastrada?: string }> => {
    try {
      const placaLimpa = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      // 1. Primeiro: busca exata (mais rápido)
      const { data: exactMatch, error } = await supabase
        .from('veiculos_moradores')
        .select('casa, placa_veiculo')
        .eq('placa_veiculo', placaLimpa)
        .maybeSingle();
      
      if (error) throw error;
      
      if (exactMatch) {
        return { isMorador: true, casa: exactMatch.casa, placaCadastrada: exactMatch.placa_veiculo };
      }
      
      // 2. v1.1.38: Busca com variações simples + agressivas (0↔6, E↔B, etc.)
      const { generateVariations, generateAggressiveVariations } = await import('@/react-app/utils/plateValidator');
      const variacoesSimples = generateVariations(placaLimpa);
      const variacoesAgressivas = generateAggressiveVariations(placaLimpa);
      
      // Combinar e remover duplicatas
      const todasVariacoes = [...new Set([...variacoesSimples, ...variacoesAgressivas])];
      
      logger.log(`🔍 Buscando morador com ${todasVariacoes.length} variações de "${placaLimpa}":`, todasVariacoes.slice(0, 8));
      
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
      
      // Buscar visitantes ativos
      const { data: visitantes, error } = await supabase
        .from('visitantes')
        .select('nome, casa_visitada, placa_veiculo')
        .eq('is_ativo', true);
      
      if (error) throw error;
      
      // Busca exata primeiro
      const exactMatch = visitantes?.find(v => 
        v.placa_veiculo?.toUpperCase().replace(/[^A-Z0-9]/g, '') === placaLimpa
      );
      
      if (exactMatch) {
        return { 
          isVisitante: true, 
          nome: exactMatch.nome,
          casa: exactMatch.casa_visitada,
          placaCadastrada: exactMatch.placa_veiculo
        };
      }
      
      // Fuzzy matching para erros de OCR
      const { generateVariations } = await import('@/react-app/utils/plateValidator');
      const variacoes = generateVariations(placaLimpa);
      
      for (const visitante of visitantes || []) {
        const placaVisitante = visitante.placa_veiculo?.toUpperCase().replace(/[^A-Z0-9]/g, '') || '';
        if (variacoes.includes(placaVisitante)) {
          return { 
            isVisitante: true, 
            nome: visitante.nome,
            casa: visitante.casa_visitada,
            placaCadastrada: visitante.placa_veiculo
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
    if (!videoRef.current || status !== 'monitoring') return false;
    if (!workerReady) return false;
    
    // Fast-Track v1.1.29: Se já validou, verificar timeout para permitir novo veículo
    if (fastTrackValidatedRef.current) {
      const timeSinceValidation = Date.now() - lastValidationTimeRef.current;
      
      // Reset automático após timeout (veículo já passou)
      if (timeSinceValidation >= VALIDATION_TIMEOUT_MS) {
        logger.log(`⏱️ Fast-Track: Timeout ${VALIDATION_TIMEOUT_MS/1000}s - permitindo novo veículo`);
        resetOcrBuffer();
        // Continua para processar novo OCR
      } else {
        // v1.1.30: Log apenas a cada 5 segundos para não poluir console
        return true;
      }
    }
    
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
      
      updateProcessingStage('ocr', 'Executando OCR no Worker...');
      const result = await processPlateWorker(capturedCanvas, { enableDebug: debugModeEnabled });
      
      if (!result) {
        finishProcessingTimer();
        setStatusMessage('❌ Erro no processamento');
        setStatus('monitoring');
        return false;
      }
      
      // Atualizar estado de fallback e debug
      setUsedFallback(result.usedFallback || false);
      if (result.debugImage) {
        setDebugImage(result.debugImage);
      }
      
      // Atualizar processingInfo com rawText, plateRegion, usedYolo e debugImages para diagnóstico e overlay visual
      setProcessingInfo(prev => ({
        ...prev,
        rawText: result.rawText || '',
        ocrConfidence: result.ocrConfidence || 0,
        plateRegion: result.plateRegion,
        usedYolo: result.usedYolo,
        detectedPlate: result.validation?.isValid ? result.validation.formatted : undefined,
        debugImages: result.debugImages,
      }));
      
      // Limpar plateRegion após 3 segundos para não poluir o overlay
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
        
        // ========== FAST-TRACK: Verificar Consistência Temporal ==========
        const { hasConsensus, matchCount } = checkOcrConsistency(placa, confidence);
        
        if (!hasConsensus) {
          // Sem consenso ainda - continuar coletando leituras
          finishProcessingTimer();
          setStatus('monitoring');
          setStatusMessage(`🔄 Coletando: ${matchCount}/${CONSISTENCY_THRESHOLD} (${placa})`);
          
          // Não marca como sucesso de OCR para continuar tentando
          return false;
        }
        
        // ========== CONSENSO ATINGIDO - Fast-Track Validação! ==========
        logger.log(`🚀 Fast-Track: Placa ${placa} validada por consistência (${matchCount}/${OCR_BUFFER_SIZE})`);
        
        // v1.1.38: Verificar se é a mesma placa validada recentemente (anti-duplicatas)
        if (placa === lastValidatedPlateRef.current) {
          const timeSinceLastValidation = Date.now() - lastValidationTimeRef.current;
          
          if (timeSinceLastValidation < MIN_REDETECTION_INTERVAL) {
            logger.log(`🔁 Fast-Track: Mesma placa ${placa} detectada após ${(timeSinceLastValidation/1000).toFixed(1)}s - ignorando (mín: ${MIN_REDETECTION_INTERVAL/1000}s)`);
            finishProcessingTimer();
            setStatus('monitoring');
            setStatusMessage('🟢 Monitorando...');
            return true;
          }
        }
        
        fastTrackValidatedRef.current = true;
        lastValidationTimeRef.current = Date.now();
        lastValidatedPlateRef.current = placa;
        
        // v1.1.39: Verificação ATÔMICA - check AND mark em uma operação
        // Isso resolve a race condition da v1.1.38
        const wasAlreadyDetected = checkAndMarkPlate(placa);
        if (wasAlreadyDetected) {
          logger.log(`⏳ Placa ${placa} detectada recentemente (anti-duplicata atômico), ignorando...`);
          finishProcessingTimer();
          setStatus('monitoring');
          setStatusMessage('🟢 Monitorando...');
          motionDetectorRef.current.markOcrSuccess();
          return true;
        }
        
        // v1.1.40: Capturar placaCadastrada do fuzzy match
        const { isMorador, casa, placaCadastrada } = await checkIfMorador(placa);
        
        let isVisitante = false;
        let nomeVisitante: string | undefined;
        let casaFinal = casa;
        let placaFinal = placaCadastrada || placa; // Usar placa cadastrada se encontrada
        
        if (!isMorador) {
          const visitanteResult = await checkIfVisitanteAtivo(placa);
          if (visitanteResult.isVisitante) {
            isVisitante = true;
            nomeVisitante = visitanteResult.nome;
            casaFinal = visitanteResult.casa;
            placaFinal = visitanteResult.placaCadastrada || placa;
          }
        }
        
        const fallbackUsed = result.usedFallback || false;
        const fonteDeteccao = fallbackUsed ? 'api' : 'local';
        const detection: Detection = {
          placa: placaFinal, // v1.1.40: Usar placa cadastrada
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
        
        // v1.1.40: Salvar com placa cadastrada
        await saveDetection(placaFinal, isMorador, casaFinal, result.validation.confidence, fonteDeteccao, isVisitante, nomeVisitante);
        
        finishProcessingTimer();
        motionDetectorRef.current.markOcrSuccess();
        
        // v1.1.40: Exibir placa cadastrada para moradores/visitantes
        if (isMorador) {
          setStatusMessage(`✅ Morador: ${placaFinal} - Casa ${casa} (Fast-Track)`);
        } else if (isVisitante) {
          setStatusMessage(`🧑 Visitante: ${nomeVisitante} - Casa ${casaFinal} (Fast-Track)`);
        } else {
          setStatusMessage(`⚠️ Não cadastrado: ${placa}`); // Desconhecidos usam placa do OCR
        }
        
        return true;
      } else {
        finishProcessingTimer();
        setStatusMessage('❌ Placa não reconhecida - tentando novamente...');
        setStatus('monitoring');
        return false;
      }
    } catch (e) {
      console.error('Erro ao processar OCR:', e);
      finishProcessingTimer();
      setStatusMessage('❌ Erro no processamento - tentando novamente...');
      setStatus('monitoring');
      return false;
    }
  }, [
    status, 
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
  
  // Leitura manual instantânea - não depende do status atual
  const manualCapture = useCallback(async (): Promise<boolean> => {
    if (!videoRef.current || !canvasRef.current) {
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
      
      const capturedCanvas = motionDetectorRef.current.captureArea(
        videoRef.current,
        virtualArea
      );
      
      updateProcessingStage('ocr', 'Executando OCR no Worker...');
      const result = await processPlateWorker(capturedCanvas, { enableDebug: debugModeEnabled });
      
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
      
      // v1.1.42: Atualizar processingInfo para exibir no pipeline de debug
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
          // v1.1.42: Feedback visual claro quando placa é ignorada por cooldown
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
          setStatusMessage(`✅ Morador: ${placa} - Casa ${casa}`);
        } else if (isVisitante) {
          setStatusMessage(`🧑 Visitante: ${nomeVisitante} - Casa ${casaFinal}`);
        } else {
          setStatusMessage(`⚠️ Não cadastrado: ${placa}`);
        }
        
        setTimeout(() => {
          if (isActiveRef.current) {
            setStatus('monitoring');
          }
        }, 2000);
        
        return true;
      } else {
        finishProcessingTimer();
        setStatusMessage(`❌ Placa não reconhecida${result.rawText ? ` (texto: ${result.rawText})` : ''}`);
        
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
  ]);
  
  const processFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (status !== 'monitoring' && status !== 'motion_detected') return;
    if (!motionDetectorRef.current.hasReference()) return;
    
    // Marcar início do frame para métricas
    recordFrameStart();
    
    const result = motionDetectorRef.current.processFrame(
      videoRef.current,
      canvasRef.current,
      virtualArea
    );
    
    // Marcar fim do frame
    recordFrameEnd();
    
    setMotionPercent(result.motionPercent);
    
    if (result.shouldUpdateReference) {
      captureReferenceFrame();
    }
    
    if (result.hasMotion) {
      // Reset contador de frames sem movimento
      noMotionCounterRef.current = 0;
      
      setStatus('motion_detected');
      setStatusMessage('🟡 Veículo detectado...');
      setProcessingInfo(prev => ({
        ...prev,
        stage: 'idle',
        stageLabel: 'Veículo detectado!',
      }));
    } else if (!result.hasMotion && status === 'motion_detected') {
      // Fast-Track: Incrementar contador de frames sem movimento
      noMotionCounterRef.current++;
      
      // Após 3 frames sem movimento (~1 segundo), limpar buffer OCR
      // Isso indica que o veículo saiu da área de detecção
      if (noMotionCounterRef.current >= 3) {
        resetOcrBuffer();
      }
      
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
      const ocrStart = performance.now();
      const success = await processFrameForOCR();
      recordOcrTime(performance.now() - ocrStart);
      
      setTimeout(() => {
        if (isActiveRef.current) {
          setStatus('monitoring');
          setStatusMessage(success ? '🟢 Monitorando...' : '🟡 Aguardando re-tentativa...');
        }
      }, 2000);
    }
  }, [status, virtualArea, processFrameForOCR, captureReferenceFrame, processingInfo.stage, processingInfo.stageLabel, recordFrameStart, recordFrameEnd, recordOcrTime, resetOcrBuffer]);
  
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
      resetOCRState();
      resetOcrBuffer(); // Fast-Track: Limpar buffer de consistência
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
  }, [selectedCamera, selectedResolution, resetOCRState, resetOcrBuffer]);
  
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
      resetOCRState();
      resetOcrBuffer(); // Fast-Track: Limpar buffer de consistência
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
  }, [hlsUrl, stopMonitoring, resetOCRState, resetOcrBuffer]);
  
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
    debugImage,
    debugModeEnabled,
    setDebugModeEnabled: setDebugModeEnabledWithPersist,
    // Performance
    performanceMetrics,
    workerReady,
    modelLoaded,
    modelLoading,
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
    videoRef,
    canvasRef,
    startMonitoring,
    startMonitoringHLS,
    stopMonitoring,
    updateVirtualArea,
    recaptureReference,
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
    throw new Error('useMonitoring must be used within a MonitoringProvider');
  }
  return context;
}
