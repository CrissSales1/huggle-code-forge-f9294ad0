/**
 * Componente de monitoramento contínuo com webcam local ou stream HLS (IPCamLive)
 * Exibe vídeo, área virtual poligonal, status e controles
 * Agora usa o contexto global MonitoringContext para persistir estado entre páginas
 * O elemento de vídeo é compartilhado via BackgroundVideo para evitar perda de stream
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Camera, 
  Play, 
  Square, 
  Settings, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Activity,
  Home,
  RotateCcw,
  Check,
  Gauge,
  Clock,
  Wifi,
  WifiOff,
  Radio,
  ScanLine
} from 'lucide-react';
import { useMonitoring, MonitoringStatus } from '@/react-app/contexts/MonitoringContext';
import { 
  Point, 
  VirtualAreaPolygon, 
  getPolygonPoints,
  CameraResolution,
  RESOLUTION_OPTIONS,
} from '../utils/motionDetection';
import PlacaVeiculo from './PlacaVeiculo';
import PerformanceIndicator from './PerformanceIndicator';

interface CameraMonitorProps {
  onDetection?: (placa: string, isMorador: boolean, casa?: string) => void;
  /** Modo compacto: esconde resultado interno e detecções recentes */
  compact?: boolean;
  /** Callback para expor dados do pipeline OCR para o componente pai */
  onPipelineUpdate?: (data: PipelineData | null) => void;
}

/** Dados do pipeline OCR expostos para o componente pai */
export interface PipelineData {
  debugImages: { preprocessed?: string; final?: string } | null;
  rawText: string;
  ocrConfidence: number;
  stage: string;
  stageLabel: string;
  usedYolo: boolean;
  plateRegion?: { width: number; height: number; confidence: number };
  currentTimeMs: number;
  lastOcrTimeMs: number;
  avgTimeMs: number;
}

type EditMode = 'none' | 'creating' | 'adjusting';

// Removido VideoPortal - agora renderizamos o vídeo diretamente no container

export default function CameraMonitor({ onDetection, compact = false, onPipelineUpdate }: CameraMonitorProps) {
  const {
    status,
    statusMessage,
    isActive,
    virtualArea,
    lastDetection,
    recentDetections,
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
    reconnectStream,
    // HLS
    sourceMode,
    setSourceMode,
    hlsUrl,
    setHlsUrl,
    hlsStatus,
    startMonitoringStream,
    whepStatus,
    activeProtocol,
    // Leitura manual
    manualCapture,
    // Refs do vídeo
    videoRef,
    canvasRef,
    // Debug
    debugModeEnabled,
    setDebugModeEnabled,
    // v1.1.45: Modo noturno forçado
    forceNightMode,
    setForceNightMode,
    // Performance
    performanceMetrics,
    modelLoaded,
    modelLoading,
    yoloBackend,
  } = useMonitoring();
  
  const [showSettings, setShowSettings] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [tempPoints, setTempPoints] = useState<Point[]>([]);
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState({ width: 1280, height: 720 });
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Reconectar stream quando componente monta (ao voltar para a página de monitoramento)
  useEffect(() => {
    if (isActive) {
      // Pequeno delay para garantir que o elemento de vídeo está no DOM
      const timer = setTimeout(() => {
        reconnectStream();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isActive, reconnectStream]);
  
  // Rastrear dimensões do vídeo para overlay correto
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const updateDimensions = () => {
      if (video.videoWidth && video.videoHeight) {
        setVideoDimensions({
          width: video.videoWidth,
          height: video.videoHeight,
        });
      }
    };
    
    video.addEventListener('loadedmetadata', updateDimensions);
    // Caso já tenha carregado
    updateDimensions();
    
    return () => video.removeEventListener('loadedmetadata', updateDimensions);
  }, [videoRef]);
  
  // Expor dados do pipeline para o componente pai
  useEffect(() => {
    if (onPipelineUpdate && isActive && debugModeEnabled) {
      onPipelineUpdate({
        debugImages: processingInfo.debugImages || null,
        rawText: processingInfo.rawText || '',
        ocrConfidence: processingInfo.ocrConfidence || 0,
        stage: processingInfo.stage,
        stageLabel: processingInfo.stageLabel,
        usedYolo: processingInfo.usedYolo || false,
        plateRegion: processingInfo.plateRegion ? {
          width: processingInfo.plateRegion.width,
          height: processingInfo.plateRegion.height,
          confidence: processingInfo.plateRegion.confidence,
        } : undefined,
        currentTimeMs: processingInfo.currentTimeMs,
        lastOcrTimeMs: processingInfo.lastOcrTimeMs,
        avgTimeMs: processingInfo.avgTimeMs,
      });
    } else if (onPipelineUpdate && (!isActive || !debugModeEnabled)) {
      onPipelineUpdate(null);
    }
  }, [onPipelineUpdate, isActive, debugModeEnabled, processingInfo]);
  
  // Toggle de visibilidade da área poligonal
  const [showPolygonOverlay, setShowPolygonOverlay] = useState<boolean>(() => {
    const saved = localStorage.getItem('portacerta_show_polygon');
    return saved !== null ? JSON.parse(saved) : true;
  });
  
  const togglePolygonVisibility = () => {
    setShowPolygonOverlay(prev => {
      const newValue = !prev;
      localStorage.setItem('portacerta_show_polygon', JSON.stringify(newValue));
      return newValue;
    });
  };
  
  // Notificar detecções
  useEffect(() => {
    if (lastDetection && onDetection) {
      onDetection(lastDetection.placa, lastDetection.isMorador, lastDetection.casa);
    }
  }, [lastDetection, onDetection]);
  
  // Cores do status
  const getStatusColor = (s: MonitoringStatus) => {
    switch (s) {
      case 'monitoring': return 'text-green-600 bg-green-100';
      case 'motion_detected': return 'text-yellow-600 bg-yellow-100';
      case 'processing': return 'text-blue-600 bg-blue-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };
  
  // Ícone do status
  const StatusIcon = () => {
    switch (status) {
      case 'monitoring': return <Activity className="w-4 h-4" />;
      case 'motion_detected': return <AlertCircle className="w-4 h-4" />;
      case 'processing': return <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />;
      case 'error': return <XCircle className="w-4 h-4" />;
      default: return <Camera className="w-4 h-4" />;
    }
  };
  
  // Obter posição relativa do clique
  const getRelativePosition = useCallback((e: React.MouseEvent): Point | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);
  
  // Verificar se clique está próximo do primeiro ponto
  const isNearFirstPoint = useCallback((pos: Point): boolean => {
    if (tempPoints.length < 3) return false;
    const firstPoint = tempPoints[0];
    const distance = Math.sqrt(
      Math.pow(pos.x - firstPoint.x, 2) + Math.pow(pos.y - firstPoint.y, 2)
    );
    return distance < 0.03; // 3% de distância
  }, [tempPoints]);
  
  // Iniciar criação de polígono
  const startCreatingPolygon = useCallback(() => {
    setEditMode('creating');
    setTempPoints([]);
  }, []);
  
  // Confirmar polígono
  const confirmPolygon = useCallback(() => {
    if (tempPoints.length >= 3) {
      const newArea: VirtualAreaPolygon = {
        type: 'polygon',
        points: tempPoints,
      };
      updateVirtualArea(newArea);
    }
    setEditMode('none');
    setTempPoints([]);
  }, [tempPoints, updateVirtualArea]);
  
  // Cancelar edição
  const cancelEditing = useCallback(() => {
    setEditMode('none');
    setTempPoints([]);
    setDraggingPoint(null);
  }, []);
  
  // Iniciar ajuste de polígono existente
  const startAdjustingPolygon = useCallback(() => {
    const points = getPolygonPoints(virtualArea);
    setTempPoints([...points]);
    setEditMode('adjusting');
  }, [virtualArea]);
  
  // Handler de clique no container
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (editMode !== 'creating') return;
    
    const pos = getRelativePosition(e);
    if (!pos) return;
    
    // Se clicou próximo do primeiro ponto e tem 3+ pontos, fechar polígono
    if (isNearFirstPoint(pos)) {
      confirmPolygon();
      return;
    }
    
    setTempPoints(prev => [...prev, pos]);
  }, [editMode, getRelativePosition, isNearFirstPoint, confirmPolygon]);
  
  // Handler de mouse down para arrastar pontos
  const handleMouseDown = useCallback((e: React.MouseEvent, pointIndex: number) => {
    e.stopPropagation();
    if (editMode !== 'adjusting') return;
    setDraggingPoint(pointIndex);
  }, [editMode]);
  
  // Handler de mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingPoint === null || editMode !== 'adjusting') return;
    
    const pos = getRelativePosition(e);
    if (!pos) return;
    
    setTempPoints(prev => {
      const newPoints = [...prev];
      newPoints[draggingPoint] = pos;
      return newPoints;
    });
  }, [draggingPoint, editMode, getRelativePosition]);
  
  // Handler de mouse up
  const handleMouseUp = useCallback(() => {
    if (draggingPoint !== null) {
      setDraggingPoint(null);
      // Salvar ao soltar o ponto
      if (tempPoints.length >= 3) {
        const newArea: VirtualAreaPolygon = {
          type: 'polygon',
          points: tempPoints,
        };
        updateVirtualArea(newArea);
      }
    }
  }, [draggingPoint, tempPoints, updateVirtualArea]);
  
  // Pontos a renderizar
  const displayPoints = editMode !== 'none' ? tempPoints : getPolygonPoints(virtualArea);
  
  return (
    <div className={`bg-white border border-gray-200 rounded-xl h-full flex flex-col ${editMode !== 'none' ? 'overflow-visible' : 'overflow-hidden'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          {sourceMode === 'hls' ? (
            <Radio className="w-5 h-5 text-purple-600" />
          ) : sourceMode === 'whep' ? (
            <Radio className="w-5 h-5 text-purple-600" />
          ) : (
            <Camera className="w-5 h-5 text-blue-600" />
          )}
          <h3 className="font-semibold text-gray-900">
            {sourceMode === 'hls' || sourceMode === 'whep' ? 'Stream IP (go2rtc)' : 'Monitoramento Local'}
          </h3>
          {(sourceMode === 'hls' || sourceMode === 'whep') && (
            <>
              {/* Protocol badge */}
              {activeProtocol === 'whep' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                  <Wifi className="w-3 h-3" />
                  WebRTC
                </span>
              )}
              {activeProtocol === 'hls' && whepStatus === 'fallback_hls' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
                  <Wifi className="w-3 h-3" />
                  HLS Fallback
                </span>
              )}
              {activeProtocol === 'hls' && whepStatus !== 'fallback_hls' && (
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                  hlsStatus === 'connected' ? 'bg-green-100 text-green-700' :
                  hlsStatus === 'connecting' ? 'bg-yellow-100 text-yellow-700' :
                  hlsStatus === 'error' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {hlsStatus === 'connected' ? <Wifi className="w-3 h-3" /> : 
                   hlsStatus === 'error' ? <WifiOff className="w-3 h-3" /> : null}
                  {hlsStatus === 'connected' ? 'HLS' :
                   hlsStatus === 'connecting' ? 'Conectando...' :
                   hlsStatus === 'error' ? 'Erro' : 'Desconectado'}
                </span>
              )}
              {activeProtocol === 'none' && whepStatus === 'connecting' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
                  Conectando WHEP...
                </span>
              )}
            </>
          )}
          
          {/* Indicador de monitoramento ativo */}
          {isActive && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 animate-pulse">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              Ativo
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Status Badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm whitespace-nowrap max-w-[260px] ${getStatusColor(status)}`}>
            <StatusIcon />
            <span className="truncate" title={statusMessage}>{statusMessage}</span>
          </div>
          
          {/* Settings Button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            title="Configurações"
          >
            <Settings className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>
      
      {/* Settings Panel */}
      {showSettings && (
        <div className="p-3 border-b border-gray-200 bg-gray-50 space-y-3">
          {/* Seletor de Fonte */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 min-w-[70px]">Fonte:</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSourceMode('webcam')}
                disabled={isActive}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  sourceMode === 'webcam' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                } ${isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Camera className="w-4 h-4" />
                Webcam Local
              </button>
              <button
                onClick={() => setSourceMode('whep')}
                disabled={isActive}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  sourceMode === 'hls' || sourceMode === 'whep'
                    ? 'bg-purple-600 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                } ${isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Radio className="w-4 h-4" />
                Stream IP
              </button>
            </div>
            {isActive && (
              <span className="text-xs text-amber-600">Pare para alterar</span>
            )}
          </div>
          
          {/* Configuração Stream IP */}
          {(sourceMode === 'hls' || sourceMode === 'whep') && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 min-w-[70px]">URL:</label>
              <input
                type="url"
                value={hlsUrl}
                onChange={(e) => setHlsUrl(e.target.value)}
                placeholder="http://192.168.1.x:1984/api/webrtc?src=camera1"
                className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white"
                disabled={isActive}
              />
            </div>
          )}
          
          {/* Seletor de Câmera - só para webcam */}
          {sourceMode === 'webcam' && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 min-w-[70px]">Câmera:</label>
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white"
                disabled={isActive}
              >
                {availableCameras.map(cam => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || `Câmera ${cam.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Seletor de Resolução - só para webcam */}
          {sourceMode === 'webcam' && (
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 min-w-[70px]">Resolução:</label>
              <select
                value={selectedResolution}
                onChange={(e) => setSelectedResolution(e.target.value as CameraResolution)}
                className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white"
                disabled={isActive}
              >
                {(Object.keys(RESOLUTION_OPTIONS) as CameraResolution[]).map(key => (
                  <option key={key} value={key}>
                    {RESOLUTION_OPTIONS[key].label} - {RESOLUTION_OPTIONS[key].description}
                  </option>
                ))}
              </select>
              {isActive && (
                <span className="text-xs text-amber-600">Pare para alterar</span>
              )}
            </div>
          )}
          
          {/* Toggle de visibilidade da área */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 min-w-[70px]">Mostrar área:</label>
            <button
              onClick={togglePolygonVisibility}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                showPolygonOverlay ? 'bg-blue-600' : 'bg-gray-300'
              }`}
              title={showPolygonOverlay ? 'Clique para ocultar a área de detecção' : 'Clique para mostrar a área de detecção'}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                showPolygonOverlay ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
            <span className="text-xs text-gray-500">
              {showPolygonOverlay ? 'Área visível' : 'Área oculta (ainda funciona)'}
            </span>
          </div>
          
          {/* Toggle de Debug - Mostrar região da placa */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 min-w-[70px]">Debug OCR:</label>
            <button
              onClick={() => setDebugModeEnabled(!debugModeEnabled)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                debugModeEnabled ? 'bg-purple-600' : 'bg-gray-300'
              }`}
              title={debugModeEnabled ? 'Clique para desativar visualização de debug' : 'Clique para ver região da placa detectada'}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                debugModeEnabled ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
            <span className="text-xs text-gray-500">
              {debugModeEnabled ? '🔍 Mostrando região detectada' : 'Desativado'}
            </span>
          </div>
          
          {/* v1.1.45: Toggle de Modo Noturno Forçado */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 min-w-[70px]">Modo Noturno:</label>
            <button
              onClick={() => setForceNightMode(!forceNightMode)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                forceNightMode ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
              title={forceNightMode 
                ? 'Clique para usar detecção automática' 
                : 'Clique para forçar correções noturnas em todas as leituras'}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                forceNightMode ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
            <span className="text-xs text-gray-500">
              {forceNightMode ? '🌙 Forçado (todas as leituras)' : '☀️ Automático'}
            </span>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {editMode === 'none' ? (
              <>
                <button
                  onClick={startCreatingPolygon}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                  disabled={!isActive}
                >
                  Nova Área de Leitura
                </button>
                <button
                  onClick={startAdjustingPolygon}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  disabled={!isActive}
                >
                  Ajustar Pontos
                </button>
                <button
                  onClick={recaptureReference}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200"
                  disabled={!isActive}
                  title="Recaptura a imagem de referência da área vazia"
                >
                  <Camera className="w-4 h-4" />
                  Recapturar Referência
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={confirmPolygon}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                  disabled={tempPoints.length < 3}
                >
                  <Check className="w-4 h-4" />
                  Confirmar
                </button>
                <button
                  onClick={cancelEditing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                >
                  <RotateCcw className="w-4 h-4" />
                  Cancelar
                </button>
              </>
            )}
            <span className="text-xs text-gray-500">
              {editMode === 'creating' 
                ? `Clique para adicionar pontos. ${tempPoints.length >= 3 ? 'Clique no primeiro ponto para fechar.' : `Mínimo 3 pontos (${tempPoints.length}/3)`}`
                : editMode === 'adjusting'
                  ? 'Arraste os pontos para ajustar a área'
                  : hasReference 
                    ? 'Referência capturada. Pronto para detectar veículos.'
                    : 'Aguardando captura da referência...'
              }
            </span>
          </div>
        </div>
      )}
      
      {/* Video Container - z-50 durante edição para ficar acima de outros elementos */}
      <div 
        ref={containerRef}
        className={`relative aspect-video bg-gray-900 ${editMode === 'creating' ? 'cursor-crosshair' : ''} ${editMode !== 'none' ? 'z-50' : ''}`}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Vídeo renderizado diretamente */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-contain"
          playsInline
          muted
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Polygon Overlay SVG - só mostra se toggle ativo ou em modo edição */}
        {isActive && displayPoints.length >= 2 && (showPolygonOverlay || editMode !== 'none') && (
          <svg 
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {/* Polígono preenchido */}
            {displayPoints.length >= 3 && (
              <polygon
                points={displayPoints.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
                fill={editMode !== 'none' 
                  ? 'rgba(251, 191, 36, 0.2)' 
                  : status === 'motion_detected' || status === 'processing'
                    ? 'rgba(234, 179, 8, 0.15)'
                    : 'rgba(34, 197, 94, 0.15)'
                }
                stroke={editMode !== 'none' 
                  ? '#fbbf24' 
                  : status === 'motion_detected' || status === 'processing'
                    ? '#eab308'
                    : '#22c55e'
                }
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
              />
            )}
            
            {/* Linhas durante criação (antes de fechar) */}
            {editMode === 'creating' && displayPoints.length >= 2 && displayPoints.length < 3 && (
              <polyline
                points={displayPoints.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}
                fill="none"
                stroke="#fbbf24"
                strokeWidth="0.5"
                strokeDasharray="2,2"
                vectorEffect="non-scaling-stroke"
              />
            )}
            
            {/* Pontos editáveis */}
            {(editMode !== 'none' || showSettings) && displayPoints.map((p, i) => (
              <g key={i}>
                {/* Área clicável maior */}
                <circle
                  cx={p.x * 100}
                  cy={p.y * 100}
                  r={4}
                  fill="transparent"
                  className={editMode === 'adjusting' ? 'cursor-move pointer-events-auto' : ''}
                  onMouseDown={(e) => handleMouseDown(e as unknown as React.MouseEvent, i)}
                />
                {/* Ponto visível */}
                <circle
                  cx={p.x * 100}
                  cy={p.y * 100}
                  r={i === 0 && editMode === 'creating' ? 2.5 : 1.5}
                  fill={i === 0 && editMode === 'creating' ? '#f59e0b' : '#22c55e'}
                  stroke="white"
                  strokeWidth="0.5"
                  className={editMode === 'adjusting' ? 'pointer-events-none' : ''}
                />
                {/* Número do ponto */}
                {editMode !== 'none' && (
                  <text
                    x={p.x * 100}
                    y={p.y * 100 - 3}
                    textAnchor="middle"
                    fill="white"
                    fontSize="3"
                    fontWeight="bold"
                    className="pointer-events-none"
                    style={{ textShadow: '0 0.5px 1px rgba(0,0,0,0.8)' }}
                  >
                    {i + 1}
                  </text>
                )}
              </g>
            ))}
          </svg>
        )}
        
        {/* Label da área - só mostra se toggle ativo */}
        {isActive && displayPoints.length >= 3 && editMode === 'none' && showPolygonOverlay && (
          <div 
            className="absolute text-xs text-white bg-black/50 px-2 py-0.5 rounded pointer-events-none"
            style={{
              left: `${Math.min(...displayPoints.map(p => p.x)) * 100}%`,
              top: `${Math.min(...displayPoints.map(p => p.y)) * 100 - 6}%`,
            }}
          >
            Área de Leitura ({displayPoints.length} pontos)
          </div>
        )}
        
        {/* Plate Detection Overlay - Bounding Box em tempo real */}
        {isActive && debugModeEnabled && processingInfo.plateRegion && (
          <svg 
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`0 0 ${videoDimensions.width} ${videoDimensions.height}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Retângulo verde ao redor da placa detectada */}
            <rect
              x={processingInfo.plateRegion.x}
              y={processingInfo.plateRegion.y}
              width={processingInfo.plateRegion.width}
              height={processingInfo.plateRegion.height}
              fill="none"
              stroke="#00FF00"
              strokeWidth="3"
            />
            
            {/* Background do texto acima */}
            <rect
              x={processingInfo.plateRegion.x}
              y={Math.max(0, processingInfo.plateRegion.y - 28)}
              width={Math.max(processingInfo.plateRegion.width, 120)}
              height="24"
              fill="rgba(0, 0, 0, 0.8)"
              rx="4"
            />
            
            {/* Texto da placa detectada */}
            <text
              x={processingInfo.plateRegion.x + processingInfo.plateRegion.width / 2}
              y={Math.max(16, processingInfo.plateRegion.y - 10)}
              textAnchor="middle"
              fill="#00FF00"
              fontSize="16"
              fontWeight="bold"
              fontFamily="monospace"
            >
              {processingInfo.detectedPlate || processingInfo.rawText || 'Detectando...'}
            </text>
            
            {/* Confiança do YOLO abaixo */}
            <text
              x={processingInfo.plateRegion.x + processingInfo.plateRegion.width}
              y={processingInfo.plateRegion.y + processingInfo.plateRegion.height + 16}
              textAnchor="end"
              fill="#00FF00"
              fontSize="12"
              fontFamily="sans-serif"
            >
              YOLO: {Math.round(processingInfo.plateRegion.confidence * 100)}%
            </text>
          </svg>
        )}
        
        {/* Placeholder quando não está ativo */}
        {!isActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800/90">
            <div className="text-center text-white">
              <Camera className="w-16 h-16 mx-auto mb-3 opacity-50" />
              <p className="text-lg">Clique em Iniciar para começar</p>
              <p className="text-sm text-gray-400 mt-1">
                O sistema irá monitorar veículos automaticamente
              </p>
            </div>
          </div>
        )}
        
        {/* Creating Mode Overlay */}
        {editMode === 'creating' && tempPoints.length === 0 && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center pointer-events-none">
            <p className="text-white text-lg bg-black/50 px-4 py-2 rounded-lg">
              Clique para adicionar o primeiro ponto da área de leitura
            </p>
          </div>
        )}
        
        {/* Motion/Reference Indicator */}
        {isActive && editMode === 'none' && (
          <div className="absolute bottom-2 left-2 flex items-center gap-2">
            {/* Status da referência */}
            <div className={`text-xs px-2 py-1 rounded ${
              hasReference 
                ? 'bg-green-600/80 text-white' 
                : 'bg-orange-500/80 text-white'
            }`}>
              {hasReference ? '📸 Ref. OK' : '⏳ Capturando...'}
            </div>
            
            {/* Indicador de detecção */}
            {hasReference && (
              <div className={`text-xs px-2 py-1 rounded ${
                motionPercent >= 0.10 
                  ? 'bg-yellow-500 text-black font-medium' 
                  : motionPercent >= 0.05 
                    ? 'bg-blue-500/80 text-white'
                    : 'bg-black/70 text-gray-300'
              }`}>
                {motionPercent >= 0.10 
                  ? `🚗 Veículo: ${Math.round(motionPercent * 100)}%`
                  : motionPercent >= 0.05 
                    ? `⚠️ Mudança: ${Math.round(motionPercent * 100)}%`
                    : '✓ Área limpa'
                }
              </div>
            )}
          </div>
        )}
        
        {/* Performance Indicator - Top Right */}
        {isActive && editMode === 'none' && (
          <div className="absolute top-2 right-2">
            <PerformanceIndicator 
              metrics={performanceMetrics} 
              compact 
              modelLoaded={modelLoaded}
              modelLoading={modelLoading}
              yoloBackend={yoloBackend}
            />
          </div>
        )}
      </div>
      
      {/* Processing Info Panel */}
      {isActive && (
        <div className="p-3 border-t border-gray-200 bg-gradient-to-r from-gray-50 to-blue-50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Processamento</span>
            </div>
            
            {/* Etapa atual */}
            <div className="flex items-center gap-2 px-2 py-1 bg-white rounded border border-gray-200">
              {processingInfo.stage !== 'idle' && processingInfo.stage !== 'done' ? (
                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <div className={`w-2 h-2 rounded-full ${processingInfo.stage === 'done' ? 'bg-green-500' : 'bg-gray-300'}`} />
              )}
              <span className="text-xs text-gray-600">{processingInfo.stageLabel}</span>
            </div>
            
            {/* Texto OCR para diagnóstico */}
            {processingInfo.rawText && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-yellow-50 border border-yellow-200 rounded text-xs">
                <span className="text-yellow-700 font-medium">OCR:</span>
                <span className="font-mono text-yellow-800">"{processingInfo.rawText}"</span>
                {processingInfo.ocrConfidence !== undefined && (
                  <span className="text-yellow-600">({Math.round(processingInfo.ocrConfidence * 100)}%)</span>
                )}
              </div>
            )}
            
            {/* Métricas de tempo */}
            <div className="flex items-center gap-3 ml-auto text-xs">
              {processingInfo.currentTimeMs > 0 && processingInfo.stage !== 'idle' && (
                <span className="text-blue-600 font-medium">
                  {(processingInfo.currentTimeMs / 1000).toFixed(1)}s
                </span>
              )}
              {processingInfo.lastOcrTimeMs > 0 && (
                <div className="flex items-center gap-1 text-gray-500">
                  <Clock className="w-3 h-3" />
                  <span>Última: {(processingInfo.lastOcrTimeMs / 1000).toFixed(2)}s</span>
                </div>
              )}
              {processingInfo.avgTimeMs > 0 && (
                <div className="text-gray-500">
                  Média: {(processingInfo.avgTimeMs / 1000).toFixed(2)}s
                </div>
              )}
            </div>
          </div>
          {/* Pipeline agora é renderizado em Monitoramento.tsx via onPipelineUpdate */}
        </div>
      )}
      
      {/* Controls */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          {!isActive ? (
            <button
              onClick={() => (sourceMode === 'hls' || sourceMode === 'whep') ? startMonitoringStream() : startMonitoring()}
              disabled={(sourceMode === 'hls' || sourceMode === 'whep') && !hlsUrl}
              className={`flex items-center gap-2 px-4 py-2 text-white rounded-lg transition-colors ${
                (sourceMode === 'hls' || sourceMode === 'whep')
                  ? 'bg-purple-600 hover:bg-purple-700' 
                  : 'bg-green-600 hover:bg-green-700'
              } ${(sourceMode === 'hls' || sourceMode === 'whep') && !hlsUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Play className="w-4 h-4" />
              {(sourceMode === 'hls' || sourceMode === 'whep') ? 'Conectar Stream' : 'Iniciar'}
            </button>
          ) : (
            <>
              <button
                onClick={stopMonitoring}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Square className="w-4 h-4" />
                Parar
              </button>
              
              {/* Botão de Leitura Manual */}
              <button
                onClick={async () => {
                  if (isCapturing) return;
                  setIsCapturing(true);
                  try {
                    await manualCapture();
                  } finally {
                    setIsCapturing(false);
                  }
                }}
                disabled={isCapturing || !hasReference}
                className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors ${
                  isCapturing || !hasReference ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                title="Forçar leitura imediata da placa"
              >
                {isCapturing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ScanLine className="w-4 h-4" />
                )}
                <span className="hidden sm:inline">Leitura Manual</span>
                <span className="sm:hidden">Ler</span>
              </button>
            </>
          )}
          
          {(sourceMode === 'hls' || sourceMode === 'whep') && !hlsUrl && !isActive && (
            <span className="text-xs text-amber-600">Configure a URL do stream nas configurações</span>
          )}
        </div>
      </div>
      
      {/* Last Detection - only in non-compact mode */}
      {!compact && lastDetection && (
        <div className="p-3 border-t border-gray-200">
          <div className={`flex items-center gap-3 px-4 py-2 rounded-lg ${
            lastDetection.isMorador 
              ? 'bg-green-100 border border-green-300' 
              : 'bg-red-100 border border-red-300'
          }`}>
            {lastDetection.isMorador ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <PlacaVeiculo placa={lastDetection.placa} size="sm" />
                {lastDetection.isMorador && lastDetection.casa && (
                  <span className="flex items-center gap-1 text-sm font-semibold text-green-700">
                    <Home className="w-4 h-4" />
                    Casa {lastDetection.casa}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {new Date(lastDetection.timestamp).toLocaleTimeString('pt-BR')}
                <span className="ml-1.5 text-gray-400">
                  • {lastDetection.fonteDeteccao === 'api' ? 'API' : 'OCR'} ({Math.round(lastDetection.confidence * 100)}%)
                </span>
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* Recent Detections - only in non-compact mode */}
      {!compact && recentDetections.length > 0 && (
        <div className="p-3 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Detecções Recentes ({recentDetections.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {recentDetections.slice(0, 5).map((det, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
                  det.isMorador 
                    ? 'bg-green-50 text-green-700 border border-green-200' 
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                <span className="font-mono font-bold">{det.placa}</span>
                {det.isMorador && det.casa && (
                  <span className="text-green-600">• Casa {det.casa}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
