/**
 * Toast de alerta quando pessoa detectada fora da página de vigilância
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { X, Shield } from 'lucide-react';
import { useVigilancia } from '@/react-app/contexts/VigilanciaContext';

const TOAST_DURATION_MS = 6000;

export default function VigilanciaToast() {
  const { personsInArea, isActive, lastAlertTime } = useVigilancia();
  const location = useLocation();
  const isOnPage = location.pathname === '/vigilancia';

  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isActive || isOnPage || personsInArea.length === 0 || !lastAlertTime) return;

    setCount(personsInArea.length);
    setExiting(false);
    setVisible(true);

    const timer = setTimeout(() => {
      setExiting(true);
      setTimeout(() => { setVisible(false); setExiting(false); }, 300);
    }, TOAST_DURATION_MS);

    return () => clearTimeout(timer);
  }, [lastAlertTime, isActive, isOnPage]);

  useEffect(() => {
    if (isOnPage && visible) {
      setExiting(true);
      setTimeout(() => { setVisible(false); setExiting(false); }, 300);
    }
  }, [isOnPage, visible]);

  if (!visible) return null;

  return (
    <div
      className={`fixed top-20 left-4 z-50 max-w-sm w-full transition-all duration-300 ${
        exiting ? 'opacity-0 -translate-x-full' : 'opacity-100 translate-x-0'
      }`}
    >
      <div className="relative rounded-xl shadow-2xl border-2 overflow-hidden bg-gradient-to-r from-red-50 to-orange-50 border-red-400">
        <div className="h-1 w-full bg-red-500" />
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-full bg-red-100">
                <Shield className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <span className="font-semibold text-sm text-red-700">
                  ⚠️ {count} pessoa(s) na área monitorada!
                </span>
                <div className="text-xs text-gray-500">Vigilância • Detecção automática</div>
              </div>
            </div>
            <button
              onClick={() => { setExiting(true); setTimeout(() => { setVisible(false); setExiting(false); }, 300); }}
              className="p-1 hover:bg-gray-200 rounded-full transition-colors"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        </div>
        <div className="h-1 bg-gray-200">
          <div
            className="h-full bg-red-400 animate-shrink-width"
            style={{ animationDuration: `${TOAST_DURATION_MS}ms` }}
          />
        </div>
      </div>
    </div>
  );
}
