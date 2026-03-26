import { useState, useRef, useEffect } from 'react';
import { Save, Trash2, AlertTriangle, Settings as SettingsIcon, Hash, Car, CheckCircle, Upload, Download, Database, Loader2, FileJson, HardDrive, Lock, ShieldCheck, Gauge, Zap, Volume2, VolumeX, Play, Home, User, AlertCircle, Music, Brain } from 'lucide-react';
import { useConfiguracoes } from '@/react-app/hooks/useApi';
import StatsCard from '@/react-app/components/StatsCard';
import { supabase } from '@/integrations/supabase/client';
import { normalizarNumeroCasa } from '@/react-app/utils/formatters';
import { 
  MotionSensitivity, 
  SENSITIVITY_PRESETS, 
  loadMotionSensitivity, 
  saveMotionSensitivity,
  loadCustomSensitivity,
  saveCustomSensitivity,
  type CustomSensitivity,
} from '@/react-app/utils/motionDetection';
import { loadFallbackEnabled, saveFallbackEnabled } from '@/react-app/hooks/usePlateRecognition';
import { 
  loadSoundEnabled, 
  saveSoundEnabled, 
  loadSoundVolume, 
  saveSoundVolume, 
  testSound,
  testPreset,
  loadSoundPresets,
  saveSoundPreset,
  SOUND_PRESETS,
} from '@/react-app/utils/notificationSounds';

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
  const [tempoDeduplicacao, setTempoDeduplicacao] = useState(configuracoes?.tempo_deduplicacao_segundos || 30);
  const [sensibilidade, setSensibilidade] = useState<MotionSensitivity>(loadMotionSensitivity());
  const [customSensitivity, setCustomSensitivity] = useState<CustomSensitivity>(loadCustomSensitivity());
  const [usarApenasOCRLocal, setUsarApenasOCRLocal] = useState(!loadFallbackEnabled());
  
  
  // Estados para configuração de som
  const [soundEnabled, setSoundEnabled] = useState(loadSoundEnabled());
  const [soundVolume, setSoundVolume] = useState(loadSoundVolume() * 100); // Converter para 0-100
  const [soundPresets, setSoundPresets] = useState(loadSoundPresets());
  
  // Estados para proteção da exclusão
  const [exclusaoDesbloqueada, setExclusaoDesbloqueada] = useState(false);
  const [senhaExclusao, setSenhaExclusao] = useState('');
  const [erroSenhaExclusao, setErroSenhaExclusao] = useState(false);
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
  useEffect(() => {
    if (configuracoes) {
      setTotalVagas(configuracoes.total_vagas_visitantes);
      setTotalPrismas(configuracoes.total_prismas_magneticos);
      setTempoDeduplicacao(configuracoes.tempo_deduplicacao_segundos || 30);
    }
  }, [configuracoes]);

  const handleSalvarConfiguracoes = async () => {
    const sucesso = await atualizarConfiguracoes({
      total_vagas_visitantes: totalVagas,
      total_prismas_magneticos: totalPrismas,
      tempo_deduplicacao_segundos: tempoDeduplicacao,
    });

    if (sucesso) {
      // Feedback visual poderia ser adicionado aqui
    }
  };

  // Validar senha da exclusão
  const handleDesbloquearExclusao = () => {
    if (senhaExclusao.toLowerCase() === 'excluirtudo') {
      setExclusaoDesbloqueada(true);
      setErroSenhaExclusao(false);
      setSenhaExclusao('');
    } else {
      setErroSenhaExclusao(true);
    }
  };

  const handleBloquearExclusao = () => {
    setExclusaoDesbloqueada(false);
    setSenhaExclusao('');
    setErroSenhaExclusao(false);
  };

  const handleLimparBanco = async () => {
    const sucesso = await limparBancoDados();
    if (sucesso) {
      setExclusaoDesbloqueada(false);
      setMostrarSucesso(true);
      
      setTimeout(() => {
        setMostrarSucesso(false);
      }, 5000);
    }
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
            placa_detectada: d.placa_detectada?.replace(/[-\s]/g, '').toUpperCase() || '',
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
      totalPrismas !== configuracoes.total_prismas_magneticos ||
      tempoDeduplicacao !== (configuracoes.tempo_deduplicacao_segundos || 30)
    );

  return (
    <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-4 sm:mb-6 lg:mb-8">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Configurações do Sistema</h1>
        <p className="text-gray-600 mt-0.5 sm:mt-1 text-xs sm:text-sm lg:text-base">Gerencie as configurações e dados do sistema</p>
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
        <div className="grid grid-cols-2 lg:grid-cols-2 gap-2 sm:gap-3 lg:gap-4 mb-4 sm:mb-6 lg:mb-8">
          <StatsCard
            title="Vagas de Visitantes"
            value={configuracoes.total_vagas_visitantes}
            icon={Car}
            color="green"
            loading={loading}
          />
          <StatsCard
            title="Prismas Magnéticos"
            value={configuracoes.total_prismas_magneticos}
            icon={Hash}
            color="blue"
            loading={loading}
          />
        </div>
      )}

      {/* Gestão de Recursos */}
      <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 mb-4 sm:mb-6 lg:mb-8">
        <div className="p-3 sm:p-4 lg:p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
            <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900">Gestão de Recursos</h2>
          </div>
          <p className="text-gray-600 mt-0.5 sm:mt-1 text-xs sm:text-sm">
            Ajuste vagas e prismas disponíveis
          </p>
        </div>
        
        <div className="p-3 sm:p-4 lg:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
            <div>
              <label htmlFor="vagas" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                Vagas de Visitantes
              </label>
              <input
                type="number"
                id="vagas"
                min="1"
                max="999"
                value={totalVagas}
                onChange={(e) => setTotalVagas(parseInt(e.target.value) || 1)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">
                Total de vagas para visitantes
              </p>
            </div>
            
            <div>
              <label htmlFor="prismas" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                Prismas Magnéticos
              </label>
              <input
                type="number"
                id="prismas"
                min="1"
                max="999"
                value={totalPrismas}
                onChange={(e) => setTotalPrismas(parseInt(e.target.value) || 1)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">
                Total de prismas disponíveis
              </p>
            </div>

            <div>
              <label htmlFor="deduplicacao" className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                Tempo de Deduplicação (segundos)
              </label>
              <input
                type="number"
                id="deduplicacao"
                min="5"
                max="300"
                value={tempoDeduplicacao}
                onChange={(e) => setTempoDeduplicacao(parseInt(e.target.value) || 30)}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-[10px] sm:text-xs text-gray-500 mt-0.5 sm:mt-1">
                Ignora placas repetidas neste intervalo (LPR)
              </p>
            </div>

            {/* Sensibilidade de Movimento */}
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">
                <div className="flex items-center space-x-1.5">
                  <Gauge className="w-3.5 h-3.5 text-orange-500" />
                  <span>Sensibilidade de Movimento</span>
                </div>
              </label>
              
              {/* Botões de preset + custom */}
              <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-4">
                {(['baixa', 'media', 'alta'] as const).map((nivel) => {
                  const preset = SENSITIVITY_PRESETS[nivel];
                  const isSelected = sensibilidade === nivel;
                  return (
                    <button
                      key={nivel}
                      type="button"
                      onClick={() => {
                        setSensibilidade(nivel);
                        saveMotionSensitivity(nivel);
                      }}
                      className={`flex flex-col items-center p-2 sm:p-3 rounded-lg border-2 transition-all ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50 text-orange-700'
                          : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/50 text-gray-600'
                      }`}
                    >
                      <span className={`text-xs sm:text-sm font-medium ${isSelected ? 'text-orange-700' : 'text-gray-800'}`}>
                        {preset.label}
                      </span>
                      <span className={`text-[10px] sm:text-xs mt-0.5 text-center hidden sm:block ${isSelected ? 'text-orange-600' : 'text-gray-500'}`}>
                        {Math.round(preset.threshold * 100)}%
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setSensibilidade('custom');
                    saveMotionSensitivity('custom');
                  }}
                  className={`flex flex-col items-center p-2 sm:p-3 rounded-lg border-2 transition-all ${
                    sensibilidade === 'custom'
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50 text-gray-600'
                  }`}
                >
                  <span className={`text-xs sm:text-sm font-medium ${sensibilidade === 'custom' ? 'text-purple-700' : 'text-gray-800'}`}>
                    Custom
                  </span>
                  <span className={`text-[10px] sm:text-xs mt-0.5 text-center hidden sm:block ${sensibilidade === 'custom' ? 'text-purple-600' : 'text-gray-500'}`}>
                    {Math.round(customSensitivity.threshold * 100)}%
                  </span>
                </button>
              </div>
              
              {/* Slider para modo custom */}
              {sensibilidade === 'custom' && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 sm:p-4 space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs sm:text-sm font-medium text-purple-700">Threshold de Mudança</span>
                      <span className="text-sm font-bold text-purple-800">{Math.round(customSensitivity.threshold * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="40"
                      value={Math.round(customSensitivity.threshold * 100)}
                      onChange={(e) => {
                        const newThreshold = parseInt(e.target.value) / 100;
                        const newConfig = { ...customSensitivity, threshold: newThreshold };
                        setCustomSensitivity(newConfig);
                        saveCustomSensitivity(newConfig);
                      }}
                      className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                    />
                    <div className="flex justify-between text-[10px] text-purple-600 mt-1">
                      <span>5% (muito sensível)</span>
                      <span>40% (pouco sensível)</span>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs sm:text-sm font-medium text-purple-700">Diferença Mínima de Pixel</span>
                      <span className="text-sm font-bold text-purple-800">{customSensitivity.minPixelDifference}</span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="60"
                      value={customSensitivity.minPixelDifference}
                      onChange={(e) => {
                        const newMinPixel = parseInt(e.target.value);
                        const newConfig = { ...customSensitivity, minPixelDifference: newMinPixel };
                        setCustomSensitivity(newConfig);
                        saveCustomSensitivity(newConfig);
                      }}
                      className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                    />
                    <div className="flex justify-between text-[10px] text-purple-600 mt-1">
                      <span>15 (sensível)</span>
                      <span>60 (robusto)</span>
                    </div>
                  </div>
                </div>
              )}
              
              <p className="text-[10px] sm:text-xs text-gray-500 mt-2">
                {sensibilidade === 'custom' 
                  ? 'Ajuste fino: menor threshold = mais sensível, menor diferença de pixel = mais sensível.'
                  : 'Se veículos não são detectados, aumente a sensibilidade. Se há muitos falsos positivos, diminua.'}
              </p>
            </div>

            {/* Resolução YOLO */}
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">
                <div className="flex items-center space-x-1.5">
                  <Brain className="w-3.5 h-3.5 text-purple-500" />
                  <span>Resolução YOLO (Detecção de Placa)</span>
                </div>
              </label>
              <div className="flex items-center p-2 sm:p-3 rounded-lg border-2 border-purple-500 bg-purple-50">
                <span className="text-xs sm:text-sm font-medium text-purple-700">
                  🎯 640px (Fixo — modelo pré-treinado)
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-2">
                O modelo YOLO foi treinado com input fixo de 640×640px. Outras resoluções requerem retreinar o modelo.
              </p>
            </div>

            {/* Modo Econômico OCR */}
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">
                <div className="flex items-center space-x-1.5">
                  <Zap className="w-3.5 h-3.5 text-green-500" />
                  <span>Modo de Reconhecimento (OCR)</span>
                </div>
              </label>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setUsarApenasOCRLocal(true);
                    saveFallbackEnabled(false);
                  }}
                  className={`flex flex-col items-center p-2 sm:p-3 rounded-lg border-2 transition-all ${
                    usarApenasOCRLocal
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-green-300 hover:bg-green-50/50 text-gray-600'
                  }`}
                >
                  <span className={`text-xs sm:text-sm font-medium ${usarApenasOCRLocal ? 'text-green-700' : 'text-gray-800'}`}>
                    🆓 Econômico
                  </span>
                  <span className={`text-[10px] sm:text-xs mt-0.5 text-center ${usarApenasOCRLocal ? 'text-green-600' : 'text-gray-500'}`}>
                    Apenas OCR local (gratuito)
                  </span>
                  <span className="text-[9px] sm:text-[10px] mt-1 px-1.5 py-0.5 bg-green-100 text-green-600 rounded-full">
                    Custo zero
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUsarApenasOCRLocal(false);
                    saveFallbackEnabled(true);
                  }}
                  className={`flex flex-col items-center p-2 sm:p-3 rounded-lg border-2 transition-all ${
                    !usarApenasOCRLocal
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 text-gray-600'
                  }`}
                >
                  <span className={`text-xs sm:text-sm font-medium ${!usarApenasOCRLocal ? 'text-blue-700' : 'text-gray-800'}`}>
                    🎯 Precisão
                  </span>
                  <span className={`text-[10px] sm:text-xs mt-0.5 text-center ${!usarApenasOCRLocal ? 'text-blue-600' : 'text-gray-500'}`}>
                    API externa se necessário
                  </span>
                  <span className="text-[9px] sm:text-[10px] mt-1 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                    Custo por uso
                  </span>
                </button>
              </div>
              <p className="text-[10px] sm:text-xs text-gray-500 mt-2">
                <strong>Econômico:</strong> Usa apenas OCR local (gratuito), pode falhar em placas difíceis.
                <br />
                <strong>Precisão:</strong> Usa API externa quando confiança &lt; 90% (mais preciso, mas tem custo).
              </p>
            </div>
          </div>
          
          {configuracoesAlteradas && (
            <div className="mt-3 sm:mt-4 lg:mt-6 p-2 sm:p-3 lg:p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-2 text-blue-800">
                <AlertTriangle className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="text-xs sm:text-sm font-medium">Alterações pendentes</span>
              </div>
              <p className="text-[10px] sm:text-xs lg:text-sm text-blue-700 mt-0.5 sm:mt-1">
                Salve para aplicar as alterações.
              </p>
            </div>
          )}
          
          <div className="flex justify-end mt-3 sm:mt-4 lg:mt-6">
            <button
              onClick={handleSalvarConfiguracoes}
              disabled={loading || !configuracoesAlteradas}
              className="flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Salvando...' : 'Salvar'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Backup e Restauração */}
      <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 mb-4 sm:mb-6 lg:mb-8">
        <div className="p-3 sm:p-4 lg:p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <HardDrive className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
              <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900">Backup e Restauração</h2>
            </div>
            {backupDesbloqueado && (
              <button
                onClick={handleBloquearBackup}
                className="flex items-center space-x-1 px-2 sm:px-3 py-1 text-xs sm:text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Lock className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Bloquear</span>
              </button>
            )}
          </div>
          <p className="text-gray-600 mt-0.5 sm:mt-1 text-xs sm:text-sm">
            Backup e restauração de dados
          </p>
        </div>
        
        <div className="p-3 sm:p-4 lg:p-6">
          {/* Tela de desbloqueio */}
          {!backupDesbloqueado ? (
            <div className="max-w-sm sm:max-w-md mx-auto text-center">
              <div className="p-3 sm:p-4 bg-purple-50 rounded-full w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 mx-auto mb-3 sm:mb-4 flex items-center justify-center">
                <Lock className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-purple-600" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">Área Protegida (LGPD)</h3>
              <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
                Digite a senha para desbloquear.
              </p>
              
              <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); handleDesbloquearBackup(); }} className="space-y-3 sm:space-y-4">
                <div>
                  <input
                    type="password"
                    value={senhaBackup}
                    onChange={(e) => {
                      setSenhaBackup(e.target.value);
                      setErroSenhaBackup(false);
                    }}
                    placeholder="Digite a senha"
                    autoComplete="off"
                    className={`w-full px-3 sm:px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 ${
                      erroSenhaBackup ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {erroSenhaBackup && (
                    <p className="text-xs sm:text-sm text-red-600 mt-1">Senha incorreta.</p>
                  )}
                </div>
                
                <button
                  type="submit"
                  className="w-full flex items-center justify-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Desbloquear</span>
                </button>
              </form>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
                {/* Exportar Backup */}
                <div className="border border-gray-200 rounded-lg p-3 sm:p-4 lg:p-6 bg-gray-50">
                  <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
                    <div className="p-1.5 sm:p-2 bg-green-100 rounded-lg">
                      <Download className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-green-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Exportar Backup</h3>
                      <p className="text-[10px] sm:text-xs lg:text-sm text-gray-600">Baixe todos os dados</p>
                    </div>
                  </div>
                  
                  <p className="text-[10px] sm:text-xs lg:text-sm text-gray-600 mb-3 sm:mb-4 hidden sm:block">
                    Gera um arquivo JSON com todos os dados do sistema.
                  </p>
                  
                  <button
                    onClick={handleExportarBackup}
                    disabled={exportando}
                    className="w-full flex items-center justify-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {exportando ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    <span>{exportando ? 'Exportando...' : 'Exportar'}</span>
                  </button>
                </div>

                {/* Importar Backup */}
                <div className="border border-gray-200 rounded-lg p-3 sm:p-4 lg:p-6 bg-gray-50">
                  <div className="flex items-center space-x-2 sm:space-x-3 mb-3 sm:mb-4">
                    <div className="p-1.5 sm:p-2 bg-blue-100 rounded-lg">
                      <Upload className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Importar Backup</h3>
                      <p className="text-[10px] sm:text-xs lg:text-sm text-gray-600">Restaure de um arquivo</p>
                    </div>
                  </div>
                  
                  <p className="text-[10px] sm:text-xs lg:text-sm text-gray-600 mb-3 sm:mb-4 hidden sm:block">
                    Selecione um arquivo JSON para restaurar.
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
                    className="w-full flex items-center justify-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importando ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <FileJson className="w-4 h-4" />
                    )}
                    <span>{importando ? 'Importando...' : 'Selecionar'}</span>
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
      <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200">
        <div className="p-3 sm:p-4 lg:p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Trash2 className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
              <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900">Gestão de Dados</h2>
            </div>
            {exclusaoDesbloqueada && (
              <button
                onClick={handleBloquearExclusao}
                className="flex items-center space-x-1 px-2 sm:px-3 py-1 text-xs sm:text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Lock className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">Bloquear</span>
              </button>
            )}
          </div>
          <p className="text-gray-600 mt-0.5 sm:mt-1 text-xs sm:text-sm">
            Limpar todos os dados
          </p>
        </div>
        
        <div className="p-3 sm:p-4 lg:p-6">
          {/* Tela de desbloqueio */}
          {!exclusaoDesbloqueada ? (
            <div className="max-w-sm sm:max-w-md mx-auto text-center">
              <div className="p-3 sm:p-4 bg-red-50 rounded-full w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 mx-auto mb-3 sm:mb-4 flex items-center justify-center">
                <Lock className="w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 text-red-600" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">Área Protegida</h3>
              <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
                Operação crítica. Digite a senha.
              </p>
              
              <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); handleDesbloquearExclusao(); }} className="space-y-3 sm:space-y-4">
                <div>
                  <input
                    type="password"
                    value={senhaExclusao}
                    onChange={(e) => {
                      setSenhaExclusao(e.target.value);
                      setErroSenhaExclusao(false);
                    }}
                    placeholder="Digite a senha"
                    autoComplete="off"
                    className={`w-full px-3 sm:px-4 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 ${
                      erroSenhaExclusao ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {erroSenhaExclusao && (
                    <p className="text-xs sm:text-sm text-red-600 mt-1">Senha incorreta.</p>
                  )}
                </div>
                
                <button
                  type="submit"
                  className="w-full flex items-center justify-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Desbloquear</span>
                </button>
              </form>
            </div>
          ) : (
            <div>
              <div className="bg-red-50 border border-red-200 p-2 sm:p-3 lg:p-4 rounded-lg mb-4 sm:mb-6">
                <div className="flex items-start space-x-2 sm:space-x-3">
                  <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-xs sm:text-sm font-medium text-red-800">Atenção!</h3>
                    <p className="text-[10px] sm:text-xs lg:text-sm text-red-700 mt-0.5 sm:mt-1">
                      Esta ação remove permanentemente todos os dados. Não pode ser desfeita.
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-center">
                <button
                  onClick={handleLimparBanco}
                  disabled={loading}
                  className="flex items-center space-x-1.5 sm:space-x-2 px-4 sm:px-6 py-2 sm:py-3 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>{loading ? 'Limpando...' : 'Limpar Banco'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notificações Sonoras */}
      <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 mb-4 sm:mb-6 lg:mb-8">
        <div className="p-3 sm:p-4 lg:p-6 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
            <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900">Notificações Sonoras</h2>
          </div>
          <p className="text-gray-600 mt-0.5 sm:mt-1 text-xs sm:text-sm">
            Configure os sons de alerta para detecções de placas
          </p>
        </div>
        
        <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
          {/* Toggle habilitar/desabilitar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {soundEnabled ? (
                <Volume2 className="w-5 h-5 text-blue-600" />
              ) : (
                <VolumeX className="w-5 h-5 text-gray-400" />
              )}
              <div>
                <p className="text-sm font-medium text-gray-900">Sons de Notificação</p>
                <p className="text-xs text-gray-500">Tocar som ao detectar veículos</p>
              </div>
            </div>
            <button
              onClick={() => {
                const newValue = !soundEnabled;
                setSoundEnabled(newValue);
                saveSoundEnabled(newValue);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                soundEnabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  soundEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
          
          {/* Controle de Volume */}
          {soundEnabled && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Volume</label>
                  <span className="text-sm text-gray-500 font-mono">{Math.round(soundVolume)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={soundVolume}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setSoundVolume(value);
                    saveSoundVolume(value / 100);
                  }}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
              
              {/* Seleção de Presets por Tipo */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-gray-600" />
                  <p className="text-sm font-medium text-gray-700">Escolha o Som para Cada Tipo</p>
                </div>
                
                {/* Preset Morador */}
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                      <Home className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm font-medium text-green-800">Morador</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SOUND_PRESETS.morador.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setSoundPresets(prev => ({ ...prev, morador: preset.id }));
                          saveSoundPreset('morador', preset.id);
                          testPreset('morador', preset.id);
                        }}
                        className={`flex items-center justify-between p-2 rounded-lg border-2 transition-all ${
                          soundPresets.morador === preset.id
                            ? 'border-green-500 bg-green-100'
                            : 'border-green-200 bg-white hover:border-green-300'
                        }`}
                      >
                        <div className="text-left">
                          <p className="text-xs font-medium text-green-900">{preset.name}</p>
                          <p className="text-[10px] text-green-600">{preset.description}</p>
                        </div>
                        {soundPresets.morador === preset.id ? (
                          <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <Play className="w-3 h-3 text-green-400 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Preset Visitante */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
                      <User className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm font-medium text-amber-800">Visitante</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SOUND_PRESETS.visitante.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setSoundPresets(prev => ({ ...prev, visitante: preset.id }));
                          saveSoundPreset('visitante', preset.id);
                          testPreset('visitante', preset.id);
                        }}
                        className={`flex items-center justify-between p-2 rounded-lg border-2 transition-all ${
                          soundPresets.visitante === preset.id
                            ? 'border-amber-500 bg-amber-100'
                            : 'border-amber-200 bg-white hover:border-amber-300'
                        }`}
                      >
                        <div className="text-left">
                          <p className="text-xs font-medium text-amber-900">{preset.name}</p>
                          <p className="text-[10px] text-amber-600">{preset.description}</p>
                        </div>
                        {soundPresets.visitante === preset.id ? (
                          <CheckCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        ) : (
                          <Play className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Preset Desconhecido */}
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                      <AlertCircle className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-sm font-medium text-red-800">Desconhecido</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {SOUND_PRESETS.desconhecido.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => {
                          setSoundPresets(prev => ({ ...prev, desconhecido: preset.id }));
                          saveSoundPreset('desconhecido', preset.id);
                          testPreset('desconhecido', preset.id);
                        }}
                        className={`flex items-center justify-between p-2 rounded-lg border-2 transition-all ${
                          soundPresets.desconhecido === preset.id
                            ? 'border-red-500 bg-red-100'
                            : 'border-red-200 bg-white hover:border-red-300'
                        }`}
                      >
                        <div className="text-left">
                          <p className="text-xs font-medium text-red-900">{preset.name}</p>
                          <p className="text-[10px] text-red-600">{preset.description}</p>
                        </div>
                        {soundPresets.desconhecido === preset.id ? (
                          <CheckCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                        ) : (
                          <Play className="w-3 h-3 text-red-400 flex-shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Botões de Teste Rápido */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-3">Testar Sons Selecionados</p>
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  {/* Som Morador */}
                  <button
                    onClick={() => testSound('morador')}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 border-green-200 bg-green-50 hover:bg-green-100 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                      <Home className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-xs font-medium text-green-700">Morador</span>
                    <Play className="w-3 h-3 text-green-600" />
                  </button>
                  
                  {/* Som Visitante */}
                  <button
                    onClick={() => testSound('visitante')}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center">
                      <User className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-xs font-medium text-amber-700">Visitante</span>
                    <Play className="w-3 h-3 text-amber-600" />
                  </button>
                  
                  {/* Som Desconhecido */}
                  <button
                    onClick={() => testSound('desconhecido')}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 border-red-200 bg-red-50 hover:bg-red-100 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
                      <AlertCircle className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-xs font-medium text-red-700">Desconhecido</span>
                    <Play className="w-3 h-3 text-red-600" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Rodapé com versão */}
      <div className="mt-8 pt-4 border-t border-gray-200 text-center">
        <p className="text-xs text-gray-400">
          Versão do Sistema: <span className="font-mono font-medium text-gray-500">1.4.2</span> <span className="text-emerald-500">(Charset Filter)</span>
        </p>
      </div>
    </div>
  );
}
