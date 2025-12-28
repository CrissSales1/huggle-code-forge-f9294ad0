/**
 * Validador e corretor de placas brasileiras
 * Suporta formato antigo (ABC-1234) e Mercosul (ABC1D23)
 */

// Caracteres que são frequentemente confundidos pelo OCR
const OCR_CORRECTIONS: Record<string, string[]> = {
  '0': ['O', 'D', 'Q'],
  '1': ['I', 'L', 'T'],
  '2': ['Z'],
  '3': ['E'],
  '4': ['A'],
  '5': ['S'],
  '6': ['G', 'B'],
  '7': ['T', 'Y'],
  '8': ['B'],
  '9': ['G', 'Q'],
  'A': ['4'],
  'B': ['8', '6'],
  'D': ['0'],
  'E': ['3'],
  'G': ['6', '9'],
  'I': ['1', 'L'],
  'L': ['1', 'I'],
  'O': ['0', 'Q', 'D'],
  'Q': ['0', 'O'],
  'S': ['5'],
  'T': ['7', '1'],
  'Z': ['2'],
};

/**
 * Limpa a string da placa, removendo caracteres inválidos
 */
export function cleanPlateString(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

/**
 * Verifica se é formato antigo: ABC1234 (3 letras + 4 números)
 */
export function isOldFormat(plate: string): boolean {
  return /^[A-Z]{3}[0-9]{4}$/.test(plate);
}

/**
 * Verifica se é formato Mercosul: ABC1D23 (3 letras + número + letra + 2 números)
 */
export function isMercosulFormat(plate: string): boolean {
  return /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/.test(plate);
}

/**
 * Verifica se a placa tem formato válido
 */
export function isValidPlate(plate: string): boolean {
  const cleaned = cleanPlateString(plate);
  return cleaned.length === 7 && (isOldFormat(cleaned) || isMercosulFormat(cleaned));
}

/**
 * Tenta corrigir caracteres baseado na posição esperada
 * Formato antigo: L L L N N N N (L=letra, N=número)
 * Formato Mercosul: L L L N L N N
 */
export function correctByPosition(plate: string): string {
  const chars = plate.split('');
  
  if (chars.length !== 7) return plate;
  
  // Posições 0, 1, 2 devem ser letras
  for (let i = 0; i < 3; i++) {
    chars[i] = forceToLetter(chars[i]);
  }
  
  // Posição 3 deve ser número
  chars[3] = forceToNumber(chars[3]);
  
  // Posição 4: pode ser letra (Mercosul) ou número (antigo)
  // Tentamos manter como está e verificar depois
  
  // Posições 5, 6 devem ser números
  chars[5] = forceToNumber(chars[5]);
  chars[6] = forceToNumber(chars[6]);
  
  // Verificar posição 4
  const withLetterAt4 = [...chars];
  withLetterAt4[4] = forceToLetter(chars[4]);
  
  const withNumberAt4 = [...chars];
  withNumberAt4[4] = forceToNumber(chars[4]);
  
  const mercosulCandidate = withLetterAt4.join('');
  const oldCandidate = withNumberAt4.join('');
  
  // Preferir Mercosul se válido, senão antigo
  if (isMercosulFormat(mercosulCandidate)) return mercosulCandidate;
  if (isOldFormat(oldCandidate)) return oldCandidate;
  
  // Retornar o que parecer mais correto
  return chars.join('');
}

/**
 * Força um caractere a ser letra
 */
function forceToLetter(char: string): string {
  if (/[A-Z]/.test(char)) return char;
  
  // Conversões comuns de número para letra
  const numberToLetter: Record<string, string> = {
    '0': 'O',
    '1': 'I',
    '2': 'Z',
    '3': 'E',
    '4': 'A',
    '5': 'S',
    '6': 'G',
    '7': 'T',
    '8': 'B',
    '9': 'G',
  };
  
  return numberToLetter[char] || char;
}

/**
 * Força um caractere a ser número
 */
function forceToNumber(char: string): string {
  if (/[0-9]/.test(char)) return char;
  
  // Conversões comuns de letra para número
  const letterToNumber: Record<string, string> = {
    'O': '0',
    'D': '0',
    'Q': '0',
    'I': '1',
    'L': '1',
    'Z': '2',
    'E': '3',
    'A': '4',
    'S': '5',
    'G': '6',
    'B': '8',
    'T': '7',
  };
  
  return letterToNumber[char] || char;
}

/**
 * Gera variações possíveis da placa para matching fuzzy
 */
export function generateVariations(plate: string): string[] {
  const variations = new Set<string>();
  variations.add(plate);
  
  const chars = plate.split('');
  
  // Gerar variações substituindo caracteres confundíveis
  for (let i = 0; i < chars.length; i++) {
    const corrections = OCR_CORRECTIONS[chars[i]];
    if (corrections) {
      for (const correction of corrections) {
        const variant = [...chars];
        variant[i] = correction;
        variations.add(variant.join(''));
      }
    }
  }
  
  return Array.from(variations);
}

/**
 * Formata a placa para exibição (ABC-1234 ou ABC1D23)
 */
export function formatPlateForDisplay(plate: string): string {
  const cleaned = cleanPlateString(plate);
  
  if (isOldFormat(cleaned)) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  }
  
  return cleaned;
}

/**
 * Resultado da validação de placa
 */
export interface PlateValidationResult {
  isValid: boolean;
  original: string;
  corrected: string;
  formatted: string;
  format: 'old' | 'mercosul' | 'unknown';
  confidence: number;
}

/**
 * Valida e corrige uma placa
 */
export function validateAndCorrectPlate(rawPlate: string): PlateValidationResult {
  const cleaned = cleanPlateString(rawPlate);
  
  // Se já é válida, retornar diretamente
  if (isValidPlate(cleaned)) {
    return {
      isValid: true,
      original: rawPlate,
      corrected: cleaned,
      formatted: formatPlateForDisplay(cleaned),
      format: isOldFormat(cleaned) ? 'old' : 'mercosul',
      confidence: 1.0,
    };
  }
  
  // Tentar corrigir
  if (cleaned.length === 7) {
    const corrected = correctByPosition(cleaned);
    
    if (isValidPlate(corrected)) {
      // Calcular confiança baseada em quantos caracteres foram alterados
      let changes = 0;
      for (let i = 0; i < 7; i++) {
        if (cleaned[i] !== corrected[i]) changes++;
      }
      const confidence = 1 - (changes * 0.15); // -15% por caractere alterado
      
      return {
        isValid: true,
        original: rawPlate,
        corrected,
        formatted: formatPlateForDisplay(corrected),
        format: isOldFormat(corrected) ? 'old' : 'mercosul',
        confidence: Math.max(0.4, confidence),
      };
    }
  }
  
  // Não foi possível validar
  return {
    isValid: false,
    original: rawPlate,
    corrected: cleaned,
    formatted: cleaned,
    format: 'unknown',
    confidence: 0,
  };
}
