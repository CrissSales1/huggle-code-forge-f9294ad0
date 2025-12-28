/**
 * Componente de monitoramento contínuo com webcam local
 * Exibe vídeo, área virtual, status e controles
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
  Maximize2,
  Home
} from 'lucide-react';
import { useContinuousMonitoring, MonitoringStatus } from '../hooks/useContinuousMonitoring';
import { VirtualArea } from '../utils/motionDetection';
import PlacaVeiculo from './PlacaVeiculo';

interface CameraMonitorProps {
  onDetection?: (placa: string, isMorador: boolean, casa?: string) => void;
}

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
  const [isEditingArea, setIsEditingArea] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startArea: VirtualArea } | null>(null);
  
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
  
  // Handlers para edição da área virtual
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isEditingArea || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    dragRef.current = {
      startX: x,
      startY: y,
      startArea: { ...virtualArea },
    };
  }, [isEditingArea, virtualArea]);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = (e.clientX - rect.left) / rect.width;
    const currentY = (e.clientY - rect.top) / rect.height;
    
    const newArea: VirtualArea = {
      x: Math.min(dragRef.current.startX, currentX),
      y: Math.min(dragRef.current.startY, currentY),
      width: Math.abs(currentX - dragRef.current.startX),
      height: Math.abs(currentY - dragRef.current.startY),
    };
    
    // Limitar área mínima
    if (newArea.width >= 0.1 && newArea.height >= 0.1) {
      updateVirtualArea(newArea);
    }
  }, [updateVirtualArea]);
  
  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      setIsEditingArea(false);
    }
  }, []);
  
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
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsEditingArea(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
              disabled={!isActive}
            >
              <Maximize2 className="w-4 h-4" />
              Redefinir Área de Leitura
            </button>
            <span className="text-xs text-gray-500">
              Clique e arraste no vídeo para definir a área
            </span>
          </div>
        </div>
      )}
      
      {/* Video Container */}
      <div 
        ref={containerRef}
        className="relative aspect-video bg-gray-900"
        onMouseDown={handleMouseDown}
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
        
        {/* Virtual Area Overlay */}
        {isActive && (
          <div
            className={`absolute border-2 ${
              isEditingArea 
                ? 'border-yellow-400 bg-yellow-400/20 cursor-crosshair' 
                : status === 'motion_detected' || status === 'processing'
                  ? 'border-yellow-500 bg-yellow-500/10'
                  : 'border-green-500 bg-green-500/10'
            } transition-colors`}
            style={{
              left: `${virtualArea.x * 100}%`,
              top: `${virtualArea.y * 100}%`,
              width: `${virtualArea.width * 100}%`,
              height: `${virtualArea.height * 100}%`,
            }}
          >
            <span className="absolute -top-6 left-0 text-xs text-white bg-black/50 px-2 py-0.5 rounded">
              Área de Leitura
            </span>
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
        
        {/* Editing Overlay */}
        {isEditingArea && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center cursor-crosshair">
            <p className="text-white text-lg bg-black/50 px-4 py-2 rounded-lg">
              Clique e arraste para definir a área de leitura
            </p>
          </div>
        )}
        
        {/* Motion Indicator */}
        {isActive && motionPercent > 0 && (
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
