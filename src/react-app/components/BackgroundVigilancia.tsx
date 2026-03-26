/**
 * Renderiza vídeo/img oculto para manter detecção de pessoas ativa
 * quando fora da página /vigilancia
 * v1.6.1 — Guard ref to prevent reconnect spam
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useVigilancia } from '@/react-app/contexts/VigilanciaContext';

export default function BackgroundVigilancia() {
  const { videoRef, imgRef, canvasRef, isActive, isMjpeg, reconnectSource } = useVigilancia();
  const location = useLocation();
  const isOnPage = location.pathname === '/vigilancia';
  const hasReconnectedRef = useRef(false);

  // Reset guard when returning to the page
  useEffect(() => {
    if (isOnPage) {
      hasReconnectedRef.current = false;
    }
  }, [isOnPage]);

  useEffect(() => {
    if (!isOnPage && isActive && !hasReconnectedRef.current) {
      hasReconnectedRef.current = true;
      const timer = setTimeout(() => {
        console.log('🔄 BackgroundVigilancia: reconectando stream em segundo plano (once)');
        reconnectSource();
      }, 150);
      return () => clearTimeout(timer);
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
