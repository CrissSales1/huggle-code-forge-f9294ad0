import { useState } from 'react';
import { Search, Download, FileText, Clock, TrendingUp, ChevronLeft, ChevronRight, FileDown, ChevronDown, ChevronUp, X, Plus, Filter } from 'lucide-react';
import { useRelatorios, buscarTodosParaExportar } from '@/react-app/hooks/useApi';
import { normalizarNumeroCasa } from '@/react-app/utils/formatters';
import PlacaVeiculo from '@/react-app/components/PlacaVeiculo';
import PrismaBadge from '@/react-app/components/PrismaBadge';
import { exportarRelatorioPDF } from '@/react-app/utils/pdfExport';
import type { FiltroRelatorioType, RelatorioResultado } from '@/shared/types';

export default function Relatorios() {
  const [filtros, setFiltros] = useState<FiltroRelatorioType>({
    data_inicial: '',
    data_final: '',
    nome: '',
    casa_visitada: '',
    placa_veiculo: '',
    pagina: 1,
    limite: 100,
    excluir_observacoes: [],
    excluir_nomes: [],
    excluir_placas: [],
  });
  
  // Estados para inputs temporários de exclusão
  const [novaExclusaoObs, setNovaExclusaoObs] = useState('');
  const [novaExclusaoNome, setNovaExclusaoNome] = useState('');
  const [novaExclusaoPlaca, setNovaExclusaoPlaca] = useState('');
  const [mostrarFiltrosExclusao, setMostrarFiltrosExclusao] = useState(false);
  const [resultado, setResultado] = useState<RelatorioResultado>({
    visitantes: [],
    total_registros: 0,
    total_finalizadas: 0,
    total_ativas: 0,
    pagina_atual: 1,
    total_paginas: 0,
    limite_por_pagina: 100,
  });

  const { gerarRelatorio, loading, error } = useRelatorios();

  const handleBuscar = async (novaPagina = 1) => {
    // Normalizar o filtro de casa antes de buscar
    const filtrosBusca = { 
      ...filtros, 
      pagina: novaPagina,
      casa_visitada: filtros.casa_visitada ? normalizarNumeroCasa(filtros.casa_visitada) : ''
    };
    const dados = await gerarRelatorio(filtrosBusca);
    setResultado(dados);
    setFiltros(prev => ({ ...prev, pagina: novaPagina }));
  };

  const handleLimparFiltros = () => {
    setFiltros({
      data_inicial: '',
      data_final: '',
      nome: '',
      casa_visitada: '',
      placa_veiculo: '',
      pagina: 1,
      limite: 100,
      excluir_observacoes: [],
      excluir_nomes: [],
      excluir_placas: [],
    });
    setNovaExclusaoObs('');
    setNovaExclusaoNome('');
    setNovaExclusaoPlaca('');
    setResultado({
      visitantes: [],
      total_registros: 0,
      total_finalizadas: 0,
      total_ativas: 0,
      pagina_atual: 1,
      total_paginas: 0,
      limite_por_pagina: 100,
    });
  };

  // Funções para adicionar/remover exclusões
  const adicionarExclusaoObs = () => {
    if (novaExclusaoObs.trim() && !filtros.excluir_observacoes?.includes(novaExclusaoObs.trim().toUpperCase())) {
      setFiltros({
        ...filtros,
        excluir_observacoes: [...(filtros.excluir_observacoes || []), novaExclusaoObs.trim().toUpperCase()],
        pagina: 1
      });
      setNovaExclusaoObs('');
    }
  };

  const removerExclusaoObs = (termo: string) => {
    setFiltros({
      ...filtros,
      excluir_observacoes: filtros.excluir_observacoes?.filter(t => t !== termo) || [],
      pagina: 1
    });
  };

  const adicionarExclusaoNome = () => {
    if (novaExclusaoNome.trim() && !filtros.excluir_nomes?.includes(novaExclusaoNome.trim().toUpperCase())) {
      setFiltros({
        ...filtros,
        excluir_nomes: [...(filtros.excluir_nomes || []), novaExclusaoNome.trim().toUpperCase()],
        pagina: 1
      });
      setNovaExclusaoNome('');
    }
  };

  const removerExclusaoNome = (nome: string) => {
    setFiltros({
      ...filtros,
      excluir_nomes: filtros.excluir_nomes?.filter(n => n !== nome) || [],
      pagina: 1
    });
  };

  const adicionarExclusaoPlaca = () => {
    if (novaExclusaoPlaca.trim() && !filtros.excluir_placas?.includes(novaExclusaoPlaca.trim().toUpperCase())) {
      setFiltros({
        ...filtros,
        excluir_placas: [...(filtros.excluir_placas || []), novaExclusaoPlaca.trim().toUpperCase()],
        pagina: 1
      });
      setNovaExclusaoPlaca('');
    }
  };

  const removerExclusaoPlaca = (placa: string) => {
    setFiltros({
      ...filtros,
      excluir_placas: filtros.excluir_placas?.filter(p => p !== placa) || [],
      pagina: 1
    });
  };

  const totalExclusoes = (filtros.excluir_observacoes?.length || 0) + (filtros.excluir_nomes?.length || 0) + (filtros.excluir_placas?.length || 0);

  const handleMudarPagina = (novaPagina: number) => {
    if (novaPagina >= 1 && novaPagina <= resultado.total_paginas) {
      handleBuscar(novaPagina);
    }
  };

  const formatarDataHora = (dataHora: string) => {
    return new Date(dataHora).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calcularTempoPermanencia = (entrada: string, saida?: string) => {
    const horaEntrada = new Date(entrada);
    const horaSaida = saida ? new Date(saida) : new Date();
    const diffMs = horaSaida.getTime() - horaEntrada.getTime();
    const diffHoras = diffMs / (1000 * 60 * 60);
    
    if (diffHoras < 1) {
      return `${Math.floor(diffHoras * 60)}min`;
    }
    return `${Math.floor(diffHoras)}h${Math.floor((diffHoras % 1) * 60)}min`;
  };

  const calcularEstatisticas = () => {
    if (resultado.total_registros === 0) return null;

    // Calcular tempo médio apenas com os dados da página atual (aproximação)
    const permanencias = resultado.visitantes
      .filter(v => v.hora_saida)
      .map(v => {
        const entrada = new Date(v.hora_entrada!);
        const saida = new Date(v.hora_saida!);
        return (saida.getTime() - entrada.getTime()) / (1000 * 60 * 60);
      });

    const tempoMedio = permanencias.length > 0 
      ? permanencias.reduce((acc, curr) => acc + curr, 0) / permanencias.length 
      : 0;

    // Usar contagens corretas do banco de dados
    return {
      totalVisitas: resultado.total_registros,
      visitasFinalizadas: resultado.total_finalizadas,
      visitasAtivas: resultado.total_ativas,
      tempoMedioPermanencia: tempoMedio,
    };
  };

  const exportarPDF = async () => {
    if (resultado.total_registros === 0) {
      alert('Não há dados para exportar. Faça uma busca primeiro.');
      return;
    }

    try {
      // Buscar TODOS os registros (não apenas os da página atual)
      const filtrosBusca = { 
        ...filtros, 
        casa_visitada: filtros.casa_visitada ? normalizarNumeroCasa(filtros.casa_visitada) : ''
      };
      const todosVisitantes = await buscarTodosParaExportar(filtrosBusca);

      const visitantesFormatados = todosVisitantes.map(v => ({
        nome: v.nome || '',
        casa_visitada: v.casa_visitada || '',
        placa_veiculo: v.placa_veiculo || '',
        numero_prisma: v.numero_prisma || null,
        observacoes: v.observacoes || null,
        hora_entrada: formatarDataHora(v.hora_entrada!),
        hora_saida: v.hora_saida ? formatarDataHora(v.hora_saida) : null,
        is_ativo: !!v.is_ativo,
        permanencia: calcularTempoPermanencia(v.hora_entrada!, v.hora_saida)
      }));

      // Usar estatísticas corretas do banco
      exportarRelatorioPDF(visitantesFormatados, filtros, {
        totalVisitas: resultado.total_registros,
        visitasFinalizadas: resultado.total_finalizadas,
        visitasAtivas: resultado.total_ativas,
        tempoMedioPermanencia: estatisticas?.tempoMedioPermanencia || 0
      });
    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
      alert('Erro ao exportar PDF. Tente novamente.');
    }
  };

  const exportarDados = () => {
    if (resultado.visitantes.length === 0) {
      alert('Não há dados para exportar. Faça uma busca primeiro.');
      return;
    }

    // Cabeçalhos das colunas
    const headers = [
      'Nome',
      'Casa Visitada', 
      'Placa do Veículo',
      'Número do Prisma',
      'Observações',
      'Data/Hora de Entrada',
      'Data/Hora de Saída',
      'Tempo de Permanência',
      'Status',
      'Estaciona na Vaga do Morador'
    ];

    // Converter dados para CSV
    const csvData = resultado.visitantes.map(visitante => {
      const entrada = visitante.hora_entrada ? formatarDataHora(visitante.hora_entrada) : '';
      const saida = visitante.hora_saida ? formatarDataHora(visitante.hora_saida) : '';
      const permanencia = calcularTempoPermanencia(visitante.hora_entrada!, visitante.hora_saida);
      const status = visitante.is_ativo ? 'Ativo' : 'Finalizado';
      const estacionaVagaMorador = visitante.estacionar_vaga_morador ? 'Sim' : 'Não';

      return [
        `"${visitante.nome}"`,
        `"${visitante.casa_visitada}"`,
        `"${visitante.placa_veiculo}"`,
        visitante.numero_prisma || '',
        `"${visitante.observacoes || ''}"`,
        `"${entrada}"`,
        `"${saida}"`,
        `"${permanencia}"`,
        `"${status}"`,
        `"${estacionaVagaMorador}"`
      ];
    });

    // Combinar headers e dados
    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n');

    // Criar e baixar arquivo
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      
      // Nome do arquivo com timestamp
      const agora = new Date();
      const timestamp = agora.toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
      link.setAttribute('download', `relatorio_visitantes_${timestamp}.csv`);
      
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const estatisticas = calcularEstatisticas();

  // Gerar array de páginas para navegação
  const gerarPaginasNavegacao = () => {
    const paginas = [];
    const paginaAtual = resultado.pagina_atual;
    const totalPaginas = resultado.total_paginas;
    
    // Sempre mostrar primeira página
    if (totalPaginas > 0) {
      paginas.push(1);
    }
    
    // Mostrar páginas ao redor da atual
    let inicio = Math.max(2, paginaAtual - 2);
    let fim = Math.min(totalPaginas - 1, paginaAtual + 2);
    
    // Adicionar ... se necessário
    if (inicio > 2) {
      paginas.push('...');
    }
    
    // Adicionar páginas do meio
    for (let i = inicio; i <= fim; i++) {
      if (i > 1 && i < totalPaginas) {
        paginas.push(i);
      }
    }
    
    // Adicionar ... se necessário
    if (fim < totalPaginas - 1) {
      paginas.push('...');
    }
    
    // Sempre mostrar última página
    if (totalPaginas > 1) {
      paginas.push(totalPaginas);
    }
    
    return paginas;
  };

  const paginasNavegacao = gerarPaginasNavegacao();

  return (
    <div className="px-4 sm:px-6 lg:px-8 mt-lg max-w-[1440px] w-full mx-auto">
      {/* Header */}
      <div className="mb-lg">
        <h1 className="text-h2 font-semibold text-on-surface tracking-tight">Busca de Visitantes</h1>
        <p className="text-on-surface-variant mt-1 text-body-sm">Encontre e analise visitantes no histórico do sistema</p>
      </div>

      {/* Filtros sempre visíveis */}
      <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200 p-3 sm:p-4 lg:p-6 mb-4 sm:mb-6">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Filtros de Busca</h2>
        
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3 lg:gap-4 mb-3 sm:mb-4">
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
              Data Inicial
            </label>
            <input
              type="date"
              value={filtros.data_inicial}
              onChange={(e) => setFiltros({...filtros, data_inicial: e.target.value, pagina: 1})}
              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
              Data Final
            </label>
            <input
              type="date"
              value={filtros.data_final}
              onChange={(e) => setFiltros({...filtros, data_final: e.target.value, pagina: 1})}
              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
              Nome do Visitante
            </label>
            <input
              type="text"
              value={filtros.nome}
              onChange={(e) => setFiltros({...filtros, nome: e.target.value.toUpperCase(), pagina: 1})}
              placeholder="Digite o nome..."
              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
            />
          </div>
          
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
              Casa Visitada
            </label>
            <input
              type="text"
              value={filtros.casa_visitada}
              onChange={(e) => setFiltros({...filtros, casa_visitada: e.target.value.toUpperCase(), pagina: 1})}
              placeholder="Casa..."
              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
            />
          </div>
          
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
              Placa do Veículo
            </label>
            <input
              type="text"
              value={filtros.placa_veiculo}
              onChange={(e) => setFiltros({...filtros, placa_veiculo: e.target.value.toUpperCase(), pagina: 1})}
              placeholder="Placa..."
              className="w-full px-2 sm:px-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        
        {/* Filtros de Exclusão (colapsável) */}
        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-200">
          <button
            onClick={() => setMostrarFiltrosExclusao(!mostrarFiltrosExclusao)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          >
            <Filter className="w-4 h-4" />
            <span>Filtros de Exclusão</span>
            {totalExclusoes > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                {totalExclusoes}
              </span>
            )}
            {mostrarFiltrosExclusao ? (
              <ChevronUp className="w-4 h-4 ml-1" />
            ) : (
              <ChevronDown className="w-4 h-4 ml-1" />
            )}
          </button>
          
          {mostrarFiltrosExclusao && (
            <div className="mt-3 p-3 sm:p-4 bg-red-50/50 border border-red-100 rounded-lg space-y-3 sm:space-y-4">
              <p className="text-xs text-gray-500">
                Use os filtros abaixo para <strong>ocultar</strong> visitantes específicos dos resultados.
              </p>
              
              {/* Excluir por Observação */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                  Excluir por Observação
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={novaExclusaoObs}
                    onChange={(e) => setNovaExclusaoObs(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && adicionarExclusaoObs()}
                    placeholder="Ex: PERSONAL, ENTREGA..."
                    className="flex-1 px-2 sm:px-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 uppercase"
                  />
                  <button
                    onClick={adicionarExclusaoObs}
                    disabled={!novaExclusaoObs.trim()}
                    className="px-3 py-1.5 sm:py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {filtros.excluir_observacoes && filtros.excluir_observacoes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {filtros.excluir_observacoes.map((termo) => (
                      <span
                        key={termo}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full"
                      >
                        {termo}
                        <button
                          onClick={() => removerExclusaoObs(termo)}
                          className="hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Excluir por Nome */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                  Excluir por Nome
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={novaExclusaoNome}
                    onChange={(e) => setNovaExclusaoNome(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && adicionarExclusaoNome()}
                    placeholder="Ex: TIAGO, ADRIANO..."
                    className="flex-1 px-2 sm:px-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 uppercase"
                  />
                  <button
                    onClick={adicionarExclusaoNome}
                    disabled={!novaExclusaoNome.trim()}
                    className="px-3 py-1.5 sm:py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {filtros.excluir_nomes && filtros.excluir_nomes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {filtros.excluir_nomes.map((nome) => (
                      <span
                        key={nome}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full"
                      >
                        {nome}
                        <button
                          onClick={() => removerExclusaoNome(nome)}
                          className="hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Excluir por Placa */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1 sm:mb-2">
                  Excluir por Placa
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={novaExclusaoPlaca}
                    onChange={(e) => setNovaExclusaoPlaca(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === 'Enter' && adicionarExclusaoPlaca()}
                    placeholder="Ex: XXE7J66..."
                    maxLength={7}
                    className="flex-1 px-2 sm:px-3 py-1.5 sm:py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 uppercase"
                  />
                  <button
                    onClick={adicionarExclusaoPlaca}
                    disabled={!novaExclusaoPlaca.trim()}
                    className="px-3 py-1.5 sm:py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {filtros.excluir_placas && filtros.excluir_placas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {filtros.excluir_placas.map((placa) => (
                      <span
                        key={placa}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full"
                      >
                        {placa}
                        <button
                          onClick={() => removerExclusaoPlaca(placa)}
                          className="hover:text-red-600"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 mt-4">
          <button
            onClick={handleLimparFiltros}
            className="px-3 sm:px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Limpar
          </button>
          <button
            onClick={() => handleBuscar(1)}
            disabled={loading}
            className="flex items-center justify-center space-x-1.5 sm:space-x-2 px-4 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm"
          >
            <Search className="w-4 h-4" />
            <span>{loading ? 'Buscando...' : 'Buscar'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Estatísticas */}
      {estatisticas && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-gutter mb-lg">
          <div className="bg-surface-container-lowest rounded-xl shadow-ambient-1 p-lg border border-outline-variant/20 flex items-center gap-md">
            <div className="w-12 h-12 rounded-full bg-primary-fixed flex items-center justify-center text-primary shrink-0">
              <FileText className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-body-sm text-on-surface-variant mb-1">Total</p>
              <p className="text-h2 text-on-surface">{estatisticas.totalVisitas}</p>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl shadow-ambient-1 p-lg border border-outline-variant/20 flex items-center gap-md">
            <div className="w-12 h-12 rounded-full bg-secondary-fixed flex items-center justify-center text-secondary shrink-0">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-body-sm text-on-surface-variant mb-1">Finalizadas</p>
              <p className="text-h2 text-on-surface">{estatisticas.visitasFinalizadas}</p>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl shadow-ambient-1 p-lg border border-outline-variant/20 flex items-center gap-md">
            <div className="w-12 h-12 rounded-full bg-tertiary-fixed flex items-center justify-center text-tertiary shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-body-sm text-on-surface-variant mb-1">Ativas</p>
              <p className="text-h2 text-on-surface">{estatisticas.visitasAtivas}</p>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl shadow-ambient-1 p-lg border border-outline-variant/20 flex items-center gap-md">
            <div className="w-12 h-12 rounded-full bg-surface-variant flex items-center justify-center text-on-surface-variant shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-body-sm text-on-surface-variant mb-1">Tempo Médio</p>
              <p className="text-h2 text-on-surface">
                {Math.floor(estatisticas.tempoMedioPermanencia)}h{Math.floor((estatisticas.tempoMedioPermanencia % 1) * 60)}m
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Resultados */}
      <div className="bg-white rounded-lg sm:rounded-xl border border-gray-200">
        <div className="p-3 sm:p-4 lg:p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-0">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900">
                Resultados
              </h2>
              {resultado.total_registros > 0 && (
                <span className="text-xs sm:text-sm text-gray-500">
                  {resultado.total_registros} registros{resultado.total_paginas > 1 && ` • ${resultado.total_paginas} páginas`}
                </span>
              )}
            </div>
            
            {resultado.visitantes.length > 0 && (
              <div className="flex gap-2 self-start sm:self-auto">
                <button 
                  onClick={exportarPDF}
                  className="flex items-center justify-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                >
                  <FileDown className="w-4 h-4" />
                  <span>PDF</span>
                </button>
                <button 
                  onClick={exportarDados}
                  className="flex items-center justify-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Exportar</span> <span>CSV</span>
                </button>
              </div>
            )}
          </div>
        </div>
        
        <div className="p-3 sm:p-4 lg:p-6">
          {resultado.visitantes.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <FileText className="w-12 h-12 sm:w-16 sm:h-16 text-gray-300 mx-auto mb-3 sm:mb-4" />
              <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-1 sm:mb-2">Nenhum resultado encontrado</h3>
              <p className="text-gray-500 text-sm">
                Use os filtros acima para buscar visitantes.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-4 lg:mx-0">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Visitante
                      </th>
                      <th className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Casa
                      </th>
                      <th className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Placa
                      </th>
                      <th className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Prisma
                      </th>
                      <th className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Observações
                      </th>
                      <th className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Entrada
                      </th>
                      <th className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Saída
                      </th>
                      <th className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Permanência
                      </th>
                      <th className="px-3 lg:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {resultado.visitantes.map((visitante, index) => (
                      <tr key={visitante.id || index} className="hover:bg-gray-50">
                        <td className="px-3 lg:px-4 py-3 lg:py-4 whitespace-nowrap">
                          <div className="font-medium text-gray-900 text-sm lg:text-base">{visitante.nome}</div>
                        </td>
                        <td className="px-3 lg:px-4 py-3 lg:py-4 whitespace-nowrap text-gray-500 text-sm lg:text-base">
                          {visitante.casa_visitada}
                        </td>
                        <td className="px-3 lg:px-4 py-3 lg:py-4 whitespace-nowrap">
                          <PlacaVeiculo placa={visitante.placa_veiculo} size="sm" />
                        </td>
                        <td className="px-3 lg:px-4 py-3 lg:py-4 whitespace-nowrap text-center">
                          {visitante.numero_prisma ? (
                            <div className="flex justify-center">
                              <PrismaBadge numero={visitante.numero_prisma} size="sm" variant="orange" />
                            </div>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-3 lg:px-4 py-3 lg:py-4 max-w-xs">
                          {visitante.observacoes ? (
                            <span className="text-gray-900 text-sm truncate block" title={visitante.observacoes}>
                              {visitante.observacoes}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-3 lg:px-4 py-3 lg:py-4 whitespace-nowrap text-gray-500 text-sm lg:text-base">
                          {formatarDataHora(visitante.hora_entrada!)}
                        </td>
                        <td className="px-3 lg:px-4 py-3 lg:py-4 whitespace-nowrap text-gray-500 text-sm lg:text-base">
                          {visitante.hora_saida ? formatarDataHora(visitante.hora_saida) : '-'}
                        </td>
                        <td className="px-3 lg:px-4 py-3 lg:py-4 whitespace-nowrap text-gray-500 text-sm lg:text-base">
                          {calcularTempoPermanencia(visitante.hora_entrada!, visitante.hora_saida)}
                        </td>
                        <td className="px-3 lg:px-4 py-3 lg:py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            visitante.is_ativo 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {visitante.is_ativo ? 'Ativo' : 'Finalizado'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              {resultado.total_paginas > 1 && (
                <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-gray-200 pt-4 sm:pt-6">
                  <div className="text-xs sm:text-sm text-gray-500 text-center sm:text-left">
                    <span>
                      {((resultado.pagina_atual - 1) * resultado.limite_por_pagina) + 1}-
                      {Math.min(resultado.pagina_atual * resultado.limite_por_pagina, resultado.total_registros)} de {resultado.total_registros}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-center gap-1">
                    {/* Botão Anterior */}
                    <button
                      onClick={() => handleMudarPagina(resultado.pagina_atual - 1)}
                      disabled={resultado.pagina_atual === 1 || loading}
                      className="flex items-center px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline ml-1">Anterior</span>
                    </button>

                    {/* Números das páginas */}
                    <div className="flex gap-1">
                      {paginasNavegacao.slice(0, 5).map((pagina, index) => (
                        <div key={index}>
                          {pagina === '...' ? (
                            <span className="px-2 py-1.5 text-xs sm:text-sm text-gray-500">...</span>
                          ) : (
                            <button
                              onClick={() => handleMudarPagina(pagina as number)}
                              disabled={loading}
                              className={`px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                                pagina === resultado.pagina_atual
                                  ? 'bg-blue-600 text-white'
                                  : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                              } disabled:opacity-50`}
                            >
                              {pagina}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Botão Próxima */}
                    <button
                      onClick={() => handleMudarPagina(resultado.pagina_atual + 1)}
                      disabled={resultado.pagina_atual === resultado.total_paginas || loading}
                      className="flex items-center px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="hidden sm:inline mr-1">Próxima</span>
                      <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
