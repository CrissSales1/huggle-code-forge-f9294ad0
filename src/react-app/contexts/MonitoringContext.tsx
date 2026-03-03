/**
 * Contexto global para monitoramento contínuo
 * Mantém o estado de monitoramento mesmo quando navega entre páginas
 * Usa Web Worker para processamento pesado (OCR, detecção) em background
 */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import Hls from 'hls.js';
import { supabase } from '@/integrations/supabase/client';
import { usePlateWorker } from '@/react-app/hooks/usePlateWorker';
import { useMotionWorker } from '@/react-app/hooks/useMotionWorker';
import { usePerformanceMetrics } from '@/react-app/hooks/usePerformanceMetrics';
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
  extractAreaPixels,
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
  forceNightMode: boolean;
  setForceNightMode: (enabled: boolean) => void;
  
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
  const isProcessingMotionRef = useRef(false); // Execution Lock para motion worker
  
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
  
  // v1.1.50: Estado para forçar modo noturno manualmente
  const [forceNightMode, setForceNightMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('portacerta_force_night_mode') === 'true';
    } catch { return false; }
  });
  
  // Persistir modo noturno forçado
  const setForceNightModeWithPersist = useCallback((enabled: boolean) => {
    setForceNightMode(enabled);
    try {
      localStorage.setItem('portacerta_force_night_mode', enabled ? 'true' : 'false');
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
  
  // v1.1.50: Função auxiliar para verificar similaridade visual entre placas
  const arePlatesSimilar = useCallback((plate1: string, plate2: string): boolean => {
    if (plate1.length !== plate2.length) return false;
    if (plate1 === plate2) return true;
    
    const VISUAL_PAIRS: Record<string, string[]> = {
      '0': ['O', 'Q', 'D'],
      'O': ['0', 'Q', 'D', 'U'],  // v1.1.69: adiciona confusão O↔U
      'U': ['V', 'O', '0'],        // v1.1.69: entrada para U
      '1': ['I', 'L', 'T', '7', '4'],  // v1.1.66: Adiciona confusão 1↔4
      'I': ['1', 'L', 'T', 'J'],  // v1.1.68: Adiciona confusão I↔J
      'J': ['I', '1'],             // v1.1.68: J confunde com I e 1
      '2': ['Z', '7', '9'],  // 9↔2 é confusão MUITO comum
      '9': ['2', '0', 'Q'],
      '7': ['1', '2', 'T'],
      '4': ['A', 'H', '1'],  // v1.1.66: 4 confunde com A, H e 1
      '5': ['S', '6'],
      '6': ['G', '8', '5'],
      '8': ['B', '6', '0'],
      'A': ['4', 'H'],       // v1.1.66: A confunde com 4 e H
      'B': ['8', '6', 'D'],        // v1.1.70: adiciona confusão B↔D
      'D': ['0', 'O', 'B'],        // v1.1.70: adiciona confusão D↔B
      'E': ['F'],
      'G': ['6', 'C'],
      'H': ['4', 'A'],       // v1.1.66: H confunde com 4 e A
      'Q': ['0', 'O', '9'],
      'S': ['5'],
      'T': ['1', '7', 'I'],
      'Z': ['2'],
    };
    
    let differences = 0;
    
    for (let i = 0; i < plate1.length; i++) {
      if (plate1[i] === plate2[i]) continue;
      
      // Verifica se são visualmente similares
      const alts = VISUAL_PAIRS[plate1[i]] || [];
      if (alts.includes(plate2[i])) {
        differences++;
      } else {
        differences += 2; // Diferença não-visual conta mais
      }
    }
    
    // Permite até 2 diferenças visuais (ou 1 não-visual)
    return differences <= 2;
  }, []);

  // Fast-Track: Verificar consistência temporal do buffer OCR
  // v1.1.50: VOTAÇÃO COM AGRUPAMENTO DE PLACAS VISUALMENTE SIMILARES
  const checkOcrConsistency = useCallback((plateText: string, confidence: number): { hasConsensus: boolean; matchCount: number; bestPlate: string } => {
    // Só aceita leituras com confiança mínima para o buffer
    if (confidence < MIN_CONFIDENCE_FOR_BUFFER) {
      logger.log(`⚠️ Fast-Track: Confiança ${(confidence * 100).toFixed(1)}% abaixo do mínimo (${(MIN_CONFIDENCE_FOR_BUFFER * 100).toFixed(0)}%), ignorando leitura`);
      return { hasConsensus: false, matchCount: 0, bestPlate: '' };
    }
    
    // v1.1.34: Se a placa for MUITO DIFERENTE da última validada, resetar buffer
    // v1.1.50: Usa similaridade visual ao invés de igualdade exata
    if (fastTrackValidatedRef.current && lastValidatedPlateRef.current) {
      if (!arePlatesSimilar(plateText, lastValidatedPlateRef.current)) {
        logger.log(`🔄 Fast-Track: Placa muito diferente detectada (${plateText} != ${lastValidatedPlateRef.current}), resetando buffer para novo veículo`);
        ocrBufferRef.current = [];
        fastTrackValidatedRef.current = false;
      }
    }
    
    // Adiciona ao buffer (FIFO)
    ocrBufferRef.current.push({ placa: plateText, confidence, timestamp: Date.now() });
    
    // Mantém apenas as últimas N leituras
    if (ocrBufferRef.current.length > OCR_BUFFER_SIZE) {
      ocrBufferRef.current.shift();
    }
    
    // v1.1.50: Agrupa placas VISUALMENTE SIMILARES como mesmo grupo
    const voteMap = new Map<string, { count: number; totalConf: number; maxConf: number; variants: Set<string>; bestVariant: string; bestVariantConf: number }>();
    
    for (const entry of ocrBufferRef.current) {
      // Procura grupo existente que seja similar
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
      
      // Atualiza melhor variante se esta tem maior confiança
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
      
      // Log de agrupamento quando encontra similar
      if (matchedGroup && matchedGroup !== entry.placa) {
        console.log(`🔗 Agrupando "${entry.placa}" com "${matchedGroup}" (similar visual)`);
      }
    }
    
    // Encontra o grupo com maior pontuação ponderada
    let bestGroupPlate = '';
    let bestScore = 0;
    let bestGroupData: typeof voteMap extends Map<string, infer V> ? V : never = null as any;
    
    for (const [groupPlate, votes] of voteMap) {
      // Score = contagem × confiança média
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
    
    // v1.1.50: Verificar se a placa atual pertence ao melhor grupo
    const currentBelongsToBestGroup = arePlatesSimilar(plateText, bestGroupPlate);
    const matchCount = bestGroupData?.count || 0;
    const hasConsensus = currentBelongsToBestGroup && matchCount >= CONSISTENCY_THRESHOLD;
    
    // A melhor placa é a variante com maior confiança do grupo vencedor
    const finalBestPlate = hasConsensus ? bestGroupData.bestVariant : plateText;
    
    if (hasConsensus) {
      console.log(`✅ Consenso v1.1.64: Grupo "${bestGroupPlate}" com ${matchCount}x → Melhor variante: "${finalBestPlate}" (${(bestGroupData.bestVariantConf * 100).toFixed(1)}%)`);
    } else {
      logger.log(`🔄 Fast-Track Buffer: "${plateText}" score=${bestScore.toFixed(2)} (consenso=${hasConsensus ? '✅' : '❌'})`);
    }
    
    return { hasConsensus, matchCount, bestPlate: finalBestPlate };
  }, [arePlatesSimilar]);
  
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
      
      // v1.1.62: Log condensado de variações
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
      
      // v1.1.82: Fuzzy matching agressivo (mesmo padrão que checkIfMorador)
      const { generateVariations, generateAggressiveVariations } = await import('@/react-app/utils/plateValidator');
      const variacoes = [...new Set([
        ...generateVariations(placaLimpa),
        ...generateAggressiveVariations(placaLimpa)
      ])];
      
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
      const result = await processPlateWorker(capturedCanvas, { 
        enableDebug: debugModeEnabled,
        forceNightMode, // v1.1.45: Passar modo noturno forçado
      });
      
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
        // v1.1.50: checkOcrConsistency agora retorna bestPlate (melhor variante do grupo similar)
        const { hasConsensus, matchCount, bestPlate } = checkOcrConsistency(placa, confidence);
        
        if (!hasConsensus) {
          // Sem consenso ainda - continuar coletando leituras
          finishProcessingTimer();
          setStatus('monitoring');
          setStatusMessage(`🔄 Leituras: ${matchCount}/${CONSISTENCY_THRESHOLD}`);
          
          // Não marca como sucesso de OCR para continuar tentando
          return false;
        }
        
        // v1.1.50: Usar a MELHOR VARIANTE do grupo (maior confiança)
        const placaConfirmada = bestPlate || placa;
        
        // ========== CONSENSO ATINGIDO - Fast-Track Validação! ==========
        logger.log(`🚀 Fast-Track: Placa ${placaConfirmada} validada por consistência (${matchCount}/${OCR_BUFFER_SIZE})`);
        
        // v1.1.38: Verificar se é a mesma placa validada recentemente (anti-duplicatas)
        // v1.1.50: Usa similaridade ao invés de igualdade exata
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
        
        // v1.1.39: Verificação ATÔMICA - check AND mark em uma operação
        // Isso resolve a race condition da v1.1.38
        // v1.1.50: Usa placaConfirmada (melhor variante do grupo)
        const wasAlreadyDetected = checkAndMarkPlate(placaConfirmada);
        if (wasAlreadyDetected) {
          logger.log(`⏳ Placa ${placaConfirmada} detectada recentemente (anti-duplicata atômico), ignorando...`);
          finishProcessingTimer();
          setStatus('monitoring');
          setStatusMessage('🟢 Monitorando...');
          motionDetectorRef.current.markOcrSuccess();
          return true;
        }
        
        // v1.1.84: Beam Search - tentar buscar TODOS os candidatos no banco
        // Se algum candidato bater direto, usar esse (evita fuzzy matching)
        let isMorador = false;
        let casa: string | undefined;
        let placaCadastrada: string | undefined;
        let isVisitante = false;
        let nomeVisitante: string | undefined;
        let casaFinal: string | undefined;
        
        // Primeiro tentar o candidato principal
        const mainResult = await checkIfMorador(placaConfirmada);
        isMorador = mainResult.isMorador;
        casa = mainResult.casa;
        placaCadastrada = mainResult.placaCadastrada;
        
        // v1.1.84: Se não achou com candidato principal, tentar candidatos do beam search
        if (!isMorador && result.candidates && result.candidates.length > 1) {
          for (const candidate of result.candidates) {
            if (candidate.text === placaConfirmada) continue; // Já tentou
            
            const candidateResult = await checkIfMorador(candidate.text);
            if (candidateResult.isMorador) {
              isMorador = true;
              casa = candidateResult.casa;
              placaCadastrada = candidateResult.placaCadastrada;
              console.log(`🎯 Beam Search Match: Candidato "${candidate.text}" encontrou morador (Casa ${casa}) - Principal era "${placaConfirmada}"`);
              break;
            }
          }
        }
        
        casaFinal = casa;
        let placaFinal = placaCadastrada || placaConfirmada;
        
        if (!isMorador) {
          const visitanteResult = await checkIfVisitanteAtivo(placaConfirmada);
          if (visitanteResult.isVisitante) {
            isVisitante = true;
            nomeVisitante = visitanteResult.nome;
            casaFinal = visitanteResult.casa;
            placaFinal = visitanteResult.placaCadastrada || placaConfirmada;
          }
          
          // v1.1.84: Tentar candidatos do beam search para visitantes também
          if (!isVisitante && result.candidates && result.candidates.length > 1) {
            for (const candidate of result.candidates) {
              if (candidate.text === placaConfirmada) continue;
              
              const candidateResult = await checkIfVisitanteAtivo(candidate.text);
              if (candidateResult.isVisitante) {
                isVisitante = true;
                nomeVisitante = candidateResult.nome;
                casaFinal = candidateResult.casa;
                placaFinal = candidateResult.placaCadastrada || candidate.text;
                console.log(`🎯 Beam Search Match: Candidato "${candidate.text}" encontrou visitante "${nomeVisitante}"`);
                break;
              }
            }
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
        
        // v1.1.61: Mensagens compactas (1 linha só)
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
  
  // Capturar referência = inicializar background no motion worker
  const initBackgroundFromVideo = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return false;
    
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return false;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;
    
    // Ajustar canvas ao tamanho do vídeo
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
  }, []);
  
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
      const result = await processPlateWorker(capturedCanvas, { 
        enableDebug: debugModeEnabled,
        forceNightMode, // v1.1.45: Passar modo noturno forçado
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
        
        // v1.1.61: Mensagens compactas
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
    forceNightMode,
    setForceNightMode: setForceNightModeWithPersist,
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
