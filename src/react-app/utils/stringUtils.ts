/**
 * Utilitários para manipulação e comparação de strings
 * Sistema Anti-Duplicatas v1.1.64
 */

/**
 * Calcula a distância de Levenshtein entre duas strings
 * Menor distância = strings mais similares
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Criar matriz
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Preencher matriz
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substituição
          matrix[i][j - 1] + 1,     // inserção
          matrix[i - 1][j] + 1      // deleção
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calcula a porcentagem de similaridade entre duas strings (0-100)
 * 100 = strings idênticas
 */
export function similaridade(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 100;
  
  const normalA = normalizarNome(a);
  const normalB = normalizarNome(b);
  
  if (normalA === normalB) return 100;
  
  const distancia = levenshteinDistance(normalA, normalB);
  const maxLen = Math.max(normalA.length, normalB.length);
  
  if (maxLen === 0) return 100;
  
  return Math.round((1 - distancia / maxLen) * 100);
}

/**
 * Normaliza um nome removendo acentos, espaços extras e convertendo para uppercase
 */
export function normalizarNome(nome: string): string {
  if (!nome) return '';
  
  return nome
    .toUpperCase()
    .trim()
    // Remover acentos
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remover espaços duplicados
    .replace(/\s+/g, ' ')
    // Remover caracteres especiais exceto espaço
    .replace(/[^A-Z0-9\s]/g, '');
}

/**
 * Verifica se dois nomes são similares (>= 80% de similaridade)
 */
export function nomesSimilares(nome1: string, nome2: string, threshold: number = 80): boolean {
  return similaridade(nome1, nome2) >= threshold;
}

/**
 * Encontra o nome mais frequente em uma lista de variações
 * Retorna o nome "canônico" baseado na frequência de uso
 */
export function encontrarNomeCanonical(nomes: string[]): string {
  if (!nomes.length) return '';
  
  const contagem: Record<string, number> = {};
  
  nomes.forEach(nome => {
    contagem[nome] = (contagem[nome] || 0) + 1;
  });
  
  // Retornar o nome mais frequente (mantendo formatação original)
  return Object.entries(contagem)
    .sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Agrupa visitantes por placa ou nome similar
 * Retorna uma chave única para agrupamento
 */
export function gerarChaveAgrupamento(placa?: string, nome?: string): string {
  // Se tem placa, usa placa como chave primária (mais confiável)
  if (placa && placa.length === 7) {
    return `placa:${placa.toUpperCase()}`;
  }
  
  // Senão, usa nome normalizado
  if (nome) {
    return `nome:${normalizarNome(nome)}`;
  }
  
  return '';
}

/**
 * Encontra variações de um nome em uma lista de visitantes
 */
export function encontrarVariacoesNome(
  nomeReferencia: string, 
  visitantes: Array<{ nome: string; placa_veiculo: string }>,
  threshold: number = 80
): Array<{ nome: string; placa_veiculo: string; similaridade: number }> {
  const normalRef = normalizarNome(nomeReferencia);
  
  return visitantes
    .map(v => ({
      ...v,
      similaridade: similaridade(normalRef, v.nome)
    }))
    .filter(v => v.similaridade >= threshold)
    .sort((a, b) => b.similaridade - a.similaridade);
}
