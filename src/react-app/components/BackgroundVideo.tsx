/**
 * Container de vídeo em segundo plano
 * Mantém o vídeo rodando mesmo quando não está visível na página
 */
import { useLocation } from 'react-router';
import { useMonitoring } from '@/react-app/contexts/MonitoringContext';

export default function BackgroundVideo() {
  const { videoRef, canvasRef, isActive } = useMonitoring();
  const location = useLocation();
  
  // Se está na página de monitoramento, não renderizar aqui (será mostrado no CameraMonitor)
  const isOnMonitoringPage = location.pathname === '/monitoramento';
  
  // Renderizar invisível quando ativo e fora da página de monitoramento
  if (!isActive || isOnMonitoringPage) {
    return null;
  }
  
  return (
    <div 
      className="fixed pointer-events-none"
      style={{ 
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        width: '640px',
        height: '480px',
        visibility: 'hidden',
        opacity: 0,
      }}
      aria-hidden="true"
    >
      <video
        ref={videoRef}
        className="w-full h-full"
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
