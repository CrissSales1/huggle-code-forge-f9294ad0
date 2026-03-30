/**
 * Página de Vigilância - Layout 2 colunas para porteiro
 * v1.7.7 — Toggle Detecção Aprimorada (Multi-Scale)
 */

import { useState, useRef, useEffect } from 'react';
import { Shield, Play, Square, Camera, Maximize2, AlertTriangle, User, Settings, RotateCcw, Clock, Eye, EyeOff, Volume2, Scan } from 'lucide-react';
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
  const [now, setNow] = useState(Date.now());

  // Atualizar relógio a cada segundo para "último alerta"
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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

      const points = isDrawingArea ? drawingPoints : config.areaPoints;
      if ((config.showDetectionArea || isDrawingArea) && points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(points[0].x * w, points[0].y * h);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x * w, points[i].y * h);
        }
        if (!isDrawingArea || points.length >= 3) ctx.closePath();

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

  // Formatar tempo desde último alerta
  const formatTimeSince = (ts: number | null): string => {
    if (!ts) return '—';
    const diff = Math.max(0, Math.round((now - ts) / 1000));
    if (diff < 60) return `${diff}s atrás`;
    if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
    return `${Math.floor(diff / 3600)}h atrás`;
  };

  const cooldownLabel = COOLDOWN_OPTIONS.find(o => o.value === config.cooldown)?.label ?? `${config.cooldown / 1000}s`;

  const statusInfo = isDetecting
    ? { label: 'Monitorando', color: 'text-white', bg: 'bg-gradient-to-r from-blue-600 to-blue-700 border-blue-500', dot: 'bg-white' }
    : cameraStarted
      ? { label: 'Câmera ligada', color: 'text-yellow-700', bg: 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-300', dot: 'bg-yellow-500' }
      : { label: 'Desligado', color: 'text-gray-500', bg: 'bg-gradient-to-r from-gray-50 to-gray-100 border-gray-300', dot: 'bg-gray-400' };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 pt-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-600 rounded-lg">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Vigilância</h2>
          {isDetecting && (
            <span className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              Ativo
            </span>
          )}
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>


      {/* Settings panel */}
      {showSettings && (
        <div className="mb-3 p-4 bg-card border border-border rounded-lg shadow-sm space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Configurações</h3>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Fonte da câmera</label>
            <div className="flex gap-2">
              <button
                onClick={() => updateConfig({ cameraSource: 'webcam' })}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${config.cameraSource === 'webcam' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:bg-muted'}`}
              >
                <Camera className="w-4 h-4 inline mr-1" /> Webcam
              </button>
              <button
                onClick={() => updateConfig({ cameraSource: 'ip' })}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${config.cameraSource === 'ip' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:bg-muted'}`}
              >
                IP / URL
              </button>
            </div>
          </div>

          {config.cameraSource === 'webcam' && devices.length > 1 && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Câmera</label>
              <select
                value={config.selectedDeviceId}
                onChange={e => updateConfig({ selectedDeviceId: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-card text-foreground"
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
              <label className="text-xs text-muted-foreground block mb-1">URL do stream</label>
              <input
                type="text"
                value={config.ipUrl}
                onChange={e => updateConfig({ ipUrl: e.target.value })}
                placeholder="http://192.168.1.100:8080/video"
                className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-card text-foreground"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Cooldown entre alertas</label>
            <div className="flex gap-2">
              {COOLDOWN_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => updateConfig({ cooldown: opt.value })}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${config.cooldown === opt.value ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border hover:bg-muted'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Área de detecção */}
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Mostrar área de detecção</label>
            <button
              onClick={() => updateConfig({ showDetectionArea: !config.showDetectionArea })}
              className={`relative w-10 h-5 rounded-full transition-colors ${config.showDetectionArea ? 'bg-primary' : 'bg-muted'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${config.showDetectionArea ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Botões de área — agora dentro de configurações */}
          <div className="flex gap-2">
            <button
              onClick={startDrawingArea}
              disabled={isDrawingArea}
              className="flex items-center gap-1.5 bg-muted hover:bg-accent text-foreground px-3 py-1.5 rounded-lg transition-colors text-xs border border-border"
            >
              <Maximize2 className="w-3.5 h-3.5" /> Redesenhar Área
            </button>
            <button
              onClick={resetArea}
              className="flex items-center gap-1.5 bg-muted hover:bg-accent text-foreground px-3 py-1.5 rounded-lg transition-colors text-xs border border-border"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Área Padrão
            </button>
          </div>

          {/* Detecção Aprimorada */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Scan className="w-4 h-4 text-muted-foreground" />
              <div>
                <label className="text-xs text-muted-foreground">Detecção Aprimorada</label>
                <p className="text-[10px] text-muted-foreground/70">Melhor detecção de pessoas distantes (mais processamento)</p>
              </div>
            </div>
            <button
              onClick={() => updateConfig({ enhancedDetection: !config.enhancedDetection })}
              className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 border ${config.enhancedDetection ? 'bg-primary border-primary' : 'bg-gray-300 border-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${config.enhancedDetection ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Agendamento */}
          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <label className="text-xs text-muted-foreground">Agendar alertas sonoros</label>
              </div>
              <button
                onClick={() => updateConfig({ alertScheduleEnabled: !config.alertScheduleEnabled })}
                className={`relative w-10 h-5 rounded-full transition-colors ${config.alertScheduleEnabled ? 'bg-primary' : 'bg-muted'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${config.alertScheduleEnabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            {config.alertScheduleEnabled && (
              <>
                <p className="text-[10px] text-muted-foreground">
                  Alertas sonoros apenas no horário definido. Ideal para porteiros noturnos.
                </p>
                <div className="flex items-center gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block">Início</label>
                    <input
                      type="time"
                      value={config.alertStartTime}
                      onChange={e => updateConfig({ alertStartTime: e.target.value })}
                      className="text-sm border border-border rounded-lg px-2 py-1 bg-card text-foreground"
                    />
                  </div>
                  <span className="text-muted-foreground mt-3">→</span>
                  <div>
                    <label className="text-[10px] text-muted-foreground block">Fim</label>
                    <input
                      type="time"
                      value={config.alertEndTime}
                      onChange={e => updateConfig({ alertEndTime: e.target.value })}
                      className="text-sm border border-border rounded-lg px-2 py-1 bg-card text-foreground"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Grid principal: Vídeo + Painel lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3">
        {/* Coluna esquerda — Vídeo */}
        <div
          ref={containerRef}
          className="relative bg-black rounded-xl overflow-hidden"
          style={{ height: 'calc(100vh - 200px)', minHeight: '300px' }}
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
            crossOrigin="anonymous"
            className={`w-full h-full object-contain ${isMjpeg ? '' : 'hidden'}`}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ cursor: isDrawingArea ? 'crosshair' : draggingPoint !== null ? 'grabbing' : 'default' }}
          />

          {!cameraStarted && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 text-white">
              <Camera className="w-10 h-10 text-gray-400 mb-3" />
              <p className="text-gray-400 text-sm mb-3">Inicie a vigilância para começar</p>
              <button
                onClick={startVigilancia}
                className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg transition-colors text-sm"
              >
                <Play className="w-4 h-4" />
                Iniciar Vigilância
              </button>
            </div>
          )}

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-center text-white">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2" />
                <p className="text-sm">Carregando modelo...</p>
              </div>
            </div>
          )}

          {/* Overlay: contagem no vídeo */}
          {cameraStarted && isDetecting && (
            <div className="absolute top-2 left-2 flex flex-col gap-1">
              <span className="bg-black/60 text-white text-xs px-2 py-1 rounded">
                <User className="w-3 h-3 inline mr-1" />
                {allPersons.length} pessoa(s)
              </span>
              {personsInArea.length > 0 && (
                <span className="bg-red-600 text-white text-xs px-2 py-1 rounded font-bold animate-pulse">
                  🚨 {personsInArea.length} na área!
                </span>
              )}
            </div>
          )}

          {isDrawingArea && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg">
              Clique para adicionar pontos. Clique no primeiro para fechar ({drawingPoints.length} pts).
            </div>
          )}
        </div>

        {/* Coluna direita — Painel informativo */}
        <div className="flex flex-col gap-3">
          {/* Alerta visual — dentro do painel lateral */}
          {personsInArea.length > 0 && (
            <div className="p-3 bg-gradient-to-r from-red-50 to-red-100 border border-red-300 rounded-xl flex items-center gap-3 animate-pulse shadow-md shadow-red-100">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <div>
                <p className="font-bold text-red-700 text-sm">
                  ⚠️ {personsInArea.length} pessoa(s) na área!
                </p>
                <p className="text-red-600 text-xs">Verifique a câmera imediatamente.</p>
              </div>
            </div>
          )}
          {/* Status do sistema */}
          <div className={`rounded-xl border p-4 shadow-sm ${statusInfo.bg}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2.5 h-2.5 rounded-full ${statusInfo.dot} ${isDetecting ? 'animate-pulse' : ''}`} />
              <span className={`font-semibold text-sm ${statusInfo.color}`}>{statusInfo.label}</span>
            </div>
            <p className={`text-xs ${isDetecting ? 'text-blue-100' : 'text-muted-foreground'}`}>
              {isDetecting
                ? 'O sistema está monitorando a área em tempo real.'
                : cameraStarted
                  ? 'A câmera está ligada mas a detecção não está ativa.'
                  : 'Inicie a vigilância para monitorar a área.'}
            </p>
          </div>

          {/* Última movimentação */}
          <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-white to-blue-50 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Última movimentação</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {formatTimeSince(lastAlertTime)}
            </p>
          </div>

          {/* Alertas sonoros — com toggle de agendamento */}
          <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-white to-blue-50 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-orange-500" />
                <span className="text-xs font-medium text-orange-600 uppercase tracking-wide">Alertas sonoros</span>
              </div>
              <button
                onClick={() => updateConfig({ alertScheduleEnabled: !config.alertScheduleEnabled })}
                className={`relative w-10 h-5 rounded-full transition-colors ${config.alertScheduleEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                title={config.alertScheduleEnabled ? 'Desativar agendamento' : 'Ativar agendamento'}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${config.alertScheduleEnabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            {config.alertScheduleEnabled ? (
              <div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="time"
                    value={config.alertStartTime}
                    onChange={e => updateConfig({ alertStartTime: e.target.value })}
                    className="text-sm border border-blue-200 rounded-lg px-2 py-1 bg-white text-foreground w-24"
                  />
                  <span className="text-blue-400 text-sm">→</span>
                  <input
                    type="time"
                    value={config.alertEndTime}
                    onChange={e => updateConfig({ alertEndTime: e.target.value })}
                    className="text-sm border border-blue-200 rounded-lg px-2 py-1 bg-white text-foreground w-24"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">Alertas sonoros apenas neste horário</p>
              </div>
            ) : (
              <p className="text-sm text-foreground font-semibold">Sempre ativo</p>
            )}
          </div>

          {/* Cooldown */}
          <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-white to-blue-50 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-green-600" />
              <span className="text-xs font-medium text-green-600 uppercase tracking-wide">Cooldown</span>
            </div>
            <p className="text-lg font-bold text-foreground">{cooldownLabel}</p>
            <p className="text-xs text-muted-foreground">Intervalo entre alertas</p>
          </div>

          {/* Controles */}
          <div className="flex flex-col gap-2 mt-auto">
            {!cameraStarted ? (
              <button
                onClick={startVigilancia}
                className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-4 py-2.5 rounded-xl transition-all text-sm font-medium w-full shadow-md shadow-blue-200"
              >
                <Play className="w-4 h-4" /> Iniciar Vigilância
              </button>
            ) : (
              <>
                {!isDetecting ? (
                  <button
                    onClick={startVigilancia}
                    disabled={isLoading}
                    className="flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-green-400 disabled:to-green-400 text-white px-4 py-2.5 rounded-xl transition-all text-sm font-medium w-full shadow-md shadow-green-200"
                  >
                    <Shield className="w-4 h-4" />
                    {isLoading ? 'Carregando...' : 'Iniciar Detecção'}
                  </button>
                ) : (
                  <button
                    onClick={stopVigilancia}
                    className="flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-4 py-2.5 rounded-xl transition-all text-sm font-medium w-full shadow-md shadow-red-200"
                  >
                    <Square className="w-4 h-4" /> Parar Detecção
                  </button>
                )}
                <button
                  onClick={stopVigilancia}
                  className="flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl transition-colors text-sm border border-gray-300 w-full"
                >
                  <EyeOff className="w-4 h-4" /> Desligar Câmera
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <AlertTriangle className="w-4 h-4 inline mr-2" />
          {error}
        </div>
      )}
    </div>
  );
}
