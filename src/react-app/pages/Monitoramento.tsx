import { useState, useEffect } from 'react';
import { Plus, Camera, CheckCircle, XCircle, Home, Edit2, Trash2, Car, Activity, Wifi, HelpCircle, RotateCcw } from 'lucide-react';
import { useLPRDetections } from '@/react-app/hooks/useApi';
import CadastroMoradorModal from '@/react-app/components/CadastroMoradorModal';
import EditarVeiculoMoradorModal from '@/react-app/components/EditarVeiculoMoradorModal';
import MonitoramentoHelp from '@/react-app/pages/MonitoramentoHelp';
import PlacaVeiculo from '@/react-app/components/PlacaVeiculo';
interface VeiculoMorador {
  id: number;
  placa_veiculo: string;
  casa: string;
}
export default function Monitoramento() {
  const [showCadastroModal, setShowCadastroModal] = useState(false);
  const [showEditarModal, setShowEditarModal] = useState(false);
  const [showVeiculosCadastrados, setShowVeiculosCadastrados] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [veiculos, setVeiculos] = useState<VeiculoMorador[]>([]);
  const [veiculoSelecionado, setVeiculoSelecionado] = useState<VeiculoMorador | null>(null);
  const {
    latestDetection,
    detectionHistory,
    loading
  } = useLPRDetections();
  const carregarVeiculos = async () => {
    try {
      const response = await fetch('/api/moradores/veiculos');
      if (response.ok) {
        const data = await response.json();
        setVeiculos(data);
      }
    } catch (err) {
      console.error('Erro ao carregar veículos:', err);
    }
  };
  const handleEditarVeiculo = (veiculo: VeiculoMorador) => {
    setVeiculoSelecionado(veiculo);
    setShowEditarModal(true);
  };
  const handleExcluirVeiculo = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este veículo?')) {
      return;
    }
    try {
      const response = await fetch(`/api/moradores/veiculos/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        await carregarVeiculos();
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Erro ao excluir veículo');
      }
    } catch (err) {
      console.error('Erro ao excluir veículo:', err);
      alert('Erro ao excluir veículo');
    }
  };

  const handleLimparMonitoramento = async () => {
    if (!confirm('Tem certeza que deseja limpar o histórico de detecções?')) {
      return;
    }
    try {
      const response = await fetch('/api/lpr/detections', {
        method: 'DELETE'
      });
      if (response.ok) {
        alert('Histórico de detecções limpo com sucesso!');
        window.location.reload();
      } else {
        const errorData = await response.json();
        alert(errorData.error || 'Erro ao limpar histórico');
      }
    } catch (err) {
      console.error('Erro ao limpar histórico:', err);
      alert('Erro ao limpar histórico');
    }
  };

  // Carregar veículos ao montar o componente
  useEffect(() => {
    carregarVeiculos();
  }, []);
  return <div className="container mx-auto px-4 py-6 lg:py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">Monitoramento de Moradores</h1>
          <p className="text-gray-600">Reconhecimento inteligente via Rekor Scout</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleLimparMonitoramento}
            className="flex items-center space-x-2 px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition-colors"
          >
            <RotateCcw className="w-5 h-5" />
            <span className="hidden sm:inline">Limpar Status</span>
          </button>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              showHelp 
                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <HelpCircle className="w-5 h-5" />
            <span className="hidden sm:inline">{showHelp ? 'Ocultar' : 'Mostrar'} Ajuda</span>
          </button>
        </div>
      </div>

      {/* Ajuda de Configuração */}
      {showHelp && <MonitoramentoHelp />}

      {/* Status da Conexão */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 lg:p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
            <Wifi className="w-5 h-5 text-green-600" />
            <span>Status do Monitoramento</span>
          </h2>
          <div className="flex items-center space-x-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
            <Activity className="w-3 h-3" />
            <span>Aguardando Detecções</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Última Detecção */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Última Detecção</h3>
            {loading && !latestDetection ? <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                <p className="text-gray-600">Carregando...</p>
              </div> : !latestDetection ? <div className="text-center py-12 bg-gray-50 rounded-lg">
                <Camera className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">Aguardando detecção...</p>
                <p className="text-sm text-gray-500 mt-2">Os dados serão carregados automaticamente</p>
              </div> : latestDetection.morador ? <div className="relative bg-gradient-to-br from-green-50 via-green-100 to-emerald-50 border-4 border-green-500 rounded-2xl p-6 text-center shadow-2xl">
                <div className="absolute top-3 right-3">
                  <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-3 py-1 rounded-full font-bold text-xs shadow-lg flex items-center space-x-1">
                    <CheckCircle className="w-3 h-3" />
                    <span>LIBERADO</span>
                  </div>
                </div>

                <div className="relative inline-block mb-4">
                  <div className="absolute inset-0 bg-green-400 rounded-full blur-xl opacity-50"></div>
                  <div className="relative bg-gradient-to-br from-green-500 to-emerald-600 rounded-full p-3 shadow-xl">
                    <CheckCircle className="w-12 h-12 text-white" strokeWidth={3} />
                  </div>
                </div>
                
                <h3 className="text-2xl font-black text-green-800 mb-4">
                  MORADOR IDENTIFICADO
                </h3>
                
                <div className="mb-4 flex justify-center">
                  <PlacaVeiculo placa={latestDetection.placa} size="lg" />
                </div>
                
                <div className="bg-white rounded-xl p-4 mb-4 shadow-lg border-2 border-green-200">
                  <div className="flex items-center justify-center space-x-3 mb-2">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-2 shadow-md">
                      <Home className="w-6 h-6 text-white" strokeWidth={2.5} />
                    </div>
                    <div className="text-4xl font-black bg-gradient-to-r from-green-700 to-emerald-700 bg-clip-text text-transparent">
                      {latestDetection.morador.casa}
                    </div>
                  </div>
                  <div className="text-xs font-semibold text-gray-500 uppercase">
                    Casa
                  </div>
                </div>
                
                <div className="flex items-center justify-center space-x-2 text-xs text-gray-600">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                  <span>{new Date(latestDetection.timestamp).toLocaleTimeString('pt-BR')}</span>
                </div>
              </div> : <div className="bg-red-50 border-2 border-red-500 rounded-xl p-6 text-center">
                <XCircle className="w-12 h-12 text-red-600 mx-auto mb-3" />
                <h3 className="text-xl font-bold text-red-800 mb-3">VEÍCULO DESCONHECIDO</h3>
                
                <div className="mb-3 flex justify-center">
                  <PlacaVeiculo placa={latestDetection.placa} size="lg" />
                </div>
                
                <div className="bg-white rounded-lg p-3 mb-3">
                  <p className="text-red-700 text-sm font-semibold">Não cadastrado</p>
                </div>
                
                <div className="flex items-center justify-center space-x-2 text-xs text-gray-600">
                  <span>{new Date(latestDetection.timestamp).toLocaleTimeString('pt-BR')}</span>
                </div>
              </div>}
          </div>

          {/* Histórico */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Últimas Detecções ({detectionHistory.length})</h3>
            {detectionHistory.length === 0 ? <div className="text-center py-12 bg-gray-50 rounded-lg">
                <p className="text-gray-600">Nenhum histórico ainda</p>
              </div> : <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {detectionHistory.map((det, idx) => <div key={idx} className={`p-3 rounded-lg border-2 ${det.morador ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center justify-between">
                      <PlacaVeiculo placa={det.placa} size="sm" />
                      {det.morador && <div className="flex items-center space-x-1 text-sm font-semibold text-green-700">
                          <Home className="w-4 h-4" />
                          <span>{det.morador.casa}</span>
                        </div>}
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-600">
                      <span>{new Date(det.timestamp).toLocaleString('pt-BR')}</span>
                    </div>
                  </div>)}
              </div>}
          </div>
        </div>
      </div>

      {/* Lista de Veículos */}
      <div className="mt-6">
        <button onClick={async () => {
        if (!showVeiculosCadastrados) {
          await carregarVeiculos();
        }
        setShowVeiculosCadastrados(!showVeiculosCadastrados);
      }} className="w-full bg-white border-2 border-gray-200 rounded-lg p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
          <div className="flex items-center space-x-3">
            <Car className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Veículos Cadastrados ({veiculos.length})
            </h2>
          </div>
          <div className={`transform transition-transform ${showVeiculosCadastrados ? 'rotate-180' : ''}`}>
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {showVeiculosCadastrados && <div className="bg-white border-2 border-t-0 border-gray-200 rounded-b-lg p-4">
            <div className="mb-4">
              <button onClick={() => setShowCadastroModal(true)} className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                <Plus className="w-5 h-5" />
                <span>Cadastrar Veículo</span>
              </button>
            </div>

            {veiculos.length === 0 ? <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Car className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">Nenhum veículo cadastrado</p>
              </div> : <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Placa</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Casa</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {veiculos.map(veiculo => <tr key={veiculo.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3"><PlacaVeiculo placa={veiculo.placa_veiculo} size="sm" /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center space-x-2">
                            <Home className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-semibold">{veiculo.casa}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end space-x-2">
                            <button onClick={() => handleEditarVeiculo(veiculo)} className="flex items-center space-x-1 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm">
                              <Edit2 className="w-3.5 h-3.5" />
                              <span>Editar</span>
                            </button>
                            <button onClick={() => handleExcluirVeiculo(veiculo.id)} className="flex items-center space-x-1 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-sm">
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Excluir</span>
                            </button>
                          </div>
                        </td>
                      </tr>)}
                  </tbody>
                </table>
              </div>}
          </div>}
      </div>

      <CadastroMoradorModal isOpen={showCadastroModal} onClose={() => setShowCadastroModal(false)} onSuccess={carregarVeiculos} />

      <EditarVeiculoMoradorModal isOpen={showEditarModal} onClose={() => {
      setShowEditarModal(false);
      setVeiculoSelecionado(null);
    }} onSuccess={carregarVeiculos} veiculo={veiculoSelecionado} />
    </div>;
}
