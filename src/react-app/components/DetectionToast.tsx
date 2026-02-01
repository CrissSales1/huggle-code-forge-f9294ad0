/**
 * Toast de notificação para detecções em segundo plano
 * Aparece quando uma placa é detectada fora da página de monitoramento
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { CheckCircle, XCircle, Home, Activity, X, User } from 'lucide-react';
import { useMonitoring, Detection } from '@/react-app/contexts/MonitoringContext';
import { playNotificationSound, loadSoundEnabled } from '@/react-app/utils/notificationSounds';

const TOAST_DURATION_MS = 6000;

export default function DetectionToast() {
  const { lastDetection, isActive } = useMonitoring();
  const location = useLocation();
  const [visibleDetection, setVisibleDetection] = useState<Detection | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  
  // Verificar se está na página de monitoramento
  const isOnMonitoringPage = location.pathname === '/monitoramento';
  
  // Mostrar toast quando detectar uma placa (apenas fora da página de monitoramento)
  // Usa timestamp como dependência para garantir que cada detecção única dispare o efeito
  useEffect(() => {
    if (lastDetection && isActive && !isOnMonitoringPage) {
      // Nova detecção
      setVisibleDetection(lastDetection);
      setIsExiting(false);
      setIsVisible(true);
      
      // Tocar som baseado no tipo de detecção
      if (loadSoundEnabled()) {
        if (lastDetection.isMorador) {
          playNotificationSound('morador');
        } else if (lastDetection.isVisitante) {
          playNotificationSound('visitante');
        } else {
          playNotificationSound('desconhecido');
        }
      }
      
      // Auto-hide após duração
      const hideTimer = setTimeout(() => {
        setIsExiting(true);
        setTimeout(() => {
          setIsVisible(false);
          setIsExiting(false);
        }, 300); // Tempo da animação de saída
      }, TOAST_DURATION_MS);
      
      return () => clearTimeout(hideTimer);
    }
  }, [lastDetection?.timestamp, isActive, isOnMonitoringPage]);
  
  // Esconder ao entrar na página de monitoramento
  useEffect(() => {
    if (isOnMonitoringPage && isVisible) {
      setIsExiting(true);
      setTimeout(() => {
        setIsVisible(false);
        setIsExiting(false);
      }, 300);
    }
  }, [isOnMonitoringPage, isVisible]);
  
  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
    }, 300);
  };
  
  if (!isVisible || !visibleDetection) return null;
  
  const isMorador = visibleDetection.isMorador;
  const isVisitante = visibleDetection.isVisitante;
  const isIdentificado = isMorador || isVisitante;
  
  // Determinar cores baseado no tipo
  const getColorScheme = () => {
    if (isMorador) return { bg: 'from-green-50 to-emerald-50', border: 'border-green-400', bar: 'bg-green-500', icon: 'bg-green-100', iconText: 'text-green-600', text: 'text-green-700', progress: 'bg-green-400' };
    if (isVisitante) return { bg: 'from-amber-50 to-yellow-50', border: 'border-amber-400', bar: 'bg-amber-500', icon: 'bg-amber-100', iconText: 'text-amber-600', text: 'text-amber-700', progress: 'bg-amber-400' };
    return { bg: 'from-red-50 to-orange-50', border: 'border-red-400', bar: 'bg-red-500', icon: 'bg-red-100', iconText: 'text-red-600', text: 'text-red-700', progress: 'bg-red-400' };
  };
  
  const colors = getColorScheme();
  
  return (
    <div 
      className={`fixed top-20 right-4 z-50 max-w-sm w-full transition-all duration-300 ${
        isExiting 
          ? 'opacity-0 translate-x-full' 
          : 'opacity-100 translate-x-0'
      }`}
    >
      <div 
        className={`relative rounded-xl shadow-2xl border-2 overflow-hidden bg-gradient-to-r ${colors.bg} ${colors.border}`}
      >
        {/* Barra superior colorida */}
        <div className={`h-1 w-full ${colors.bar}`} />
        
        {/* Conteúdo */}
        <div className="p-4">
          {/* Header com ícone e botão fechar */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-full ${colors.icon}`}>
                {isMorador ? (
                  <CheckCircle className={`w-5 h-5 ${colors.iconText}`} />
                ) : isVisitante ? (
                  <User className={`w-5 h-5 ${colors.iconText}`} />
                ) : (
                  <XCircle className={`w-5 h-5 ${colors.iconText}`} />
                )}
              </div>
              <div>
                <span className={`font-semibold text-sm ${colors.text}`}>
                  {isMorador ? 'Morador Autorizado' : isVisitante ? 'Visitante Ativo' : 'Veículo Desconhecido'}
                </span>
                {isVisitante && visibleDetection.nomeVisitante && (
                  <div className={`text-xs font-medium ${colors.text}`}>
                    {visibleDetection.nomeVisitante}
                  </div>
                )}
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Activity className="w-3 h-3" />
                  <span>Detecção automática</span>
                </div>
              </div>
            </div>
            
            <button 
              onClick={handleClose}
              className="p-1 hover:bg-gray-200 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          
          {/* Placa */}
          <div className="flex items-center justify-center mb-3">
            <div className="bg-white border-2 border-gray-300 rounded-lg px-4 py-2 shadow-sm">
              <span className="font-mono font-bold text-xl text-gray-900 tracking-wider">
                {visibleDetection.placa}
              </span>
            </div>
          </div>
          
          {/* Info adicional */}
          <div className="flex items-center justify-between text-sm">
            {isIdentificado && visibleDetection.casa && (
              <div className={`flex items-center gap-1.5 ${colors.text}`}>
                <Home className="w-4 h-4" />
                <span className="font-semibold">Casa {visibleDetection.casa}</span>
              </div>
            )}
            
            {!isIdentificado && (
              <div className="text-red-600 text-xs font-medium">
                Verifique antes de liberar
              </div>
            )}
            
            <div className="text-gray-400 text-xs">
              {visibleDetection.fonteDeteccao === 'api' ? 'API' : 'OCR'}
              {visibleDetection.confidence && ` (${Math.round(visibleDetection.confidence * 100)}%)`}
              {' • '}
              {new Date(visibleDetection.timestamp).toLocaleTimeString('pt-BR', { 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit'
              })}
            </div>
          </div>
        </div>
        
        {/* Barra de progresso */}
        <div className="h-1 bg-gray-200">
          <div 
            className={`h-full ${colors.progress} animate-shrink-width`}
            style={{ animationDuration: `${TOAST_DURATION_MS}ms` }}
          />
        </div>
      </div>
    </div>
  );
}
