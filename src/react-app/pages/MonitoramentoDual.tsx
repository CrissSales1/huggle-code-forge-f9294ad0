import { useState, useEffect, useMemo } from 'react';
import { 
  ArrowDown, 
  ArrowUp, 
  Car, 
  Home, 
  Clock, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  Search,
  MapPin
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import CameraMonitor from '@/react-app/components/CameraMonitor';
import PlacaVeiculo from '@/react-app/components/PlacaVeiculo';

interface VeiculoMorador {
  id: number;
  placa_veiculo: string;
  casa: string;
  status_presenca: string | null;
  ultima_movimentacao: string | null;
}

interface DetecaoRecente {
  id: number;
  placa: string;
  timestamp: string;
  direcao: 'entrada' | 'saida';
  morador: { casa: string } | null;
}

export default function MonitoramentoDual() {
  const [veiculos, setVeiculos] = useState<VeiculoMorador[]>([]);
  const [detecoes, setDetecoes] = useState<DetecaoRecente[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Filtrar veículos
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
      .sort((a, b) => {
        // Ordenar por última movimentação (mais recente primeiro)
        if (a.ultima_movimentacao && b.ultima_movimentacao) {
          return new Date(b.ultima_movimentacao).getTime() - new Date(a.ultima_movimentacao).getTime();
        }
        if (a.ultima_movimentacao) return -1;
        if (b.ultima_movimentacao) return 1;
        return a.casa.localeCompare(b.casa, 'pt-BR', { numeric: true });
      });
  }, [veiculos, searchTerm]);

  // Estatísticas rápidas
  const stats = useMemo(() => {
    const dentro = veiculos.filter(v => v.status_presenca === 'dentro').length;
    const fora = veiculos.filter(v => v.status_presenca === 'fora').length;
    const desconhecido = veiculos.filter(v => !v.status_presenca || v.status_presenca === 'desconhecido').length;
    return { dentro, fora, desconhecido, total: veiculos.length };
  }, [veiculos]);

  // Carregar dados
  const carregarDados = async () => {
    try {
      setLoading(true);
      
      // Buscar veículos com status
      const { data: veiculosData, error: veiculosError } = await supabase
        .from('veiculos_moradores')
        .select('*')
        .order('casa', { ascending: true });
      
      if (veiculosError) throw veiculosError;
      setVeiculos(veiculosData || []);

      // Buscar detecções recentes
      const { data: detecoesData, error: detecoesError } = await supabase
        .from('lpr_deteccoes')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(20);
      
      if (detecoesError) throw detecoesError;
      
      setDetecoes((detecoesData || []).map(d => ({
        id: d.id,
        placa: d.placa_detectada,
        timestamp: d.timestamp,
        direcao: (d.direcao || 'entrada') as 'entrada' | 'saida',
        morador: d.is_morador ? { casa: d.casa_morador || '' } : null,
      })));
      
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  // Carregar dados iniciais e configurar realtime
  useEffect(() => {
    carregarDados();

    // Realtime para detecções
    const channel = supabase
      .channel('dual-monitor-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lpr_deteccoes'
        },
        (payload) => {
          const novaDetecao: DetecaoRecente = {
            id: payload.new.id,
            placa: payload.new.placa_detectada,
            timestamp: payload.new.timestamp,
            direcao: (payload.new.direcao || 'entrada') as 'entrada' | 'saida',
            morador: payload.new.is_morador ? { casa: payload.new.casa_morador || '' } : null,
          };
          setDetecoes(prev => [novaDetecao, ...prev.slice(0, 19)]);
          
          // Atualizar status do veículo se for morador
          if (payload.new.is_morador) {
            setVeiculos(prev => prev.map(v => {
              if (v.placa_veiculo === payload.new.placa_detectada) {
                return {
                  ...v,
                  status_presenca: payload.new.direcao === 'entrada' ? 'dentro' : 'fora',
                  ultima_movimentacao: payload.new.timestamp,
                };
              }
              return v;
            }));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'veiculos_moradores'
        },
        () => {
          // Recarregar veículos quando houver atualização
          carregarDados();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Formatar tempo relativo
  const formatarTempoRelativo = (timestamp: string | null) => {
    if (!timestamp) return 'Desconhecido';
    
    const agora = new Date();
    const data = new Date(timestamp);
    const diffMs = agora.getTime() - data.getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMin < 1) return 'Agora';
    if (diffMin < 60) return `${diffMin}min atrás`;
    if (diffHoras < 24) return `${diffHoras}h atrás`;
    return `${diffDias}d atrás`;
  };

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 max-w-[1920px] mx-auto">
      {/* Header */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-1">
            Monitoramento Dual
          </h1>
          <p className="text-gray-600 text-xs sm:text-sm lg:text-base">
            Controle de entrada e saída com duas câmeras simultâneas
          </p>
        </div>
        
        {/* Estatísticas rápidas */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm">
            <MapPin className="w-4 h-4" />
            <span className="font-semibold">{stats.dentro}</span>
            <span className="hidden sm:inline">dentro</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm">
            <Car className="w-4 h-4" />
            <span className="font-semibold">{stats.fora}</span>
            <span className="hidden sm:inline">fora</span>
          </div>
          <button
            onClick={carregarDados}
            disabled={loading}
            className="p-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            title="Atualizar dados"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Layout Principal - 3 colunas */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 lg:gap-6">
        {/* Câmera de Entrada */}
        <div className="xl:col-span-4">
          <CameraMonitor cameraType="entrada" compact />
        </div>

        {/* Painel Central - Status em Tempo Real */}
        <div className="xl:col-span-4 order-first xl:order-none">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
            {/* Header do painel */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Car className="w-5 h-5 text-blue-600" />
                <span>Status dos Veículos</span>
              </h3>
              <span className="text-xs text-gray-500">{veiculos.length} cadastrados</span>
            </div>

            {/* Busca */}
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por placa ou casa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>

            {/* Lista de veículos com status */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[400px] xl:max-h-[600px]">
              {loading ? (
                <div className="text-center py-8">
                  <RefreshCw className="w-8 h-8 text-gray-400 mx-auto animate-spin" />
                  <p className="text-gray-500 mt-2">Carregando...</p>
                </div>
              ) : veiculosFiltrados.length === 0 ? (
                <div className="text-center py-8">
                  <Car className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">
                    {searchTerm ? 'Nenhum veículo encontrado' : 'Nenhum veículo cadastrado'}
                  </p>
                </div>
              ) : (
                veiculosFiltrados.map(veiculo => (
                  <div 
                    key={veiculo.id}
                    className={`p-3 rounded-lg border transition-all ${
                      veiculo.status_presenca === 'dentro'
                        ? 'bg-green-50 border-green-200'
                        : veiculo.status_presenca === 'fora'
                          ? 'bg-red-50 border-red-200'
                          : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {/* Info do veículo */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0">
                          <PlacaVeiculo placa={veiculo.placa_veiculo} size="sm" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Home className="w-3.5 h-3.5 text-blue-600" />
                            <span className="font-semibold text-gray-900">Casa {veiculo.casa}</span>
                          </div>
                          {veiculo.ultima_movimentacao && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                              <Clock className="w-3 h-3" />
                              <span>{formatarTempoRelativo(veiculo.ultima_movimentacao)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Badge de status */}
                      <div className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        veiculo.status_presenca === 'dentro'
                          ? 'bg-green-600 text-white'
                          : veiculo.status_presenca === 'fora'
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-400 text-white'
                      }`}>
                        {veiculo.status_presenca === 'dentro' ? (
                          <>
                            <CheckCircle className="w-3 h-3" />
                            <span>DENTRO</span>
                          </>
                        ) : veiculo.status_presenca === 'fora' ? (
                          <>
                            <XCircle className="w-3 h-3" />
                            <span>FORA</span>
                          </>
                        ) : (
                          <span>?</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Detecções recentes */}
            {detecoes.length > 0 && (
              <div className="border-t border-gray-100 p-3">
                <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Últimas Detecções
                </h4>
                <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                  {detecoes.slice(0, 5).map(det => (
                    <div 
                      key={det.id}
                      className={`flex items-center justify-between p-2 rounded text-xs ${
                        det.direcao === 'entrada' 
                          ? 'bg-blue-50 border border-blue-100' 
                          : 'bg-orange-50 border border-orange-100'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {det.direcao === 'entrada' ? (
                          <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                        ) : (
                          <ArrowUp className="w-3.5 h-3.5 text-orange-600" />
                        )}
                        <span className={`font-mono font-bold ${det.morador ? 'text-green-700' : 'text-red-700'}`}>
                          {det.placa}
                        </span>
                        {det.morador && (
                          <span className="text-gray-600">Casa {det.morador.casa}</span>
                        )}
                      </div>
                      <span className="text-gray-400">
                        {new Date(det.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Câmera de Saída */}
        <div className="xl:col-span-4">
          <CameraMonitor cameraType="saida" compact />
        </div>
      </div>
    </div>
  );
}
