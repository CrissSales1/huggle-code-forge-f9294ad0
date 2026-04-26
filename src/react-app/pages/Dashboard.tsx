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
          <h1 className="text-h1 text-on-surface truncate">Dashboard</h1>
          <p className="text-on-surface-variant mt-0.5 text-body-sm">Visão geral das atividades do condomínio</p>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={handleRefresh}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-4 py-2 text-button text-primary bg-transparent border border-outline rounded-btn hover:bg-surface-variant transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          <button
            onClick={() => setShowCadastroModal(true)}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-1.5 px-4 sm:px-6 py-2 text-button bg-primary text-on-primary rounded-btn hover:bg-primary-container transition-colors shadow-ambient-1 hover:shadow-ambient-2"
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
          value={stats?.vagas_disponiveis || 0}
          icon={Car}
          color="green"
          loading={loadingStats}
        />
        <StatsCard
          title="Prismas Magnéticos Disponíveis"
          value={stats?.prismas_disponiveis || 0}
          icon={Hash}
          color="blue"
          loading={loadingStats}
        />
        <StatsCard
          title="Total de Visitantes Ativos"
          value={stats?.visitantes_ativos || 0}
          icon={Users}
          color="purple"
          loading={loadingStats}
        />
      </div>

      {/* Lista de visitantes ativos */}
      <div className="bg-surface-container-lowest rounded-card shadow-ambient-1">
        <div className="p-md sm:p-lg border-b border-surface-variant flex items-center justify-between gap-3">
          <div>
            <h2 className="text-h3 text-on-surface">Visitantes Ativos</h2>
            <p className="text-on-surface-variant mt-0.5 text-body-sm">
              {visitantes.length === 0
                ? 'Nenhum visitante ativo no momento'
                : `${visitantes.length} visitante${visitantes.length !== 1 ? 's' : ''} ativo${visitantes.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          {visitantes.length > 0 && (
            <span className="bg-surface-container-highest text-on-surface-variant text-label-caps px-3 py-1 rounded-full whitespace-nowrap">
              {visitantes.length} {visitantes.length === 1 ? 'REGISTRO' : 'REGISTROS'}
            </span>
          )}
        </div>

        <div className="p-md sm:p-lg">
          {loadingVisitantes ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-on-surface-variant text-body-sm">Carregando visitantes...</p>
            </div>
          ) : visitantes.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-14 h-14 text-outline-variant mx-auto mb-4" />
              <h3 className="text-h3 text-on-surface mb-2 px-4">Nenhum visitante ativo</h3>
              <p className="text-on-surface-variant mb-6 text-body-sm px-4">
                Quando houver visitantes no condomínio, eles aparecerão aqui.
              </p>
              <button
                onClick={() => setShowCadastroModal(true)}
                className="inline-flex items-center space-x-1.5 px-4 py-2 text-button bg-primary text-on-primary rounded-btn hover:bg-primary-container transition-colors shadow-ambient-1"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Cadastrar Primeiro Visitante</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-gutter">
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
