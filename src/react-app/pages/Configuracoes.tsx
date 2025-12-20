import { useState, useRef } from 'react';
import { Save, Trash2, AlertTriangle, Settings as SettingsIcon, Hash, Car, CheckCircle, Upload, Download, Database, Loader2, FileJson, HardDrive, Lock, ShieldCheck } from 'lucide-react';
import { useConfiguracoes } from '@/react-app/hooks/useApi';
import StatsCard from '@/react-app/components/StatsCard';
import { supabase } from '@/integrations/supabase/client';
import { normalizarNumeroCasa } from '@/react-app/utils/formatters';

interface BackupData {
  metadata: {
    versao: string;
    data_exportacao: string;
    sistema: string;
  };
  tabelas: {
    visitantes: any[];
    veiculos_moradores: any[];
    lpr_deteccoes: any[];
    prismas_magneticos: any[];
    configuracoes_sistema: any[];
  };
}

export default function Configuracoes() {
  const { configuracoes, atualizarConfiguracoes, limparBancoDados, loading, error } = useConfiguracoes();
  
  const [totalVagas, setTotalVagas] = useState(configuracoes?.total_vagas_visitantes || 10);
  const [totalPrismas, setTotalPrismas] = useState(configuracoes?.total_prismas_magneticos || 20);
  const [showConfirmacaoLimpeza, setShowConfirmacaoLimpeza] = useState(false);
  const [senhaSeguranca, setSenhaSeguranca] = useState('');
  const [mostrarSucesso, setMostrarSucesso] = useState(false);
  
  // Estados para proteção do backup
  const [backupDesbloqueado, setBackupDesbloqueado] = useState(false);
  const [senhaBackup, setSenhaBackup] = useState('');
  const [erroSenhaBackup, setErroSenhaBackup] = useState(false);
  
  // Estados para exportação
  const [exportando, setExportando] = useState(false);
  
  // Estados para importação
  const [importando, setImportando] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [dadosParaImportar, setDadosParaImportar] = useState<BackupData | null>(null);
  const [showConfirmacaoImport, setShowConfirmacaoImport] = useState(false);
  const [limparAntesImportar, setLimparAntesImportar] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    message: string;
    detalhes?: string;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      return;
    }

    const sucesso = await limparBancoDados();
    if (sucesso) {
      setShowConfirmacaoLimpeza(false);
      setSenhaSeguranca('');
      setMostrarSucesso(true);
      
      setTimeout(() => {
        setMostrarSucesso(false);
      }, 5000);
    }
  };

  const cancelarLimpeza = () => {
    setShowConfirmacaoLimpeza(false);
    setSenhaSeguranca('');
  };

  // Validar senha do backup
  const handleDesbloquearBackup = () => {
    if (senhaBackup.toLowerCase() === 'backup') {
      setBackupDesbloqueado(true);
      setErroSenhaBackup(false);
      setSenhaBackup('');
    } else {
      setErroSenhaBackup(true);
    }
  };

  const handleBloquearBackup = () => {
    setBackupDesbloqueado(false);
    setSenhaBackup('');
    setErroSenhaBackup(false);
    setImportResult(null);
  };

  // Função para buscar todos os registros de uma tabela (sem limite de 1000)
  const fetchAllRecords = async (tableName: 'visitantes' | 'veiculos_moradores' | 'lpr_deteccoes' | 'prismas_magneticos') => {
    const allRecords: any[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .order('id', { ascending: true })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error(`Erro ao buscar ${tableName}:`, error);
        break;
      }

      if (data && data.length > 0) {
        allRecords.push(...data);
        page++;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    return allRecords;
  };

  // Exportar backup completo
  const handleExportarBackup = async () => {
    setExportando(true);
    
    try {
      // Buscar todos os dados de todas as tabelas (sem limite de 1000)
      const [visitantes, veiculos, deteccoes, prismas, config] = await Promise.all([
        fetchAllRecords('visitantes'),
        fetchAllRecords('veiculos_moradores'),
        fetchAllRecords('lpr_deteccoes'),
        fetchAllRecords('prismas_magneticos'),
        supabase.from('configuracoes_sistema').select('*'),
      ]);

      const backup: BackupData = {
        metadata: {
          versao: '1.0',
          data_exportacao: new Date().toISOString(),
          sistema: 'PortaCerta - Sistema de Controle de Acesso',
        },
        tabelas: {
          visitantes: visitantes,
          veiculos_moradores: veiculos,
          lpr_deteccoes: deteccoes,
          prismas_magneticos: prismas,
          configuracoes_sistema: config.data || [],
        },
      };

      // Gerar arquivo e forçar download
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const dataFormatada = new Date().toISOString().split('T')[0];
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-portacerta-${dataFormatada}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setImportResult({
        success: true,
        message: 'Backup exportado com sucesso!',
        detalhes: `${backup.tabelas.visitantes.length} visitantes, ${backup.tabelas.veiculos_moradores.length} veículos, ${backup.tabelas.lpr_deteccoes.length} detecções`,
      });
    } catch (err) {
      console.error('Erro ao exportar backup:', err);
      setImportResult({
        success: false,
        message: 'Erro ao exportar backup',
        detalhes: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    } finally {
      setExportando(false);
    }
  };

  // Selecionar arquivo para importar
  const handleSelecionarArquivo = () => {
    fileInputRef.current?.click();
  };

  // Processar arquivo selecionado
  const handleArquivoSelecionado = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const dados = JSON.parse(content) as BackupData;

      // Validar estrutura básica
      if (!dados.tabelas) {
        throw new Error('Formato de arquivo inválido: campo "tabelas" não encontrado');
      }

      setDadosParaImportar(dados);
      setShowConfirmacaoImport(true);
      setImportResult(null);
    } catch (err) {
      console.error('Erro ao ler arquivo:', err);
      setImportResult({
        success: false,
        message: 'Erro ao ler arquivo de backup',
        detalhes: err instanceof Error ? err.message : 'Formato de arquivo inválido',
      });
    }

    // Limpar input para permitir selecionar o mesmo arquivo novamente
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Executar importação
  const handleConfirmarImportacao = async () => {
    if (!dadosParaImportar) return;

    setShowConfirmacaoImport(false);
    setImportando(true);
    setImportResult(null);

    try {
      // Limpar dados existentes se solicitado
      if (limparAntesImportar) {
        setImportProgress('Limpando dados existentes...');
        await limparBancoDados();
      }

      const { tabelas } = dadosParaImportar;
      let visitantesImportados = 0;
      let veiculosImportados = 0;
      let deteccoesImportadas = 0;

      // Importar visitantes em lotes
      if (tabelas.visitantes && tabelas.visitantes.length > 0) {
        setImportProgress(`Importando ${tabelas.visitantes.length} visitantes...`);
        
        const batchSize = 50;
        for (let i = 0; i < tabelas.visitantes.length; i += batchSize) {
          const batch = tabelas.visitantes.slice(i, i + batchSize).map((v: any) => ({
            nome: v.nome,
            casa_visitada: normalizarNumeroCasa(v.casa_visitada || ''),
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
            console.error(`Erro no lote de visitantes:`, insertError.message);
          } else {
            visitantesImportados += batch.length;
            setImportProgress(`Importando visitantes: ${visitantesImportados}/${tabelas.visitantes.length}`);
          }
        }
      }

      // Importar veículos de moradores
      if (tabelas.veiculos_moradores && tabelas.veiculos_moradores.length > 0) {
        setImportProgress(`Importando ${tabelas.veiculos_moradores.length} veículos de moradores...`);
        
        const batchSize = 50;
        for (let i = 0; i < tabelas.veiculos_moradores.length; i += batchSize) {
          const batch = tabelas.veiculos_moradores.slice(i, i + batchSize).map((v: any) => ({
            placa_veiculo: v.placa_veiculo,
            casa: normalizarNumeroCasa(v.casa || ''),
          }));

          const { error: insertError } = await supabase
            .from('veiculos_moradores')
            .insert(batch);

          if (insertError) {
            console.error(`Erro no lote de veículos:`, insertError.message);
          } else {
            veiculosImportados += batch.length;
          }
        }
      }

      // Importar detecções LPR
      if (tabelas.lpr_deteccoes && tabelas.lpr_deteccoes.length > 0) {
        setImportProgress(`Importando ${tabelas.lpr_deteccoes.length} detecções LPR...`);
        
        const batchSize = 50;
        for (let i = 0; i < tabelas.lpr_deteccoes.length; i += batchSize) {
          const batch = tabelas.lpr_deteccoes.slice(i, i + batchSize).map((d: any) => ({
            placa_detectada: d.placa_detectada,
            timestamp: d.timestamp,
            confidence: d.confidence,
            is_morador: d.is_morador,
            casa_morador: d.casa_morador,
          }));

          const { error: insertError } = await supabase
            .from('lpr_deteccoes')
            .insert(batch);

          if (insertError) {
            console.error(`Erro no lote de detecções:`, insertError.message);
          } else {
            deteccoesImportadas += batch.length;
          }
        }
      }

      setImportResult({
        success: true,
        message: 'Importação concluída com sucesso!',
        detalhes: `${visitantesImportados} visitantes, ${veiculosImportados} veículos, ${deteccoesImportadas} detecções importadas`,
      });
    } catch (err) {
      console.error('Erro na importação:', err);
      setImportResult({
        success: false,
        message: 'Erro durante a importação',
        detalhes: err instanceof Error ? err.message : 'Erro desconhecido',
      });
    } finally {
      setImportando(false);
      setImportProgress('');
      setDadosParaImportar(null);
      setLimparAntesImportar(false);
    }
  };

  const cancelarImportacao = () => {
    setShowConfirmacaoImport(false);
    setDadosParaImportar(null);
    setLimparAntesImportar(false);
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

      {/* Backup e Restauração */}
      <div className="bg-white rounded-lg border border-gray-200 mb-8">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <HardDrive className="w-5 h-5 text-purple-600" />
              <h2 className="text-xl font-semibold text-gray-900">Backup e Restauração</h2>
            </div>
            {backupDesbloqueado && (
              <button
                onClick={handleBloquearBackup}
                className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Lock className="w-4 h-4" />
                <span>Bloquear</span>
              </button>
            )}
          </div>
          <p className="text-gray-600 mt-1">
            Faça backup completo dos dados ou restaure de um backup anterior
          </p>
        </div>
        
        <div className="p-6">
          {/* Tela de desbloqueio */}
          {!backupDesbloqueado ? (
            <div className="max-w-md mx-auto text-center">
              <div className="p-4 bg-purple-50 rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                <Lock className="w-10 h-10 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Área Protegida (LGPD)</h3>
              <p className="text-sm text-gray-600 mb-6">
                O acesso ao backup de dados é restrito. Digite a senha para desbloquear as funções de backup e restauração.
              </p>
              
              <div className="space-y-4">
                <div>
                  <input
                    type="password"
                    value={senhaBackup}
                    onChange={(e) => {
                      setSenhaBackup(e.target.value);
                      setErroSenhaBackup(false);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleDesbloquearBackup()}
                    placeholder="Digite a senha de acesso"
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                      erroSenhaBackup ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {erroSenhaBackup && (
                    <p className="text-sm text-red-600 mt-1">Senha incorreta. Tente novamente.</p>
                  )}
                </div>
                
                <button
                  onClick={handleDesbloquearBackup}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Desbloquear Acesso</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Resultado de operação */}
              {importResult && (
                <div className={`p-4 rounded-lg mb-6 ${
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
                      {importResult.detalhes && (
                        <p className={`text-sm mt-1 ${
                          importResult.success ? 'text-green-700' : 'text-red-700'
                        }`}>
                          {importResult.detalhes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Progress de importação */}
              {importProgress && (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-6">
                  <div className="flex items-center space-x-3">
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    <span className="text-sm text-blue-800">{importProgress}</span>
                  </div>
                </div>
              )}

              {/* Cards de Exportar e Importar */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Exportar Backup */}
                <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Download className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Exportar Backup</h3>
                      <p className="text-sm text-gray-600">Baixe todos os dados</p>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-4">
                    Gera um arquivo JSON com todos os dados do sistema: visitantes, veículos de moradores, 
                    detecções LPR, prismas e configurações.
                  </p>
                  
                  <button
                    onClick={handleExportarBackup}
                    disabled={exportando}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {exportando ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>{exportando ? 'Exportando...' : 'Exportar Backup'}</span>
                  </button>
                </div>

                {/* Importar Backup */}
                <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Upload className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">Importar Backup</h3>
                      <p className="text-sm text-gray-600">Restaure de um arquivo</p>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-4">
                    Selecione um arquivo de backup JSON exportado anteriormente para restaurar os dados no sistema.
                  </p>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleArquivoSelecionado}
                    className="hidden"
                  />
                  
                  <button
                    onClick={handleSelecionarArquivo}
                    disabled={importando}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importando ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileJson className="w-4 h-4" />
                    )}
                    <span>{importando ? 'Importando...' : 'Selecionar Arquivo'}</span>
                  </button>
                </div>
              </div>

              {/* Modal de confirmação de importação */}
              {showConfirmacaoImport && dadosParaImportar && (
                <div className="mt-6 p-4 border border-blue-200 bg-blue-50 rounded-lg">
                  <div className="flex items-start space-x-3 mb-4">
                    <Database className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-medium text-blue-800">Confirmar Importação</h3>
                      <p className="text-sm text-blue-700 mt-1">
                        Arquivo de backup de {dadosParaImportar.metadata?.data_exportacao 
                          ? new Date(dadosParaImportar.metadata.data_exportacao).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit', 
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'data desconhecida'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-4 mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Dados a importar:</h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• {dadosParaImportar.tabelas.visitantes?.length || 0} visitantes</li>
                      <li>• {dadosParaImportar.tabelas.veiculos_moradores?.length || 0} veículos de moradores</li>
                      <li>• {dadosParaImportar.tabelas.lpr_deteccoes?.length || 0} detecções LPR</li>
                    </ul>
                  </div>
                  
                  <label className="flex items-center space-x-2 mb-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={limparAntesImportar}
                      onChange={(e) => setLimparAntesImportar(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      Limpar dados existentes antes de importar
                    </span>
                  </label>
                  
                  {limparAntesImportar && (
                    <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg mb-4">
                      <div className="flex items-start space-x-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-yellow-800">
                          Atenção: Todos os dados atuais serão removidos antes da importação!
                        </p>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex space-x-3">
                    <button
                      onClick={cancelarImportacao}
                      className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleConfirmarImportacao}
                      className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Confirmar Importação</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Gestão de Dados - Limpar Banco */}
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
                  <span>{loading ? 'Limpando...' : 'Confirmar Exclusão'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
