import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Plus, Camera, CheckCircle, XCircle, Home, Edit2, Trash2, Car, Activity, HelpCircle, RotateCcw, Search, X, User, Clock } from 'lucide-react';
import { useLPRDetections } from '@/react-app/hooks/useApi';
import { supabase } from '@/integrations/supabase/client';
import CadastroMoradorModal from '@/react-app/components/CadastroMoradorModal';
import EditarVeiculoMoradorModal from '@/react-app/components/EditarVeiculoMoradorModal';
import MonitoramentoHelp from '@/react-app/pages/MonitoramentoHelp';
import PlacaVeiculo from '@/react-app/components/PlacaVeiculo';
import CameraMonitor from '@/react-app/components/CameraMonitor';

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
  const [searchTerm, setSearchTerm] = useState('');

  // Filtragem e ordenação numérica dos veículos
  const veiculosFiltrados = useMemo(() => {
    const termo = searchTerm.toLowerCase().trim();
    return veiculos
      .filter(v => {
        if (!termo) return true;
        return (
          v.placa_veiculo.toLowerCase().includes(termo) ||
          v.casa.toLowerCase().includes(termo)
        );
      })
      .sort((a, b) => a.casa.localeCompare(b.casa, 'pt-BR', { numeric: true }));
  }, [veiculos, searchTerm]);

  const {
    latestDetection,
    detectionHistory,
    refetch
  } = useLPRDetections();

  // v1.1.30: Debounce para evitar múltiplos refetches simultâneos
  const lastRefetchTimeRef = useRef<number>(0);
  const REFETCH_DEBOUNCE_MS = 2000; // Mínimo 2s entre refetches

  const debouncedRefetch = useCallback(() => {
    const now = Date.now();
    if (now - lastRefetchTimeRef.current >= REFETCH_DEBOUNCE_MS) {
      lastRefetchTimeRef.current = now;
      refetch();
    }
  }, [refetch]);

  const carregarVeiculos = async () => {
    try {
      const { data, error } = await supabase
        .from('veiculos_moradores')
        .select('*')
        .order('casa', { ascending: true });
      
      if (error) throw error;
      setVeiculos(data || []);
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
      const { error } = await supabase
        .from('veiculos_moradores')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await carregarVeiculos();
    } catch (err) {
      console.error('Erro ao excluir veículo:', err);
      alert('Erro ao excluir veículo');
    }
  };

  const handleLimparMonitoramento = async () => {
    if (!confirm('Tem certeza que deseja limpar todo o histórico de detecções?')) {
      return;
    }
    try {
      // v1.1.46: Usar gt(0) para melhor compatibilidade com RLS
      const { error } = await supabase
        .from('lpr_deteccoes')
        .delete()
        .gt('id', 0);

      if (error) {
        console.error('Erro ao limpar histórico:', error);
        throw error;
      }
      
      alert('Histórico de detecções limpo com sucesso!');
      refetch();
    } catch (err: any) {
      console.error('Erro ao limpar histórico:', err);
      
      // v1.1.46: Mensagens mais descritivas para o usuário
      if (err?.code === 'PGRST301' || err?.message?.includes('JWT')) {
        alert('Sessão expirada. Por favor, faça login novamente.');
      } else if (err?.code === '42501' || err?.message?.includes('RLS')) {
        alert('Sem permissão para limpar o histórico. Verifique suas credenciais.');
      } else {
        alert(`Erro ao limpar histórico: ${err?.message || 'Erro desconhecido'}`);
      }
    }
  };

  // Carregar veículos ao montar o componente
  useEffect(() => {
    carregarVeiculos();
  }, []);

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 max-w-7xl mx-auto">
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-1 truncate">Monitoramento de Moradores</h1>
          <p className="text-gray-600 text-xs sm:text-sm lg:text-base">
            Reconhecimento via câmera local com OCR
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleLimparMonitoramento}
            className="flex items-center justify-center space-x-1.5 px-2.5 sm:px-3 lg:px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition-colors text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Limpar</span>
          </button>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className={`flex items-center justify-center space-x-1.5 px-2.5 sm:px-3 lg:px-4 py-2 rounded-lg transition-colors text-sm ${
              showHelp 
                ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span className="hidden sm:inline">{showHelp ? 'Ocultar' : ''} Ajuda</span>
          </button>
        </div>
      </div>

      {/* Ajuda de Configuração */}
      {showHelp && <MonitoramentoHelp />}

      {/* Camera Monitor com Painel de Resultado - Layout responsivo 3 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-5 2xl:grid-cols-12 gap-4 mb-4 sm:mb-6">
        {/* Câmera - 3/5 em LG, 6/12 em 2XL */}
        <div className="lg:col-span-3 2xl:col-span-6">
          <CameraMonitor 
            onDetection={debouncedRefetch} 
            compact 
          />
        </div>
        
        {/* Painel de Resultado - 2/5 em LG, 4/12 em 2XL */}
        <div className="lg:col-span-2 2xl:col-span-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
            {/* Header */}
            <div className="px-4 py-2.5 2xl:py-2 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm 2xl:text-base">
                <Activity className="w-4 h-4 2xl:w-5 2xl:h-5 text-blue-600" />
                <span>Resultado</span>
              </h3>
              {latestDetection && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  latestDetection.morador 
                    ? 'bg-green-100 text-green-700' 
                    : latestDetection.visitante
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {latestDetection.morador ? 'Autorizado' : latestDetection.visitante ? 'Visitante' : 'Desconhecido'}
                </span>
              )}
            </div>
            
            {/* Conteúdo */}
            <div className="flex-1 p-3 2xl:p-4 flex flex-col overflow-hidden">
              {/* Card de resultado principal */}
              <div className="flex flex-col justify-start">
                {!latestDetection ? (
                  /* Aguardando detecção */
                  <div className="text-center py-8 2xl:py-6 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                    <Camera className="w-12 h-12 2xl:w-10 2xl:h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600 text-base 2xl:text-sm font-medium">Aguardando detecção...</p>
                    <p className="text-gray-400 text-sm 2xl:text-xs mt-1">O sistema exibirá os veículos</p>
                  </div>
                ) : latestDetection.morador ? (
                  <div className="bg-gradient-to-br from-green-100 via-green-50 to-emerald-100 border-4 border-green-500 rounded-2xl p-4 2xl:p-3 shadow-lg animate-fade-in">
                    {/* Badge de status */}
                    <div className="flex items-center justify-center mb-3 2xl:mb-2">
                      <div className="bg-green-600 text-white px-4 py-1 2xl:px-3 2xl:py-0.5 rounded-full font-bold text-sm 2xl:text-xs flex items-center gap-1.5 shadow-md">
                        <CheckCircle className="w-4 h-4 2xl:w-3.5 2xl:h-3.5" />
                        <span>MORADOR AUTORIZADO</span>
                      </div>
                    </div>
                    
                    {/* Placa centralizada */}
                    <div className="flex justify-center mb-3 2xl:mb-2">
                      <PlacaVeiculo placa={latestDetection.placa} size="lg" />
                    </div>
                    
                    {/* Casa do morador */}
                    <div className="flex justify-center mb-2">
                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border-2 border-green-300 shadow-sm">
                        <Home className="w-5 h-5 2xl:w-4 2xl:h-4 text-blue-600" />
                        <span className="text-2xl 2xl:text-xl font-bold text-green-700">
                          Casa {latestDetection.morador.casa}
                        </span>
                      </div>
                    </div>
                    
                    {/* Horário e fonte */}
                    <div className="text-center text-sm 2xl:text-xs">
                      <span className="text-gray-600">
                        {new Date(latestDetection.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                      <span className="text-gray-400 ml-1">
                        • {latestDetection.fonteDeteccao === 'api' ? 'API' : 'OCR'}
                        {latestDetection.confidence && ` (${Math.round(latestDetection.confidence * 100)}%)`}
                      </span>
                    </div>
                  </div>
                ) : latestDetection.visitante ? (
                  <div className="bg-gradient-to-br from-amber-100 via-yellow-50 to-orange-100 border-4 border-amber-500 rounded-2xl p-4 2xl:p-3 shadow-lg animate-fade-in">
                    {/* Badge de status */}
                    <div className="flex items-center justify-center mb-3 2xl:mb-2">
                      <div className="bg-amber-600 text-white px-4 py-1 2xl:px-3 2xl:py-0.5 rounded-full font-bold text-sm 2xl:text-xs flex items-center gap-1.5 shadow-md">
                        <User className="w-4 h-4 2xl:w-3.5 2xl:h-3.5" />
                        <span>VISITANTE ATIVO</span>
                      </div>
                    </div>
                    
                    {/* Placa centralizada */}
                    <div className="flex justify-center mb-3 2xl:mb-2">
                      <PlacaVeiculo placa={latestDetection.placa} size="lg" />
                    </div>
                    
                    {/* Casa do visitante e nome */}
                    <div className="flex flex-col items-center gap-1.5 mb-2">
                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border-2 border-amber-300 shadow-sm">
                        <Home className="w-4 h-4 text-blue-600" />
                        <span className="text-xl 2xl:text-lg font-bold text-amber-700">
                          Casa {latestDetection.visitante.casa}
                        </span>
                      </div>
                      <div className="text-base 2xl:text-sm font-semibold text-amber-800">
                        {latestDetection.visitante.nome}
                      </div>
                    </div>
                    
                    {/* Horário e fonte */}
                    <div className="text-center text-sm 2xl:text-xs">
                      <span className="text-gray-600">
                        {new Date(latestDetection.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                      <span className="text-gray-400 ml-1">
                        • {latestDetection.fonteDeteccao === 'api' ? 'API' : 'OCR'}
                        {latestDetection.confidence && ` (${Math.round(latestDetection.confidence * 100)}%)`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gradient-to-br from-red-100 via-red-50 to-orange-100 border-4 border-red-500 rounded-2xl p-4 2xl:p-3 shadow-lg animate-fade-in">
                    {/* Badge de alerta */}
                    <div className="flex items-center justify-center mb-3 2xl:mb-2">
                      <div className="bg-red-600 text-white px-4 py-1 2xl:px-3 2xl:py-0.5 rounded-full font-bold text-sm 2xl:text-xs flex items-center gap-1.5 shadow-md animate-pulse">
                        <XCircle className="w-4 h-4 2xl:w-3.5 2xl:h-3.5" />
                        <span>VEÍCULO DESCONHECIDO</span>
                      </div>
                    </div>
                    
                    {/* Placa centralizada */}
                    <div className="flex justify-center mb-3 2xl:mb-2">
                      <PlacaVeiculo placa={latestDetection.placa} size="lg" />
                    </div>
                    
                    {/* Aviso */}
                    <div className="flex justify-center mb-2">
                      <div className="bg-red-50 border border-red-200 px-2 py-1 rounded-lg">
                        <p className="text-red-700 font-medium text-center text-xs">
                          Verifique antes de liberar
                        </p>
                      </div>
                    </div>
                    
                    {/* Horário e fonte */}
                    <div className="text-center text-sm 2xl:text-xs">
                      <span className="text-gray-600">
                        {new Date(latestDetection.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                      <span className="text-gray-400 ml-1">
                        • {latestDetection.fonteDeteccao === 'api' ? 'API' : 'OCR'}
                        {latestDetection.confidence && ` (${Math.round(latestDetection.confidence * 100)}%)`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Histórico de detecções - oculto em 2XL (vai para coluna separada) */}
              {detectionHistory.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 2xl:hidden">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center justify-between">
                    <span>Histórico</span>
                    <span className="text-gray-400 font-normal text-xs">({detectionHistory.length})</span>
                  </h4>
                  <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                    {detectionHistory.slice(0, 8).map((det, idx) => (
                      <div 
                        key={idx} 
                        className={`p-2 rounded-lg border text-xs ${
                          det.morador 
                            ? 'bg-green-50 border-green-200' 
                            : det.visitante
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-red-50 border-red-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className={`font-mono font-bold ${det.morador ? 'text-green-800' : det.visitante ? 'text-amber-800' : 'text-red-800'}`}>
                            {det.placa}
                          </span>
                          <span className="text-gray-400 text-[10px]">
                            {new Date(det.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {det.morador && (
                          <div className="flex items-center gap-1 text-green-700">
                            <Home className="w-3 h-3" />
                            <span className="font-semibold">Casa {det.morador.casa}</span>
                          </div>
                        )}
                        {det.visitante && (
                          <div className="flex items-center gap-1 text-amber-700">
                            <User className="w-3 h-3" />
                            <span className="font-semibold">{det.visitante.nome} • Casa {det.visitante.casa}</span>
                          </div>
                        )}
                        {!det.morador && !det.visitante && (
                          <span className="text-red-600 text-[10px]">Não cadastrado</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Coluna de Histórico separada - só visível em 2XL */}
        <div className="hidden 2xl:block 2xl:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-xl">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-blue-600" />
                <span>Histórico</span>
              </h3>
              <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                {detectionHistory.length}
              </span>
            </div>
            <div className="flex-1 p-2 overflow-y-auto">
              {detectionHistory.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                  <p>Nenhuma detecção</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {detectionHistory.slice(0, 20).map((det, idx) => (
                    <div 
                      key={idx} 
                      className={`p-2 rounded-lg border text-xs ${
                        det.morador 
                          ? 'bg-green-50 border-green-200' 
                          : det.visitante
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`font-mono font-bold text-[11px] ${det.morador ? 'text-green-800' : det.visitante ? 'text-amber-800' : 'text-red-800'}`}>
                          {det.placa}
                        </span>
                        <span className="text-gray-400 text-[10px]">
                          {new Date(det.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {det.morador && (
                        <div className="flex items-center gap-1 text-green-700">
                          <Home className="w-2.5 h-2.5" />
                          <span className="font-medium text-[10px]">Casa {det.morador.casa}</span>
                        </div>
                      )}
                      {det.visitante && (
                        <div className="flex items-center gap-1 text-amber-700">
                          <User className="w-2.5 h-2.5" />
                          <span className="font-medium text-[10px]">{det.visitante.nome}</span>
                        </div>
                      )}
                      {!det.morador && !det.visitante && (
                        <span className="text-red-600 text-[10px]">Não cadastrado</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Lista de Veículos - Versão expandível para todas as telas */}
      <div className="mt-4 sm:mt-6">
        <button onClick={async () => {
        if (!showVeiculosCadastrados) {
          await carregarVeiculos();
        }
        setShowVeiculosCadastrados(!showVeiculosCadastrados);
      }} className="w-full bg-white border sm:border-2 border-gray-200 rounded-lg p-3 sm:p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Car className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            <h2 className="text-sm sm:text-base lg:text-lg font-semibold text-gray-900">
              Veículos Cadastrados ({veiculos.length})
            </h2>
          </div>
          <div className={`transform transition-transform ${showVeiculosCadastrados ? 'rotate-180' : ''}`}>
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {showVeiculosCadastrados && <div className="bg-white border sm:border-2 border-t-0 border-gray-200 rounded-b-lg p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              {/* Campo de Busca */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por placa ou casa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')} 
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
                  >
                    <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>
              
              {/* Botão Cadastrar */}
              <button onClick={() => setShowCadastroModal(true)} className="flex items-center justify-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex-shrink-0">
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Cadastrar Veículo</span>
              </button>
            </div>

            {/* Contador de resultados */}
            {searchTerm && (
              <p className="text-xs text-gray-500 mb-2">
                Mostrando {veiculosFiltrados.length} de {veiculos.length} veículos
              </p>
            )}

            {veiculos.length === 0 ? <div className="bg-gray-50 border border-dashed sm:border-2 border-gray-300 rounded-lg p-6 sm:p-8 text-center">
                <Car className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-2 sm:mb-3" />
                <p className="text-gray-600 text-sm sm:text-base">Nenhum veículo cadastrado</p>
              </div> : veiculosFiltrados.length === 0 ? <div className="bg-gray-50 border border-dashed sm:border-2 border-gray-300 rounded-lg p-6 sm:p-8 text-center">
                <Search className="w-10 h-10 sm:w-12 sm:h-12 text-gray-400 mx-auto mb-2 sm:mb-3" />
                <p className="text-gray-600 text-sm sm:text-base">Nenhum veículo encontrado para "{searchTerm}"</p>
              </div> : <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full min-w-[400px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Placa</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Casa</th>
                      <th className="px-2 sm:px-4 py-2 sm:py-3 text-right text-[10px] sm:text-xs font-medium text-gray-500 uppercase">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {veiculosFiltrados.map(veiculo => <tr key={veiculo.id} className="hover:bg-gray-50">
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          <div className="scale-90 sm:scale-100 origin-left">
                            <PlacaVeiculo placa={veiculo.placa_veiculo} size="sm" />
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          <div className="flex items-center space-x-1 sm:space-x-2">
                            <Home className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600" />
                            <span className="text-xs sm:text-sm font-semibold">{veiculo.casa}</span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                          <div className="flex justify-end gap-1 sm:gap-2">
                            <button onClick={() => handleEditarVeiculo(veiculo)} className="flex items-center space-x-0.5 sm:space-x-1 px-2 sm:px-3 py-1 sm:py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-xs sm:text-sm">
                              <Edit2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              <span className="hidden sm:inline">Editar</span>
                            </button>
                            <button onClick={() => handleExcluirVeiculo(veiculo.id)} className="flex items-center space-x-0.5 sm:space-x-1 px-2 sm:px-3 py-1 sm:py-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 text-xs sm:text-sm">
                              <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              <span className="hidden sm:inline">Excluir</span>
                            </button>
                          </div>
                        </td>
                      </tr>)}
                  </tbody>
                </table>
              </div>}
          </div>}
      </div>

      <CadastroMoradorModal 
        isOpen={showCadastroModal} 
        onClose={() => setShowCadastroModal(false)} 
        onSuccess={() => {
          carregarVeiculos();
          refetch();
        }} 
      />

      <EditarVeiculoMoradorModal 
        isOpen={showEditarModal} 
        onClose={() => {
          setShowEditarModal(false);
          setVeiculoSelecionado(null);
        }} 
        onSuccess={() => {
          carregarVeiculos();
          refetch();
        }} 
        veiculo={veiculoSelecionado} 
      />
    </div>
  );
}
