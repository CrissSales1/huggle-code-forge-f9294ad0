/**
 * Renderiza vídeo/img oculto para manter detecção de pessoas ativa
 * quando fora da página /vigilancia
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useVigilancia } from '@/react-app/contexts/VigilanciaContext';

export default function BackgroundVigilancia() {
  const { videoRef, imgRef, canvasRef, isActive, isMjpeg, reconnectSource } = useVigilancia();
  const location = useLocation();
  const isOnPage = location.pathname === '/vigilancia';

  useEffect(() => {
    if (!isOnPage && isActive) {
      console.log('🔄 BackgroundVigilancia: reconectando stream em segundo plano');
      reconnectSource();
    }
  }, [isOnPage, isActive, reconnectSource]);

  if (isOnPage) return null;

  return (
    <div
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
      <video ref={videoRef} playsInline muted />
      <img ref={imgRef} alt="" className={isMjpeg ? '' : 'hidden'} />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
