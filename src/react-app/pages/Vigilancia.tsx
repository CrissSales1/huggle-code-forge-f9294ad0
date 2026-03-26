/**
 * Página de Vigilância - Detecção de Pessoas com MediaPipe
 * v1.3.0
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Shield, Play, Square, Camera, Maximize2, AlertTriangle, User, Settings, RotateCcw } from 'lucide-react';
import { usePersonDetection } from '@/react-app/hooks/usePersonDetection';
import { type Point } from '@/react-app/utils/motionDetection';
// v1.4.0: Uses objectDetector.ts under the hood via usePersonDetection

type CameraSource = 'webcam' | 'ip';

const DEFAULT_AREA: Point[] = [
  { x: 0.15, y: 0.15 },
  { x: 0.85, y: 0.15 },
  { x: 0.85, y: 0.85 },
  { x: 0.15, y: 0.85 },
];

const COOLDOWN_OPTIONS = [
  { value: 5000, label: '5s' },
  { value: 10000, label: '10s' },
  { value: 30000, label: '30s' },
  { value: 60000, label: '1min' },
];

export default function Vigilancia() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [cameraSource, setCameraSource] = useState<CameraSource>('webcam');
  const [ipUrl, setIpUrl] = useState('');
  const [cameraStarted, setCameraStarted] = useState(false);
  const [areaPoints, setAreaPoints] = useState<Point[]>(DEFAULT_AREA);
  const [isDrawingArea, setIsDrawingArea] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [cooldown, setCooldown] = useState(10000);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const {
    isLoading,
    isDetecting,
    personsInArea,
    allPersons,
    lastAlertTime,
    error,
    setVideo,
    setArea,
    startDetection,
    stopDetection,
  } = usePersonDetection({ cooldownMs: cooldown });

  // Listar câmeras disponíveis
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(devs => {
      const videoDevs = devs.filter(d => d.kind === 'videoinput');
      setDevices(videoDevs);
      if (videoDevs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevs[0].deviceId);
      }
    });
  }, []);

  // Manter área sincronizada com o hook
  useEffect(() => {
    setArea(areaPoints);
  }, [areaPoints, setArea]);

  // Iniciar câmera
  const startCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (cameraSource === 'webcam') {
        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();
      } else if (ipUrl) {
        video.src = ipUrl;
        await video.play();
      }

      setCameraStarted(true);
      setVideo(video);
    } catch (err) {
      console.error('Erro ao iniciar câmera:', err);
      alert('Erro ao acessar a câmera. Verifique as permissões.');
    }
  }, [cameraSource, selectedDeviceId, ipUrl, setVideo]);

  // Parar câmera
  const stopCamera = useCallback(() => {
    stopDetection();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = '';
    }
    setCameraStarted(false);
  }, [stopDetection]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Desenhar overlay no canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    let animId: number;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;

      // Desenhar área virtual
      const points = isDrawingArea ? drawingPoints : areaPoints;
      if (points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(points[0].x * w, points[0].y * h);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x * w, points[i].y * h);
        }
        if (!isDrawingArea || points.length >= 3) {
          ctx.closePath();
        }

        // Preenchimento
        const hasAlert = personsInArea.length > 0;
        ctx.fillStyle = hasAlert
          ? 'rgba(239, 68, 68, 0.25)'
          : 'rgba(59, 130, 246, 0.15)';
        ctx.fill();

        // Borda
        ctx.strokeStyle = hasAlert ? '#ef4444' : '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash(hasAlert ? [] : [8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Pontos arrastáveis
        points.forEach((p, i) => {
          ctx.beginPath();
          ctx.arc(p.x * w, p.y * h, 6, 0, Math.PI * 2);
          ctx.fillStyle = draggingPoint === i ? '#fbbf24' : '#ffffff';
          ctx.fill();
          ctx.strokeStyle = hasAlert ? '#ef4444' : '#3b82f6';
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }

      // Desenhar bounding boxes de pessoas
      if (video.videoWidth > 0) {
        const scaleX = w / video.videoWidth;
        const scaleY = h / video.videoHeight;

        allPersons.forEach(person => {
          const inArea = personsInArea.includes(person);
          const bx = person.x * scaleX;
          const by = person.y * scaleY;
          const bw = person.width * scaleX;
          const bh = person.height * scaleY;

          ctx.strokeStyle = inArea ? '#ef4444' : '#22c55e';
          ctx.lineWidth = 2;
          ctx.strokeRect(bx, by, bw, bh);

          // Label
          const label = `Pessoa ${Math.round(person.confidence * 100)}%`;
          ctx.font = '12px sans-serif';
          const textW = ctx.measureText(label).width;
          ctx.fillStyle = inArea ? '#ef4444' : '#22c55e';
          ctx.fillRect(bx, by - 18, textW + 8, 18);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, bx + 4, by - 4);
        });
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [areaPoints, drawingPoints, isDrawingArea, personsInArea, allPersons, draggingPoint]);

  // Handlers para desenhar/arrastar área
  const getRelativePos = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e: React.MouseEvent) => {
    const pos = getRelativePos(e);
    if (!pos) return;

    if (isDrawingArea) {
      if (drawingPoints.length >= 2) {
        // Fechar se clicar perto do primeiro ponto
        const first = drawingPoints[0];
        const dist = Math.sqrt((pos.x - first.x) ** 2 + (pos.y - first.y) ** 2);
        if (dist < 0.04 && drawingPoints.length >= 3) {
          setAreaPoints([...drawingPoints]);
          setIsDrawingArea(false);
          setDrawingPoints([]);
          return;
        }
      }
      setDrawingPoints(prev => [...prev, pos]);
      return;
    }

    // Verificar se clicou em um ponto existente para arrastar
    const container = containerRef.current;
    if (!container) return;
    for (let i = 0; i < areaPoints.length; i++) {
      const dist = Math.sqrt((pos.x - areaPoints[i].x) ** 2 + (pos.y - areaPoints[i].y) ** 2);
      if (dist < 0.03) {
        setDraggingPoint(i);
        return;
      }
    }
  };

  const handlePointerMove = (e: React.MouseEvent) => {
    if (draggingPoint === null) return;
    const pos = getRelativePos(e);
    if (!pos) return;
    setAreaPoints(prev => prev.map((p, i) => (i === draggingPoint ? pos : p)));
  };

  const handlePointerUp = () => {
    setDraggingPoint(null);
  };

  const startDrawingArea = () => {
    setIsDrawingArea(true);
    setDrawingPoints([]);
  };

  const resetArea = () => {
    setAreaPoints(DEFAULT_AREA);
    setIsDrawingArea(false);
    setDrawingPoints([]);
  };

  const timeSinceAlert = lastAlertTime ? Math.round((Date.now() - lastAlertTime) / 1000) : null;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-blue-600" />
          <h2 className="text-lg sm:text-xl font-bold text-gray-800">Vigilância</h2>
          {isDetecting && (
            <span className="flex items-center gap-1 bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded-full">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Ativo
            </span>
          )}
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Alerta visual */}
      {personsInArea.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 animate-pulse">
          <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
          <div>
            <p className="font-bold text-red-700">
              ⚠️ {personsInArea.length} pessoa(s) detectada(s) na área monitorada!
            </p>
            <p className="text-red-600 text-sm">Verifique a câmera imediatamente.</p>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="mb-4 p-4 bg-white border border-gray-200 rounded-lg shadow-sm space-y-3">
          <h3 className="font-semibold text-gray-700 text-sm">Configurações de Vigilância</h3>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Fonte da câmera</label>
            <div className="flex gap-2">
              <button
                onClick={() => setCameraSource('webcam')}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${cameraSource === 'webcam' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                <Camera className="w-4 h-4 inline mr-1" /> Webcam
              </button>
              <button
                onClick={() => setCameraSource('ip')}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${cameraSource === 'ip' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                IP / URL
              </button>
            </div>
          </div>

          {cameraSource === 'webcam' && devices.length > 1 && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Câmera</label>
              <select
                value={selectedDeviceId}
                onChange={e => setSelectedDeviceId(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5"
              >
                {devices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Câmera ${d.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {cameraSource === 'ip' && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">URL do stream</label>
              <input
                type="text"
                value={ipUrl}
                onChange={e => setIpUrl(e.target.value)}
                placeholder="http://192.168.1.100:8080/video"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-gray-500 block mb-1">Cooldown entre alertas</label>
            <div className="flex gap-2">
              {COOLDOWN_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCooldown(opt.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${cooldown === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Vídeo + Canvas */}
      <div
        ref={containerRef}
        className="relative bg-black rounded-xl overflow-hidden aspect-video mb-4"
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full h-full object-contain"
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: isDrawingArea ? 'crosshair' : draggingPoint !== null ? 'grabbing' : 'default' }}
        />

        {/* Overlay quando câmera não iniciada */}
        {!cameraStarted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white">
            <Camera className="w-12 h-12 text-gray-400 mb-3" />
            <p className="text-gray-400 text-sm mb-4">Inicie a câmera para começar</p>
            <button
              onClick={startCamera}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Play className="w-4 h-4" />
              Iniciar Câmera
            </button>
          </div>
        )}

        {/* Loading do modelo */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60">
            <div className="text-center text-white">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-3" />
              <p className="text-sm">Carregando modelo MediaPipe...</p>
              <p className="text-xs text-gray-300 mt-1">Primeira vez pode demorar ~10s</p>
            </div>
          </div>
        )}

        {/* Info overlay */}
        {cameraStarted && isDetecting && (
          <div className="absolute top-3 left-3 flex flex-col gap-1">
            <span className="bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
              <User className="w-3 h-3 inline mr-1" />
              {allPersons.length} pessoa(s) detectada(s)
            </span>
            {personsInArea.length > 0 && (
              <span className="bg-red-600 text-white text-xs px-2 py-1 rounded font-bold animate-pulse">
                🚨 {personsInArea.length} na área!
              </span>
            )}
          </div>
        )}

        {/* Instrução de desenho */}
        {isDrawingArea && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black bg-opacity-70 text-white text-xs px-3 py-2 rounded-lg">
            Clique para adicionar pontos. Clique no primeiro ponto para fechar a área ({drawingPoints.length} pontos).
          </div>
        )}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap gap-2 mb-4">
        {!cameraStarted ? (
          <button
            onClick={startCamera}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
          >
            <Play className="w-4 h-4" /> Iniciar Câmera
          </button>
        ) : (
          <>
            {!isDetecting ? (
              <button
                onClick={startDetection}
                disabled={isLoading}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg transition-colors text-sm"
              >
                <Shield className="w-4 h-4" />
                {isLoading ? 'Carregando...' : 'Iniciar Vigilância'}
              </button>
            ) : (
              <button
                onClick={stopDetection}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
              >
                <Square className="w-4 h-4" /> Parar
              </button>
            )}

            <button
              onClick={startDrawingArea}
              disabled={isDrawingArea}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors text-sm border border-gray-300"
            >
              <Maximize2 className="w-4 h-4" /> Redesenhar Área
            </button>

            <button
              onClick={resetArea}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors text-sm border border-gray-300"
            >
              <RotateCcw className="w-4 h-4" /> Área Padrão
            </button>

            <button
              onClick={stopCamera}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors text-sm border border-gray-300"
            >
              <Square className="w-4 h-4" /> Desligar Câmera
            </button>
          </>
        )}
      </div>

      {/* Erro */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          {error}
        </div>
      )}

      {/* Status */}
      {isDetecting && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <p className="text-2xl font-bold text-gray-800">{allPersons.length}</p>
            <p className="text-xs text-gray-500">Pessoas Detectadas</p>
          </div>
          <div className={`rounded-lg border p-3 text-center ${personsInArea.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <p className={`text-2xl font-bold ${personsInArea.length > 0 ? 'text-red-600' : 'text-gray-800'}`}>
              {personsInArea.length}
            </p>
            <p className="text-xs text-gray-500">Na Área Monitorada</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <p className="text-2xl font-bold text-gray-800">{areaPoints.length}</p>
            <p className="text-xs text-gray-500">Pontos da Área</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-3 text-center">
            <p className="text-2xl font-bold text-gray-800">
              {timeSinceAlert !== null ? `${timeSinceAlert}s` : '—'}
            </p>
            <p className="text-xs text-gray-500">Último Alerta</p>
          </div>
        </div>
      )}
    </div>
  );
}
