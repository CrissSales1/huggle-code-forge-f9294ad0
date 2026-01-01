/**
 * Container de vídeo global para monitoramento
 * Renderiza o vídeo oculto quando FORA da página de monitoramento
 * Na página de monitoramento, o CameraMonitor renderiza o vídeo diretamente
 */
import { useLocation } from 'react-router';
import { useMonitoring } from '@/react-app/contexts/MonitoringContext';

export default function BackgroundVideo() {
  const { videoRef, canvasRef } = useMonitoring();
  const location = useLocation();
  
  // Verificar se está na página de monitoramento
  const isOnMonitoringPage = location.pathname === '/monitoramento';
  
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
