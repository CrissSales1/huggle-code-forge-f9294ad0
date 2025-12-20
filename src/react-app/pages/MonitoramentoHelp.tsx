import { AlertCircle, CheckCircle2, ExternalLink, Copy, XCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';

export default function MonitoramentoHelp() {
  const webhookUrl = 'https://kbgftpiyzfmabrncpnas.supabase.co/functions/v1/rekor-webhook';
  const [copied, setCopied] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean; message: string} | null>(null);
  
  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      alert('Erro ao copiar. URL: ' + webhookUrl);
    }
  };
  
  const handleTestWebhook = async () => {
    setTestLoading(true);
    setTestResult(null);
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          results: [{
            plate: 'TEST123',
            score: 0.95
          }]
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTestResult({
          success: true,
          message: `Webhook funcionando! Placa ${data.placa} processada.`
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
      setTestLoading(false);
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

      {/* Passos de configuração */}
      <div className="space-y-3 mb-4">
        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
            1
          </div>
          <div className="flex-1">
            <p className="text-xs sm:text-sm text-gray-700">
              <strong>No Rekor Scout</strong> → Selecione "Other HTTP Web Server"
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
            2
          </div>
          <div className="flex-1">
            <p className="text-xs sm:text-sm text-gray-700">
              <strong>Cole a URL acima</strong> no campo de endpoint
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
            3
          </div>
          <div className="flex-1">
            <p className="text-xs sm:text-sm text-gray-700">
              <strong>Clique em Apply</strong> e depois <strong>Finish</strong>
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
            4
          </div>
          <div className="flex-1">
            <p className="text-xs sm:text-sm text-gray-700">
              <strong>Teste</strong> passando um veículo na câmera ou use o botão abaixo
            </p>
          </div>
        </div>
      </div>

      {/* Resultado do teste */}
      {testResult && (
        <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
          testResult.success 
            ? 'bg-green-100 border border-green-300 text-green-800' 
            : 'bg-red-100 border border-red-300 text-red-800'
        }`}>
          {testResult.success ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : (
            <XCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{testResult.message}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleTestWebhook}
          disabled={testLoading}
          className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
        >
          {testLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Testando...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Testar Webhook</span>
            </>
          )}
        </button>
        
        <a
          href="https://github.com/yourusername/portacerta/blob/main/SETUP-REKOR-SCOUT-WEBHOOK.md"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-semibold"
        >
          <ExternalLink className="w-4 h-4" />
          <span>Guia Completo</span>
        </a>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-600">
            <strong>Importante:</strong> O Rekor Scout precisa estar configurado para <strong>ENVIAR</strong> as detecções. 
            Sem essa configuração, as detecções não aparecerão automaticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
