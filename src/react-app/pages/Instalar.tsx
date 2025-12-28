import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Download, Smartphone, Share, Plus, Check, ArrowLeft, Monitor } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Instalar() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // Detectar se já está instalado
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Capturar evento de instalação
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    setIsInstalling(true);
    
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
    } finally {
      setIsInstalling(false);
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 py-8 px-4">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 mx-auto mb-4 rounded-2xl overflow-hidden shadow-xl">
            <img 
              src="/pwa-icons/icon.svg" 
              alt="Estacionamento" 
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            Estacionamento - Aguas da Fonte
          </h1>
          <p className="text-gray-600">
            Instale o app na sua tela inicial para acesso rápido
          </p>
        </div>

        {/* Status de Instalação */}
        {isInstalled ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-green-500 rounded-full flex items-center justify-center">
              <Check className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-semibold text-green-800 mb-2">
              App Instalado!
            </h2>
            <p className="text-green-700">
              O app já está instalado no seu dispositivo. Você pode acessá-lo pela tela inicial.
            </p>
          </div>
        ) : (
          <>
            {/* Botão de Instalação Automática (Android) */}
            {deferredPrompt && (
              <button
                onClick={handleInstall}
                disabled={isInstalling}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 px-6 rounded-xl font-semibold text-lg shadow-lg hover:from-blue-700 hover:to-blue-800 transition-all mb-6 flex items-center justify-center gap-3 disabled:opacity-70"
              >
                <Download className="w-6 h-6" />
                {isInstalling ? 'Instalando...' : 'Instalar Agora'}
              </button>
            )}

            {/* Instruções Android */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                  <Smartphone className="w-5 h-5 text-green-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-800">Android</h2>
              </div>
              
              <ol className="space-y-4 text-gray-700">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                  <span>Toque no menu <strong className="text-gray-900">⋮</strong> (três pontos) no canto superior direito do navegador</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                  <span>Selecione <strong className="text-gray-900">"Instalar app"</strong> ou <strong className="text-gray-900">"Adicionar à tela inicial"</strong></span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                  <span>Confirme a instalação tocando em <strong className="text-gray-900">"Instalar"</strong></span>
                </li>
              </ol>
            </div>

            {/* Instruções iOS */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Monitor className="w-5 h-5 text-gray-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-800">iPhone / iPad</h2>
              </div>
              
              <ol className="space-y-4 text-gray-700">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">1</span>
                  <div className="flex items-center gap-2">
                    <span>Toque no botão</span>
                    <Share className="w-5 h-5 text-blue-500" />
                    <span><strong className="text-gray-900">Compartilhar</strong></span>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">2</span>
                  <div className="flex items-center gap-2">
                    <span>Role e toque em</span>
                    <Plus className="w-4 h-4 text-gray-600" />
                    <span><strong className="text-gray-900">"Adicionar à Tela de Início"</strong></span>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">3</span>
                  <span>Confirme tocando em <strong className="text-gray-900">"Adicionar"</strong></span>
                </li>
              </ol>
            </div>
          </>
        )}

        {/* Voltar ao Sistema */}
        <Link
          to="/login"
          className="w-full bg-gray-100 text-gray-700 py-3 px-6 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Ir para o Sistema
        </Link>

        {/* Benefícios */}
        <div className="mt-8 text-center">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Benefícios do App
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="w-12 h-12 mx-auto mb-2 bg-blue-100 rounded-full flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-blue-600" />
              </div>
              <p className="text-xs text-gray-600">Acesso rápido</p>
            </div>
            <div>
              <div className="w-12 h-12 mx-auto mb-2 bg-blue-100 rounded-full flex items-center justify-center">
                <Download className="w-6 h-6 text-blue-600" />
              </div>
              <p className="text-xs text-gray-600">Tela cheia</p>
            </div>
            <div>
              <div className="w-12 h-12 mx-auto mb-2 bg-blue-100 rounded-full flex items-center justify-center">
                <Check className="w-6 h-6 text-blue-600" />
              </div>
              <p className="text-xs text-gray-600">Sempre atualizado</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
