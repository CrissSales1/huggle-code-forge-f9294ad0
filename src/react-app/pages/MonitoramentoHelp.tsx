import { AlertCircle, CheckCircle2, Copy, XCircle, Loader2, BookOpen, Zap, Cloud } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

type TestType = 'secondTube' | 'cloud' | null;
type TestResult = { success: boolean; message: string; formato?: string } | null;

export default function MonitoramentoHelp() {
  const webhookUrl = 'https://kbgftpiyzfmabrncpnas.supabase.co/functions/v1/rekor-webhook';
  const [copied, setCopied] = useState(false);
  const [testLoading, setTestLoading] = useState<TestType>(null);
  const [testResult, setTestResult] = useState<TestResult>(null);
  
  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      alert('Erro ao copiar. URL: ' + webhookUrl);
    }
  };
  
  // Teste do formato Second Tube (instantâneo)
  const handleTestSecondTube = async () => {
    setTestLoading('secondTube');
    setTestResult(null);
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_type: 'alpr_results',
          results: [{
            plate: 'SECONDTUBE1',
            confidence: 98.5,
            epoch_time: Date.now()
          }]
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTestResult({
          success: true,
          message: `⚡ Second Tube OK! Placa ${data.placa} processada instantaneamente.`,
          formato: data.formato
        });
      } else {
        setTestResult({
          success: false,
          message: data.message || 'Erro desconhecido'
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Erro de conexão'
      });
    } finally {
      setTestLoading(null);
    }
  };
  
  // Teste do formato Cloud (agrupado)
  const handleTestCloud = async () => {
    setTestLoading('cloud');
    setTestResult(null);
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data_type: 'alpr_group',
          best_plate_number: 'CLOUD123',
          best_confidence: 95.0,
          epoch_start: Date.now()
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTestResult({
          success: true,
          message: `☁️ Cloud OK! Placa ${data.placa} processada via agrupamento.`,
          formato: data.formato
        });
      } else {
        setTestResult({
          success: false,
          message: data.message || 'Erro desconhecido'
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Erro de conexão'
      });
    } finally {
      setTestLoading(null);
    }
  };
  
  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 p-4 sm:p-6 mb-6">
      <div className="flex items-start space-x-3 mb-4">
        <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
            Como Configurar o Rekor Scout
          </h3>
          <p className="text-xs sm:text-sm text-gray-600 mb-4">
            Para que as detecções apareçam aqui, configure o Rekor Scout para enviar dados para este endpoint.
          </p>
        </div>
      </div>

      {/* URL do Webhook - destaque principal */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-4 border-2 border-blue-200">
        <p className="text-xs font-bold text-blue-800 mb-2 flex items-center gap-2">
          <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px]">ENDPOINT</span>
          Cole esta URL no Rekor Scout:
        </p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <code className="flex-1 bg-white px-3 py-2.5 rounded border-2 border-blue-300 text-xs sm:text-sm font-mono break-all text-blue-900 select-all">
            {webhookUrl}
          </code>
          <button
            onClick={handleCopyUrl}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              copied 
                ? 'bg-green-600 text-white' 
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {copied ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copiar
              </>
            )}
          </button>
        </div>
      </div>

      {/* Configuração Second Tube (INSTANTÂNEO) */}
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-400 rounded-lg p-4 mb-4">
        <p className="text-xs font-bold text-yellow-800 mb-2 flex items-center gap-2">
          <span className="bg-yellow-500 text-white px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
            <Zap className="w-3 h-3" /> DETECÇÃO INSTANTÂNEA
          </span>
          Configure → OpenALPR Settings:
        </p>
        <ul className="text-xs text-yellow-900 space-y-2">
          <li className="flex items-start gap-2">
            <span className="font-bold text-yellow-700">•</span>
            <span>
              <strong>upload_second_tube_post_enabled</strong> → Override → <strong>1</strong>
              <span className="block text-[10px] text-yellow-700 mt-0.5">Ativa o envio direto para o webhook</span>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-yellow-700">•</span>
            <span>
              <strong>upload_second_tube_post_url</strong> → Override → Cole a URL acima
              <span className="block text-[10px] text-yellow-700 mt-0.5">Envia detecção instantânea, sem esperar agrupamento</span>
            </span>
          </li>
        </ul>
        <p className="text-[10px] text-yellow-700 mt-2 pt-2 border-t border-yellow-200">
          ⚡ <strong>Recomendado para portaria!</strong> O porteiro vê a placa assim que o veículo entra na cena.
        </p>
      </div>

      {/* Configuração Cloud (fallback) */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
        <p className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-2">
          <span className="bg-gray-500 text-white px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
            <Cloud className="w-3 h-3" /> CLOUD (ALTERNATIVO)
          </span>
          Configuração via Rekor Scout Cloud:
        </p>
        <ul className="text-xs text-gray-600 space-y-2">
          <li className="flex items-start gap-2">
            <span className="font-bold text-gray-500">•</span>
            <span>
              <strong>plate_groups_min_plates_to_group</strong> → Override → <strong>1</strong>
              <span className="block text-[10px] text-gray-500 mt-0.5">Envia na primeira leitura</span>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold text-gray-500">•</span>
            <span>
              <strong>plate_groups_time_delta_ms</strong> → Override → <strong>500</strong>
              <span className="block text-[10px] text-gray-500 mt-0.5">Reduz tempo de espera</span>
            </span>
          </li>
        </ul>
        <p className="text-[10px] text-gray-500 mt-2 pt-2 border-t border-gray-200">
          ☁️ O Cloud tem delay de 5-15 segundos. Use apenas se o Second Tube não funcionar.
        </p>
      </div>

      {/* Resultado do teste */}
      {testResult && (
        <div className={`mb-4 p-3 rounded-lg ${
          testResult.success 
            ? 'bg-green-100 border border-green-300 text-green-800' 
            : 'bg-red-100 border border-red-300 text-red-800'
        }`}>
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{testResult.message}</span>
          </div>
          {testResult.formato && (
            <p className="text-xs mt-1 ml-7 opacity-80">
              Formato detectado: <code className="bg-white/50 px-1 rounded">{testResult.formato}</code>
            </p>
          )}
        </div>
      )}

      {/* Botões de teste específicos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <button
          onClick={handleTestSecondTube}
          disabled={testLoading !== null}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-lg hover:from-yellow-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-md"
        >
          {testLoading === 'secondTube' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Testando...</span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              <span>Testar Second Tube</span>
            </>
          )}
        </button>
        
        <button
          onClick={handleTestCloud}
          disabled={testLoading !== null}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg hover:from-gray-600 hover:to-gray-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-md"
        >
          {testLoading === 'cloud' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Testando...</span>
            </>
          ) : (
            <>
              <Cloud className="w-4 h-4" />
              <span>Testar Cloud</span>
            </>
          )}
        </button>
      </div>

      <Link
        to="/guia-rekor-scout"
        className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold w-full"
      >
        <BookOpen className="w-4 h-4" />
        <span>Guia Completo de Configuração</span>
      </Link>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600">
            <strong>Dica:</strong> Desative o webhook do Cloud e deixe apenas o Second Tube ativo. 
            Depois clique em "Testar Second Tube" para confirmar que está funcionando.
          </p>
        </div>
      </div>
    </div>
  );
}
