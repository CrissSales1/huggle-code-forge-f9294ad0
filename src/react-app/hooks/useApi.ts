import { useState, useEffect, useCallback } from 'react';

// Utility function for retrying failed requests
const fetchWithRetry = async (url: string, options: RequestInit = {}, maxRetries = 3) => {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        console.warn(`Tentativa ${attempt} falhou, tentando novamente em ${attempt * 1000}ms...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  
  throw lastError!;
};
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
      
      const response = await fetchWithRetry('/api/dashboard/stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Erro no fetch das estatísticas:', err);
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
      
      const response = await fetchWithRetry('/api/visitantes/ativos');
      const data = await response.json();
      setVisitantes(data);
    } catch (err) {
      console.error('Erro no fetch dos visitantes ativos:', err);
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
      
      const response = await fetchWithRetry('/api/prismas/disponiveis');
      const data = await response.json();
      setPrismas(data);
    } catch (err) {
      console.error('Erro no fetch dos prismas disponíveis:', err);
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

// Hook para ações de visitantes
export function useVisitanteActions() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cadastrarVisitante = async (data: CadastroVisitanteType): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      await fetchWithRetry('/api/visitantes', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro de conexão com o servidor');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const registrarSaida = async (id: number): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/visitantes/saida', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao registrar saída');
      }
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const editarVisitante = async (data: EditarVisitanteType): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Enviando dados para edição:', JSON.stringify(data, null, 2));
      
      const response = await fetch(`/api/visitantes/${data.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      console.log('Resposta recebida:', response.status, response.statusText);
      
      if (!response.ok) {
        let errorMessage = 'Erro ao editar visitante';
        
        try {
          const errorData = await response.json();
          console.error('Dados do erro:', errorData);
          
          // Priorizar as mensagens de erro mais específicas
          if (errorData && typeof errorData === 'object') {
            if (errorData.details && typeof errorData.details === 'string') {
              errorMessage = errorData.details;
            } else if (errorData.error && typeof errorData.error === 'string') {
              errorMessage = errorData.error;
            } else if (errorData.message && typeof errorData.message === 'string') {
              errorMessage = errorData.message;
            } else if (errorData.validation_errors && Array.isArray(errorData.validation_errors)) {
              const validationMessages = errorData.validation_errors.map((issue: any) => {
                const path = issue.path && issue.path.length > 0 ? issue.path.join('.') + ': ' : '';
                return path + (issue.message || 'erro de validação');
              });
              errorMessage = validationMessages.join('; ');
            }
          }
        } catch (parseError) {
          console.error('Erro ao fazer parse da resposta de erro:', parseError);
          errorMessage = `Erro HTTP ${response.status}: ${response.statusText}`;
        }
        
        console.error('Mensagem de erro final:', errorMessage);
        setError(errorMessage);
        return false;
      }
      
      const responseData = await response.json();
      console.log('Dados da resposta de sucesso:', responseData);
      
      return true;
    } catch (err) {
      let errorMessage = 'Erro de conexão ao editar visitante';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else {
        errorMessage = 'Erro desconhecido';
      }
      
      console.error('Erro de rede/conexão:', errorMessage);
      console.error('Objeto de erro completo:', err);
      
      setError(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const buscarVisitantes = async (termo: string): Promise<VisitanteType[]> => {
    try {
      const response = await fetch(`/api/visitantes/buscar?termo=${encodeURIComponent(termo)}`);
      if (!response.ok) {
        throw new Error('Erro ao buscar visitantes');
      }
      
      const data = await response.json();
      return data;
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
      
      const response = await fetch('/api/relatorios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(filtros),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao gerar relatório');
      }
      
      const data = await response.json();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
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
      
      const response = await fetch('/api/configuracoes');
      if (!response.ok) {
        throw new Error('Erro ao carregar configurações');
      }
      
      const data = await response.json();
      setConfiguracoes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
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
      
      const response = await fetch('/api/configuracoes', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao atualizar configurações');
      }
      
      await refetch();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const limparBancoDados = async (): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/dados', {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao limpar banco de dados');
      }
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { configuracoes, atualizarConfiguracoes, limparBancoDados, loading, error, refetch };
}

// Hook para estatísticas detalhadas
export function useEstatisticas(periodo: string) {
  const [estatisticas, setEstatisticas] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEstatisticas = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/estatisticas?periodo=${periodo}`);
        if (!response.ok) {
          throw new Error('Erro ao carregar estatísticas');
        }
        
        const data = await response.json();
        setEstatisticas(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    };

    fetchEstatisticas();
  }, [periodo]);

  return { estatisticas, loading, error };
}

// Hook para monitoramento LPR (Rekor Scout)
export function useLPRDetections() {
  const [latestDetection, setLatestDetection] = useState<any>(null);
  const [detectionHistory, setDetectionHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLatest = useCallback(async () => {
    try {
      const response = await fetch('/api/lpr/latest-detection');
      if (!response.ok) {
        throw new Error('Erro ao buscar última detecção');
      }
      const data = await response.json();
      if (data) {
        setLatestDetection(data);
      }
    } catch (err) {
      console.error('Erro ao buscar última detecção:', err);
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    }
  }, []);

  const fetchHistory = useCallback(async (limite: number = 10) => {
    try {
      const response = await fetch(`/api/lpr/detections?limite=${limite}`);
      if (!response.ok) {
        throw new Error('Erro ao buscar histórico');
      }
      const data = await response.json();
      setDetectionHistory(data);
    } catch (err) {
      console.error('Erro ao buscar histórico:', err);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([fetchLatest(), fetchHistory()]);
      setLoading(false);
    };

    fetchData();
    
    // Polling a cada 3 segundos para buscar novas detecções
    const interval = setInterval(() => {
      fetchLatest();
      fetchHistory();
    }, 3000);

    return () => clearInterval(interval);
  }, [fetchLatest, fetchHistory]);

  return { latestDetection, detectionHistory, loading, error, refetch: fetchLatest };
}
