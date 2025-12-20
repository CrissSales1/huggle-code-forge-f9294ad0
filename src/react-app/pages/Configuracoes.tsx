import { useState } from 'react';
import { Save, Trash2, AlertTriangle, Settings as SettingsIcon, Hash, Car, CheckCircle } from 'lucide-react';
import { useConfiguracoes } from '@/react-app/hooks/useApi';
import StatsCard from '@/react-app/components/StatsCard';

export default function Configuracoes() {
  const { configuracoes, atualizarConfiguracoes, limparBancoDados, loading, error } = useConfiguracoes();
  
  const [totalVagas, setTotalVagas] = useState(configuracoes?.total_vagas_visitantes || 10);
  const [totalPrismas, setTotalPrismas] = useState(configuracoes?.total_prismas_magneticos || 20);
  const [showConfirmacaoLimpeza, setShowConfirmacaoLimpeza] = useState(false);
  const [senhaSeguranca, setSenhaSeguranca] = useState('');
  const [mostrarSucesso, setMostrarSucesso] = useState(false);

  // Atualizar valores locais quando configurações carregarem
  useState(() => {
    if (configuracoes) {
      setTotalVagas(configuracoes.total_vagas_visitantes);
      setTotalPrismas(configuracoes.total_prismas_magneticos);
    }
  });

  const handleSalvarConfiguracoes = async () => {
    const sucesso = await atualizarConfiguracoes({
      total_vagas_visitantes: totalVagas,
      total_prismas_magneticos: totalPrismas,
    });

    if (sucesso) {
      // Feedback visual poderia ser adicionado aqui
    }
  };

  const handleLimparBanco = async () => {
    if (senhaSeguranca !== 'excluirtudo') {
      // Não fazer nada se a senha estiver incorreta
      return;
    }

    const sucesso = await limparBancoDados();
    if (sucesso) {
      setShowConfirmacaoLimpeza(false);
      setSenhaSeguranca('');
      setMostrarSucesso(true);
      
      // Ocultar alerta de sucesso após 5 segundos
      setTimeout(() => {
        setMostrarSucesso(false);
      }, 5000);
    }
  };

  const cancelarLimpeza = () => {
    setShowConfirmacaoLimpeza(false);
    setSenhaSeguranca('');
  };

  const configuracoesAlteradas = 
    configuracoes && (
      totalVagas !== configuracoes.total_vagas_visitantes ||
      totalPrismas !== configuracoes.total_prismas_magneticos
    );

  return (
    <div className="container mx-auto px-4 lg:px-6 py-4 lg:py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Configurações do Sistema</h1>
        <p className="text-gray-600 mt-1">Gerencie as configurações e dados do sistema</p>
      </div>

      {/* Alerta de sucesso */}
      {mostrarSucesso && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 flex items-center space-x-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span>Banco de dados limpo com sucesso! Todos os dados foram removidos.</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Configurações Atuais */}
      {configuracoes && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 lg:mb-8">
          <StatsCard
            title="Total de Vagas de Visitantes"
            value={configuracoes.total_vagas_visitantes}
            icon={Car}
            color="green"
            loading={loading}
          />
          <StatsCard
            title="Total de Prismas Magnéticos"
            value={configuracoes.total_prismas_magneticos}
            icon={Hash}
            color="blue"
            loading={loading}
          />
        </div>
      )}

      {/* Gestão de Recursos */}
      <div className="bg-white rounded-lg border border-gray-200 mb-8">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <SettingsIcon className="w-5 h-5 text-gray-600" />
            <h2 className="text-xl font-semibold text-gray-900">Gestão de Recursos</h2>
          </div>
          <p className="text-gray-600 mt-1">
            Ajuste o número total de vagas e prismas disponíveis no condomínio
          </p>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
            <div>
              <label htmlFor="vagas" className="block text-sm font-medium text-gray-700 mb-2">
                Número Total de Vagas de Visitantes
              </label>
              <input
                type="number"
                id="vagas"
                min="1"
                max="999"
                value={totalVagas}
                onChange={(e) => setTotalVagas(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Quantidade total de vagas destinadas aos visitantes
              </p>
            </div>
            
            <div>
              <label htmlFor="prismas" className="block text-sm font-medium text-gray-700 mb-2">
                Número Total de Prismas Magnéticos
              </label>
              <input
                type="number"
                id="prismas"
                min="1"
                max="999"
                value={totalPrismas}
                onChange={(e) => setTotalPrismas(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Quantidade total de prismas magnéticos disponíveis
              </p>
            </div>
          </div>
          
          {configuracoesAlteradas && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-2 text-blue-800">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">Alterações pendentes</span>
              </div>
              <p className="text-sm text-blue-700 mt-1">
                Você tem alterações não salvas. Clique em "Salvar Configurações" para aplicá-las.
              </p>
            </div>
          )}
          
          <div className="flex justify-end mt-6">
            <button
              onClick={handleSalvarConfiguracoes}
              disabled={loading || !configuracoesAlteradas}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Salvando...' : 'Salvar Configurações'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Gestão de Dados */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Trash2 className="w-5 h-5 text-red-600" />
            <h2 className="text-xl font-semibold text-gray-900">Gestão de Dados</h2>
          </div>
          <p className="text-gray-600 mt-1">
            Limpe todos os dados do sistema (visitantes e histórico)
          </p>
        </div>
        
        <div className="p-6">
          {!showConfirmacaoLimpeza ? (
            <div>
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg mb-4">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-medium text-red-800">Atenção!</h3>
                    <p className="text-sm text-red-700 mt-1">
                      Esta ação irá remover permanentemente todos os dados de visitantes, 
                      histórico de entradas e saídas. Esta operação não pode ser desfeita.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-start">
                <button
                  onClick={() => setShowConfirmacaoLimpeza(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Limpar Banco de Dados</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-medium text-red-800">
                      Confirmação de Segurança
                    </h3>
                    <p className="text-sm text-red-700 mt-1">
                      Para confirmar que realmente deseja excluir todos os dados, digite a senha de segurança abaixo.
                    </p>
                  </div>
                </div>
              </div>
              
              <div>
                <label htmlFor="senhaSeguranca" className="block text-sm font-medium text-gray-700 mb-2">
                  Senha de segurança
                </label>
                <input
                  type="password"
                  id="senhaSeguranca"
                  value={senhaSeguranca}
                  onChange={(e) => setSenhaSeguranca(e.target.value)}
                  placeholder="Digite a senha de segurança"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Digite a senha de segurança para confirmar a exclusão
                </p>
              </div>
              
              <div className="flex justify-start space-x-3">
                <button
                  onClick={cancelarLimpeza}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleLimparBanco}
                  disabled={loading || senhaSeguranca !== 'excluirtudo'}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>
                    {loading ? 'Excluindo...' : 'Confirmar Exclusão'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
