import { useState } from 'react';
import { Save, Trash2, AlertTriangle, Settings as SettingsIcon, Hash, Car, CheckCircle, Upload, Database, Loader2 } from 'lucide-react';
import { useConfiguracoes } from '@/react-app/hooks/useApi';
import StatsCard from '@/react-app/components/StatsCard';
import { supabase } from '@/integrations/supabase/client';

export default function Configuracoes() {
  const { configuracoes, atualizarConfiguracoes, limparBancoDados, loading, error } = useConfiguracoes();
  
  const [totalVagas, setTotalVagas] = useState(configuracoes?.total_vagas_visitantes || 10);
  const [totalPrismas, setTotalPrismas] = useState(configuracoes?.total_prismas_magneticos || 20);
  const [showConfirmacaoLimpeza, setShowConfirmacaoLimpeza] = useState(false);
  const [senhaSeguranca, setSenhaSeguranca] = useState('');
  const [mostrarSucesso, setMostrarSucesso] = useState(false);
  
  // Estados para importação
  const [importando, setImportando] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    visitantes?: number;
    veiculos?: number;
  } | null>(null);

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

  const handleImportarDados = async () => {
    setImportando(true);
    setImportProgress('Carregando arquivo de dados...');
    setImportResult(null);

    try {
      // Carregar arquivo JSON
      const response = await fetch('/dados-importacao.json');
      if (!response.ok) {
        throw new Error('Arquivo de importação não encontrado');
      }
      
      const dados = await response.json();
      const { tabelas } = dados;
      
      let visitantesImportados = 0;
      let veiculosImportados = 0;
      
      // Importar visitantes em lotes
      if (tabelas.visitantes && tabelas.visitantes.length > 0) {
        setImportProgress(`Importando ${tabelas.visitantes.length} visitantes...`);
        
        const batchSize = 50;
        for (let i = 0; i < tabelas.visitantes.length; i += batchSize) {
          const batch = tabelas.visitantes.slice(i, i + batchSize).map((v: any) => ({
            nome: v.nome,
            casa_visitada: v.casa_visitada,
            placa_veiculo: v.placa_veiculo,
            numero_prisma: v.numero_prisma,
            estacionar_vaga_morador: v.estacionar_vaga_morador === 1 || v.estacionar_vaga_morador === true,
            hora_entrada: v.hora_entrada,
            hora_saida: v.hora_saida,
            is_ativo: v.is_ativo === 1 || v.is_ativo === true,
            observacoes: v.observacoes,
            liberado_por: v.liberado_por,
          }));

          const { error: insertError } = await supabase
            .from('visitantes')
            .insert(batch);

          if (insertError) {
            console.error(`Erro no lote ${Math.floor(i / batchSize) + 1}:`, insertError.message);
          } else {
            visitantesImportados += batch.length;
            setImportProgress(`Importando visitantes: ${visitantesImportados}/${tabelas.visitantes.length}`);
          }
        }
      }
      
      // Importar veículos de moradores
      if (tabelas.veiculos_moradores && tabelas.veiculos_moradores.length > 0) {
        setImportProgress(`Importando ${tabelas.veiculos_moradores.length} veículos de moradores...`);
        
        for (const v of tabelas.veiculos_moradores) {
          const { error: insertError } = await supabase
            .from('veiculos_moradores')
            .insert({
              placa_veiculo: v.placa_veiculo,
              casa: v.casa,
            });

          if (!insertError) {
            veiculosImportados++;
          }
        }
      }
      
      setImportResult({
        success: true,
        message: 'Importação concluída com sucesso!',
        visitantes: visitantesImportados,
        veiculos: veiculosImportados,
      });
      
    } catch (err) {
      console.error('Erro na importação:', err);
      setImportResult({
        success: false,
        message: err instanceof Error ? err.message : 'Erro desconhecido na importação',
      });
    } finally {
      setImportando(false);
      setImportProgress('');
    }
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

      {/* Importação de Dados */}
      <div className="bg-white rounded-lg border border-gray-200 mb-8">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-green-600" />
            <h2 className="text-xl font-semibold text-gray-900">Importação de Dados</h2>
          </div>
          <p className="text-gray-600 mt-1">
            Importe dados de visitantes e veículos de moradores
          </p>
        </div>
        
        <div className="p-6">
          <div className="bg-green-50 border border-green-200 p-4 rounded-lg mb-4">
            <div className="flex items-start space-x-3">
              <Upload className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-green-800">Arquivo de Importação Disponível</h3>
                <p className="text-sm text-green-700 mt-1">
                  1.343 registros prontos para importação (visitantes e veículos de moradores).
                  Clique no botão abaixo para iniciar a importação.
                </p>
              </div>
            </div>
          </div>
          
          {importProgress && (
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
              <div className="flex items-center space-x-3">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                <span className="text-sm text-blue-800">{importProgress}</span>
              </div>
            </div>
          )}
          
          {importResult && (
            <div className={`p-4 rounded-lg mb-4 ${
              importResult.success 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-start space-x-3">
                <CheckCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                  importResult.success ? 'text-green-600' : 'text-red-600'
                }`} />
                <div>
                  <h3 className={`text-sm font-medium ${
                    importResult.success ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {importResult.message}
                  </h3>
                  {importResult.success && (
                    <p className="text-sm text-green-700 mt-1">
                      {importResult.visitantes} visitantes e {importResult.veiculos} veículos importados.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div className="flex justify-start">
            <button
              onClick={handleImportarDados}
              disabled={importando}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>{importando ? 'Importando...' : 'Importar Dados'}</span>
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
