/**
 * Componente de monitoramento contínuo com webcam local ou câmera IP
 * Exibe vídeo, área virtual poligonal, status e controles
 * Suporta tipo de câmera: entrada ou saída
 * Suporta fonte: webcam ou go2rtc (câmera IP via RTSP)
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
  ArrowDown,
  ArrowUp,
  Wifi,
  WifiOff,
  Video,
  Globe
} from 'lucide-react';
import { useContinuousMonitoring, MonitoringStatus, CameraType } from '../hooks/useContinuousMonitoring';
import { 
  Point, 
  VirtualAreaPolygon, 
  getPolygonPoints,
  CameraResolution,
  RESOLUTION_OPTIONS,
} from '../utils/motionDetection';
import { loadStreamMode } from '../hooks/useGo2rtcStream';
import PlacaVeiculo from './PlacaVeiculo';

export type StreamMode = 'webcam' | 'go2rtc';

interface CameraMonitorProps {
  onDetection?: (placa: string, isMorador: boolean, casa?: string) => void;
  /** Modo compacto: esconde resultado interno e detecções recentes */
  compact?: boolean;
  /** Tipo de câmera: entrada ou saída */
  cameraType?: CameraType;
  /** Modo de stream (opcional, carrega do localStorage se não fornecido) */
  streamMode?: StreamMode;
}

type EditMode = 'none' | 'creating' | 'adjusting';

export default function CameraMonitor({ 
  onDetection, 
  compact = false,
  cameraType = 'entrada'
}: CameraMonitorProps) {
  const {
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
    connectionMode,
  } = useContinuousMonitoring({ cameraType });
  
  const [showSettings, setShowSettings] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [tempPoints, setTempPoints] = useState<Point[]>([]);
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Cores baseadas no tipo de câmera
  const isEntrada = cameraType === 'entrada';
  const CameraIcon = isEntrada ? ArrowDown : ArrowUp;
  const cameraLabel = isEntrada ? 'Entrada' : 'Saída';
  
  // Verificar modo atual
  const currentStreamMode = loadStreamMode(cameraType);
  const isIpCamera = currentStreamMode === 'go2rtc';
  
  // Toggle de visibilidade da área poligonal
  const [showPolygonOverlay, setShowPolygonOverlay] = useState<boolean>(() => {
    const key = `portacerta_show_polygon_${cameraType}`;
    const saved = localStorage.getItem(key);
    return saved !== null ? JSON.parse(saved) : true;
  });
  
  const togglePolygonVisibility = () => {
    setShowPolygonOverlay(prev => {
      const newValue = !prev;
      const key = `portacerta_show_polygon_${cameraType}`;
      localStorage.setItem(key, JSON.stringify(newValue));
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
      case 'monitoring': return isEntrada ? 'text-green-600 bg-green-100' : 'text-orange-600 bg-orange-100';
      case 'motion_detected': return 'text-yellow-600 bg-yellow-100';
      case 'processing': return 'text-blue-600 bg-blue-100';
      case 'connecting': return 'text-purple-600 bg-purple-100';
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
      case 'connecting': return <Wifi className="w-4 h-4 animate-pulse" />;
      case 'error': return <XCircle className="w-4 h-4" />;
      default: return <Camera className="w-4 h-4" />;
    }
  };
  
  // Ícone do modo de conexão
  const ConnectionModeIcon = () => {
    switch (connectionMode) {
      case 'webrtc': return <Globe className="w-3.5 h-3.5" />;
      case 'mse': return <Wifi className="w-3.5 h-3.5" />;
      case 'local': return <Video className="w-3.5 h-3.5" />;
      default: return <WifiOff className="w-3.5 h-3.5" />;
    }
  };
  
  const getConnectionModeLabel = () => {
    switch (connectionMode) {
      case 'webrtc': return 'WebRTC';
      case 'mse': return 'MSE';
      case 'local': return 'Webcam';
      default: return 'Desconectado';
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
    return distance < 0.03;
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
  
  // Classes de cor baseadas no tipo
  const headerBgClass = isEntrada ? 'bg-blue-50' : 'bg-orange-50';
  const iconColorClass = isEntrada ? 'text-blue-600' : 'text-orange-600';
  const buttonBgClass = isEntrada ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700';
  const polygonStrokeColor = isEntrada ? '#22c55e' : '#f97316';
  const polygonFillColor = isEntrada ? 'rgba(34, 197, 94, 0.15)' : 'rgba(249, 115, 22, 0.15)';
  
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className={`flex items-center justify-between p-3 border-b border-gray-200 ${headerBgClass}`}>
        <div className="flex items-center gap-2">
          <CameraIcon className={`w-5 h-5 ${iconColorClass}`} />
          <h3 className="font-semibold text-gray-900">Câmera {cameraLabel}</h3>
          
          {/* Badge do tipo de câmera */}
          <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
            isIpCamera 
              ? 'bg-purple-100 text-purple-700' 
              : isEntrada 
                ? 'bg-blue-100 text-blue-700' 
                : 'bg-orange-100 text-orange-700'
          }`}>
            {isIpCamera ? <Globe className="w-3 h-3" /> : <Video className="w-3 h-3" />}
            {isIpCamera ? 'IP' : 'Webcam'}
          </span>
          
          {/* Badge de conexão quando ativo */}
          {isActive && connectionMode !== 'none' && (
            <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
              connectionMode === 'webrtc' ? 'bg-green-100 text-green-700' :
              connectionMode === 'mse' ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              <ConnectionModeIcon />
              {getConnectionModeLabel()}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Status Badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm ${getStatusColor(status)}`}>
            <StatusIcon />
            <span className="hidden sm:inline">{statusMessage}</span>
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
          {/* Aviso sobre modo IP */}
          {isIpCamera && (
            <div className="flex items-start gap-2 p-2 bg-purple-50 border border-purple-200 rounded-lg">
              <Globe className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-purple-700">
                <strong>Modo Câmera IP:</strong> Usando stream via go2rtc. 
                Para alterar configurações, vá em <a href="/configuracoes-cameras" className="underline font-medium">Configurações → Câmeras</a>.
              </div>
            </div>
          )}
          
          {/* Seletor de Câmera (apenas para webcam) */}
          {!isIpCamera && (
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
          
          {/* Seletor de Resolução (apenas para webcam) */}
          {!isIpCamera && (
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
                showPolygonOverlay ? (isEntrada ? 'bg-blue-600' : 'bg-orange-600') : 'bg-gray-300'
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
          
          <div className="flex items-center gap-2 flex-wrap">
            {editMode === 'none' ? (
              <>
                <button
                  onClick={startCreatingPolygon}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg ${isEntrada ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
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
      
      {/* Video Container */}
      <div 
        ref={containerRef}
        className={`relative aspect-video bg-gray-900 ${editMode === 'creating' ? 'cursor-crosshair' : ''}`}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          playsInline
          muted
        />
        
        {/* Canvas oculto para processamento */}
        <canvas ref={canvasRef} className="hidden" />
        
        {/* Polygon Overlay SVG */}
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
                    : polygonFillColor
                }
                stroke={editMode !== 'none' 
                  ? '#fbbf24' 
                  : status === 'motion_detected' || status === 'processing'
                    ? '#eab308'
                    : polygonStrokeColor
                }
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
              />
            )}
            
            {/* Linhas durante criação */}
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
                <circle
                  cx={p.x * 100}
                  cy={p.y * 100}
                  r={4}
                  fill="transparent"
                  className={editMode === 'adjusting' ? 'cursor-move pointer-events-auto' : ''}
                  onMouseDown={(e) => handleMouseDown(e as unknown as React.MouseEvent, i)}
                />
                <circle
                  cx={p.x * 100}
                  cy={p.y * 100}
                  r={i === 0 && editMode === 'creating' ? 2.5 : 1.5}
                  fill={i === 0 && editMode === 'creating' ? '#f59e0b' : polygonStrokeColor}
                  stroke="white"
                  strokeWidth="0.5"
                  className={editMode === 'adjusting' ? 'pointer-events-none' : ''}
                />
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
        
        {/* Label da área */}
        {isActive && displayPoints.length >= 3 && editMode === 'none' && showPolygonOverlay && (
          <div 
            className="absolute text-xs text-white bg-black/50 px-2 py-0.5 rounded pointer-events-none"
            style={{
              left: `${Math.min(...displayPoints.map(p => p.x)) * 100}%`,
              top: `${Math.min(...displayPoints.map(p => p.y)) * 100 - 6}%`,
            }}
          >
            {cameraLabel} ({displayPoints.length} pontos)
          </div>
        )}
        
        {/* Overlay de status quando parado */}
        {!isActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            {isIpCamera ? (
              <Globe className={`w-16 h-16 mb-4 text-purple-400`} />
            ) : (
              <Camera className={`w-16 h-16 mb-4 ${iconColorClass}`} />
            )}
            <p className="text-white text-lg font-medium mb-2">
              Câmera de {cameraLabel} Parada
            </p>
            <p className="text-gray-400 text-sm mb-4">
              {isIpCamera 
                ? 'Clique em Iniciar para conectar à câmera IP'
                : 'Clique em Iniciar para começar o monitoramento'
              }
            </p>
            {isIpCamera && (
              <p className="text-purple-400 text-xs">
                Modo: Câmera IP via go2rtc
              </p>
            )}
          </div>
        )}
        
        {/* Overlay de conexão */}
        {status === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
            <div className="w-12 h-12 border-4 border-purple-400 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-white text-lg font-medium">Conectando...</p>
            <p className="text-gray-400 text-sm">{statusMessage}</p>
          </div>
        )}
        
        {/* Métricas em tempo real */}
        {isActive && status !== 'connecting' && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            {/* Movimento */}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
              motionPercent > 20 ? 'bg-yellow-500/80' : 'bg-black/50'
            } text-white`}>
              <Gauge className="w-3 h-3" />
              <span>{motionPercent.toFixed(1)}%</span>
            </div>
            
            {/* Stage de processamento */}
            {processingInfo.stage !== 'idle' && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/80 text-white text-xs">
                <Clock className="w-3 h-3" />
                <span>{processingInfo.stageLabel}</span>
                <span>({processingInfo.currentTimeMs}ms)</span>
              </div>
            )}
            
            {/* Última detecção */}
            {processingInfo.lastOcrTimeMs > 0 && processingInfo.stage === 'idle' && (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-black/50 text-white text-xs">
                <Clock className="w-3 h-3" />
                <span>Último: {processingInfo.lastOcrTimeMs}ms</span>
                <span className="text-gray-300">(média: {processingInfo.avgTimeMs}ms)</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Controles */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between gap-3">
          {/* Botão principal */}
          {!isActive ? (
            <button
              onClick={() => startMonitoring()}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-lg transition-colors ${
                isIpCamera ? 'bg-purple-600 hover:bg-purple-700' : buttonBgClass
              }`}
            >
              {isIpCamera ? <Globe className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              <span>Iniciar {cameraLabel}</span>
            </button>
          ) : (
            <button
              onClick={stopMonitoring}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Square className="w-5 h-5" />
              <span>Parar</span>
            </button>
          )}
        </div>
      </div>
      
      {/* Resultado da última detecção (se não for compacto) */}
      {!compact && lastDetection && (
        <div className={`p-4 border-t ${lastDetection.isMorador ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {lastDetection.isMorador ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              <span className={`font-semibold ${lastDetection.isMorador ? 'text-green-800' : 'text-red-800'}`}>
                {lastDetection.isMorador ? 'Morador Autorizado' : 'Veículo Desconhecido'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${isEntrada ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                {lastDetection.direcao === 'entrada' ? '⬇️ Entrada' : '⬆️ Saída'}
              </span>
            </div>
            <span className="text-sm text-gray-500">
              {new Date(lastDetection.timestamp).toLocaleTimeString('pt-BR')}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <PlacaVeiculo placa={lastDetection.placa} size="md" />
            {lastDetection.isMorador && lastDetection.casa && (
              <div className="flex items-center gap-1.5 text-green-700">
                <Home className="w-4 h-4" />
                <span className="font-semibold">Casa {lastDetection.casa}</span>
              </div>
            )}
            <div className="text-sm text-gray-500">
              Confiança: {(lastDetection.confidence * 100).toFixed(0)}%
              {lastDetection.usedFallback && (
                <span className="ml-2 text-amber-600">(API)</span>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Lista de detecções recentes (se não for compacto) */}
      {!compact && recentDetections.length > 1 && (
        <div className="p-3 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Detecções Recentes</h4>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {recentDetections.slice(1, 6).map((det, idx) => (
              <div 
                key={idx}
                className={`flex items-center justify-between p-2 rounded text-sm ${
                  det.isMorador ? 'bg-green-50' : 'bg-red-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-medium ${det.isMorador ? 'text-green-700' : 'text-red-700'}`}>
                    {det.placa}
                  </span>
                  {det.isMorador && (
                    <span className="text-green-600 text-xs">Casa {det.casa}</span>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded ${det.direcao === 'entrada' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                    {det.direcao === 'entrada' ? '⬇️' : '⬆️'}
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(det.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
