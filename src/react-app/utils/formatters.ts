/**
 * Normaliza números de casa para garantir consistência (ex: "1" → "01", "CASA 5" → "CASA 05")
 * @param valor - O valor do número da casa
 * @returns O valor normalizado com zeros à esquerda para números de 1-9
 */
export function normalizarNumeroCasa(valor: string): string {
  if (!valor) return valor;
  
  const valorTrimmed = valor.trim().toUpperCase();
  
  // Se for apenas um dígito de 1-9, adiciona zero à esquerda
  if (/^[1-9]$/.test(valorTrimmed)) {
    return `0${valorTrimmed}`;
  }
  
  // Se tiver formato "CASA X", "APT X", etc. com um dígito, normaliza
  const match = valorTrimmed.match(/^(CASA|APT|APTO|APARTAMENTO|BLOCO|BL)\s*([1-9])$/i);
  if (match) {
    return `${match[1]} 0${match[2]}`;
  }
  
  // Se terminar com espaço + um dígito de 1-9, normaliza (ex: "CASA 5" → "CASA 05")
  const matchFinal = valorTrimmed.match(/^(.+\s)([1-9])$/);
  if (matchFinal) {
    return `${matchFinal[1]}0${matchFinal[2]}`;
  }
  
  return valorTrimmed;
}

/**
 * Normaliza termo de busca de casa para encontrar tanto "1" quanto "01"
 * @param termo - O termo de busca
 * @returns Termo normalizado
 */
export function normalizarBuscaCasa(termo: string): string {
  if (!termo) return termo;
  return normalizarNumeroCasa(termo);
}
