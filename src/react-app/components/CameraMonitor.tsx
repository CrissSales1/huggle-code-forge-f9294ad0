/**
 * Componente de monitoramento contínuo com webcam local
 * Exibe vídeo, área virtual poligonal, status e controles
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
  Check
} from 'lucide-react';
import { useContinuousMonitoring, MonitoringStatus } from '../hooks/useContinuousMonitoring';
import { 
  Point, 
  VirtualAreaPolygon, 
  getPolygonPoints,
} from '../utils/motionDetection';
import PlacaVeiculo from './PlacaVeiculo';

interface CameraMonitorProps {
  onDetection?: (placa: string, isMorador: boolean, casa?: string) => void;
}

type EditMode = 'none' | 'creating' | 'adjusting';

export default function CameraMonitor({ onDetection }: CameraMonitorProps) {
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
  } = useContinuousMonitoring();
  
  const [showSettings, setShowSettings] = useState(false);
  const [editMode, setEditMode] = useState<EditMode>('none');
  const [tempPoints, setTempPoints] = useState<Point[]>([]);
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
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
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Monitoramento Local</h3>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Status Badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm ${getStatusColor(status)}`}>
            <StatusIcon />
            <span>{statusMessage}</span>
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
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Câmera:</label>
            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5"
              disabled={isActive}
            >
              {availableCameras.map(cam => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  {cam.label || `Câmera ${cam.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
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
                  : 'Defina uma área poligonal clicando no vídeo'
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
        {isActive && displayPoints.length >= 2 && (
          <svg 
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ overflow: 'visible' }}
          >
            {/* Polígono preenchido */}
            {displayPoints.length >= 3 && (
              <polygon
                points={displayPoints.map(p => `${p.x * 100}%,${p.y * 100}%`).join(' ')}
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
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            )}
            
            {/* Linhas durante criação (antes de fechar) */}
            {editMode === 'creating' && displayPoints.length >= 2 && displayPoints.length < 3 && (
              <polyline
                points={displayPoints.map(p => `${p.x * 100}%,${p.y * 100}%`).join(' ')}
                fill="none"
                stroke="#fbbf24"
                strokeWidth="2"
                strokeDasharray="5,5"
                vectorEffect="non-scaling-stroke"
              />
            )}
            
            {/* Pontos editáveis */}
            {(editMode !== 'none' || showSettings) && displayPoints.map((p, i) => (
              <g key={i}>
                {/* Área clicável maior */}
                <circle
                  cx={`${p.x * 100}%`}
                  cy={`${p.y * 100}%`}
                  r="16"
                  fill="transparent"
                  className={editMode === 'adjusting' ? 'cursor-move pointer-events-auto' : ''}
                  onMouseDown={(e) => handleMouseDown(e as unknown as React.MouseEvent, i)}
                />
                {/* Ponto visível */}
                <circle
                  cx={`${p.x * 100}%`}
                  cy={`${p.y * 100}%`}
                  r={i === 0 && editMode === 'creating' ? 10 : 6}
                  fill={i === 0 && editMode === 'creating' ? '#f59e0b' : '#22c55e'}
                  stroke="white"
                  strokeWidth="2"
                  className={editMode === 'adjusting' ? 'pointer-events-none' : ''}
                />
                {/* Número do ponto */}
                {editMode !== 'none' && (
                  <text
                    x={`${p.x * 100}%`}
                    y={`${p.y * 100}%`}
                    dy="-12"
                    textAnchor="middle"
                    fill="white"
                    fontSize="12"
                    fontWeight="bold"
                    className="pointer-events-none"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
                  >
                    {i + 1}
                  </text>
                )}
              </g>
            ))}
          </svg>
        )}
        
        {/* Label da área */}
        {isActive && displayPoints.length >= 3 && editMode === 'none' && (
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
        
        {/* Motion Indicator */}
        {isActive && motionPercent > 0 && editMode === 'none' && (
          <div className="absolute bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
            Movimento: {Math.round(motionPercent * 100)}%
          </div>
        )}
      </div>
      
      {/* Controls & Last Detection */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between gap-4">
          {/* Controls */}
          <div className="flex items-center gap-2">
            {!isActive ? (
              <button
                onClick={() => startMonitoring()}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Play className="w-4 h-4" />
                Iniciar
              </button>
            ) : (
              <button
                onClick={stopMonitoring}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <Square className="w-4 h-4" />
                Parar
              </button>
            )}
          </div>
          
          {/* Last Detection */}
          {lastDetection && (
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
                  {lastDetection.usedFallback && ' • API externa'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Recent Detections */}
      {recentDetections.length > 0 && (
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
