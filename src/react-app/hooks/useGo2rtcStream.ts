/**
 * Hook para conexão com servidor go2rtc via WebRTC/MSE
 * Converte streams RTSP em formatos compatíveis com browser
 */
import { useState, useCallback, useRef, useEffect } from 'react';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';
export type ConnectionMode = 'webrtc' | 'mse' | 'none';

interface Go2rtcConfig {
  serverUrl: string;
  streamName: string;
}

interface UseGo2rtcStreamReturn {
  status: ConnectionStatus;
  mode: ConnectionMode;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  connect: () => Promise<void>;
  disconnect: () => void;
  isConnected: boolean;
}

// Storage keys para configuração
const STORAGE_KEY_PREFIX = 'portacerta_go2rtc_';

export function loadGo2rtcConfig(cameraType: 'entrada' | 'saida'): Go2rtcConfig | null {
  try {
    const serverUrl = localStorage.getItem(`${STORAGE_KEY_PREFIX}server_url`);
    const streamName = localStorage.getItem(`${STORAGE_KEY_PREFIX}stream_${cameraType}`);
    
    if (serverUrl && streamName) {
      return { serverUrl, streamName };
    }
  } catch (e) {
    console.warn('Erro ao carregar config go2rtc:', e);
  }
  return null;
}

export function saveGo2rtcConfig(serverUrl: string, streamEntrada: string, streamSaida: string): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}server_url`, serverUrl);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}stream_entrada`, streamEntrada);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}stream_saida`, streamSaida);
  } catch (e) {
    console.warn('Erro ao salvar config go2rtc:', e);
  }
}

export function loadStreamMode(cameraType: 'entrada' | 'saida'): 'webcam' | 'go2rtc' {
  try {
    const mode = localStorage.getItem(`${STORAGE_KEY_PREFIX}mode_${cameraType}`);
    return mode === 'go2rtc' ? 'go2rtc' : 'webcam';
  } catch {
    return 'webcam';
  }
}

export function saveStreamMode(cameraType: 'entrada' | 'saida', mode: 'webcam' | 'go2rtc'): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}mode_${cameraType}`, mode);
  } catch (e) {
    console.warn('Erro ao salvar modo de stream:', e);
  }
}

export function useGo2rtcStream(cameraType: 'entrada' | 'saida'): UseGo2rtcStreamReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [mode, setMode] = useState<ConnectionMode>('none');
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  
  // Limpar conexão
  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (mediaSourceRef.current) {
      mediaSourceRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current.src = '';
    }
  }, []);
  
  // Tentar conexão WebRTC
  const connectWebRTC = useCallback(async (serverUrl: string, streamName: string): Promise<boolean> => {
    try {
      // Criar peer connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;
      
      // Handler para tracks recebidos
      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().catch(console.warn);
        }
      };
      
      // Handler para estado de conexão
      pc.onconnectionstatechange = () => {
        switch (pc.connectionState) {
          case 'connected':
            setStatus('connected');
            setMode('webrtc');
            setError(null);
            break;
          case 'disconnected':
          case 'failed':
            setStatus('error');
            setError('Conexão WebRTC perdida');
            break;
        }
      };
      
      // Adicionar transceiver para receber vídeo
      pc.addTransceiver('video', { direction: 'recvonly' });
      pc.addTransceiver('audio', { direction: 'recvonly' });
      
      // Criar oferta
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      // Enviar oferta para go2rtc
      const apiUrl = `${serverUrl}/api/webrtc?src=${encodeURIComponent(streamName)}`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: offer.sdp,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const answerSdp = await response.text();
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });
      
      return true;
    } catch (e) {
      console.warn('WebRTC falhou:', e);
      return false;
    }
  }, []);
  
  // Tentar conexão MSE (Media Source Extensions)
  const connectMSE = useCallback(async (serverUrl: string, streamName: string): Promise<boolean> => {
    try {
      if (!('MediaSource' in window)) {
        throw new Error('MSE não suportado');
      }
      
      const wsUrl = `${serverUrl.replace('http', 'ws')}/api/ws?src=${encodeURIComponent(streamName)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;
      
      if (videoRef.current) {
        videoRef.current.src = URL.createObjectURL(mediaSource);
      }
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout de conexão MSE'));
        }, 10000);
        
        mediaSource.addEventListener('sourceopen', () => {
          try {
            const sourceBuffer = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.640028"');
            
            ws.onmessage = async (event) => {
              if (event.data instanceof Blob) {
                const buffer = await event.data.arrayBuffer();
                if (!sourceBuffer.updating && mediaSource.readyState === 'open') {
                  sourceBuffer.appendBuffer(buffer);
                }
              }
            };
            
            ws.onopen = () => {
              clearTimeout(timeout);
              setStatus('connected');
              setMode('mse');
              setError(null);
              videoRef.current?.play().catch(console.warn);
              resolve(true);
            };
            
            ws.onerror = () => {
              clearTimeout(timeout);
              reject(new Error('Erro de conexão WebSocket'));
            };
          } catch (e) {
            clearTimeout(timeout);
            reject(e);
          }
        });
      });
    } catch (e) {
      console.warn('MSE falhou:', e);
      return false;
    }
  }, []);
  
  // Conectar ao stream
  const connect = useCallback(async () => {
    cleanup();
    
    const config = loadGo2rtcConfig(cameraType);
    if (!config) {
      setStatus('error');
      setError('Configuração não encontrada. Configure o servidor go2rtc primeiro.');
      return;
    }
    
    setStatus('connecting');
    setError(null);
    
    // Tentar WebRTC primeiro (menor latência)
    const webrtcSuccess = await connectWebRTC(config.serverUrl, config.streamName);
    if (webrtcSuccess) {
      return;
    }
    
    // Fallback para MSE
    const mseSuccess = await connectMSE(config.serverUrl, config.streamName);
    if (mseSuccess) {
      return;
    }
    
    // Ambos falharam
    setStatus('error');
    setError('Falha ao conectar. Verifique se o go2rtc está rodando e a URL está correta.');
  }, [cameraType, cleanup, connectWebRTC, connectMSE]);
  
  // Desconectar
  const disconnect = useCallback(() => {
    cleanup();
    setStatus('disconnected');
    setMode('none');
    setError(null);
  }, [cleanup]);
  
  // Cleanup no unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);
  
  return {
    status,
    mode,
    error,
    videoRef,
    connect,
    disconnect,
    isConnected: status === 'connected',
  };
}
