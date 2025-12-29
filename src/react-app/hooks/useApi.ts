import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type {
  CadastroVisitanteType,
  VisitanteAtivo,
  DashboardStats,
  VisitanteType,
  ConfiguracoesSistemaType,
  FiltroRelatorioType,
  EditarVisitanteType,
  PrismaMagneticoType,
  RelatorioResultado,
} from '@/shared/types';

// Hook para estatísticas do dashboard
export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Buscar configurações
      const { data: config, error: configError } = await supabase
        .from('configuracoes_sistema')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (configError) throw configError;

      // Buscar visitantes ativos
      const { data: visitantesAtivos, error: visitantesError } = await supabase
        .from('visitantes')
        .select('*')
        .eq('is_ativo', true);

      if (visitantesError) throw visitantesError;

      // Buscar prismas em uso
      const { data: prismasEmUso, error: prismasError } = await supabase
        .from('prismas_magneticos')
        .select('*')
        .eq('is_em_uso', true);

      if (prismasError) throw prismasError;

      // Calcular vagas em uso (visitantes que NÃO estacionam na vaga do morador)
      const vagasEmUso = visitantesAtivos?.filter(v => !v.estacionar_vaga_morador).length || 0;

      const dashboardStats: DashboardStats = {
        vagas_disponiveis: (config?.total_vagas_visitantes || 10) - vagasEmUso,
        vagas_ocupadas: vagasEmUso,
        total_vagas: config?.total_vagas_visitantes || 10,
        prismas_disponiveis: (config?.total_prismas_magneticos || 20) - (prismasEmUso?.length || 0),
        prismas_em_uso: prismasEmUso?.length || 0,
        total_prismas: config?.total_prismas_magneticos || 20,
        visitantes_ativos: visitantesAtivos?.length || 0,
      };

      setStats(dashboardStats);
    } catch (err) {
      console.error('Erro ao buscar estatísticas:', err);
      setError(err instanceof Error ? err.message : 'Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { stats, loading, error, refetch };
}

// Hook para visitantes ativos
export function useVisitantesAtivos() {
  const [visitantes, setVisitantes] = useState<VisitanteAtivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from('visitantes')
        .select('*')
        .eq('is_ativo', true)
        .order('hora_entrada', { ascending: false });

      if (queryError) throw queryError;

      setVisitantes(data as VisitanteAtivo[] || []);
    } catch (err) {
      console.error('Erro ao buscar visitantes ativos:', err);
      setError(err instanceof Error ? err.message : 'Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { visitantes, loading, error, refetch };
}

// Hook para prismas disponíveis
export function usePrismasDisponiveis() {
  const [prismas, setPrismas] = useState<PrismaMagneticoType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Buscar prismas em uso por visitantes ativos (verificação dupla)
      const { data: visitantesAtivos } = await supabase
        .from('visitantes')
        .select('numero_prisma')
        .eq('is_ativo', true)
        .not('numero_prisma', 'is', null);

      const prismasEmUsoPorVisitantes = new Set(
        (visitantesAtivos || []).map(v => v.numero_prisma).filter(Boolean)
      );

      // 2. Buscar todos os prismas
      const { data, error: queryError } = await supabase
        .from('prismas_magneticos')
        .select('*')
        .order('numero', { ascending: true });

      if (queryError) throw queryError;

      // 3. Filtrar apenas prismas realmente disponíveis (verificação dupla)
      // - is_em_uso deve ser false E
      // - não pode estar sendo usado por nenhum visitante ativo
      const prismasDisponiveis = (data || []).filter(p => 
        !p.is_em_uso && !prismasEmUsoPorVisitantes.has(p.numero)
      );

      setPrismas(prismasDisponiveis as PrismaMagneticoType[]);
    } catch (err) {
      console.error('Erro ao buscar prismas disponíveis:', err);
      setError(err instanceof Error ? err.message : 'Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { prismas, loading, error, refetch };
}

// Função para sincronizar estado dos prismas com visitantes ativos
export async function sincronizarPrismas(): Promise<boolean> {
  try {
    // 1. Buscar todos os prismas em uso por visitantes ativos
    const { data: visitantesAtivos } = await supabase
      .from('visitantes')
      .select('numero_prisma, id')
      .eq('is_ativo', true)
      .not('numero_prisma', 'is', null);

    const prismasEmUso = (visitantesAtivos || [])
      .filter(v => v.numero_prisma !== null)
      .map(v => ({ numero: v.numero_prisma!, visitante_id: v.id }));

    const numerosPrismasEmUso = prismasEmUso.map(p => p.numero);

    // 2. Marcar prismas em uso corretamente
    for (const prisma of prismasEmUso) {
      await supabase
        .from('prismas_magneticos')
        .update({ is_em_uso: true, visitante_id: prisma.visitante_id })
        .eq('numero', prisma.numero);
    }

    // 3. Marcar prismas não usados como disponíveis
    if (numerosPrismasEmUso.length > 0) {
      await supabase
        .from('prismas_magneticos')
        .update({ is_em_uso: false, visitante_id: null })
        .not('numero', 'in', `(${numerosPrismasEmUso.join(',')})`);
    } else {
      // Se não há prismas em uso, liberar todos
      await supabase
        .from('prismas_magneticos')
        .update({ is_em_uso: false, visitante_id: null });
    }

    console.log('Prismas sincronizados com sucesso');
    return true;
  } catch (err) {
    console.error('Erro ao sincronizar prismas:', err);
    return false;
  }
}

// Hook para ações de visitantes
export function useVisitanteActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cadastrarVisitante = async (data: CadastroVisitanteType): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      // Inserir visitante
      const { data: visitante, error: insertError } = await supabase
        .from('visitantes')
        .insert({
          nome: data.nome,
          casa_visitada: data.casa_visitada,
          placa_veiculo: data.placa_veiculo,
          numero_prisma: data.numero_prisma,
          estacionar_vaga_morador: data.estacionar_vaga_morador || false,
          hora_entrada: new Date().toISOString(),
          is_ativo: true,
          observacoes: data.observacoes,
          liberado_por: data.liberado_por,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Atualizar prisma se foi selecionado
      if (data.numero_prisma && visitante) {
        const { error: prismaError } = await supabase
          .from('prismas_magneticos')
          .update({ is_em_uso: true, visitante_id: visitante.id })
          .eq('numero', data.numero_prisma);

        if (prismaError) throw prismaError;
      }

      return true;
    } catch (err) {
      console.error('Erro ao cadastrar visitante:', err);
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar visitante');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const registrarSaida = async (id: number): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      // Buscar visitante
      const { data: visitante, error: fetchError } = await supabase
        .from('visitantes')
        .select('numero_prisma')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Atualizar visitante
      const { error: updateError } = await supabase
        .from('visitantes')
        .update({
          is_ativo: false,
          hora_saida: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) throw updateError;

      // Liberar prisma se existir
      if (visitante?.numero_prisma) {
        const { error: prismaError } = await supabase
          .from('prismas_magneticos')
          .update({ is_em_uso: false, visitante_id: null })
          .eq('numero', visitante.numero_prisma);

        if (prismaError) throw prismaError;
      }

      return true;
    } catch (err) {
      console.error('Erro ao registrar saída:', err);
      setError(err instanceof Error ? err.message : 'Erro ao registrar saída');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const editarVisitante = async (data: EditarVisitanteType): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      // Buscar visitante atual para verificar prisma anterior
      const { data: visitanteAtual, error: fetchError } = await supabase
        .from('visitantes')
        .select('numero_prisma')
        .eq('id', data.id)
        .single();

      if (fetchError) throw fetchError;

      const prismaAnterior = visitanteAtual?.numero_prisma;
      const novoPrisma = data.numero_prisma;

      // Atualizar visitante
      const { error: updateError } = await supabase
        .from('visitantes')
        .update({
          nome: data.nome,
          casa_visitada: data.casa_visitada,
          placa_veiculo: data.placa_veiculo,
          numero_prisma: data.numero_prisma,
          estacionar_vaga_morador: data.estacionar_vaga_morador,
          observacoes: data.observacoes,
          liberado_por: data.liberado_por,
        })
        .eq('id', data.id);

      if (updateError) throw updateError;

      // Liberar prisma anterior se mudou
      if (prismaAnterior && prismaAnterior !== novoPrisma) {
        await supabase
          .from('prismas_magneticos')
          .update({ is_em_uso: false, visitante_id: null })
          .eq('numero', prismaAnterior);
      }

      // Ocupar novo prisma se foi selecionado
      if (novoPrisma && novoPrisma !== prismaAnterior) {
        await supabase
          .from('prismas_magneticos')
          .update({ is_em_uso: true, visitante_id: data.id })
          .eq('numero', novoPrisma);
      }

      return true;
    } catch (err) {
      console.error('Erro ao editar visitante:', err);
      setError(err instanceof Error ? err.message : 'Erro ao editar visitante');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const buscarVisitantes = async (termo: string): Promise<VisitanteType[]> => {
    try {
      const { data, error: queryError } = await supabase
        .from('visitantes')
        .select('*')
        .or(`nome.ilike.%${termo}%,placa_veiculo.ilike.%${termo}%`)
        .order('created_at', { ascending: false })
        .limit(20);

      if (queryError) throw queryError;

      return data as VisitanteType[] || [];
    } catch (err) {
      console.error('Erro ao buscar visitantes:', err);
      return [];
    }
  };

  return { cadastrarVisitante, registrarSaida, editarVisitante, buscarVisitantes, loading, error };
}

// Hook para relatórios
export function useRelatorios() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gerarRelatorio = async (filtros: FiltroRelatorioType): Promise<RelatorioResultado> => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('visitantes')
        .select('*', { count: 'exact' });

      // Aplicar filtros
      if (filtros.data_inicial) {
        query = query.gte('hora_entrada', filtros.data_inicial);
      }
      if (filtros.data_final) {
        query = query.lte('hora_entrada', filtros.data_final);
      }
      if (filtros.nome) {
        query = query.ilike('nome', `%${filtros.nome}%`);
      }
      if (filtros.casa_visitada) {
        // Buscar tanto o valor original quanto a versão normalizada (ex: "1" busca "01" também)
        const casaNormalizada = filtros.casa_visitada;
        const casaSemZero = casaNormalizada.replace(/^0/, '');
        if (casaNormalizada !== casaSemZero) {
          // Se foi normalizado, busca ambos
          query = query.or(`casa_visitada.ilike.%${casaNormalizada}%,casa_visitada.ilike.%${casaSemZero}%`);
        } else {
          query = query.ilike('casa_visitada', `%${casaNormalizada}%`);
        }
      }
      if (filtros.placa_veiculo) {
        query = query.ilike('placa_veiculo', `%${filtros.placa_veiculo}%`);
      }

      // Paginação
      const limite = filtros.limite || 100;
      const pagina = filtros.pagina || 1;
      const offset = (pagina - 1) * limite;

      query = query
        .order('hora_entrada', { ascending: false })
        .range(offset, offset + limite - 1);

      const { data, error: queryError, count } = await query;

      if (queryError) throw queryError;

      const totalRegistros = count || 0;
      const totalPaginas = Math.ceil(totalRegistros / limite);

      return {
        visitantes: data as VisitanteType[] || [],
        total_registros: totalRegistros,
        pagina_atual: pagina,
        total_paginas: totalPaginas,
        limite_por_pagina: limite,
      };
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      setError(err instanceof Error ? err.message : 'Erro ao gerar relatório');
      return {
        visitantes: [],
        total_registros: 0,
        pagina_atual: 1,
        total_paginas: 0,
        limite_por_pagina: 100,
      };
    } finally {
      setLoading(false);
    }
  };

  return { gerarRelatorio, loading, error };
}

// Hook para configurações
export function useConfiguracoes() {
  const [configuracoes, setConfiguracoes] = useState<ConfiguracoesSistemaType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from('configuracoes_sistema')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (queryError) throw queryError;

      setConfiguracoes(data as ConfiguracoesSistemaType);
    } catch (err) {
      console.error('Erro ao carregar configurações:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const atualizarConfiguracoes = async (data: ConfiguracoesSistemaType): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      // Atualizar configurações
      const { error: updateError } = await supabase
        .from('configuracoes_sistema')
        .update({
          total_vagas_visitantes: data.total_vagas_visitantes,
          total_prismas_magneticos: data.total_prismas_magneticos,
          tempo_deduplicacao_segundos: data.tempo_deduplicacao_segundos,
        })
        .eq('id', 1);

      if (updateError) throw updateError;

      // Buscar prismas existentes
      const { data: prismasExistentes, error: prismasError } = await supabase
        .from('prismas_magneticos')
        .select('numero')
        .order('numero', { ascending: true });

      if (prismasError) throw prismasError;

      const numerosExistentes = prismasExistentes?.map(p => p.numero) || [];
      const totalDesejado = data.total_prismas_magneticos;

      // Criar prismas que faltam
      const prismasParaCriar: { numero: number; is_em_uso: boolean }[] = [];
      for (let i = 1; i <= totalDesejado; i++) {
        if (!numerosExistentes.includes(i)) {
          prismasParaCriar.push({ numero: i, is_em_uso: false });
        }
      }

      if (prismasParaCriar.length > 0) {
        const { error: insertError } = await supabase
          .from('prismas_magneticos')
          .insert(prismasParaCriar);

        if (insertError) throw insertError;
      }

      // Remover prismas excedentes (apenas os que não estão em uso)
      const prismasParaRemover = numerosExistentes.filter(n => n > totalDesejado);
      if (prismasParaRemover.length > 0) {
        const { error: deleteError } = await supabase
          .from('prismas_magneticos')
          .delete()
          .in('numero', prismasParaRemover)
          .eq('is_em_uso', false);

        if (deleteError) throw deleteError;
      }

      await refetch();
      return true;
    } catch (err) {
      console.error('Erro ao atualizar configurações:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar configurações');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const limparBancoDados = async (): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);

      // Deletar TODOS os visitantes
      const { error: visitantesError } = await supabase
        .from('visitantes')
        .delete()
        .gte('id', 0); // Deleta todos os registros

      if (visitantesError) throw visitantesError;

      // Deletar TODOS os veículos de moradores
      const { error: veiculosError } = await supabase
        .from('veiculos_moradores')
        .delete()
        .gte('id', 0); // Deleta todos os registros

      if (veiculosError) throw veiculosError;

      // Deletar TODAS as detecções LPR
      const { error: deteccoesError } = await supabase
        .from('lpr_deteccoes')
        .delete()
        .gte('id', 0); // Deleta todos os registros

      if (deteccoesError) throw deteccoesError;

      // Resetar todos os prismas (liberar mas manter)
      const { error: prismasError } = await supabase
        .from('prismas_magneticos')
        .update({ is_em_uso: false, visitante_id: null })
        .gte('id', 0);

      if (prismasError) throw prismasError;

      return true;
    } catch (err) {
      console.error('Erro ao limpar banco de dados:', err);
      setError(err instanceof Error ? err.message : 'Erro ao limpar banco de dados');
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { configuracoes, atualizarConfiguracoes, limparBancoDados, loading, error, refetch };
}

// Hook para estatísticas detalhadas
export function useEstatisticas(periodo: '7' | '30' | '90') {
  const [estatisticas, setEstatisticas] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEstatisticas = async () => {
      try {
        setLoading(true);
        setError(null);

        // Calcular data de início baseado no período (em dias)
        const agora = new Date();
        const dias = parseInt(periodo);
        const dataInicio = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);

        // Buscar TODOS os visitantes usando paginação para evitar limite de 1000
        let allVisitantes: any[] = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: pageData, error: queryError } = await supabase
            .from('visitantes')
            .select('*')
            .gte('hora_entrada', dataInicio.toISOString())
            .order('hora_entrada', { ascending: false })
            .range(page * pageSize, (page + 1) * pageSize - 1);

          if (queryError) throw queryError;

          if (pageData && pageData.length > 0) {
            allVisitantes = [...allVisitantes, ...pageData];
            page++;
            hasMore = pageData.length === pageSize;
          } else {
            hasMore = false;
          }
        }

        const visitantes = allVisitantes;

        const totalVisitantes = visitantes?.length || 0;
        const mediaPorDia = dias > 0 ? Math.round(totalVisitantes / dias) : 0;

        // Tempo médio de permanência
        const visitantesComSaida = visitantes?.filter(v => v.hora_saida) || [];
        let tempoMedioMinutos = 0;
        if (visitantesComSaida.length > 0) {
          const totalMinutos = visitantesComSaida.reduce((acc, v) => {
            const entrada = new Date(v.hora_entrada).getTime();
            const saida = new Date(v.hora_saida!).getTime();
            return acc + (saida - entrada) / (1000 * 60);
          }, 0);
          tempoMedioMinutos = totalMinutos / visitantesComSaida.length;
        }

        // Formatar tempo médio
        const horas = Math.floor(tempoMedioMinutos / 60);
        const minutos = Math.round(tempoMedioMinutos % 60);
        const tempoMedioPermanencia = horas > 0 ? `${horas}h ${minutos}m` : `${minutos}m`;

        // Taxa de ocupação (simulada como % de visitantes ativos / total vagas)
        const taxaOcupacaoMedia = totalVisitantes > 0 ? Math.min(100, Math.round((totalVisitantes / dias) * 10)) : 0;

        // Visitantes por dia
        const visitantesPorDia: { data: string; visitantes: number }[] = [];
        for (let i = dias - 1; i >= 0; i--) {
          const dia = new Date(agora.getTime() - i * 24 * 60 * 60 * 1000);
          const diaStr = dia.toISOString().split('T')[0];
          const count = visitantes?.filter(v => v.hora_entrada.startsWith(diaStr)).length || 0;
          visitantesPorDia.push({ data: diaStr, visitantes: count });
        }

        // Horários de pico (0-23h)
        const horariosPico: { hora: number; visitantes: number }[] = [];
        for (let h = 0; h < 24; h++) {
          const count = visitantes?.filter(v => new Date(v.hora_entrada).getHours() === h).length || 0;
          horariosPico.push({ hora: h, visitantes: count });
        }

        // Distribuição de tempo de permanência
        const distribuicaoTempo = [
          { name: '< 1h', quantidade: visitantesComSaida.filter(v => {
            const diff = (new Date(v.hora_saida!).getTime() - new Date(v.hora_entrada).getTime()) / (1000 * 60);
            return diff < 60;
          }).length },
          { name: '1-2h', quantidade: visitantesComSaida.filter(v => {
            const diff = (new Date(v.hora_saida!).getTime() - new Date(v.hora_entrada).getTime()) / (1000 * 60);
            return diff >= 60 && diff < 120;
          }).length },
          { name: '2-4h', quantidade: visitantesComSaida.filter(v => {
            const diff = (new Date(v.hora_saida!).getTime() - new Date(v.hora_entrada).getTime()) / (1000 * 60);
            return diff >= 120 && diff < 240;
          }).length },
          { name: '> 4h', quantidade: visitantesComSaida.filter(v => {
            const diff = (new Date(v.hora_saida!).getTime() - new Date(v.hora_entrada).getTime()) / (1000 * 60);
            return diff >= 240;
          }).length },
        ];

        // Visitantes por dia da semana
        const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        const visitantesPorDiaSemana = diasSemana.map((dia, index) => ({
          dia,
          visitantes: visitantes?.filter(v => new Date(v.hora_entrada).getDay() === index).length || 0,
        }));

        // Top visitantes recorrentes (por nome)
        const visitantesPorNome: { [key: string]: { nome: string; casa_visitada: string; total_visitas: number } } = {};
        visitantes?.forEach(v => {
          if (visitantesPorNome[v.nome]) {
            visitantesPorNome[v.nome].total_visitas++;
          } else {
            visitantesPorNome[v.nome] = { nome: v.nome, casa_visitada: v.casa_visitada, total_visitas: 1 };
          }
        });
        const visitantesRecorrentes = Object.values(visitantesPorNome)
          .sort((a, b) => b.total_visitas - a.total_visitas)
          .slice(0, 5);

        // Maior tempo de permanência
        const maiorTempoPermanencia = visitantesComSaida
          .map(v => {
            const diffMs = new Date(v.hora_saida!).getTime() - new Date(v.hora_entrada).getTime();
            const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
            const diffMinutos = Math.round((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            return {
              nome: v.nome,
              casa_visitada: v.casa_visitada,
              hora_entrada: v.hora_entrada,
              tempo_permanencia: diffHoras > 0 ? `${diffHoras}h ${diffMinutos}m` : `${diffMinutos}m`,
              total_minutos: diffMs / (1000 * 60),
            };
          })
          .sort((a, b) => b.total_minutos - a.total_minutos)
          .slice(0, 5);

        setEstatisticas({
          totalVisitantes,
          mediaPorDia,
          tempoMedioPermanencia,
          taxaOcupacaoMedia,
          visitantesPorDia,
          horariosPico,
          distribuicaoTempo,
          visitantesPorDiaSemana,
          visitantesRecorrentes,
          maiorTempoPermanencia,
          alertas: [],
        });
      } catch (err) {
        console.error('Erro ao carregar estatísticas:', err);
        setError(err instanceof Error ? err.message : 'Erro ao carregar estatísticas');
      } finally {
        setLoading(false);
      }
    };

    fetchEstatisticas();
  }, [periodo]);

  return { estatisticas, loading, error };
}

// Hook para monitoramento LPR local com Realtime
export function useLPRDetections() {
  const [latestDetection, setLatestDetection] = useState<any>(null);
  const [detectionHistory, setDetectionHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Função para mapear dados do banco para o formato da UI
  const mapDetectionData = (data: any) => {
    if (!data) return null;
    return {
      id: data.id,
      placa: data.placa_detectada,
      confidence: data.confidence,
      timestamp: data.timestamp,
      direcao: data.direcao || 'entrada',
      morador: data.is_morador ? { casa: data.casa_morador } : null,
    };
  };

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Buscar última detecção
      const { data: latest, error: latestError } = await supabase
        .from('lpr_deteccoes')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestError) throw latestError;
      if (latest) setLatestDetection(mapDetectionData(latest));

      // Buscar histórico
      const { data: history, error: historyError } = await supabase
        .from('lpr_deteccoes')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(10);

      if (historyError) throw historyError;
      setDetectionHistory((history || []).map(mapDetectionData));
      
    } catch (err) {
      console.error('Erro ao buscar detecções:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar detecções');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Carregar dados iniciais
    fetchInitialData();

    // Configurar Realtime - escuta novas inserções instantaneamente
    const channel = supabase
      .channel('lpr-deteccoes-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lpr_deteccoes'
        },
        (payload) => {
          console.log('Nova detecção recebida via Realtime:', payload.new);
          const novaDeteccao = mapDetectionData(payload.new);
          setLatestDetection(novaDeteccao);
          setDetectionHistory(prev => [novaDeteccao, ...prev.slice(0, 9)]);
        }
      )
      .subscribe((status) => {
        console.log('Status da conexão Realtime:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchInitialData]);

  return { latestDetection, detectionHistory, loading, error, isConnected, refetch: fetchInitialData };
}
