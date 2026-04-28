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
    <div className="px-4 sm:px-6 lg:px-8 mt-lg max-w-[1440px] w-full mx-auto">
      {/* Header — alinhado ao padrão das outras telas */}
      <div className="mb-lg flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1 flex items-start gap-3">
          <div className="w-11 h-11 rounded-full bg-primary/10 ring-4 ring-primary/5 text-primary flex items-center justify-center flex-shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-h2 font-semibold text-on-surface tracking-tight mb-1 truncate">
              Monitoramento de Moradores
            </h1>
            <p className="text-on-surface-variant text-body-sm">
              Reconhecimento via câmera local com OCR
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleLimparMonitoramento}
            className="flex items-center gap-2 px-4 py-2 rounded-btn border border-error/40 text-error bg-transparent hover:bg-error/10 transition-colors text-button"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">Limpar</span>
          </button>
          <button
            onClick={() => setShowHelp(!showHelp)}
            className={`flex items-center gap-2 px-4 py-2 rounded-btn border transition-colors text-button ${
              showHelp
                ? 'border-primary text-primary bg-primary/10 shadow-ambient-1'
                : 'border-outline-variant text-on-surface-variant bg-transparent hover:bg-primary/5 hover:border-primary/40 hover:text-primary'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span className="hidden sm:inline">{showHelp ? 'Ocultar ajuda' : 'Ajuda'}</span>
          </button>
        </div>
      </div>

      {/* Ajuda de Configuração */}
      {showHelp && <MonitoramentoHelp />}

      {/* Câmera + Resultado + Histórico — Grid 3 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-5 2xl:grid-cols-12 gap-3 lg:min-h-[530px]">
        {/* Câmera */}
        <div className="lg:col-span-3 2xl:col-span-6 lg:min-h-[530px]">
          <CameraMonitor 
            onDetection={debouncedRefetch} 
            compact 
            onPipelineUpdate={setPipelineData}
          />
        </div>
        
        {/* Painel de Resultado + Pipeline */}
        <div className="lg:col-span-2 2xl:col-span-4 flex flex-col gap-3 lg:h-full lg:max-h-[530px] lg:overflow-hidden">
          {(() => {
            const cardAccent = !displayedDetection
              ? 'border-l-primary'
              : displayedDetection.morador
                ? 'border-l-secondary'
                : displayedDetection.visitante
                  ? 'border-l-tertiary'
                  : 'border-l-error';
            return (
          <div className={`bg-surface-container-lowest rounded-card border border-outline-variant shadow-ambient-1 flex flex-col border-l-4 ${cardAccent}`}>
            {/* Header do card */}
            <div className="px-4 py-2.5 border-b border-outline-variant flex items-center justify-between bg-primary/5">
              <h3 className="font-semibold text-on-surface flex items-center gap-2 text-body-sm">
                <Activity className="w-4 h-4 text-primary" />
                <span>Resultado</span>
                {selectedDetectionId !== null && (
                  <button 
                    onClick={() => setSelectedDetectionId(null)}
                    className="text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-primary/15 transition-colors font-medium"
                  >
                    <Clock className="w-3 h-3" />
                    Histórico
                    <X className="w-3 h-3" />
                  </button>
                )}
              </h3>
              {displayedDetection && (() => {
                const status = displayedDetection.morador
                  ? { label: 'Autorizado', cls: 'bg-secondary-container text-on-secondary-container' }
                  : displayedDetection.visitante
                  ? { label: 'Visitante', cls: 'bg-tertiary-container text-on-tertiary-container' }
                  : { label: 'Desconhecido', cls: 'bg-error-container text-on-error-container' };
                return (
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${status.cls}`}>
                    {status.label}
                  </span>
                );
              })()}
            </div>
            
            {/* Conteúdo */}
            <div className="p-3 flex flex-col">
              <div className="flex flex-col justify-start">
                {!displayedDetection ? (
                  /* Estado vazio — sóbrio */
                  <div className="text-center py-8 bg-surface-container-low rounded-card border border-dashed border-outline-variant">
                    <Camera className="w-10 h-10 text-on-surface-variant/60 mx-auto mb-2" />
                    <p className="text-on-surface text-body-sm font-medium">Aguardando detecção…</p>
                    <p className="text-on-surface-variant text-[12px] mt-0.5">
                      O sistema exibirá os veículos
                    </p>
                  </div>
                ) : (() => {
                  // Resolver tema único por status (sem gradientes)
                  const theme = displayedDetection.morador
                    ? {
                        bar: 'bg-secondary',
                        surface: 'bg-secondary-container/40',
                        ring: 'border-secondary/30',
                        chip: 'bg-secondary text-on-secondary',
                        chipIcon: <CheckCircle className="w-3.5 h-3.5" />,
                        chipLabel: 'MORADOR AUTORIZADO',
                      }
                    : displayedDetection.visitante
                    ? {
                        bar: 'bg-tertiary',
                        surface: 'bg-tertiary-container/40',
                        ring: 'border-tertiary/30',
                        chip: 'bg-tertiary text-on-tertiary',
                        chipIcon: <User className="w-3.5 h-3.5" />,
                        chipLabel: 'VISITANTE ATIVO',
                      }
                    : {
                        bar: 'bg-error',
                        surface: 'bg-error-container/40',
                        ring: 'border-error/30',
                        chip: 'bg-error text-on-error',
                        chipIcon: <XCircle className="w-3.5 h-3.5" />,
                        chipLabel: 'VEÍCULO DESCONHECIDO',
                      };

                  return (
                    <div className={`relative overflow-hidden rounded-card border ${theme.ring} ${theme.surface} p-3 animate-fade-in`}>
                      {/* Faixa lateral colorida — única acentuação forte */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${theme.bar}`} />

                      {/* Chip de status */}
                      <div className="flex items-center justify-center mb-3">
                        <div className={`${theme.chip} px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide flex items-center gap-1.5 shadow-ambient-1`}>
                          {theme.chipIcon}
                          <span>{theme.chipLabel}</span>
                        </div>
                      </div>

                      {/* Placa */}
                      <div className="flex justify-center mb-3">
                        <PlacaVeiculo placa={displayedDetection.placa} size="lg" />
                      </div>

                      {/* Info contextual */}
                      {displayedDetection.morador && (
                        <div className="flex justify-center mb-2">
                          <div className="flex items-center gap-2 bg-surface-container-lowest px-3 py-1.5 rounded-lg border border-outline-variant">
                            <Home className="w-4 h-4 text-on-surface-variant" />
                            <span className="text-body-md font-semibold text-on-surface">
                              Casa {displayedDetection.morador.casa}
                            </span>
                          </div>
                        </div>
                      )}

                      {displayedDetection.visitante && (
                        <div className="flex flex-col items-center gap-1.5 mb-2">
                          <div className="flex items-center gap-2 bg-surface-container-lowest px-3 py-1.5 rounded-lg border border-outline-variant">
                            <Home className="w-4 h-4 text-on-surface-variant" />
                            <span className="text-body-md font-semibold text-on-surface">
                              Casa {displayedDetection.visitante.casa}
                            </span>
                          </div>
                          <div className="text-body-sm font-medium text-on-surface">
                            {displayedDetection.visitante.nome}
                          </div>
                        </div>
                      )}

                      {!displayedDetection.morador && !displayedDetection.visitante && (
                        <div className="flex justify-center mb-2">
                          <p className="text-error text-[12px] font-medium">
                            Verifique antes de liberar
                          </p>
                        </div>
                      )}

                      {/* Horário e fonte — discretos */}
                      <div className="text-center text-[11px] text-on-surface-variant mt-1">
                        <span>{new Date(displayedDetection.timestamp).toLocaleTimeString('pt-BR')}</span>
                        <span className="mx-1">•</span>
                        <span>
                          {displayedDetection.fonteDeteccao === 'api' ? 'API' : 'OCR'}
                          {displayedDetection.confidence && ` (${Math.round(displayedDetection.confidence * 100)}%)`}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
              
              {/* Histórico inline (quando não há coluna separada) */}
              {detectionHistory.length > 0 && (
                <div className="mt-3 pt-3 border-t border-outline-variant 2xl:hidden">
                  <h4 className="text-body-sm font-semibold text-on-surface mb-2 flex items-center justify-between">
                    <span>Histórico</span>
                    <span className="text-on-surface-variant font-normal text-[11px]">({detectionHistory.length})</span>
                  </h4>
                  <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                    {detectionHistory.slice(0, 8).map((det, idx) => {
                      const accent = det.morador ? 'bg-secondary' : det.visitante ? 'bg-tertiary' : 'bg-error';
                      return (
                        <button 
                          key={det.id || idx}
                          onClick={() => handleHistoryClick(det.id)}
                          className={`w-full text-left relative overflow-hidden p-2 pl-3 rounded-lg border bg-surface-container-low text-[12px] transition-all
                            ${selectedDetectionId === det.id 
                              ? 'border-primary ring-1 ring-primary/30' 
                              : 'border-outline-variant hover:bg-surface-container'
                            }`}
                        >
                          <span className={`absolute left-0 top-0 bottom-0 w-0.5 ${accent}`} />
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="font-mono font-bold text-on-surface">
                              {det.placa}
                            </span>
                            <span className="text-on-surface-variant text-[10px]">
                              {new Date(det.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {det.morador && (
                            <div className="flex items-center gap-1 text-on-surface-variant">
                              <Home className="w-3 h-3" />
                              <span className="font-medium">Casa {det.morador.casa}</span>
                            </div>
                          )}
                          {det.visitante && (
                            <div className="flex items-center gap-1 text-on-surface-variant">
                              <User className="w-3 h-3" />
                              <span className="font-medium truncate">{det.visitante.nome} • Casa {det.visitante.casa}</span>
                            </div>
                          )}
                          {!det.morador && !det.visitante && (
                            <span className="text-on-surface-variant text-[10px]">Não cadastrado</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
            );
          })()}
          
          {/* Pipeline OCR — também tokenizado */}
          {displayedPipeline && (
            <div className="bg-surface-container-lowest rounded-card border border-outline-variant shadow-ambient-1 p-3 border-l-4 border-l-primary">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Camera className="w-3.5 h-3.5" />
                </div>
                <span className="text-[12px] font-semibold text-on-surface">Pipeline de processamento OCR</span>
                {displayedPipeline.rawText && (
                  <span className="text-[11px] bg-surface-container text-on-surface-variant px-2 py-0.5 rounded-full font-mono">
                    {displayedPipeline.rawText} · {Math.round(displayedPipeline.ocrConfidence * 100)}%
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-inverse-surface rounded-lg overflow-hidden">
                  <div className="text-[10px] text-center text-inverse-on-surface/80 py-1 font-medium">
                    Placa Processada
                  </div>
                  {displayedPipeline.debugImages?.preprocessed ? (
                    <img 
                      src={displayedPipeline.debugImages.preprocessed} 
                      alt="Placa Processada" 
                      className="w-full h-20 object-contain" 
                    />
                  ) : (
                    <div className="h-20 flex items-center justify-center text-inverse-on-surface/50 text-[11px]">
                      Aguardando…
                    </div>
                  )}
                </div>
                
                <div className="bg-inverse-surface rounded-lg overflow-hidden border border-secondary/40">
                  <div className="text-[10px] text-center text-secondary-fixed-dim py-1 font-medium">
                    Resultado OCR
                  </div>
                  {displayedPipeline.debugImages?.final ? (
                    <img 
                      src={displayedPipeline.debugImages.final} 
                      alt="Resultado OCR" 
                      className="w-full h-20 object-contain" 
                    />
                  ) : (
                    <div className="h-20 flex items-center justify-center text-inverse-on-surface/50 text-[11px]">
                      Aguardando leitura…
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-3 mt-2 text-[10px] text-on-surface-variant">
                <span>Fonte: {displayedPipeline.usedYolo ? 'YOLO' : 'Heurística'}</span>
                {displayedPipeline.plateRegion && (
                  <span>Região: {displayedPipeline.plateRegion.width}×{displayedPipeline.plateRegion.height}px</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Coluna de Histórico separada — só visível em 2XL */}
        <div className="hidden 2xl:block 2xl:col-span-2 h-full max-h-[530px]">
          <div className="bg-surface-container-lowest rounded-card border border-outline-variant shadow-ambient-1 flex flex-col h-full overflow-hidden">
            <div className="px-3 py-2 border-b border-outline-variant flex items-center justify-between bg-surface-container-low">
              <h3 className="font-semibold text-on-surface flex items-center gap-2 text-body-sm">
                <Clock className="w-4 h-4 text-primary" />
                <span>Histórico</span>
              </h3>
              <span className="text-[11px] text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full font-medium">
                {detectionHistory.length}
              </span>
            </div>
            <div className="flex-1 p-2 overflow-y-auto">
              {detectionHistory.length === 0 ? (
                <div className="h-full flex items-center justify-center text-on-surface-variant text-body-sm">
                  <p>Nenhuma detecção</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {detectionHistory.map((det, idx) => {
                    const accent = det.morador ? 'bg-secondary' : det.visitante ? 'bg-tertiary' : 'bg-error';
                    return (
                      <button
                        key={det.id || idx}
                        onClick={() => handleHistoryClick(det.id)}
                        className={`w-full text-left relative overflow-hidden p-2 pl-3 rounded-lg border bg-surface-container-low text-[12px] transition-all
                          ${selectedDetectionId === det.id 
                            ? 'border-primary ring-1 ring-primary/30' 
                            : 'border-outline-variant hover:bg-surface-container'
                          }`}
                      >
                        <span className={`absolute left-0 top-0 bottom-0 w-0.5 ${accent}`} />
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-mono font-bold text-[11px] text-on-surface">
                            {det.placa}
                          </span>
                          <span className="text-on-surface-variant text-[10px]">
                            {new Date(det.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {det.morador && (
                          <div className="flex items-center gap-1 text-on-surface-variant">
                            <Home className="w-2.5 h-2.5" />
                            <span className="font-medium text-[10px]">Casa {det.morador.casa}</span>
                          </div>
                        )}
                        {det.visitante && (
                          <div className="flex items-center gap-1 text-on-surface-variant">
                            <User className="w-2.5 h-2.5" />
                            <span className="font-medium text-[10px] truncate">{det.visitante.nome}</span>
                          </div>
                        )}
                        {!det.morador && !det.visitante && (
                          <span className="text-on-surface-variant text-[10px]">Não cadastrado</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Lista de Veículos — sóbria, alinhada com o restante do sistema */}
      <div className="mt-4 relative z-10">
        <button
          onClick={async () => {
            if (!showVeiculosCadastrados) {
              await carregarVeiculos();
            }
            setShowVeiculosCadastrados(!showVeiculosCadastrados);
          }}
          className="w-full bg-surface-container-lowest border border-outline-variant rounded-card p-3 sm:p-4 flex items-center justify-between hover:bg-surface-container-low transition-colors"
        >
          <div className="flex items-center gap-2 sm:gap-3">
            <Car className="w-4 h-4 sm:w-5 sm:h-5 text-on-surface-variant" />
            <h2 className="text-body-sm sm:text-body-md font-semibold text-on-surface">
              Veículos cadastrados
              <span className="ml-1.5 text-on-surface-variant font-normal">({veiculos.length})</span>
            </h2>
          </div>
          <div className={`transform transition-transform text-on-surface-variant ${showVeiculosCadastrados ? 'rotate-180' : ''}`}>
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {showVeiculosCadastrados && (
          <div className="bg-surface-container-lowest border border-t-0 border-outline-variant rounded-b-card p-3 sm:p-4 max-h-[350px] overflow-y-auto">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              {/* Campo de busca */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="Buscar por placa ou casa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-surface-container-lowest border border-outline-variant rounded-btn text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')} 
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-surface-container rounded"
                  >
                    <X className="w-4 h-4 text-on-surface-variant" />
                  </button>
                )}
              </div>
              
              {/* Botão Cadastrar — primary do sistema */}
              <button
                onClick={() => setShowCadastroModal(true)}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-btn hover:bg-primary/90 transition-colors text-button flex-shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar veículo</span>
              </button>
            </div>

            {searchTerm && (
              <p className="text-[11px] text-on-surface-variant mb-2">
                Mostrando {veiculosFiltrados.length} de {veiculos.length} veículos
              </p>
            )}

            {veiculos.length === 0 ? (
              <div className="bg-surface-container-low border border-dashed border-outline-variant rounded-card p-6 sm:p-8 text-center">
                <Car className="w-10 h-10 text-on-surface-variant/60 mx-auto mb-2" />
                <p className="text-on-surface-variant text-body-sm">Nenhum veículo cadastrado</p>
              </div>
            ) : veiculosFiltrados.length === 0 ? (
              <div className="bg-surface-container-low border border-dashed border-outline-variant rounded-card p-6 sm:p-8 text-center">
                <Search className="w-10 h-10 text-on-surface-variant/60 mx-auto mb-2" />
                <p className="text-on-surface-variant text-body-sm">Nenhum veículo encontrado para "{searchTerm}"</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full min-w-[400px]">
                  <thead className="bg-surface-container-low">
                    <tr>
                      <th className="px-2 sm:px-4 py-2 text-left text-[10px] sm:text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Placa</th>
                      <th className="px-2 sm:px-4 py-2 text-left text-[10px] sm:text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Casa</th>
                      <th className="px-2 sm:px-4 py-2 text-right text-[10px] sm:text-[11px] font-semibold text-on-surface-variant uppercase tracking-wide">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {veiculosFiltrados.map(veiculo => (
                      <tr key={veiculo.id} className="hover:bg-surface-container-low transition-colors">
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          <div className="scale-90 sm:scale-100 origin-left">
                            <PlacaVeiculo placa={veiculo.placa_veiculo} size="sm" />
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3">
                          <div className="flex items-center gap-1.5">
                            <Home className="w-3.5 h-3.5 text-on-surface-variant" />
                            <span className="text-body-sm font-semibold text-on-surface">{veiculo.casa}</span>
                          </div>
                        </td>
                        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleEditarVeiculo(veiculo)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-btn border border-outline-variant text-on-surface-variant hover:bg-surface-container hover:text-on-surface text-[12px] transition-colors"
                              aria-label="Editar"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Editar</span>
                            </button>
                            <button
                              onClick={() => handleExcluirVeiculo(veiculo.id)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-btn border border-error/30 text-error hover:bg-error/5 text-[12px] transition-colors"
                              aria-label="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Excluir</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
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
