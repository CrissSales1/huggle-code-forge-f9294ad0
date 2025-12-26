import { ArrowLeft, CheckCircle2, AlertCircle, Camera, Settings, Wifi, Server, Copy } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

export default function GuiaRekorScout() {
  const webhookUrl = 'https://kbgftpiyzfmabrncpnas.supabase.co/functions/v1/rekor-webhook';
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      alert('Erro ao copiar. URL: ' + webhookUrl);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 text-white">
        <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
          <Link 
            to="/monitoramento" 
            className="inline-flex items-center gap-2 text-blue-100 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Monitoramento</span>
          </Link>
          
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4">
              <Camera className="w-10 h-10 sm:w-12 sm:h-12" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-black">Guia de Configuração</h1>
              <p className="text-blue-100 text-sm sm:text-lg">Rekor Scout + PortaCerta</p>
            </div>
          </div>
          
          <p className="text-blue-100 max-w-2xl">
            Configure o reconhecimento automático de placas para identificar moradores e visitantes em tempo real.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* Endpoint Principal */}
        <div className="bg-white rounded-2xl shadow-xl border-2 border-blue-200 p-6 sm:p-8 mb-8 -mt-8 sm:-mt-12 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-100 rounded-xl p-3">
              <Server className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Endpoint do Webhook</h2>
              <p className="text-gray-500 text-sm">Use esta URL no Rekor Scout</p>
            </div>
          </div>
          
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-4 mb-4">
            <code className="text-green-400 text-sm sm:text-base font-mono break-all select-all">
              {webhookUrl}
            </code>
          </div>
          
          <button
            onClick={handleCopyUrl}
            className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold transition-all ${
              copied 
                ? 'bg-green-500 text-white' 
                : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg'
            }`}
          >
            {copied ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Copiado para a área de transferência!
              </>
            ) : (
              <>
                <Copy className="w-5 h-5" />
                Copiar URL do Webhook
              </>
            )}
          </button>
        </div>

        {/* Passo a Passo */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <Settings className="w-7 h-7 text-indigo-600" />
            Passo a Passo
          </h2>
          
          <div className="space-y-4">
            {/* Passo 1 */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="flex items-start gap-4 p-5 sm:p-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xl font-black shadow-lg">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Abra o Rekor Scout</h3>
                  <p className="text-gray-600 mb-3">
                    Inicie o aplicativo Rekor Scout no computador conectado à câmera. Certifique-se de que a câmera está funcionando corretamente.
                  </p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      O computador precisa ter acesso à internet para enviar as detecções.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Passo 2 */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="flex items-start gap-4 p-5 sm:p-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xl font-black shadow-lg">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Acesse as Configurações de Webhook</h3>
                  <p className="text-gray-600 mb-3">
                    No menu do Rekor Scout, vá em <strong>Settings</strong> (Configurações) e procure por 
                    <strong> "Web Server"</strong> ou <strong>"Webhook"</strong>.
                  </p>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800 font-medium">
                      📍 Caminho: Settings → Web Server → Destination
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Passo 3 */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="flex items-start gap-4 p-5 sm:p-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xl font-black shadow-lg">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Selecione "Other HTTP Web Server"</h3>
                  <p className="text-gray-600 mb-3">
                    Na lista de destinos disponíveis, escolha a opção <strong>"Other HTTP Web Server"</strong> 
                    ou <strong>"Custom Webhook"</strong>.
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-center text-sm">
                    <div className="bg-gray-100 rounded-lg p-3 opacity-50">
                      <span className="text-gray-500">OpenALPR Cloud</span>
                    </div>
                    <div className="bg-green-100 border-2 border-green-500 rounded-lg p-3">
                      <span className="text-green-700 font-bold">✓ Other HTTP Web Server</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Passo 4 - Company ID */}
            <div className="bg-white rounded-xl shadow-lg border-2 border-red-200 overflow-hidden">
              <div className="flex items-start gap-4 p-5 sm:p-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-600 text-white flex items-center justify-center text-xl font-black shadow-lg">
                  4
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">⚠️ Preencha o Company ID (OBRIGATÓRIO)</h3>
                  <p className="text-gray-600 mb-3">
                    Localize o campo <strong>"Company ID"</strong> e preencha com seu ID de usuário do Rekor Scout. 
                    <strong className="text-red-600"> Este campo é obrigatório!</strong>
                  </p>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-3">
                    <p className="text-sm text-red-800 font-medium mb-2">
                      ⚠️ Sem o Company ID preenchido:
                    </p>
                    <ul className="text-sm text-red-700 space-y-1 ml-4 list-disc">
                      <li>A câmera pode não carregar</li>
                      <li>As detecções não serão enviadas</li>
                      <li>O sistema apresentará erros</li>
                    </ul>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      <strong>Onde encontrar:</strong> Portal Rekor Scout → Settings → Profile → ID da conta
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Passo 5 */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="flex items-start gap-4 p-5 sm:p-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xl font-black shadow-lg">
                  5
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Cole a URL do Endpoint</h3>
                  <p className="text-gray-600 mb-3">
                    No campo de URL/Endpoint, cole a URL copiada acima. Não modifique nenhum caractere.
                  </p>
                  <div className="bg-slate-900 rounded-lg p-3 mb-3">
                    <code className="text-green-400 text-xs sm:text-sm font-mono break-all">
                      {webhookUrl}
                    </code>
                  </div>
                  <button
                    onClick={handleCopyUrl}
                    className="text-sm text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                  >
                    <Copy className="w-4 h-4" />
                    Copiar novamente
                  </button>
                </div>
              </div>
            </div>

            {/* Passo 6 */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="flex items-start gap-4 p-5 sm:p-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xl font-black shadow-lg">
                  6
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Salve e Reinicie o Serviço</h3>
                  <p className="text-gray-600 mb-3">
                    Clique em <strong>"Apply"</strong> para salvar. Depois, <strong>reinicie o serviço</strong> do Rekor Scout para aplicar as alterações.
                  </p>
                  <div className="flex flex-wrap gap-3 mb-3">
                    <span className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">
                      Apply
                    </span>
                    <span className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-bold">
                      Finish
                    </span>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-800">
                      <strong>Importante:</strong> Reinicie o serviço "OpenALPR" no Gerenciador de Serviços do Windows, ou feche e abra o aplicativo novamente.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Passo 7 */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="flex items-start gap-4 p-5 sm:p-6">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white flex items-center justify-center text-xl font-black shadow-lg">
                  7
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Teste a Integração</h3>
                  <p className="text-gray-600 mb-3">
                    Passe um veículo na frente da câmera. Se tudo estiver correto, a detecção aparecerá 
                    <strong> em 1-3 segundos</strong> na página de Monitoramento.
                  </p>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle2 className="w-8 h-8 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="font-bold text-green-800">Pronto!</p>
                      <p className="text-sm text-green-700">O sistema receberá as placas automaticamente.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Como Funciona */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 sm:p-8 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
            <Wifi className="w-6 h-6 text-indigo-600" />
            Como Funciona?
          </h2>
          
          <div className="grid sm:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center">
                <Camera className="w-8 h-8 text-amber-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">1. Detecção</h3>
              <p className="text-sm text-gray-600">
                A câmera captura o veículo e o Rekor Scout reconhece a placa
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
                <Server className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">2. Envio</h3>
              <p className="text-sm text-gray-600">
                O Rekor envia a placa para o PortaCerta via webhook
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">3. Verificação</h3>
              <p className="text-sm text-gray-600">
                O sistema verifica se é morador e exibe o resultado na tela
              </p>
            </div>
          </div>
        </div>

        {/* Configurações para Velocidade */}
        <div className="bg-gradient-to-r from-emerald-50 to-green-50 rounded-2xl border-2 border-emerald-200 p-6 sm:p-8 mb-8">
          <h2 className="text-xl font-bold text-emerald-900 mb-4 flex items-center gap-3">
            <Settings className="w-6 h-6" />
            Configurações para Detecção Rápida
          </h2>
          <p className="text-emerald-800 mb-4">
            Para reduzir o tempo entre a detecção e a exibição no app, configure em <strong>Configure → OpenALPR Settings</strong>:
          </p>
          
          <div className="bg-white rounded-xl p-4 border border-emerald-200 space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-emerald-100">
              <code className="text-sm font-mono text-emerald-800">plate_groups_min_plates_to_group</code>
              <span className="bg-emerald-600 text-white px-3 py-1 rounded-lg font-bold text-sm">1</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-emerald-100">
              <code className="text-sm font-mono text-emerald-800">plate_groups_time_delta_ms</code>
              <span className="bg-emerald-600 text-white px-3 py-1 rounded-lg font-bold text-sm">500</span>
            </div>
            <p className="text-xs text-emerald-700 pt-2">
              Marque <strong>Override</strong> em cada configuração e aplique os valores acima. 
              Depois <strong>reinicie o serviço</strong> do Rekor Scout.
            </p>
          </div>
          
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">
              <strong>Importante:</strong> NÃO desative <code className="bg-red-100 px-1 rounded">plate_groups_enabled</code> - isso impede o envio de webhooks.
            </p>
          </div>
        </div>

        {/* Dicas */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border-2 border-amber-200 p-6 sm:p-8 mb-8">
          <h2 className="text-xl font-bold text-amber-900 mb-4 flex items-center gap-3">
            <AlertCircle className="w-6 h-6" />
            Dicas Importantes
          </h2>
          
          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-amber-800">
                <strong>Cadastre os veículos dos moradores</strong> na seção "Veículos Cadastrados" para que sejam identificados automaticamente.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-amber-800">
                <strong>Mantenha a câmera limpa</strong> e bem posicionada para melhor reconhecimento das placas.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-amber-800">
                <strong>O computador do Rekor Scout</strong> precisa estar sempre ligado e conectado à internet.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-amber-800">
                <strong>As detecções aparecem em tempo real</strong> - não precisa atualizar a página.
              </p>
            </li>
          </ul>
        </div>

        {/* Botão Voltar */}
        <div className="text-center">
          <Link 
            to="/monitoramento"
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
          >
            <ArrowLeft className="w-5 h-5" />
            Voltar ao Monitoramento
          </Link>
        </div>
      </div>
    </div>
  );
}