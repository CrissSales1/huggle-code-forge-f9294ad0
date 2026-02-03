import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/react-app/utils/logger';
import { normalizarNome, similaridade, gerarChaveAgrupamento } from '@/react-app/utils/stringUtils';
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

  /**
   * Busca visitantes similares para evitar duplicatas
   * Busca por placa exata ou nome com similaridade >= 80%
   */
  const buscarVisitantesSimilares = async (
    nome?: string,
    placa?: string
  ): Promise<{ visitante: VisitanteType; similaridade: number; totalVisitas: number }[]> => {
    try {
      // Buscar visitantes potencialmente similares
      let query = supabase.from('visitantes').select('*');
      
      if (placa && placa.length === 7) {
        // Buscar por placa exata (mais confiável)
        query = query.eq('placa_veiculo', placa.toUpperCase());
      } else if (nome && nome.length >= 3) {
        // Buscar por nome parecido (primeiras 3 letras)
        const prefixo = nome.substring(0, 3).toUpperCase();
        query = query.ilike('nome', `${prefixo}%`);
      } else {
        return [];
      }
      
      const { data, error: queryError } = await query
        .order('hora_entrada', { ascending: false })
        .limit(100);
      
      if (queryError) throw queryError;
      if (!data || data.length === 0) return [];
      
      // Agrupar por visitante único (placa ou nome normalizado)
      const agrupados: Record<string, { 
        visitante: VisitanteType; 
        similaridadeNome: number;
        totalVisitas: number;
      }> = {};
      
      data.forEach(v => {
        const chave = gerarChaveAgrupamento(v.placa_veiculo, v.nome);
        const simNome = nome ? similaridade(nome, v.nome) : 100;
        
        // Filtrar por similaridade mínima de 80%
        if (simNome < 80 && !placa) return;
        
        // Converter dados do Supabase para VisitanteType
        const visitanteConvertido: VisitanteType = {
          id: v.id,
          nome: v.nome,
          casa_visitada: v.casa_visitada,
          placa_veiculo: v.placa_veiculo,
          numero_prisma: v.numero_prisma ?? undefined,
          estacionar_vaga_morador: v.estacionar_vaga_morador ?? false,
          observacoes: v.observacoes ?? undefined,
          liberado_por: v.liberado_por ?? undefined,
          hora_entrada: v.hora_entrada,
          hora_saida: v.hora_saida ?? undefined,
          is_ativo: v.is_ativo ?? true,
        };
        
        if (!agrupados[chave]) {
          agrupados[chave] = {
            visitante: visitanteConvertido,
            similaridadeNome: simNome,
            totalVisitas: 1
          };
        } else {
          agrupados[chave].totalVisitas++;
          // Manter o registro mais recente
          const existingEntrada = agrupados[chave].visitante.hora_entrada;
          if (existingEntrada && new Date(v.hora_entrada) > new Date(existingEntrada)) {
            agrupados[chave].visitante = visitanteConvertido;
            agrupados[chave].similaridadeNome = simNome;
          }
        }
      });
      
      // Converter para array e ordenar por total de visitas
      return Object.values(agrupados)
        .map(g => ({
          visitante: g.visitante,
          similaridade: g.similaridadeNome,
          totalVisitas: g.totalVisitas
        }))
        .sort((a, b) => b.totalVisitas - a.totalVisitas);
    } catch (err) {
      console.error('Erro ao buscar visitantes similares:', err);
      return [];
    }
  };

  return { cadastrarVisitante, registrarSaida, editarVisitante, buscarVisitantes, buscarVisitantesSimilares, loading, error };
}

// Função para buscar TODOS os visitantes (sem paginação) para exportação
export async function buscarTodosParaExportar(filtros: FiltroRelatorioType): Promise<VisitanteType[]> {
  const BATCH_SIZE = 1000;
  const allData: VisitanteType[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('visitantes')
      .select('*');

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
      const casaNormalizada = filtros.casa_visitada;
      const casaSemZero = casaNormalizada.replace(/^0/, '');
      if (casaNormalizada !== casaSemZero) {
        query = query.or(`casa_visitada.ilike.%${casaNormalizada}%,casa_visitada.ilike.%${casaSemZero}%`);
      } else {
        query = query.ilike('casa_visitada', `%${casaNormalizada}%`);
      }
    }
    if (filtros.placa_veiculo) {
      query = query.ilike('placa_veiculo', `%${filtros.placa_veiculo}%`);
    }
    // Filtros de exclusão
    if (filtros.excluir_observacoes?.length) {
      for (const termo of filtros.excluir_observacoes) {
        query = query.not('observacoes', 'ilike', `%${termo}%`);
      }
    }
    if (filtros.excluir_nomes?.length) {
      for (const nome of filtros.excluir_nomes) {
        query = query.not('nome', 'ilike', `%${nome}%`);
      }
    }
    if (filtros.excluir_placas?.length) {
      for (const placa of filtros.excluir_placas) {
        query = query.not('placa_veiculo', 'eq', placa.toUpperCase());
      }
    }

    query = query
      .order('hora_entrada', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar dados para exportar:', error);
      break;
    }

    if (data && data.length > 0) {
      allData.push(...(data as VisitanteType[]));
      offset += BATCH_SIZE;
      hasMore = data.length === BATCH_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allData;
}


// Hook para relatórios
export function useRelatorios() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gerarRelatorio = async (filtros: FiltroRelatorioType): Promise<RelatorioResultado> => {
    try {
      setLoading(true);
      setError(null);

      // Query principal com paginação
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
        const casaNormalizada = filtros.casa_visitada;
        const casaSemZero = casaNormalizada.replace(/^0/, '');
        if (casaNormalizada !== casaSemZero) {
          query = query.or(`casa_visitada.ilike.%${casaNormalizada}%,casa_visitada.ilike.%${casaSemZero}%`);
        } else {
          query = query.ilike('casa_visitada', `%${casaNormalizada}%`);
        }
      }
      if (filtros.placa_veiculo) {
        query = query.ilike('placa_veiculo', `%${filtros.placa_veiculo}%`);
      }
      // Filtros de exclusão
      if (filtros.excluir_observacoes?.length) {
        for (const termo of filtros.excluir_observacoes) {
          query = query.not('observacoes', 'ilike', `%${termo}%`);
        }
      }
      if (filtros.excluir_nomes?.length) {
        for (const nome of filtros.excluir_nomes) {
          query = query.not('nome', 'ilike', `%${nome}%`);
        }
      }
      if (filtros.excluir_placas?.length) {
        for (const placa of filtros.excluir_placas) {
          query = query.not('placa_veiculo', 'eq', placa.toUpperCase());
        }
      }

      // Paginação
      const limite = filtros.limite || 100;
      const pagina = filtros.pagina || 1;
      const offset = (pagina - 1) * limite;

      query = query
        .order('hora_entrada', { ascending: false })
        .range(offset, offset + limite - 1);

      // Queries para contagem correta de finalizadas e ativas (com mesmos filtros)
      let queryFinalizadas = supabase
        .from('visitantes')
        .select('*', { count: 'exact', head: true })
        .eq('is_ativo', false);

      let queryAtivas = supabase
        .from('visitantes')
        .select('*', { count: 'exact', head: true })
        .eq('is_ativo', true);

      // Aplicar mesmos filtros às queries de contagem
      if (filtros.data_inicial) {
        queryFinalizadas = queryFinalizadas.gte('hora_entrada', filtros.data_inicial);
        queryAtivas = queryAtivas.gte('hora_entrada', filtros.data_inicial);
      }
      if (filtros.data_final) {
        queryFinalizadas = queryFinalizadas.lte('hora_entrada', filtros.data_final);
        queryAtivas = queryAtivas.lte('hora_entrada', filtros.data_final);
      }
      if (filtros.nome) {
        queryFinalizadas = queryFinalizadas.ilike('nome', `%${filtros.nome}%`);
        queryAtivas = queryAtivas.ilike('nome', `%${filtros.nome}%`);
      }
      if (filtros.casa_visitada) {
        const casaNormalizada = filtros.casa_visitada;
        const casaSemZero = casaNormalizada.replace(/^0/, '');
        if (casaNormalizada !== casaSemZero) {
          queryFinalizadas = queryFinalizadas.or(`casa_visitada.ilike.%${casaNormalizada}%,casa_visitada.ilike.%${casaSemZero}%`);
          queryAtivas = queryAtivas.or(`casa_visitada.ilike.%${casaNormalizada}%,casa_visitada.ilike.%${casaSemZero}%`);
        } else {
          queryFinalizadas = queryFinalizadas.ilike('casa_visitada', `%${casaNormalizada}%`);
          queryAtivas = queryAtivas.ilike('casa_visitada', `%${casaNormalizada}%`);
        }
      }
      if (filtros.placa_veiculo) {
        queryFinalizadas = queryFinalizadas.ilike('placa_veiculo', `%${filtros.placa_veiculo}%`);
        queryAtivas = queryAtivas.ilike('placa_veiculo', `%${filtros.placa_veiculo}%`);
      }
      if (filtros.excluir_observacoes?.length) {
        for (const termo of filtros.excluir_observacoes) {
          queryFinalizadas = queryFinalizadas.not('observacoes', 'ilike', `%${termo}%`);
          queryAtivas = queryAtivas.not('observacoes', 'ilike', `%${termo}%`);
        }
      }
      if (filtros.excluir_nomes?.length) {
        for (const nome of filtros.excluir_nomes) {
          queryFinalizadas = queryFinalizadas.not('nome', 'ilike', `%${nome}%`);
          queryAtivas = queryAtivas.not('nome', 'ilike', `%${nome}%`);
        }
      }
      if (filtros.excluir_placas?.length) {
        for (const placa of filtros.excluir_placas) {
          queryFinalizadas = queryFinalizadas.not('placa_veiculo', 'eq', placa.toUpperCase());
          queryAtivas = queryAtivas.not('placa_veiculo', 'eq', placa.toUpperCase());
        }
      }

      // Executar todas as queries em paralelo
      const [
        { data, error: queryError, count },
        { count: countFinalizadas },
        { count: countAtivas }
      ] = await Promise.all([
        query,
        queryFinalizadas,
        queryAtivas
      ]);

      if (queryError) throw queryError;

      const totalRegistros = count || 0;
      const totalPaginas = Math.ceil(totalRegistros / limite);

      return {
        visitantes: data as VisitanteType[] || [],
        total_registros: totalRegistros,
        total_finalizadas: countFinalizadas || 0,
        total_ativas: countAtivas || 0,
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
        total_finalizadas: 0,
        total_ativas: 0,
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

        // Top visitantes recorrentes (agrupados por placa OU nome normalizado)
        // v1.1.64: Agrupamento inteligente que unifica variações de nome (typos)
        const visitantesPorChave: { [key: string]: { 
          nome: string; 
          placa: string;
          casa_visitada: string; 
          total_visitas: number;
          nomes_variantes: Set<string>;
        } } = {};
        
        visitantes?.forEach(v => {
          // Usar placa como chave primária se disponível, senão nome normalizado
          const chave = v.placa_veiculo && v.placa_veiculo.length === 7
            ? `placa:${v.placa_veiculo}`
            : `nome:${normalizarNome(v.nome)}`;
          
          if (visitantesPorChave[chave]) {
            visitantesPorChave[chave].total_visitas++;
            visitantesPorChave[chave].nomes_variantes.add(v.nome);
          } else {
            visitantesPorChave[chave] = { 
              nome: v.nome, 
              placa: v.placa_veiculo,
              casa_visitada: v.casa_visitada, 
              total_visitas: 1,
              nomes_variantes: new Set([v.nome])
            };
          }
        });
        
        const visitantesRecorrentes = Object.values(visitantesPorChave)
          .map(v => ({
            nome: v.nome,
            casa_visitada: v.casa_visitada,
            total_visitas: v.total_visitas,
            // Indicar se há variações de nome (possíveis typos)
            variacoes: v.nomes_variantes.size > 1 ? Array.from(v.nomes_variantes) : undefined
          }))
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
      morador: data.is_morador ? { casa: data.casa_morador } : null,
      visitante: data.is_visitante ? { casa: data.casa_morador, nome: data.nome_visitante } : null,
      fonteDeteccao: data.fonte_deteccao || 'local',
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
      // v1.1.30: Silenciar erros de rede transitórios (Failed to fetch)
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (!errorMessage.includes('Failed to fetch')) {
        console.error('Erro ao buscar detecções:', err);
      }
      setError(err instanceof Error ? err.message : 'Erro ao buscar detecções');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Carregar dados iniciais
    fetchInitialData();

    // Configurar Realtime - escuta INSERT e UPDATE
    const channel = supabase
      .channel('lpr-deteccoes-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lpr_deteccoes'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            logger.log('Nova detecção recebida via Realtime:', payload.new);
            const novaDeteccao = mapDetectionData(payload.new);
            setLatestDetection(novaDeteccao);
            // v1.1.40: Deduplicação - verificar se já existe no histórico (evita duplicata com estado local)
            setDetectionHistory(prev => {
              // Verificar se já existe detecção com mesmo id OU (mesma placa + timestamp próximo)
              const isDuplicate = prev.some(det => {
                if (!det || !novaDeteccao) return false;
                // Match por ID
                if (det.id === novaDeteccao.id) return true;
                // Match por placa + timestamp (dentro de 5 segundos)
                if (det.placa === novaDeteccao.placa) {
                  const timeDiff = Math.abs(
                    new Date(det.timestamp).getTime() - new Date(novaDeteccao.timestamp).getTime()
                  );
                  if (timeDiff < 5000) return true;
                }
                return false;
              });
              
              if (isDuplicate) {
                logger.log('🔄 Realtime: Ignorando duplicata já no histórico:', novaDeteccao?.placa);
                return prev;
              }
              
              return [novaDeteccao, ...prev.slice(0, 9)];
            });
          } else if (payload.eventType === 'UPDATE') {
            logger.log('Detecção atualizada via Realtime:', payload.new);
            const atualizada = mapDetectionData(payload.new);
            // Atualizar o item no histórico
            setDetectionHistory(prev => 
              prev.map(det => det?.id === atualizada?.id ? atualizada : det)
            );
            // Se for a última detecção, atualizar também
            setLatestDetection((current: any) => 
              current?.id === atualizada?.id ? atualizada : current
            );
          }
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
