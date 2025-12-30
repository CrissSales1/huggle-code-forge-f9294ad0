/**
 * Página de configuração de câmeras IP via go2rtc
 */
import { useState, useEffect } from 'react';
import { 
  Camera, 
  Settings, 
  Save, 
  TestTube, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Wifi,
  WifiOff,
  ExternalLink,
  HelpCircle
} from 'lucide-react';
import { 
  loadGo2rtcConfig, 
  saveGo2rtcConfig,
  loadStreamMode,
  saveStreamMode 
} from '../hooks/useGo2rtcStream';

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface StreamTest {
  status: TestStatus;
  message: string;
}

export default function ConfiguracoesCameras() {
  const [serverUrl, setServerUrl] = useState('http://192.168.1.100:1984');
  const [streamEntrada, setStreamEntrada] = useState('entrada');
  const [streamSaida, setStreamSaida] = useState('saida');
  const [modeEntrada, setModeEntrada] = useState<'webcam' | 'go2rtc'>('webcam');
  const [modeSaida, setModeSaida] = useState<'webcam' | 'go2rtc'>('webcam');
  
  const [testEntrada, setTestEntrada] = useState<StreamTest>({ status: 'idle', message: '' });
  const [testSaida, setTestSaida] = useState<StreamTest>({ status: 'idle', message: '' });
  const [saved, setSaved] = useState(false);
  
  // Carregar configurações salvas
  useEffect(() => {
    const configEntrada = loadGo2rtcConfig('entrada');
    const configSaida = loadGo2rtcConfig('saida');
    
    if (configEntrada) {
      setServerUrl(configEntrada.serverUrl);
      setStreamEntrada(configEntrada.streamName);
    }
    if (configSaida) {
      setStreamSaida(configSaida.streamName);
    }
    
    setModeEntrada(loadStreamMode('entrada'));
    setModeSaida(loadStreamMode('saida'));
  }, []);
  
  // Salvar configurações
  const handleSave = () => {
    saveGo2rtcConfig(serverUrl, streamEntrada, streamSaida);
    saveStreamMode('entrada', modeEntrada);
    saveStreamMode('saida', modeSaida);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };
  
  // Testar conexão com stream
  const testStream = async (streamName: string, type: 'entrada' | 'saida') => {
    const setTest = type === 'entrada' ? setTestEntrada : setTestSaida;
    
    setTest({ status: 'testing', message: 'Testando conexão...' });
    
    try {
      // Verificar se servidor responde
      const apiUrl = `${serverUrl}/api/streams`;
      const response = await fetch(apiUrl, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) {
        throw new Error(`Servidor retornou ${response.status}`);
      }
      
      const streams = await response.json();
      
      // Verificar se stream existe
      if (streams[streamName]) {
        setTest({ 
          status: 'success', 
          message: `✅ Stream "${streamName}" encontrado e ativo!`
        });
      } else {
        setTest({ 
          status: 'error', 
          message: `⚠️ Servidor OK, mas stream "${streamName}" não encontrado. Verifique o go2rtc.yaml`
        });
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Erro desconhecido';
      setTest({ 
        status: 'error', 
        message: `❌ Falha: ${errorMessage}. Verifique se go2rtc está rodando em ${serverUrl}`
      });
    }
  };
  
  const TestStatusIcon = ({ status }: { status: TestStatus }) => {
    switch (status) {
      case 'testing':
        return <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return null;
    }
  };
  
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Camera className="w-8 h-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Configuração de Câmeras IP</h1>
        </div>
        <p className="text-gray-600">
          Configure suas câmeras RTSP usando go2rtc como conversor de stream.
        </p>
      </div>
      
      {/* Alerta Informativo */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900 mb-1">Pré-requisitos</h3>
            <p className="text-sm text-blue-800 mb-2">
              Para usar câmeras IP, você precisa do go2rtc rodando em um servidor local.
            </p>
            <a 
              href="/SETUP-GO2RTC.md" 
              target="_blank"
              className="inline-flex items-center gap-1.5 text-sm text-blue-700 hover:text-blue-900 font-medium"
            >
              <HelpCircle className="w-4 h-4" />
              Ver guia de instalação
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>
      
      {/* Formulário de Configuração */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-600" />
            <h2 className="font-semibold text-gray-900">Servidor go2rtc</h2>
          </div>
        </div>
        
        <div className="p-4 space-y-4">
          {/* URL do Servidor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              URL do Servidor go2rtc
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://192.168.1.100:1984"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Endereço IP do computador ou Raspberry Pi rodando go2rtc (porta padrão: 1984)
            </p>
          </div>
        </div>
        
        {/* Câmera de Entrada */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <ArrowDown className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Câmera de Entrada</h3>
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Modo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Fonte de Vídeo
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setModeEntrada('webcam')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
                    modeEntrada === 'webcam'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  Webcam
                </button>
                <button
                  onClick={() => setModeEntrada('go2rtc')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
                    modeEntrada === 'go2rtc'
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Wifi className="w-4 h-4" />
                  Câmera IP
                </button>
              </div>
            </div>
            
            {/* Nome do Stream */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nome do Stream
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={streamEntrada}
                  onChange={(e) => setStreamEntrada(e.target.value)}
                  placeholder="entrada"
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  disabled={modeEntrada === 'webcam'}
                />
                <button
                  onClick={() => testStream(streamEntrada, 'entrada')}
                  disabled={modeEntrada === 'webcam' || testEntrada.status === 'testing'}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {testEntrada.status === 'testing' ? (
                    <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <TestTube className="w-4 h-4" />
                  )}
                  Testar
                </button>
              </div>
            </div>
          </div>
          
          {/* Resultado do Teste */}
          {testEntrada.status !== 'idle' && (
            <div className={`mt-3 flex items-center gap-2 p-3 rounded-lg ${
              testEntrada.status === 'success' ? 'bg-green-50 text-green-800' :
              testEntrada.status === 'error' ? 'bg-red-50 text-red-800' :
              'bg-blue-50 text-blue-800'
            }`}>
              <TestStatusIcon status={testEntrada.status} />
              <span className="text-sm">{testEntrada.message}</span>
            </div>
          )}
        </div>
        
        {/* Câmera de Saída */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <ArrowUp className="w-5 h-5 text-orange-600" />
            <h3 className="font-semibold text-gray-900">Câmera de Saída</h3>
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Modo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Fonte de Vídeo
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setModeSaida('webcam')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
                    modeSaida === 'webcam'
                      ? 'bg-orange-50 border-orange-300 text-orange-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  Webcam
                </button>
                <button
                  onClick={() => setModeSaida('go2rtc')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition-colors ${
                    modeSaida === 'go2rtc'
                      ? 'bg-orange-50 border-orange-300 text-orange-700'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Wifi className="w-4 h-4" />
                  Câmera IP
                </button>
              </div>
            </div>
            
            {/* Nome do Stream */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nome do Stream
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={streamSaida}
                  onChange={(e) => setStreamSaida(e.target.value)}
                  placeholder="saida"
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                  disabled={modeSaida === 'webcam'}
                />
                <button
                  onClick={() => testStream(streamSaida, 'saida')}
                  disabled={modeSaida === 'webcam' || testSaida.status === 'testing'}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {testSaida.status === 'testing' ? (
                    <div className="w-4 h-4 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <TestTube className="w-4 h-4" />
                  )}
                  Testar
                </button>
              </div>
            </div>
          </div>
          
          {/* Resultado do Teste */}
          {testSaida.status !== 'idle' && (
            <div className={`mt-3 flex items-center gap-2 p-3 rounded-lg ${
              testSaida.status === 'success' ? 'bg-green-50 text-green-800' :
              testSaida.status === 'error' ? 'bg-red-50 text-red-800' :
              'bg-blue-50 text-blue-800'
            }`}>
              <TestStatusIcon status={testSaida.status} />
              <span className="text-sm">{testSaida.message}</span>
            </div>
          )}
        </div>
        
        {/* Botão Salvar */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {modeEntrada === 'go2rtc' || modeSaida === 'go2rtc' ? (
                <>
                  <Wifi className="w-4 h-4 text-green-600" />
                  <span className="text-sm text-gray-600">
                    {modeEntrada === 'go2rtc' && modeSaida === 'go2rtc' 
                      ? 'Ambas as câmeras via IP'
                      : modeEntrada === 'go2rtc' 
                        ? 'Entrada via IP, Saída via Webcam'
                        : 'Entrada via Webcam, Saída via IP'
                    }
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-500">
                    Ambas as câmeras via Webcam
                  </span>
                </>
              )}
            </div>
            
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {saved ? (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Salvo!
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Salvar Configurações
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      
      {/* Dicas */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
        <h3 className="font-medium text-gray-900 mb-3">💡 Dicas</h3>
        <ul className="space-y-2 text-sm text-gray-600">
          <li className="flex items-start gap-2">
            <span className="text-blue-500">•</span>
            O go2rtc deve estar rodando no mesmo computador ou Raspberry Pi da rede local.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500">•</span>
            Os nomes dos streams (entrada/saida) devem corresponder aos configurados no go2rtc.yaml.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500">•</span>
            A conexão usa WebRTC para menor latência. Se falhar, tenta MSE automaticamente.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500">•</span>
            Você pode usar modo híbrido: uma câmera via IP e outra via Webcam.
          </li>
        </ul>
      </div>
    </div>
  );
}
