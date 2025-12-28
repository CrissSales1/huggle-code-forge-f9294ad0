import { useState, useRef, useEffect } from 'react';
import { Camera, X, Eye, Zap, Edit3, Video, Settings, Target } from 'lucide-react';
import { usePlateRecognition } from '../hooks/usePlateRecognition';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlacaDetected: (placa: string) => void;
}

interface CameraDevice {
  deviceId: string;
  label: string;
}

interface ReadingArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function CameraModal({ isOpen, onClose, onPlacaDetected }: CameraModalProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [showCameraSelector, setShowCameraSelector] = useState(false);
  const [loadingCameras, setLoadingCameras] = useState(false);
  const [showAreaConfig, setShowAreaConfig] = useState(false);
  const [readingArea, setReadingArea] = useState<ReadingArea | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentSelection, setCurrentSelection] = useState<ReadingArea | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Hook de reconhecimento OCR local com fallback
  const { 
    isProcessing, 
    lastResult, 
    error: ocrError, 
    statusMessage,
    usedFallback,
    recognizeFromCanvas, 
    reset: resetOCR,
    cleanup: cleanupOCR 
  } = usePlateRecognition();

  // Função para obter lista de câmeras disponíveis
  const getAvailableCameras = async (): Promise<CameraDevice[]> => {
    try {
      setLoadingCameras(true);
      
      // Primeiro solicitar permissão para acessar as câmeras
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      tempStream.getTracks().forEach(track => track.stop());
      
      // Agora obter a lista de dispositivos
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      
      const cameras: CameraDevice[] = videoDevices.map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Câmera ${index + 1}`
      }));
      
      return cameras;
    } catch (err) {
      console.error('Erro ao obter câmeras disponíveis:', err);
      return [];
    } finally {
      setLoadingCameras(false);
    }
  };

  // Função para salvar câmera selecionada no localStorage
  const saveCameraPreference = (cameraId: string) => {
    localStorage.setItem('portacerta-preferred-camera', cameraId);
  };

  // Função para obter câmera salva do localStorage
  const getSavedCameraPreference = (): string | null => {
    return localStorage.getItem('portacerta-preferred-camera');
  };

  // Função para salvar área de leitura no localStorage
  const saveReadingArea = (area: ReadingArea) => {
    localStorage.setItem('portacerta-reading-area', JSON.stringify(area));
  };

  // Função para obter área de leitura salva do localStorage
  const getSavedReadingArea = (): ReadingArea | null => {
    try {
      const saved = localStorage.getItem('portacerta-reading-area');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  };

  // Função para inicializar e carregar lista de câmeras
  const initializeCameras = async () => {
    const cameras = await getAvailableCameras();
    setAvailableCameras(cameras);
    
    // Tentar usar câmera salva ou a primeira disponível
    const savedCameraId = getSavedCameraPreference();
    
    if (savedCameraId && cameras.find(cam => cam.deviceId === savedCameraId)) {
      setSelectedCameraId(savedCameraId);
    } else if (cameras.length > 0) {
      setSelectedCameraId(cameras[0].deviceId);
    }
  };

  const initCamera = async (cameraId?: string) => {
    try {
      setCameraError(null);
      setPermissionDenied(false);
      setCameraReady(false);
      
      // Se não especificou uma câmera, usar a selecionada ou a primeira disponível
      const targetCameraId = cameraId || selectedCameraId;
      
      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
        }
      };

      // Se temos um ID de câmera específico, usar ele
      if (targetCameraId) {
        (constraints.video as MediaTrackConstraints).deviceId = { exact: targetCameraId };
      } else {
        // Fallback para câmera ambiente (mobile)
        (constraints.video as MediaTrackConstraints).facingMode = 'environment';
      }
      
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          setCameraReady(true);
        };
      }
    } catch (err) {
      console.error('Erro ao acessar câmera:', err);
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setPermissionDenied(true);
        setCameraError('Acesso à câmera negado. Por favor, permita o acesso à câmera e tente novamente.');
      } else if (err instanceof Error && err.name === 'OverconstrainedError') {
        // Se falhar com câmera específica, tentar sem restrições
        if (cameraId) {
          console.warn('Falha ao usar câmera específica, tentando padrão...');
          await initCamera(); // Tentar sem especificar câmera
        } else {
          setCameraError('Câmera selecionada não está disponível. Tente selecionar outra câmera.');
        }
      } else {
        setCameraError('Erro ao acessar câmera. Verifique se há uma câmera conectada.');
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setCameraReady(false);
  };
  
  const handleCancelToManualInput = () => {
    stopCamera();
    onClose();
  };


  // Função para capturar e reconhecer placa com OCR local (Tesseract.js)
  const captureAndRecognize = async () => {
    if (!videoRef.current || !canvasRef.current || !cameraReady) {
      setCameraError('Câmera não está pronta. Aguarde um momento.');
      return;
    }

    resetOCR();

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Erro ao obter contexto do canvas');
      }

      // Usar área de leitura se configurada, senão usar imagem completa
      if (readingArea) {
        const videoWidth = video.videoWidth || video.clientWidth;
        const videoHeight = video.videoHeight || video.clientHeight;
        
        const x = Math.max(0, Math.min(readingArea.x, videoWidth));
        const y = Math.max(0, Math.min(readingArea.y, videoHeight));
        const width = Math.min(readingArea.width, videoWidth - x);
        const height = Math.min(readingArea.height, videoHeight - y);
        
        canvas.width = width;
        canvas.height = height;
        
        console.log(`=== CAPTURANDO ÁREA SELECIONADA ===`);
        console.log(`Área: ${x},${y} ${width}x${height}`);
        
        ctx.drawImage(video, x, y, width, height, 0, 0, width, height);
      } else {
        canvas.width = video.videoWidth || video.clientWidth;
        canvas.height = video.videoHeight || video.clientHeight;
        
        console.log(`=== CAPTURANDO IMAGEM COMPLETA ===`);
        console.log(`Resolução: ${canvas.width}x${canvas.height}`);
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      
      // Usar OCR local gratuito (Tesseract.js)
      console.log('🔍 Iniciando OCR local (Tesseract.js)...');
      const result = await recognizeFromCanvas(canvas);
      
      if (result.success && result.validation.isValid) {
        const placa = result.validation.formatted;
        console.log(`✅ PLACA RECONHECIDA: ${placa} (${Math.round(result.validation.confidence * 100)}% confiança)`);
        
        setTimeout(() => {
          onPlacaDetected(result.validation.corrected);
          onClose();
        }, 1500);
      }
      
    } catch (err) {
      console.error('Erro no reconhecimento:', err);
      setCameraError(`Erro ao processar a imagem: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
    }
  };

  // Função para mudar câmera
  const handleCameraChange = async (cameraId: string) => {
    setSelectedCameraId(cameraId);
    saveCameraPreference(cameraId);
    stopCamera();
    await initCamera(cameraId);
  };

  // Funções para seleção de área de leitura
  const getVideoCoordinates = (event: React.MouseEvent<HTMLVideoElement>) => {
    const video = videoRef.current;
    if (!video) return null;

    const rect = video.getBoundingClientRect();
    const scaleX = video.videoWidth / rect.width;
    const scaleY = video.videoHeight / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLVideoElement>) => {
    if (!showAreaConfig) return;
    const coords = getVideoCoordinates(event);
    if (!coords) return;
    setIsSelecting(true);
    setStartPoint(coords);
    setCurrentSelection(null);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLVideoElement>) => {
    if (!showAreaConfig || !isSelecting || !startPoint) return;
    const coords = getVideoCoordinates(event);
    if (!coords) return;

    const selection: ReadingArea = {
      x: Math.min(startPoint.x, coords.x),
      y: Math.min(startPoint.y, coords.y),
      width: Math.abs(coords.x - startPoint.x),
      height: Math.abs(coords.y - startPoint.y)
    };
    setCurrentSelection(selection);
  };

  const handleMouseUp = () => {
    if (!showAreaConfig || !isSelecting || !currentSelection) return;
    setIsSelecting(false);
    setStartPoint(null);
  };

  const handleConfirmarArea = () => {
    if (currentSelection && currentSelection.width > 50 && currentSelection.height > 50) {
      setReadingArea(currentSelection);
      saveReadingArea(currentSelection);
      setCurrentSelection(null);
      setShowAreaConfig(false);
    }
  };

  const handleCancelarSelecao = () => {
    setCurrentSelection(null);
    setIsSelecting(false);
    setStartPoint(null);
    setShowAreaConfig(false);
  };

  const clearReadingArea = () => {
    setReadingArea(null);
    localStorage.removeItem('portacerta-reading-area');
  };

  useEffect(() => {
    if (isOpen) {
      const savedArea = getSavedReadingArea();
      if (savedArea) {
        setReadingArea(savedArea);
      }
      
      initializeCameras().then(() => {
        if (selectedCameraId) {
          initCamera(selectedCameraId);
        } else {
          initCamera();
        }
      });
    } else {
      stopCamera();
      setCameraError(null);
      resetOCR();
      setShowCameraSelector(false);
      setShowAreaConfig(false);
      setReadingArea(null);
      setIsSelecting(false);
      setStartPoint(null);
      setCurrentSelection(null);
    }

    return () => {
      stopCamera();
      cleanupOCR();
    };
  }, [isOpen, resetOCR, cleanupOCR]);

  useEffect(() => {
    if (isOpen && selectedCameraId && !stream) {
      initCamera(selectedCameraId);
    }
  }, [selectedCameraId, isOpen]);

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-2 sm:p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[98vh] sm:max-h-[95vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Leitura de Placa</h2>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAreaConfig(!showAreaConfig)}
              className={`flex items-center space-x-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${
                showAreaConfig 
                  ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
              title="Configurar Área de Leitura"
            >
              <Target className="w-3 h-3" />
              <span className="hidden sm:inline">
                {showAreaConfig ? 'Cancelar' : 'Área'}
              </span>
            </button>

            {availableCameras.length > 1 && (
              <button
                onClick={() => setShowCameraSelector(!showCameraSelector)}
                className="flex items-center space-x-1 px-2 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                title="Selecionar Câmera"
              >
                <Video className="w-3 h-3" />
                <span className="hidden sm:inline">Câmeras ({availableCameras.length})</span>
                <span className="sm:hidden">({availableCameras.length})</span>
              </button>
            )}
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isProcessing}
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 sm:p-4">
            {showAreaConfig && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-start space-x-2 mb-3">
                  <Target className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-medium text-blue-900">Configurar Área de Leitura</h3>
                    <p className="text-xs text-blue-700 mt-1">
                      Clique e arraste na câmera para selecionar a área onde a placa aparece.
                    </p>
                  </div>
                </div>
                
                {readingArea && !currentSelection && (
                  <div className="flex items-center justify-between bg-green-100 rounded-lg p-2 mb-2">
                    <div className="text-xs text-green-800">
                      <span className="font-medium">✅ Área configurada:</span> {Math.round(readingArea.width)}×{Math.round(readingArea.height)}px
                    </div>
                    <button
                      onClick={clearReadingArea}
                      className="text-xs text-green-700 hover:text-green-900 underline"
                    >
                      Limpar
                    </button>
                  </div>
                )}

                {currentSelection && (
                  <div className="bg-orange-100 rounded-lg p-3 mb-2">
                    <div className="text-xs text-orange-800 mb-2">
                      <span className="font-medium">📐 Área selecionada:</span> {Math.round(currentSelection.width)}×{Math.round(currentSelection.height)}px
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={handleConfirmarArea}
                        className="flex-1 text-xs bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors"
                        disabled={currentSelection.width < 50 || currentSelection.height < 50}
                      >
                        ✅ Confirmar Área
                      </button>
                      <button
                        onClick={handleCancelarSelecao}
                        className="flex-1 text-xs bg-gray-500 text-white px-3 py-2 rounded-lg hover:bg-gray-600 transition-colors"
                      >
                        ❌ Cancelar
                      </button>
                    </div>
                    {(currentSelection.width < 50 || currentSelection.height < 50) && (
                      <div className="text-xs text-red-600 mt-1">
                        Área muito pequena. Selecione uma área maior (mínimo 50x50px).
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {showCameraSelector && availableCameras.length > 1 && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <Settings className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-medium text-blue-900">Selecionar Câmera</h3>
                </div>
                
                {loadingCameras ? (
                  <div className="text-center py-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-xs text-blue-700 mt-1">Carregando câmeras...</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {availableCameras.map((camera, index) => (
                      <button
                        key={camera.deviceId}
                        onClick={() => handleCameraChange(camera.deviceId)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedCameraId === camera.deviceId
                            ? 'bg-blue-100 border-2 border-blue-300 text-blue-900 font-medium'
                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <Video className="w-3 h-3" />
                          <span className="truncate">{camera.label || `Câmera ${index + 1}`}</span>
                          {selectedCameraId === camera.deviceId && (
                            <span className="ml-auto text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full flex-shrink-0">
                              Ativa
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(ocrError || cameraError) && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-3 sm:px-4 rounded-lg">
                <div className="font-medium text-sm">Erro no reconhecimento</div>
                <div className="text-xs sm:text-sm mt-1 break-words">{ocrError || cameraError}</div>
                {permissionDenied && (
                  <div className="mt-2">
                    <button
                      onClick={() => initCamera()}
                      className="text-xs sm:text-sm underline hover:no-underline"
                    >
                      Tentar novamente
                    </button>
                  </div>
                )}
              </div>
            )}

            {isProcessing && statusMessage && (
              <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-700 px-3 py-3 sm:px-4 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-blue-600 flex-shrink-0"></div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm">Reconhecendo placa (OCR local)...</div>
                    <div className="text-xs sm:text-sm break-words">{statusMessage}</div>
                  </div>
                </div>
              </div>
            )}

            {lastResult?.success && (
              <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-3 py-3 sm:px-4 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="text-green-600 text-xl">✅</div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm">Placa reconhecida!</div>
                    <div className="text-lg font-bold">{lastResult.validation.formatted}</div>
                    <div className="text-xs">
                      Confiança: {Math.round(lastResult.validation.confidence * 100)}% | 
                      Tempo: {lastResult.processingTimeMs.toFixed(0)}ms |
                      {usedFallback ? ' 🌐 API externa' : ' 💻 OCR local'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="relative mb-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                className={`w-full h-64 sm:h-80 lg:h-96 bg-gray-900 rounded-lg object-cover ${
                  showAreaConfig ? 'cursor-crosshair' : ''
                }`}
              />

              {readingArea && !showAreaConfig && videoRef.current && (
                <div 
                  className="absolute border-2 border-green-400 bg-green-400 bg-opacity-20 pointer-events-none"
                  style={{
                    left: `${(readingArea.x / videoRef.current.videoWidth) * 100}%`,
                    top: `${(readingArea.y / videoRef.current.videoHeight) * 100}%`,
                    width: `${(readingArea.width / videoRef.current.videoWidth) * 100}%`,
                    height: `${(readingArea.height / videoRef.current.videoHeight) * 100}%`,
                  }}
                >
                  <div className="absolute -top-6 left-0 bg-green-500 text-white text-xs px-2 py-1 rounded">
                    Área de Leitura
                  </div>
                </div>
              )}

              {currentSelection && showAreaConfig && videoRef.current && (
                <div 
                  className="absolute border-2 border-blue-400 bg-blue-400 bg-opacity-20 pointer-events-none"
                  style={{
                    left: `${(currentSelection.x / videoRef.current.videoWidth) * 100}%`,
                    top: `${(currentSelection.y / videoRef.current.videoHeight) * 100}%`,
                    width: `${(currentSelection.width / videoRef.current.videoWidth) * 100}%`,
                    height: `${(currentSelection.height / videoRef.current.videoHeight) * 100}%`,
                  }}
                >
                  <div className="absolute -top-6 left-0 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                    Nova Seleção
                  </div>
                </div>
              )}
              
              {!stream && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 rounded-lg">
                  <div className="text-white text-center">
                    <Eye className="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-2 animate-pulse" />
                    <p className="text-sm sm:text-base">Inicializando câmera...</p>
                  </div>
                </div>
              )}

              {stream && !cameraReady && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 rounded-lg">
                  <div className="text-white text-center">
                    <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-b-2 border-white mx-auto mb-2"></div>
                    <p className="text-sm sm:text-base">Preparando câmera...</p>
                  </div>
                </div>
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
        
        <div className="border-t border-gray-200 bg-white p-3 sm:p-4 flex-shrink-0">
          <div className="flex flex-col sm:flex-row justify-center space-y-3 sm:space-y-0 sm:space-x-3">
            <button
              onClick={handleCancelToManualInput}
              className="flex-1 sm:flex-none px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center space-x-2"
              disabled={isProcessing}
            >
              <Edit3 className="w-4 h-4" />
              <span>Digitar Manualmente</span>
            </button>
            
            <button
              onClick={captureAndRecognize}
              disabled={!cameraReady || isProcessing || showAreaConfig || !!currentSelection}
              className="flex-1 sm:flex-none px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              title={
                currentSelection
                  ? "Confirme ou cancele a seleção primeiro"
                  : showAreaConfig 
                  ? "Termine a configuração da área primeiro" 
                  : readingArea 
                  ? "Ler placa na área configurada" 
                  : "Ler placa na imagem completa"
              }
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Processando...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>{readingArea ? 'Ler Área' : 'Ler Placa'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
