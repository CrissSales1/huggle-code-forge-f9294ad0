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

      {/* Câmeras lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-4 lg:mb-6">
        <CameraMonitor cameraType="entrada" compact />
        <CameraMonitor cameraType="saida" compact />
      </div>

      {/* Busca e Detecções Recentes */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Busca */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por placa ou casa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
          />
        </div>

        {/* Detecções recentes como chips */}
        {detecoes.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 w-full sm:w-auto">
            <span className="text-xs text-gray-500 flex-shrink-0 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Recentes:
            </span>
            <div className="flex gap-1.5">
              {detecoes.slice(0, 5).map(det => (
                <div 
                  key={det.id}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
                    det.direcao === 'entrada' 
                      ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                      : 'bg-orange-100 text-orange-700 border border-orange-200'
                  }`}
                >
                  {det.direcao === 'entrada' ? (
                    <ArrowDown className="w-3 h-3" />
                  ) : (
                    <ArrowUp className="w-3 h-3" />
                  )}
                  <span className="font-mono">{det.placa}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Cards de veículos */}
      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 text-gray-400 mx-auto animate-spin" />
          <p className="text-gray-500 mt-2">Carregando veículos...</p>
        </div>
      ) : veiculosFiltrados.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <Car className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">
            {searchTerm ? 'Nenhum veículo encontrado' : 'Nenhum veículo cadastrado'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 lg:gap-4">
          {veiculosFiltrados.map(veiculo => (
            <div 
              key={veiculo.id}
              className={`p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                veiculo.status_presenca === 'dentro'
                  ? 'bg-green-50 border-green-300'
                  : veiculo.status_presenca === 'fora'
                    ? 'bg-red-50 border-red-300'
                    : 'bg-gray-50 border-gray-200'
              }`}
            >
              {/* Placa */}
              <div className="flex justify-center mb-3">
                <PlacaVeiculo placa={veiculo.placa_veiculo} size="md" />
              </div>

              {/* Casa */}
              <div className="flex items-center justify-center gap-1.5 mb-3">
                <Home className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-gray-900">Casa {veiculo.casa}</span>
              </div>

              {/* Status e tempo */}
              <div className="flex items-center justify-between">
                {/* Badge de status */}
                <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
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
                    <span>DESCONHECIDO</span>
                  )}
                </div>

                {/* Tempo */}
                {veiculo.ultima_movimentacao && (
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>{formatarTempoRelativo(veiculo.ultima_movimentacao)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
