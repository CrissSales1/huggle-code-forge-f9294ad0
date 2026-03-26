/**
 * Página de Vigilância - Consome VigilanciaContext
 * v1.6.0 — Background + Persistência + Agendamento
 */

import { useState, useRef, useEffect } from 'react';
import { Shield, Play, Square, Camera, Maximize2, AlertTriangle, User, Settings, RotateCcw, Clock } from 'lucide-react';
import { useVigilancia } from '@/react-app/contexts/VigilanciaContext';
import { type Point } from '@/react-app/utils/motionDetection';

const COOLDOWN_OPTIONS = [
  { value: 5000, label: '5s' },
  { value: 10000, label: '10s' },
  { value: 30000, label: '30s' },
  { value: 60000, label: '1min' },
];

const DEFAULT_AREA: Point[] = [
  { x: 0.15, y: 0.15 },
  { x: 0.85, y: 0.15 },
  { x: 0.85, y: 0.85 },
  { x: 0.15, y: 0.85 },
];

export default function Vigilancia() {
  const vig = useVigilancia();
  const {
    config,
    updateConfig,
    isLoading,
    isDetecting,
    personsInArea,
    allPersons,
    lastAlertTime,
    error,
    videoRef,
    imgRef,
    canvasRef,
    startVigilancia,
    stopVigilancia,
    devices,
    isMjpeg,
    cameraStarted,
  } = vig;

  const containerRef = useRef<HTMLDivElement>(null);

  const [isDrawingArea, setIsDrawingArea] = useState(false);
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);

  // Desenhar overlay no canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let animId: number;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const container = containerRef.current;
      if (!container) { animId = requestAnimationFrame(draw); return; }

      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;

      // Desenhar área virtual (only if showDetectionArea or drawing)
      const points = isDrawingArea ? drawingPoints : config.areaPoints;
      if ((config.showDetectionArea || isDrawingArea) && points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(points[0].x * w, points[0].y * h);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x * w, points[i].y * h);
        }
        if (!isDrawingArea || points.length >= 3) {
          ctx.closePath();
        }

        const hasAlert = personsInArea.length > 0;
        ctx.fillStyle = hasAlert ? 'rgba(239, 68, 68, 0.25)' : 'rgba(59, 130, 246, 0.15)';
        ctx.fill();

        ctx.strokeStyle = hasAlert ? '#ef4444' : '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash(hasAlert ? [] : [8, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

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

      // Bounding boxes
      const sourceW = isMjpeg && imgRef.current ? imgRef.current.naturalWidth : (videoRef.current?.videoWidth ?? 0);
      const sourceH = isMjpeg && imgRef.current ? imgRef.current.naturalHeight : (videoRef.current?.videoHeight ?? 0);
      if (sourceW > 0) {
        const scaleX = w / sourceW;
        const scaleY = h / sourceH;

        allPersons.forEach(person => {
          const inArea = personsInArea.includes(person);
          const bx = person.x * scaleX;
          const by = person.y * scaleY;
          const bw = person.width * scaleX;
          const bh = person.height * scaleY;

          ctx.strokeStyle = inArea ? '#ef4444' : '#22c55e';
          ctx.lineWidth = 2;
          ctx.strokeRect(bx, by, bw, bh);

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
  }, [config.areaPoints, config.showDetectionArea, drawingPoints, isDrawingArea, personsInArea, allPersons, draggingPoint, isMjpeg, canvasRef, imgRef, videoRef]);

  // Handlers para desenhar/arrastar área
  const getRelativePos = (e: React.MouseEvent): Point | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e: React.MouseEvent) => {
    const pos = getRelativePos(e);
    if (!pos) return;

    if (isDrawingArea) {
      if (drawingPoints.length >= 2) {
        const first = drawingPoints[0];
        const dist = Math.sqrt((pos.x - first.x) ** 2 + (pos.y - first.y) ** 2);
        if (dist < 0.04 && drawingPoints.length >= 3) {
          updateConfig({ areaPoints: [...drawingPoints] });
          setIsDrawingArea(false);
          setDrawingPoints([]);
          return;
        }
      }
      setDrawingPoints(prev => [...prev, pos]);
      return;
    }

    for (let i = 0; i < config.areaPoints.length; i++) {
      const dist = Math.sqrt((pos.x - config.areaPoints[i].x) ** 2 + (pos.y - config.areaPoints[i].y) ** 2);
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
    updateConfig({ areaPoints: config.areaPoints.map((p, i) => (i === draggingPoint ? pos : p)) });
  };

  const handlePointerUp = () => setDraggingPoint(null);

  const startDrawingArea = () => { setIsDrawingArea(true); setDrawingPoints([]); };
  const resetArea = () => { updateConfig({ areaPoints: DEFAULT_AREA }); setIsDrawingArea(false); setDrawingPoints([]); };

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
                onClick={() => updateConfig({ cameraSource: 'webcam' })}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${config.cameraSource === 'webcam' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                <Camera className="w-4 h-4 inline mr-1" /> Webcam
              </button>
              <button
                onClick={() => updateConfig({ cameraSource: 'ip' })}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${config.cameraSource === 'ip' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
              >
                IP / URL
              </button>
            </div>
          </div>

          {config.cameraSource === 'webcam' && devices.length > 1 && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">Câmera</label>
              <select
                value={config.selectedDeviceId}
                onChange={e => updateConfig({ selectedDeviceId: e.target.value })}
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

          {config.cameraSource === 'ip' && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">URL do stream</label>
              <input
                type="text"
                value={config.ipUrl}
                onChange={e => updateConfig({ ipUrl: e.target.value })}
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
                  onClick={() => updateConfig({ cooldown: opt.value })}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${config.cooldown === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mostrar/ocultar área */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500">Mostrar área de detecção</label>
            <button
              onClick={() => updateConfig({ showDetectionArea: !config.showDetectionArea })}
              className={`relative w-10 h-5 rounded-full transition-colors ${config.showDetectionArea ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${config.showDetectionArea ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Agendamento de alertas */}
          <div className="border-t border-gray-100 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-gray-500" />
                <label className="text-xs text-gray-500">Agendar alertas sonoros</label>
              </div>
              <button
                onClick={() => updateConfig({ alertScheduleEnabled: !config.alertScheduleEnabled })}
                className={`relative w-10 h-5 rounded-full transition-colors ${config.alertScheduleEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${config.alertScheduleEnabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            {config.alertScheduleEnabled && (
              <>
                <p className="text-[10px] text-gray-400">
                  Alertas sonoros apenas no horário definido. Ideal para porteiros noturnos.
                </p>
                <div className="flex items-center gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 block">Início</label>
                    <input
                      type="time"
                      value={config.alertStartTime}
                      onChange={e => updateConfig({ alertStartTime: e.target.value })}
                      className="text-sm border border-gray-300 rounded-lg px-2 py-1"
                    />
                  </div>
                  <span className="text-gray-400 mt-3">→</span>
                  <div>
                    <label className="text-[10px] text-gray-400 block">Fim</label>
                    <input
                      type="time"
                      value={config.alertEndTime}
                      onChange={e => updateConfig({ alertEndTime: e.target.value })}
                      className="text-sm border border-gray-300 rounded-lg px-2 py-1"
                    />
                  </div>
                </div>
              </>
            )}
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
          className={`w-full h-full object-contain ${isMjpeg ? 'hidden' : ''}`}
        />
        <img
          ref={imgRef}
          alt="Stream MJPEG"
          className={`w-full h-full object-contain ${isMjpeg ? '' : 'hidden'}`}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: isDrawingArea ? 'crosshair' : draggingPoint !== null ? 'grabbing' : 'default' }}
        />

        {!cameraStarted && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white">
            <Camera className="w-12 h-12 text-gray-400 mb-3" />
            <p className="text-gray-400 text-sm mb-4">Inicie a vigilância para começar</p>
            <button
              onClick={startVigilancia}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Play className="w-4 h-4" />
              Iniciar Vigilância
            </button>
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-60">
            <div className="text-center text-white">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-3" />
              <p className="text-sm">Carregando modelo MediaPipe...</p>
              <p className="text-xs text-gray-300 mt-1">Primeira vez pode demorar ~10s</p>
            </div>
          </div>
        )}

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
            onClick={startVigilancia}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
          >
            <Play className="w-4 h-4" /> Iniciar Vigilância
          </button>
        ) : (
          <>
            {!isDetecting ? (
              <button
                onClick={startVigilancia}
                disabled={isLoading}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg transition-colors text-sm"
              >
                <Shield className="w-4 h-4" />
                {isLoading ? 'Carregando...' : 'Iniciar Vigilância'}
              </button>
            ) : (
              <button
                onClick={stopVigilancia}
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
              onClick={stopVigilancia}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition-colors text-sm border border-gray-300"
            >
              <Square className="w-4 h-4" /> Desligar
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          {error}
        </div>
      )}

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
            <p className="text-2xl font-bold text-gray-800">{config.areaPoints.length}</p>
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
