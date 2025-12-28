import { useState, useRef, useCallback } from 'react';
import { 
  VideoOff, Play, Square, Settings, Camera, 
  AlertCircle, CheckCircle, Clock, Car, Gauge, 
  Pencil, Check, Volume2, VolumeX
} from 'lucide-react';
import { useWebcamStream } from '@/react-app/hooks/useWebcamStream';
import { useMotionDetection, type DetectionZone as DetectionZoneType } from '@/react-app/hooks/useMotionDetection';
import { usePlateRecognition } from '@/react-app/hooks/usePlateRecognition';
import DetectionZone from '@/react-app/components/DetectionZone';
import PlacaVeiculo from '@/react-app/components/PlacaVeiculo';
import { supabase } from '@/integrations/supabase/client';

interface Detection {
  id: number;
  placa: string;
  timestamp: Date;
  confidence: number;
  isMorador: boolean;
  casa?: string;
  usedFallback: boolean;
}

export default function MonitoramentoLocal() {
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [isEditingZone, setIsEditingZone] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [stats, setStats] = useState({ total: 0, moradores: 0, visitantes: 0 });
  const detectionIdRef = useRef(0);

  // Hooks
  const { 
    videoRef, 
    isStreaming, 
    error: webcamError, 
    devices, 
    selectedDevice,
    startStream, 
    stopStream, 
    captureFrame,
    selectDevice 
  } = useWebcamStream();

  const { 
    recognizeFromCanvas, 
    isProcessing, 
    lastResult, 
    statusMessage,
    usedFallback,
    reset: resetOCR 
  } = usePlateRecognition();

  // Callback quando movimento é detectado
  const handleMotionDetected = useCallback(async (frame: HTMLCanvasElement) => {
    if (isProcessing) return;

    console.log('🚗 Processando frame capturado...');
    
    const result = await recognizeFromCanvas(frame);
    
    if (result.success && result.validation.isValid) {
      const placa = result.validation.corrected;
      
      // Verificar se é morador
      const { data: morador } = await supabase
        .from('veiculos_moradores')
        .select('casa')
        .eq('placa_veiculo', placa)
        .maybeSingle();

      const isMorador = !!morador;
      
      // Registrar detecção no banco
      await supabase.from('lpr_deteccoes').insert({
        placa_detectada: placa,
        timestamp: new Date().toISOString(),
        confidence: result.ocrConfidence,
        is_morador: isMorador,
        casa_morador: morador?.casa || null,
      });

      // Adicionar à lista local
      const detection: Detection = {
        id: ++detectionIdRef.current,
        placa,
        timestamp: new Date(),
        confidence: result.ocrConfidence,
        isMorador,
        casa: morador?.casa,
        usedFallback: usedFallback,
      };

      setDetections(prev => [detection, ...prev].slice(0, 50));
      setStats(prev => ({
        total: prev.total + 1,
        moradores: prev.moradores + (isMorador ? 1 : 0),
        visitantes: prev.visitantes + (isMorador ? 0 : 1),
      }));

      // Som de notificação
      if (soundEnabled) {
        const audio = new Audio(isMorador 
          ? 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleW' // Beep curto
          : 'data:audio/wav;base64,UklGRl9vT19teleW' // Beep duplo
        );
        audio.volume = 0.3;
        audio.play().catch(() => {});
      }

      console.log(`✅ Placa detectada: ${placa} | Morador: ${isMorador}`);
    }
  }, [isProcessing, recognizeFromCanvas, usedFallback, soundEnabled]);

  const {
    isMonitoring,
    motionDetected,
    config,
    startMonitoring,
    stopMonitoring,
    updateConfig,
    motionLevel,
  } = useMotionDetection(handleMotionDetected);

  // Iniciar/parar monitoramento completo
  const handleStartMonitoring = useCallback(async () => {
    if (!isStreaming) {
      await startStream();
    }
    // Aguardar o vídeo estar pronto
    setTimeout(() => {
      startMonitoring(captureFrame);
    }, 1000);
  }, [isStreaming, startStream, startMonitoring, captureFrame]);

  const handleStopMonitoring = useCallback(() => {
    stopMonitoring();
    stopStream();
    resetOCR();
  }, [stopMonitoring, stopStream, resetOCR]);

  // Atualizar zona
  const handleZoneChange = useCallback((zone: DetectionZoneType) => {
    updateConfig({ zone });
  }, [updateConfig]);

  // Formatar tempo
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Camera className="w-7 h-7 text-blue-600" />
          Monitoramento Local (Webcam)
        </h1>
        <p className="text-gray-600 mt-1">
          Sistema de reconhecimento de placas usando webcam local com OCR Tesseract.js
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Área de Vídeo */}
        <div className="lg:col-span-2 space-y-4">
          {/* Player de Vídeo */}
          <div className="bg-gray-900 rounded-xl overflow-hidden shadow-lg">
            <div 
              ref={videoContainerRef}
              className="relative aspect-video bg-gray-800"
            >
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                playsInline
                muted
              />

              {/* Zona de Detecção */}
              {isStreaming && (
                <DetectionZone
                  zone={config.zone}
                  onZoneChange={handleZoneChange}
                  isEditing={isEditingZone}
                  containerRef={videoContainerRef}
                />
              )}

              {/* Overlay quando não está transmitindo */}
              {!isStreaming && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                  <VideoOff className="w-16 h-16 mb-4" />
                  <p>Webcam não iniciada</p>
                  <p className="text-sm text-gray-500 mt-1">Clique em "Iniciar" para começar</p>
                </div>
              )}

              {/* Indicadores */}
              <div className="absolute top-4 left-4 flex flex-col gap-2">
                {isMonitoring && (
                  <div className="flex items-center gap-2 bg-red-600 text-white px-3 py-1.5 rounded-full text-sm font-medium animate-pulse">
                    <div className="w-2 h-2 bg-white rounded-full" />
                    MONITORANDO
                  </div>
                )}

                {motionDetected && (
                  <div className="flex items-center gap-2 bg-yellow-500 text-yellow-900 px-3 py-1.5 rounded-full text-sm font-medium">
                    <Car className="w-4 h-4" />
                    Movimento Detectado!
                  </div>
                )}

                {isProcessing && (
                  <div className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-full text-sm font-medium">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processando OCR...
                  </div>
                )}
              </div>

              {/* Medidor de movimento */}
              {isMonitoring && (
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="flex items-center gap-2 bg-black/50 rounded-lg px-3 py-2">
                    <Gauge className="w-4 h-4 text-gray-300" />
                    <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-200 ${
                          motionLevel > 15 ? 'bg-red-500' : motionLevel > 8 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(100, motionLevel * 3)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-300 w-8">{motionLevel}%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Controles */}
            <div className="bg-gray-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {!isMonitoring ? (
                  <button
                    onClick={handleStartMonitoring}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    Iniciar Monitoramento
                  </button>
                ) : (
                  <button
                    onClick={handleStopMonitoring}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    <Square className="w-4 h-4" />
                    Parar
                  </button>
                )}

                {isStreaming && (
                  <button
                    onClick={() => setIsEditingZone(!isEditingZone)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      isEditingZone 
                        ? 'bg-yellow-500 text-yellow-900' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {isEditingZone ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                    {isEditingZone ? 'Salvar Zona' : 'Editar Zona'}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`p-2 rounded-lg transition-colors ${
                    soundEnabled ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'
                  }`}
                  title={soundEnabled ? 'Som ativado' : 'Som desativado'}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>

                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Painel de Configurações */}
          {showSettings && (
            <div className="bg-white rounded-xl shadow-lg p-4 space-y-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Configurações
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Seleção de Câmera */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Câmera
                  </label>
                  <select
                    value={selectedDevice || ''}
                    onChange={(e) => selectDevice(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {devices.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sensibilidade */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sensibilidade de Movimento
                  </label>
                  <select
                    value={config.sensitivity}
                    onChange={(e) => updateConfig({ sensitivity: e.target.value as 'low' | 'medium' | 'high' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="low">Baixa (menos detecções)</option>
                    <option value="medium">Média (recomendado)</option>
                    <option value="high">Alta (mais sensível)</option>
                  </select>
                </div>

                {/* Intervalo de Debounce */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Intervalo entre Detecções
                  </label>
                  <select
                    value={config.debounceMs}
                    onChange={(e) => updateConfig({ debounceMs: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={2000}>2 segundos</option>
                    <option value={3000}>3 segundos</option>
                    <option value={5000}>5 segundos</option>
                    <option value={10000}>10 segundos</option>
                  </select>
                </div>
              </div>

              {webcamError && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <p className="text-sm">{webcamError}</p>
                </div>
              )}
            </div>
          )}

          {/* Status do OCR */}
          {statusMessage && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-blue-700 text-sm">{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Painel Lateral */}
        <div className="space-y-4">
          {/* Estatísticas */}
          <div className="bg-white rounded-xl shadow-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Estatísticas da Sessão</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
                <p className="text-xs text-gray-600">Total</p>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{stats.moradores}</p>
                <p className="text-xs text-gray-600">Moradores</p>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <p className="text-2xl font-bold text-orange-600">{stats.visitantes}</p>
                <p className="text-xs text-gray-600">Visitantes</p>
              </div>
            </div>
          </div>

          {/* Log de Detecções */}
          <div className="bg-white rounded-xl shadow-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center justify-between">
              <span>Detecções Recentes</span>
              {detections.length > 0 && (
                <button 
                  onClick={() => setDetections([])}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Limpar
                </button>
              )}
            </h3>

            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {detections.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Car className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma detecção ainda</p>
                  <p className="text-xs">As placas detectadas aparecerão aqui</p>
                </div>
              ) : (
                detections.map(detection => (
                  <div 
                    key={detection.id}
                    className={`p-3 rounded-lg border-l-4 ${
                      detection.isMorador 
                        ? 'bg-green-50 border-green-500' 
                        : 'bg-orange-50 border-orange-500'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <PlacaVeiculo placa={detection.placa} size="sm" />
                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                          <Clock className="w-3 h-3" />
                          {formatTime(detection.timestamp)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                          detection.isMorador 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-orange-100 text-orange-700'
                        }`}>
                          {detection.isMorador ? (
                            <>
                              <CheckCircle className="w-3 h-3" />
                              Morador
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3 h-3" />
                              Visitante
                            </>
                          )}
                        </div>
                        {detection.casa && (
                          <p className="text-xs text-gray-500 mt-1">Casa {detection.casa}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">
                          {Math.round(detection.confidence * 100)}% conf.
                          {detection.usedFallback && ' (API)'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Última Detecção em Destaque */}
          {lastResult && lastResult.success && (
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-xl shadow-lg p-4 text-white">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Car className="w-5 h-5" />
                Última Placa Detectada
              </h3>
              <div className="bg-white/10 backdrop-blur rounded-lg p-3">
                <PlacaVeiculo placa={lastResult.validation.corrected} size="lg" />
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-blue-200">Confiança OCR</p>
                    <p className="font-semibold">{Math.round(lastResult.ocrConfidence * 100)}%</p>
                  </div>
                  <div>
                    <p className="text-blue-200">Tempo</p>
                    <p className="font-semibold">{lastResult.processingTimeMs.toFixed(0)}ms</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
