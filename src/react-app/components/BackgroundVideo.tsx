/**
 * Container de vídeo global para monitoramento
 * Renderiza o vídeo oculto quando FORA da página de monitoramento
 * Na página de monitoramento, o CameraMonitor renderiza o vídeo diretamente
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useMonitoring } from '@/react-app/contexts/MonitoringContext';

export default function BackgroundVideo() {
  const { videoRef, canvasRef, status, reconnectStream } = useMonitoring();
  const location = useLocation();
  
  // Verificar se está na página de monitoramento
  const isOnMonitoringPage = location.pathname === '/monitoramento';
  const isActive = status === 'monitoring';
  
  // v1.1.67: Reconectar stream quando BackgroundVideo monta (fora da página de monitoramento)
  // Isso garante que o vídeo oculto receba o stream da câmera para detecção contínua
  useEffect(() => {
    if (!isOnMonitoringPage && isActive) {
      // Pequeno delay para garantir que o elemento de vídeo está no DOM
      const timer = setTimeout(() => {
        console.log('🔄 BackgroundVideo: Reconectando stream para monitoramento em segundo plano');
        reconnectStream();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isOnMonitoringPage, isActive, reconnectStream]);
  
  // Quando na página de monitoramento, o CameraMonitor renderiza o vídeo diretamente
  // Não renderizar nada aqui para evitar conflito de refs
  if (isOnMonitoringPage) {
    return null;
  }
  
  // Fora da página de monitoramento: renderizar vídeo oculto mas continuando a processar
  return (
    <div 
      id="global-video-container"
      style={{ 
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        width: '640px',
        height: '480px',
        visibility: 'hidden',
        opacity: 0,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      <video
        ref={videoRef}
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
