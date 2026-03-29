import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Plus, Camera, CheckCircle, XCircle, Home, Edit2, Trash2, Car, Activity, HelpCircle, RotateCcw, Search, X, User, Clock } from 'lucide-react';
import { useLPRDetections } from '@/react-app/hooks/useApi';
import { supabase } from '@/integrations/supabase/client';
import CadastroMoradorModal from '@/react-app/components/CadastroMoradorModal';
import EditarVeiculoMoradorModal from '@/react-app/components/EditarVeiculoMoradorModal';
import MonitoramentoHelp from '@/react-app/pages/MonitoramentoHelp';
import PlacaVeiculo from '@/react-app/components/PlacaVeiculo';
import CameraMonitor, { PipelineData } from '@/react-app/components/CameraMonitor';
import { playNotificationSound, loadSoundEnabled, unlockAudioContext } from '@/react-app/utils/notificationSounds';
import { savePipeline, loadAllPipelines } from '@/react-app/utils/pipelineStorage';

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
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  
  // v1.1.80: Estados para histórico clicável
  const [selectedDetectionId, setSelectedDetectionId] = useState<number | null>(null);
  // v1.1.80: Buffer de pipeline por placa (mais confiável que por ID devido ao delay do realtime)
  const [pipelineByPlate, setPipelineByPlate] = useState<Map<string, PipelineData>>(new Map());
  // v1.1.80: Ref para detectar nova detecção e resetar seleção
  const prevLatestIdRef = useRef<number | null>(null);

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

  // v1.7.6: Carregar pipelines persistidos do IndexedDB ao montar
  useEffect(() => {
    loadAllPipelines().then(stored => {
      if (stored.size > 0) {
        setPipelineByPlate(prev => {
          const merged = new Map(stored);
          // Sobrescrever com dados em memória (mais recentes)
          prev.forEach((v, k) => merged.set(k, v));
          return merged;
        });
        console.log(`📦 ${stored.size} pipelines carregados do IndexedDB`);
      }
    });
  }, []);

  // Desbloquear AudioContext na primeira interação do usuário
  useEffect(() => {
    const handleUserInteraction = () => {
      unlockAudioContext();
      // Remover listeners após desbloqueio
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
    
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('touchstart', handleUserInteraction);
    
    return () => {
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);

  // Tocar som quando houver nova detecção
  const lastDetectionIdRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (latestDetection && latestDetection.id !== lastDetectionIdRef.current) {
      lastDetectionIdRef.current = latestDetection.id;
      
      // Tocar som baseado no tipo de detecção
      if (loadSoundEnabled()) {
        if (latestDetection.morador) {
          playNotificationSound('morador');
        } else if (latestDetection.visitante) {
          playNotificationSound('visitante');
        } else {
          playNotificationSound('desconhecido');
        }
      }
    }
  }, [latestDetection]);

  // v1.1.80: Resetar seleção quando nova detecção chegar (prioridade é saber quem está chegando)
  useEffect(() => {
    if (latestDetection?.id && latestDetection.id !== prevLatestIdRef.current) {
      prevLatestIdRef.current = latestDetection.id;
      // Nova detecção chegou - voltar ao modo automático
      if (selectedDetectionId !== null) {
        setSelectedDetectionId(null);
      }
    }
  }, [latestDetection?.id]);

  // v1.7.6: Salvar pipeline por placa (memória + IndexedDB)
  // Fix: deep-copy debugImages + salvar apenas quando imagens existem
  useEffect(() => {
    if (pipelineData?.rawText) {
      const placa = pipelineData.rawText.replace(/[^A-Z0-9]/g, '').toUpperCase();
      const hasImages = !!(pipelineData.debugImages?.preprocessed || pipelineData.debugImages?.final);
      if (placa.length >= 7 && hasImages) {
        // Deep-copy para evitar perda de referências quando pipeline reseta
        const snapshot = {
          ...pipelineData,
          debugImages: pipelineData.debugImages
            ? { ...pipelineData.debugImages }
            : null,
        };
        
        setPipelineByPlate(prev => {
          const updated = new Map(prev);
          updated.set(placa, snapshot);
          
          // Manter apenas as 20 mais recentes em memória
          if (updated.size > 20) {
            const oldest = updated.keys().next().value;
            if (oldest) updated.delete(oldest);
          }
          
          return updated;
        });
        
        // Persistir no IndexedDB
        savePipeline(placa, snapshot);
      }
    }
  }, [pipelineData]);

  // v1.1.80: Limpar seleção se o item selecionado não está mais no histórico
  useEffect(() => {
    if (selectedDetectionId !== null) {
      const aindaNoHistorico = detectionHistory.some(d => d.id === selectedDetectionId);
      if (!aindaNoHistorico && latestDetection?.id !== selectedDetectionId) {
        setSelectedDetectionId(null);
      }
    }
  }, [detectionHistory, selectedDetectionId, latestDetection?.id]);

  // v1.1.79: Handler de clique no histórico
  const handleHistoryClick = useCallback((detectionId: number) => {
    // Se clicou na mesma detecção, desselecionar (voltar para auto)
    if (selectedDetectionId === detectionId) {
      setSelectedDetectionId(null);
    } else {
      setSelectedDetectionId(detectionId);
    }
  }, [selectedDetectionId]);

  // v1.1.79: Determinar qual detecção exibir
  const displayedDetection = useMemo(() => {
    if (selectedDetectionId === null) return latestDetection;
    // Buscar no histórico
    const fromHistory = detectionHistory.find(d => d.id === selectedDetectionId);
    return fromHistory || latestDetection;
  }, [selectedDetectionId, latestDetection, detectionHistory]);

  // v1.1.80: Determinar qual pipeline exibir (por placa para evitar problemas de timing)
  const displayedPipeline = useMemo(() => {
    if (selectedDetectionId === null) return pipelineData;
    
    const detection = detectionHistory.find(d => d.id === selectedDetectionId);
    if (!detection) return pipelineData;
    
    // Buscar pipeline pela placa (mais confiável que por ID)
    const placaLimpa = detection.placa.replace(/[^A-Z0-9]/g, '').toUpperCase();
    return pipelineByPlate.get(placaLimpa) || null;
  }, [selectedDetectionId, pipelineData, detectionHistory, pipelineByPlate]);

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-4 max-w-7xl mx-auto">
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
      <div className="grid grid-cols-1 lg:grid-cols-5 2xl:grid-cols-12 gap-3 lg:min-h-[530px]">
        {/* Câmera - 3/5 em LG, 6/12 em 2XL */}
        <div className="lg:col-span-3 2xl:col-span-6 lg:min-h-[530px]">
          <CameraMonitor 
            onDetection={debouncedRefetch} 
            compact 
            onPipelineUpdate={setPipelineData}
          />
        </div>
        
        {/* Painel de Resultado + Pipeline - 2/5 em LG, 4/12 em 2XL */}
        <div className="lg:col-span-2 2xl:col-span-4 flex flex-col gap-3 lg:h-full lg:max-h-[530px] lg:overflow-hidden">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
            {/* Header */}
            <div className="px-4 py-2.5 2xl:py-2 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm 2xl:text-base">
                <Activity className="w-4 h-4 2xl:w-5 2xl:h-5 text-blue-600" />
                <span>Resultado</span>
                {/* v1.1.79: Badge de modo histórico */}
                {selectedDetectionId !== null && (
                  <button 
                    onClick={() => setSelectedDetectionId(null)}
                    className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-blue-200 transition-colors"
                  >
                    <Clock className="w-3 h-3" />
                    Histórico
                    <X className="w-3 h-3" />
                  </button>
                )}
              </h3>
              {displayedDetection && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  displayedDetection.morador 
                    ? 'bg-green-100 text-green-700' 
                    : displayedDetection.visitante
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {displayedDetection.morador ? 'Autorizado' : displayedDetection.visitante ? 'Visitante' : 'Desconhecido'}
                </span>
              )}
            </div>
            
            {/* Conteúdo */}
            <div className="p-3 2xl:p-4 flex flex-col">
              {/* Card de resultado principal */}
              <div className="flex flex-col justify-start">
                {!displayedDetection ? (
                  /* Aguardando detecção */
                  <div className="text-center py-8 2xl:py-6 bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
                    <Camera className="w-12 h-12 2xl:w-10 2xl:h-10 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-600 text-base 2xl:text-sm font-medium">Aguardando detecção...</p>
                    <p className="text-gray-400 text-sm 2xl:text-xs mt-1">O sistema exibirá os veículos</p>
                  </div>
                ) : displayedDetection.morador ? (
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
                      <PlacaVeiculo placa={displayedDetection.placa} size="lg" />
                    </div>
                    
                    {/* Casa do morador */}
                    <div className="flex justify-center mb-2">
                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border-2 border-green-300 shadow-sm">
                        <Home className="w-5 h-5 2xl:w-4 2xl:h-4 text-blue-600" />
                        <span className="text-2xl 2xl:text-xl font-bold text-green-700">
                          Casa {displayedDetection.morador.casa}
                        </span>
                      </div>
                    </div>
                    
                    {/* Horário e fonte */}
                    <div className="text-center text-sm 2xl:text-xs">
                      <span className="text-gray-600">
                        {new Date(displayedDetection.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                      <span className="text-gray-400 ml-1">
                        • {displayedDetection.fonteDeteccao === 'api' ? 'API' : 'OCR'}
                        {displayedDetection.confidence && ` (${Math.round(displayedDetection.confidence * 100)}%)`}
                      </span>
                    </div>
                  </div>
                ) : displayedDetection.visitante ? (
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
                      <PlacaVeiculo placa={displayedDetection.placa} size="lg" />
                    </div>
                    
                    {/* Casa do visitante e nome */}
                    <div className="flex flex-col items-center gap-1.5 mb-2">
                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border-2 border-amber-300 shadow-sm">
                        <Home className="w-4 h-4 text-blue-600" />
                        <span className="text-xl 2xl:text-lg font-bold text-amber-700">
                          Casa {displayedDetection.visitante.casa}
                        </span>
                      </div>
                      <div className="text-base 2xl:text-sm font-semibold text-amber-800">
                        {displayedDetection.visitante.nome}
                      </div>
                    </div>
                    
                    {/* Horário e fonte */}
                    <div className="text-center text-sm 2xl:text-xs">
                      <span className="text-gray-600">
                        {new Date(displayedDetection.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                      <span className="text-gray-400 ml-1">
                        • {displayedDetection.fonteDeteccao === 'api' ? 'API' : 'OCR'}
                        {displayedDetection.confidence && ` (${Math.round(displayedDetection.confidence * 100)}%)`}
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
                      <PlacaVeiculo placa={displayedDetection.placa} size="lg" />
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
                        {new Date(displayedDetection.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                      <span className="text-gray-400 ml-1">
                        • {displayedDetection.fonteDeteccao === 'api' ? 'API' : 'OCR'}
                        {displayedDetection.confidence && ` (${Math.round(displayedDetection.confidence * 100)}%)`}
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
                        key={det.id || idx}
                        onClick={() => handleHistoryClick(det.id)}
                        className={`p-2 rounded-lg border text-xs cursor-pointer transition-all
                          ${selectedDetectionId === det.id 
                            ? 'ring-2 ring-blue-500 ring-offset-1 shadow-md' 
                            : 'hover:shadow-md hover:scale-[1.01]'
                          }
                          ${det.morador 
                            ? 'bg-green-50 border-green-200 hover:bg-green-100' 
                            : det.visitante
                            ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                            : 'bg-red-50 border-red-200 hover:bg-red-100'
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
          
          {/* Pipeline de Processamento OCR - aparece quando monitoramento ativo + debug habilitado */}
          {displayedPipeline && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-purple-700">🔍 Pipeline de Processamento OCR</span>
                {displayedPipeline.rawText && (
                  <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
                    OCR: "{displayedPipeline.rawText}" ({Math.round(displayedPipeline.ocrConfidence * 100)}%)
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Placa Processada */}
                <div className="bg-gray-800 rounded-lg overflow-hidden">
                  <div className="text-xs text-center text-gray-300 py-1 bg-gray-900 font-medium">
                    Placa Processada
                  </div>
                  {displayedPipeline.debugImages?.preprocessed ? (
                    <img 
                      src={displayedPipeline.debugImages.preprocessed} 
                      alt="Placa Processada" 
                      className="w-full h-20 object-contain bg-gray-900" 
                    />
                  ) : (
                    <div className="h-20 flex items-center justify-center text-gray-500 text-xs">
                      Aguardando detecção...
                    </div>
                  )}
                </div>
                
                {/* Resultado OCR */}
                <div className="bg-gray-800 rounded-lg overflow-hidden border-2 border-green-500">
                  <div className="text-xs text-center text-green-400 py-1 bg-gray-900 font-medium">
                    Resultado OCR
                  </div>
                  {displayedPipeline.debugImages?.final ? (
                    <img 
                      src={displayedPipeline.debugImages.final} 
                      alt="Resultado OCR" 
                      className="w-full h-20 object-contain bg-gray-900" 
                    />
                  ) : (
                    <div className="h-20 flex items-center justify-center text-gray-500 text-xs">
                      Aguardando leitura...
                    </div>
                  )}
                </div>
              </div>
              
              {/* Info adicional */}
              <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-500">
                <span>Fonte: {displayedPipeline.usedYolo ? '🧠 YOLO' : '📐 Heurística'}</span>
                {displayedPipeline.plateRegion && (
                  <span>Região: {displayedPipeline.plateRegion.width}x{displayedPipeline.plateRegion.height}px</span>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Coluna de Histórico separada - só visível em 2XL */}
        <div className="hidden 2xl:block 2xl:col-span-2 h-full max-h-[530px]">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-full overflow-hidden">
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
                  {detectionHistory.map((det, idx) => (
                    <div 
                      key={det.id || idx}
                      onClick={() => handleHistoryClick(det.id)}
                      className={`p-2 rounded-lg border text-xs cursor-pointer transition-all
                        ${selectedDetectionId === det.id 
                          ? 'ring-2 ring-blue-500 ring-offset-1 shadow-md' 
                          : 'hover:shadow-md hover:scale-[1.01]'
                        }
                        ${det.morador 
                          ? 'bg-green-50 border-green-200 hover:bg-green-100' 
                          : det.visitante
                          ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                          : 'bg-red-50 border-red-200 hover:bg-red-100'
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
      {/* z-10 garante que fica abaixo do vídeo durante edição de polígono (z-50) */}
      <div className="mt-4 relative z-10">
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

        {showVeiculosCadastrados && <div className="bg-white border sm:border-2 border-t-0 border-gray-200 rounded-b-lg p-3 sm:p-4 max-h-[350px] overflow-y-auto">
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
