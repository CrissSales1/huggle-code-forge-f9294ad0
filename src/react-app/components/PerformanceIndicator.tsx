/**
 * Componente visual para exibir métricas de performance em tempo real
 */
import { Cpu, Gauge, Clock, Zap, CheckCircle, XCircle, Loader2, Brain } from 'lucide-react';
import { PerformanceMetrics } from '../hooks/usePerformanceMetrics';

interface PerformanceIndicatorProps {
  metrics: PerformanceMetrics;
  compact?: boolean;
  modelLoaded?: boolean;
  modelLoading?: boolean;
  yoloBackend?: string;
}

export default function PerformanceIndicator({ 
  metrics, 
  compact = false,
  modelLoaded = false,
  modelLoading = false,
  yoloBackend = 'unknown',
}: PerformanceIndicatorProps) {
  const { fps, frameTimeMs, ocrTimeMs, memoryMB, workerStatus } = metrics;
  
  // Determinar cor do FPS baseado na performance
  const getFpsColor = () => {
    if (fps >= 25) return 'text-green-400';
    if (fps >= 15) return 'text-yellow-400';
    return 'text-red-400';
  };
  
  // Ícone do status do worker
  const WorkerStatusIcon = () => {
    switch (workerStatus) {
      case 'ready':
        return <CheckCircle className="w-3 h-3 text-green-400" />;
      case 'processing':
        return <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />;
      case 'error':
        return <XCircle className="w-3 h-3 text-red-400" />;
      default:
        return <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />;
    }
  };
  
  // Ícone e cor do status do modelo YOLO
  const getModelStatusColor = () => {
    if (modelLoaded) return 'text-green-400';
    if (modelLoading) return 'text-yellow-400';
    return 'text-gray-500';
  };
  
  const getModelStatusText = () => {
    if (modelLoaded) return 'YOLO ✓';
    if (modelLoading) return 'YOLO...';
    return 'YOLO ✗';
  };
  
  // Backend GPU/CPU
  const getBackendColor = () => {
    if (yoloBackend === 'webgl') return 'text-green-400';
    if (yoloBackend === 'cpu') return 'text-gray-400';
    return 'text-gray-500';
  };
  
  const getBackendLabel = () => {
    if (yoloBackend === 'webgl') return 'GPU';
    if (yoloBackend === 'cpu') return 'CPU';
    return '—';
  };
  
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs font-mono bg-gray-900/80 text-gray-300 px-2 py-1 rounded backdrop-blur-sm">
        <span className={getFpsColor()}>{fps} FPS</span>
        <span className="text-gray-500">|</span>
        <span>{frameTimeMs}ms</span>
        <WorkerStatusIcon />
        <span className={getModelStatusColor()}>
          <Brain className="w-3 h-3 inline mr-0.5" />
          {modelLoaded ? '✓' : modelLoading ? '...' : '✗'}
        </span>
        {modelLoaded && (
          <span className={getBackendColor()}>{getBackendLabel()}</span>
        )}
      </div>
    );
  }
  
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs font-mono bg-gray-900/90 text-gray-300 px-3 py-1.5 rounded-lg backdrop-blur-sm border border-gray-700">
      {/* FPS */}
      <div className="flex items-center gap-1.5">
        <Gauge className="w-3.5 h-3.5 text-gray-500" />
        <span className={getFpsColor()}>{fps}</span>
        <span className="text-gray-500">FPS</span>
      </div>
      
      {/* Frame Time */}
      <div className="flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-gray-300">{frameTimeMs}</span>
        <span className="text-gray-500">ms</span>
      </div>
      
      {/* OCR Time */}
      {ocrTimeMs > 0 && (
        <div className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-amber-400">{(ocrTimeMs / 1000).toFixed(2)}s</span>
          <span className="text-gray-500">OCR</span>
        </div>
      )}
      
      {/* Memory */}
      {memoryMB !== null && (
        <div className="flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-gray-300">{memoryMB}</span>
          <span className="text-gray-500">MB</span>
        </div>
      )}
      
      {/* Worker Status */}
      <div className="flex items-center gap-1.5">
        <WorkerStatusIcon />
        <span className="text-gray-500">Worker</span>
      </div>
      
      {/* YOLO Model Status */}
      <div className="flex items-center gap-1.5">
        <Brain className={`w-3.5 h-3.5 ${getModelStatusColor()}`} />
        <span className={getModelStatusColor()}>{getModelStatusText()}</span>
      </div>
      
      {/* Backend GPU/CPU */}
      {modelLoaded && (
        <div className="flex items-center gap-1.5">
          <span className={`font-bold ${getBackendColor()}`}>{getBackendLabel()}</span>
        </div>
      )}
    </div>
  );
}
