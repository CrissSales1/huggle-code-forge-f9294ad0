/**
 * Container de vídeo global para monitoramento
 * SEMPRE renderiza o elemento de vídeo para evitar perda de stream
 * Ajusta visibilidade baseado na rota atual
 */
import { useLocation } from 'react-router';
import { useMonitoring } from '@/react-app/contexts/MonitoringContext';

export default function BackgroundVideo() {
  const { videoRef, canvasRef } = useMonitoring();
  const location = useLocation();
  
  // Verificar se está na página de monitoramento
  const isOnMonitoringPage = location.pathname === '/monitoramento';
  
  // SEMPRE renderizar o vídeo, mas ajustar visibilidade e posição
  // Quando na página de monitoramento, o CameraMonitor vai posicionar este container
  // Quando fora, fica oculto mas continua processando
  
  return (
    <div 
      id="global-video-container"
      className={`${isOnMonitoringPage ? '' : 'fixed pointer-events-none'}`}
      style={isOnMonitoringPage ? {} : { 
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        width: '640px',
        height: '480px',
        visibility: 'hidden',
        opacity: 0,
      }}
      aria-hidden={!isOnMonitoringPage}
    >
      <video
        ref={videoRef}
        className={`w-full h-full ${isOnMonitoringPage ? 'object-contain' : ''}`}
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
