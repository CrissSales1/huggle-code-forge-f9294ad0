import { Camera, CheckCircle2, Settings, Lightbulb, AlertTriangle, Monitor, Zap, Eye } from 'lucide-react';

export default function MonitoramentoHelp() {
  return (
    <div className="bg-white rounded-xl border-2 border-gray-200 p-4 sm:p-6 mb-6">
      {/* Título */}
      <div className="flex items-start space-x-3 mb-6">
        <Camera className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Como Funciona o Monitoramento Local
          </h3>
          <p className="text-sm text-gray-600">
            O sistema utiliza sua webcam para detectar e reconhecer placas de veículos automaticamente.
          </p>
        </div>
      </div>

      {/* Como Funciona */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-4 border border-blue-200">
        <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Fluxo de Detecção
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
          <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-blue-700 font-bold">1</span>
            </div>
            <p className="text-gray-700 font-medium">Câmera captura</p>
            <p className="text-gray-500 text-xs mt-1">Vídeo em tempo real</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-blue-700 font-bold">2</span>
            </div>
            <p className="text-gray-700 font-medium">Detecta movimento</p>
            <p className="text-gray-500 text-xs mt-1">Na área definida</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-blue-700 font-bold">3</span>
            </div>
            <p className="text-gray-700 font-medium">OCR lê a placa</p>
            <p className="text-gray-500 text-xs mt-1">Tesseract.js</p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
              <span className="text-blue-700 font-bold">4</span>
            </div>
            <p className="text-gray-700 font-medium">Verifica morador</p>
            <p className="text-gray-500 text-xs mt-1">Banco de dados</p>
          </div>
        </div>
      </div>

      {/* Configuração da Área de Leitura */}
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4 mb-4">
        <h4 className="font-semibold text-yellow-800 mb-3 flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Configurando a Área de Leitura
        </h4>
        <ul className="text-sm text-yellow-900 space-y-2">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <span>Clique em <strong>"Editar Área"</strong> na câmera para ajustar o polígono de leitura</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <span>Posicione o polígono para cobrir <strong>apenas a região onde a placa aparece</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <span>O sistema só detectará movimento dentro desta área</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
            <span>Clique em <strong>"Salvar"</strong> para aplicar a configuração</span>
          </li>
        </ul>
      </div>

      {/* Requisitos */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
        <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Monitor className="w-4 h-4" />
          Requisitos para Bom Funcionamento
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-700"><strong>Webcam:</strong> Resolução mínima 720p</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-700"><strong>Iluminação:</strong> Boa luz ambiente</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-700"><strong>Posição:</strong> Câmera na altura da placa</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span className="text-gray-700"><strong>Veículo:</strong> Parar por ~1 segundo</span>
          </div>
        </div>
      </div>

      {/* Dicas */}
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 mb-4">
        <h4 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
          <Lightbulb className="w-4 h-4" />
          Dicas para Melhor Reconhecimento
        </h4>
        <ul className="text-sm text-green-900 space-y-2">
          <li className="flex items-start gap-2">
            <Eye className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span>Evite luz direta na lente da câmera (contra-luz)</span>
          </li>
          <li className="flex items-start gap-2">
            <Eye className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span>Placas sujas ou danificadas podem ter menor taxa de reconhecimento</span>
          </li>
          <li className="flex items-start gap-2">
            <Eye className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span>Quanto menor a área de leitura, mais rápido o processamento</span>
          </li>
          <li className="flex items-start gap-2">
            <Eye className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <span>A primeira detecção pode demorar mais (carregamento do modelo OCR)</span>
          </li>
        </ul>
      </div>

      {/* Problemas Comuns */}
      <div className="bg-gradient-to-r from-red-50 to-orange-50 border border-red-200 rounded-lg p-4">
        <h4 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Problemas Comuns
        </h4>
        <div className="space-y-3 text-sm">
          <div className="bg-white rounded-lg p-3 border border-red-100">
            <p className="font-medium text-red-800">Não detecta movimento</p>
            <p className="text-gray-600 mt-1">
              Verifique se a área de leitura está corretamente posicionada e se há movimento suficiente.
            </p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-red-100">
            <p className="font-medium text-red-800">OCR lento ou não funciona</p>
            <p className="text-gray-600 mt-1">
              A primeira execução carrega o modelo (~2MB). Aguarde e tente novamente.
            </p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-red-100">
            <p className="font-medium text-red-800">Placa não reconhecida corretamente</p>
            <p className="text-gray-600 mt-1">
              Melhore a iluminação, limpe a lente da câmera e certifique-se que a placa está legível.
            </p>
          </div>
          <div className="bg-white rounded-lg p-3 border border-red-100">
            <p className="font-medium text-red-800">Câmera não aparece</p>
            <p className="text-gray-600 mt-1">
              Verifique as permissões do navegador e se a câmera não está sendo usada por outro programa.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
