import { AlertCircle, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';

export default function MonitoramentoHelp() {
  const webhookUrl = window.location.origin + '/api/rekorscout/webhook';
  
  const handleTestWebhook = async () => {
    try {
      const response = await fetch('/api/rekorscout/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          results: [{
            plate: 'ABC1234',
            score: 0.95
          }]
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('✅ Webhook funcionando! Placa de teste ABC1234 foi processada com sucesso.');
      } else {
        alert('❌ Webhook respondeu mas houve um problema: ' + (data.message || 'Erro desconhecido'));
      }
    } catch (error) {
      alert('❌ Erro ao testar webhook: ' + (error instanceof Error ? error.message : String(error)));
    }
  };
  
  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 p-6 mb-6">
      <div className="flex items-start space-x-3 mb-4">
        <AlertCircle className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Como Configurar o Rekor Scout
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Para que as detecções apareçam aqui, você precisa configurar o Rekor Scout para enviar as detecções para este webhook.
          </p>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <p className="text-xs font-semibold text-gray-700 mb-2">URL do Webhook:</p>
        <div className="flex items-center space-x-2">
          <code className="flex-1 bg-white px-3 py-2 rounded border border-gray-300 text-sm font-mono break-all">
            {webhookUrl}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(webhookUrl);
              alert('URL copiada!');
            }}
            className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm whitespace-nowrap"
          >
            Copiar
          </button>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
            1
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-700">
              <strong>Acesse as configurações do Rekor Scout</strong> (painel web, config.yaml, ou API)
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
            2
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-700">
              <strong>Configure o webhook</strong> para enviar detecções de placas para a URL acima
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
            3
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-700">
              <strong>Configure</strong>: Method = POST, Content-Type = application/json
            </p>
          </div>
        </div>

        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">
            4
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-700">
              <strong>Teste</strong> passando um veículo na câmera ou use o botão de teste abaixo
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleTestWebhook}
          className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Testar Webhook</span>
        </button>
        
        <a
          href="https://github.com/yourusername/portacerta/blob/main/SETUP-REKOR-SCOUT-WEBHOOK.md"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
