import { useState } from 'react';
import { PlusCircle, Users, Car, Hash, RefreshCw } from 'lucide-react';
import { useDashboardStats, useVisitantesAtivos, useVisitanteActions } from '@/react-app/hooks/useApi';
import StatsCard from '@/react-app/components/StatsCard';
import VisitanteCard from '@/react-app/components/VisitanteCard';
import CadastroVisitanteModal from '@/react-app/components/CadastroVisitanteModal';
import EditarVisitanteModal from '@/react-app/components/EditarVisitanteModal';
import type { VisitanteAtivo } from '@/shared/types';

export default function Dashboard() {
  const [showCadastroModal, setShowCadastroModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [visitanteEditando, setVisitanteEditando] = useState<VisitanteAtivo | null>(null);

  const { stats, loading: loadingStats, refetch: refetchStats } = useDashboardStats();
  const { visitantes, loading: loadingVisitantes, refetch: refetchVisitantes } = useVisitantesAtivos();
  const { registrarSaida, loading: loadingActions } = useVisitanteActions();

  const handleRefresh = () => {
    refetchStats();
    refetchVisitantes();
  };

  const handleCadastroSuccess = () => {
    refetchStats();
    refetchVisitantes();
  };

  const handleEditarVisitante = (visitante: VisitanteAtivo) => {
    setVisitanteEditando(visitante);
    setShowEditModal(true);
  };

  const handleEditSuccess = () => {
    refetchVisitantes();
    setVisitanteEditando(null);
  };

  const handleRegistrarSaida = async (id: number) => {
    const sucesso = await registrarSaida(id);
    if (sucesso) {
      refetchStats();
      refetchVisitantes();
    }
  };

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 max-w-7xl mx-auto">
      {/* Header da página */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate">Dashboard</h1>
          <p className="text-gray-600 mt-0.5 text-xs sm:text-sm lg:text-base">Visão geral das atividades do condomínio</p>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={handleRefresh}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-3 sm:px-4 py-2 text-sm sm:text-base text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          
          <button
            onClick={() => setShowCadastroModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-4 sm:px-6 py-2 text-sm sm:text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Novo</span>
            <span className="hidden sm:inline">Cadastro</span>
          </button>
        </div>
      </div>

      {/* Indicadores estatísticos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <StatsCard
          title="Vagas de Visitantes Disponíveis"
          value={stats?.vagas_visitantes_disponiveis || 0}
          icon={Car}
          color="green"
          loading={loadingStats}
        />
        <StatsCard
          title="Prismas Magnéticos Disponíveis"
          value={stats?.prismas_magneticos_disponiveis || 0}
          icon={Hash}
          color="blue"
          loading={loadingStats}
        />
        <StatsCard
          title="Total de Visitantes Ativos"
          value={stats?.total_visitantes_ativos || 0}
          icon={Users}
          color="purple"
          loading={loadingStats}
        />
      </div>

      {/* Lista de visitantes ativos */}
      <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-200">
        <div className="p-3 sm:p-4 lg:p-6 border-b border-gray-200">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Visitantes Ativos</h2>
          <p className="text-gray-600 mt-0.5 sm:mt-1 text-xs sm:text-sm">
            {visitantes.length === 0 
              ? 'Nenhum visitante ativo no momento' 
              : `${visitantes.length} visitante${visitantes.length !== 1 ? 's' : ''} ativo${visitantes.length !== 1 ? 's' : ''}`
            }
          </p>
        </div>
        
        <div className="p-3 sm:p-4 lg:p-6">
          {loadingVisitantes ? (
            <div className="text-center py-6 sm:py-8 lg:py-12">
              <div className="animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-3 sm:mt-4 text-gray-500 text-xs sm:text-sm lg:text-base">Carregando visitantes...</p>
            </div>
          ) : visitantes.length === 0 ? (
            <div className="text-center py-6 sm:py-8 lg:py-12">
              <Users className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" />
              <h3 className="text-sm sm:text-base lg:text-lg font-medium text-gray-900 mb-1 sm:mb-2 px-4">Nenhum visitante ativo</h3>
              <p className="text-gray-500 mb-4 sm:mb-6 text-xs sm:text-sm lg:text-base px-4">
                Quando houver visitantes no condomínio, eles aparecerão aqui.
              </p>
              <button
                onClick={() => setShowCadastroModal(true)}
                className="inline-flex items-center space-x-1.5 px-3 sm:px-4 py-2 text-sm sm:text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Cadastrar Primeiro Visitante</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3 lg:gap-4 xl:gap-6">
              {visitantes.map((visitante) => (
                <VisitanteCard
                  key={visitante.id}
                  visitante={visitante}
                  onEdit={handleEditarVisitante}
                  onRegistrarSaida={handleRegistrarSaida}
                  loading={loadingActions}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modais */}
      <CadastroVisitanteModal
        isOpen={showCadastroModal}
        onClose={() => setShowCadastroModal(false)}
        onSuccess={handleCadastroSuccess}
      />

      <EditarVisitanteModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        visitante={visitanteEditando}
        onSuccess={handleEditSuccess}
      />
    </div>
  );
}
