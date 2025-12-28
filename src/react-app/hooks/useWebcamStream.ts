import { useState, useEffect, useRef, useCallback } from 'react';

export interface WebcamDevice {
  deviceId: string;
  label: string;
}

export interface UseWebcamStreamReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isStreaming: boolean;
  error: string | null;
  devices: WebcamDevice[];
  selectedDevice: string | null;
  startStream: (deviceId?: string) => Promise<void>;
  stopStream: () => void;
  captureFrame: () => HTMLCanvasElement | null;
  selectDevice: (deviceId: string) => void;
}

export function useWebcamStream(): UseWebcamStreamReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<WebcamDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);

  // Listar dispositivos de vídeo disponíveis
  const listDevices = useCallback(async () => {
    try {
      // Precisamos pedir permissão primeiro para listar os dispositivos com labels
      await navigator.mediaDevices.getUserMedia({ video: true });
      
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Câmera ${device.deviceId.slice(0, 8)}`,
        }));
      
      setDevices(videoDevices);
      
      if (videoDevices.length > 0 && !selectedDevice) {
        setSelectedDevice(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.error('Erro ao listar dispositivos:', err);
      setError('Não foi possível acessar as câmeras. Verifique as permissões.');
    }
  }, [selectedDevice]);

  // Iniciar stream da webcam
  const startStream = useCallback(async (deviceId?: string) => {
    try {
      setError(null);
      
      // Parar stream anterior se existir
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: deviceId || selectedDevice ? { exact: deviceId || selectedDevice! } : undefined,
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment', // Preferir câmera traseira em mobile
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsStreaming(true);
      console.log('📹 Webcam stream iniciado');
    } catch (err) {
      console.error('Erro ao iniciar webcam:', err);
      setError('Não foi possível acessar a webcam. Verifique as permissões do navegador.');
      setIsStreaming(false);
    }
  }, [selectedDevice]);

  // Parar stream
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsStreaming(false);
    console.log('📹 Webcam stream parado');
  }, []);

  // Capturar frame atual como canvas
  const captureFrame = useCallback((): HTMLCanvasElement | null => {
    if (!videoRef.current || !isStreaming) return null;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    ctx.drawImage(video, 0, 0);
    return canvas;
  }, [isStreaming]);

  // Selecionar dispositivo
  const selectDevice = useCallback((deviceId: string) => {
    setSelectedDevice(deviceId);
    if (isStreaming) {
      startStream(deviceId);
    }
  }, [isStreaming, startStream]);

  // Listar dispositivos ao montar
  useEffect(() => {
    listDevices();
  }, [listDevices]);

  // Limpar ao desmontar
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  return {
    videoRef,
    isStreaming,
    error,
    devices,
    selectedDevice,
    startStream,
    stopStream,
    captureFrame,
    selectDevice,
  };
}
