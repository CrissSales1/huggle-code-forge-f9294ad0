import { useState } from 'react';
import { PlusCircle, Users, Car, Hash, RefreshCw } from 'lucide-react';
import {
  useDashboardStats,
  useVisitantesAtivos,
  useVisitanteActions,
} from '@/react-app/hooks/useApi';
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
  const {
    visitantes,
    loading: loadingVisitantes,
    refetch: refetchVisitantes,
  } = useVisitantesAtivos();
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
    refetchStats();
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
    <div className="px-4 sm:px-6 lg:px-8 mt-lg max-w-[1440px] w-full mx-auto">
      {/* Top bar da página */}
      <header className="sticky top-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 bg-background/80 backdrop-blur-md flex justify-between items-center h-20 border-b border-outline-variant mb-lg">
        <div className="min-w-0">
          <h1 className="text-h2 font-semibold text-on-surface tracking-tight truncate">
            Dashboard — Visão geral
          </h1>
        </div>
        <div className="flex items-center gap-md">
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-transparent text-primary text-button font-medium rounded-btn border border-outline hover:bg-surface-variant transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-5 h-5" />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
          <button
            onClick={() => setShowCadastroModal(true)}
            className="px-4 py-2 bg-primary text-on-primary text-button font-medium rounded-btn hover:bg-primary-container transition-colors shadow-ambient-1 hover:shadow-ambient-2 flex items-center gap-2"
          >
            <PlusCircle className="w-5 h-5" />
            <span>Novo Cadastro</span>
          </button>
        </div>
      </header>

      {/* KPI Section */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-xl">
        <StatsCard
          title="Vagas Disponíveis"
          value={stats?.vagas_disponiveis ?? 0}
          icon={Car}
          color="green"
          subtitle="livres agora"
          loading={loadingStats}
        />
        <StatsCard
          title="Prismas Disponíveis"
          value={stats?.prismas_disponiveis ?? 0}
          icon={Hash}
          color="blue"
          subtitle="na portaria"
          loading={loadingStats}
        />
        <StatsCard
          title="Visitantes Ativos"
          value={stats?.visitantes_ativos ?? 0}
          icon={Users}
          color="purple"
          subtitle="no condomínio"
          loading={loadingStats}
        />
      </section>

      {/* Lista de visitantes ativos */}
      <section className="pb-xl">
        <div className="flex items-center justify-between mb-md">
          <h2 className="text-h3 font-semibold text-on-surface">Visitantes Ativos</h2>
          <span className="bg-surface-container-highest text-on-surface-variant text-label-caps font-semibold px-3 py-1 rounded-full">
            {visitantes.length} {visitantes.length === 1 ? 'REGISTRO' : 'REGISTROS'}
          </span>
        </div>

        {loadingVisitantes ? (
          <div className="text-center py-12 bg-surface-container-lowest rounded-card shadow-ambient-1">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto" />
            <p className="mt-4 text-on-surface-variant text-body-sm">Carregando visitantes...</p>
          </div>
        ) : visitantes.length === 0 ? (
          <div className="text-center py-12 bg-surface-container-lowest rounded-card shadow-ambient-1">
            <Users className="w-16 h-16 text-outline-variant mx-auto mb-4" />
            <h3 className="text-h3 font-semibold text-on-surface mb-2">
              Nenhum visitante ativo
            </h3>
            <p className="text-on-surface-variant text-body-sm mb-6 px-4">
              Quando houver visitantes no condomínio, eles aparecerão aqui.
            </p>
            <button
              onClick={() => setShowCadastroModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-btn text-button font-medium hover:bg-primary-container transition-colors shadow-ambient-1"
            >
              <PlusCircle className="w-4 h-4" />
              Cadastrar Primeiro Visitante
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
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
      </section>

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
