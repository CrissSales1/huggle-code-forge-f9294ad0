/**
 * Validador e corretor de placas brasileiras
 * Suporta formato antigo (ABC-1234) e Mercosul (ABC1D23)
 */

// Caracteres que são frequentemente confundidos pelo OCR
// v1.1.38: OCR_CORRECTIONS com confusões 0↔6 adicionadas
const OCR_CORRECTIONS: Record<string, string[]> = {
  // Números → possíveis confusões
  '0': ['O', 'D', 'Q', 'C', '6'],       // v1.1.38: adicionado '6'
  '1': ['I', 'L', 'T', '7', '|'],
  '2': ['Z', '7'],
  '3': ['E', '8'],
  '4': ['A', 'H'],
  '5': ['S', '6'],
  '6': ['G', 'B', '5', '0', '9'],       // v1.1.38: adicionado '0' e '9'
  '7': ['T', 'Y', '1', '2'],
  '8': ['B', '3', '0'],                  // v1.1.38: adicionado '0'
  '9': ['G', 'Q', 'P', '6'],             // v1.1.38: adicionado '6'
  
  // Letras → possíveis confusões
  'A': ['4', 'H'],
  'B': ['8', '6', '3'],
  'C': ['0', 'G', '('],
  'D': ['0', 'O'],
  'E': ['3', 'F', 'B'],                  // v1.1.38: adicionado 'B'
  'F': ['E', 'P', 'T'],
  'G': ['6', '9', 'C', '0'],
  'H': ['4', 'N', 'M'],
  'I': ['1', 'L', 'T', '|', 'J'],   // v1.1.68: adiciona J
  'J': ['1', ']', 'I'],              // v1.1.68: adiciona I
  'L': ['1', 'I', '7'],
  'M': ['N', 'H', 'W'],
  'N': ['M', 'H'],
  'O': ['0', 'Q', 'D', 'C'],
  'P': ['9', 'R'],
  'Q': ['0', 'O', '9'],
  'R': ['P', 'K'],
  'S': ['5', '8'],
  'T': ['7', '1', 'I', 'Y'],
  'U': ['V', 'W', '0'],
  'V': ['U', 'W', 'Y'],
  'W': ['V', 'M', 'N'],
  'Y': ['V', '7', 'T'],
  'Z': ['2', '7'],
};

// v1.1.43: Mapeamento de caracteres visualmente similares (para correção agressiva)
// Inclui confusões 0↔6↔9, E↔B, 2↔7, 9↔2 para melhor matching no banco
const VISUAL_SIMILAR: Record<string, string[]> = {
  // Muito similares - altíssima confusão
  'D': ['0', 'O', 'Q'],
  'O': ['0', 'D', 'Q', '6', 'U'],        // v1.1.69: adiciona U
  '0': ['O', 'D', 'Q', '6', '8'],        // v1.1.38: adicionado '6' e '8'
  '1': ['I', 'L', '7', 'T', '|'],
  'I': ['1', 'L', '|', 'J'],         // v1.1.68: adiciona J
  '4': ['A', 'H'],
  'A': ['4', 'H'],
  '8': ['B', '3', '0'],                   // v1.1.38: adicionado '0'
  'B': ['8', '3', '6', 'E'],              // v1.1.38: adicionado 'E'
  '5': ['S', '6'],                        // v1.1.38: adicionado '6'
  'S': ['5'],
  '6': ['G', 'B', '0', '9', '5'],         // v1.1.38: adicionado '0', '9', '5'
  'G': ['6', '9', '0'],                   // v1.1.38: adicionado '0'
  '9': ['G', '6', '0', '2'],              // v1.1.43: adicionado '2' (confusão noturna)
  '2': ['Z', '7', '9'],                   // v1.1.43: adicionado '7' e '9' (confusão noturna)
  '7': ['T', '1', '2'],                   // v1.1.43: adicionado '2' (confusão fonte fina)
  'Z': ['2', '7'],                        // v1.1.43: adicionado '7'
  'E': ['3', 'B', 'F'],                   // v1.1.38: adicionado 'B' e 'F'
  // Confusões específicas do caso UFHJ -> DFJ
  'U': ['0', 'O', 'D', 'V'],
  'F': ['E', 'P', 'T'],
  'H': ['4', 'N', 'M'],
  'J': ['1', '2', '3', ']', 'I'],         // v1.1.68: adiciona I (confusão J↔I)
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
 * 
 * v1.1.52: Aceita formatHint para forçar formato específico
 *          Se formatHint='antiga', NUNCA converte para Mercosul
 */
export function correctByPosition(plate: string, formatHint?: 'antiga' | 'mercosul' | 'unknown'): string {
  const chars = plate.split('');
  
  if (chars.length !== 7) return plate;
  
  // Posições 0, 1, 2 devem ser letras
  for (let i = 0; i < 3; i++) {
    chars[i] = forceToLetter(chars[i]);
  }
  
  // Posição 3 deve ser número
  chars[3] = forceToNumber(chars[3]);
  
  // v1.1.52: Se formatHint é 'antiga', forçar formato antigo (LLL-NNNN)
  if (formatHint === 'antiga') {
    // Posições 4, 5, 6 DEVEM ser números
    chars[4] = forceToNumber(chars[4]);
    chars[5] = forceToNumber(chars[5]);
    chars[6] = forceToNumber(chars[6]);
    return chars.join('');
  }
  
  // Posições 5, 6 devem ser números
  chars[5] = forceToNumber(chars[5]);
  chars[6] = forceToNumber(chars[6]);
  
  // Posição 4: pode ser letra (Mercosul) ou número (antigo)
  // Tentamos manter como está e verificar depois
  const withLetterAt4 = [...chars];
  withLetterAt4[4] = forceToLetter(chars[4]);
  
  const withNumberAt4 = [...chars];
  withNumberAt4[4] = forceToNumber(chars[4]);
  
  const mercosulCandidate = withLetterAt4.join('');
  const oldCandidate = withNumberAt4.join('');
  
  // v1.1.52: Se o caractere original na posição 4 é claramente um número, preferir antigo
  const originalChar4 = plate[4];
  if (/[0-9]/.test(originalChar4)) {
    // Caractere original é número - preferir formato antigo primeiro
    if (isOldFormat(oldCandidate)) return oldCandidate;
    if (isMercosulFormat(mercosulCandidate)) return mercosulCandidate;
  } else {
    // Caractere original é letra - preferir Mercosul primeiro
    if (isMercosulFormat(mercosulCandidate)) return mercosulCandidate;
    if (isOldFormat(oldCandidate)) return oldCandidate;
  }
  
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
  format: 'antiga' | 'mercosul' | 'unknown';
  confidence: number;
}

/**
 * Gera variações agressivas baseadas em similaridade visual
 * v1.1.38: Exportado para uso na busca de moradores com confusões 0↔6
 */
export function generateAggressiveVariations(plate: string): string[] {
  const variations = new Set<string>();
  const chars = plate.split('');
  
  // Aplicar correção posicional como base
  const positionCorrected = correctByPosition(plate);
  variations.add(positionCorrected);
  
  // Gerar variações baseadas em confusões visuais
  // Posições 0, 1, 2: DEVEM ser letras
  for (let i = 0; i < 3; i++) {
    const original = chars[i];
    const alternatives = VISUAL_SIMILAR[original] || [];
    
    for (const alt of alternatives) {
      if (/[A-Z]/.test(alt)) {
        const variant = [...chars];
        variant[i] = alt;
        variations.add(correctByPosition(variant.join('')));
      }
    }
  }
  
  // Posição 3: DEVE ser número
  const alt3 = VISUAL_SIMILAR[chars[3]] || [];
  for (const alt of alt3) {
    if (/[0-9]/.test(alt)) {
      const variant = [...chars];
      variant[3] = alt;
      const generated = correctByPosition(variant.join(''));
      variations.add(generated);
    }
  }
  
  // Posição 4: pode ser letra (Mercosul) ou número (antigo)
  const alt4 = VISUAL_SIMILAR[chars[4]] || [];
  for (const alt of alt4) {
    const variant = [...chars];
    variant[4] = alt;
    variations.add(correctByPosition(variant.join('')));
  }
  
  // Posições 5, 6: DEVEM ser números
  for (let i = 5; i < 7; i++) {
    const alt = VISUAL_SIMILAR[chars[i]] || [];
    for (const a of alt) {
      if (/[0-9]/.test(a)) {
        const variant = [...chars];
        variant[i] = a;
        variations.add(correctByPosition(variant.join('')));
      }
    }
  }
  
  return Array.from(variations);
}

/**
 * Conta quantos caracteres foram alterados entre duas strings
 */
function countChanges(original: string, corrected: string): number {
  let changes = 0;
  for (let i = 0; i < Math.min(original.length, corrected.length); i++) {
    if (original[i] !== corrected[i]) changes++;
  }
  return changes;
}

/**
 * Valida e corrige uma placa
 * v1.1.52: Aceita formatHint para respeitar formato detectado pelo hífen
 */
export function validateAndCorrectPlate(rawPlate: string, formatHint?: 'antiga' | 'mercosul' | 'unknown'): PlateValidationResult {
  const cleaned = cleanPlateString(rawPlate);
  
  // Se já é válida, retornar diretamente
  // v1.1.52: Se formatHint é 'antiga', respeitar mesmo que também seja Mercosul válido
  if (isValidPlate(cleaned)) {
    const isActuallyOld = isOldFormat(cleaned);
    const format = formatHint === 'antiga' ? 'antiga' : (isActuallyOld ? 'antiga' : 'mercosul');
    return {
      isValid: true,
      original: rawPlate,
      corrected: cleaned,
      formatted: formatPlateForDisplay(cleaned),
      format,
      confidence: 1.0,
    };
  }
  
  // NOVO: Se tem 8 caracteres, testar sem o primeiro (ruído comum)
  if (cleaned.length === 8) {
    const withoutFirst = cleaned.slice(1);
    if (isValidPlate(withoutFirst)) {
      return {
        isValid: true,
        original: rawPlate,
        corrected: withoutFirst,
        formatted: formatPlateForDisplay(withoutFirst),
        format: isOldFormat(withoutFirst) ? 'antiga' : 'mercosul',
        confidence: 0.7,
      };
    }
    
    // Tentar correção posicional no substring
    const correctedWithoutFirst = correctByPosition(withoutFirst);
    if (isValidPlate(correctedWithoutFirst)) {
      return {
        isValid: true,
        original: rawPlate,
        corrected: correctedWithoutFirst,
        formatted: formatPlateForDisplay(correctedWithoutFirst),
        format: isOldFormat(correctedWithoutFirst) ? 'antiga' : 'mercosul',
        confidence: 0.6,
      };
    }
  }
  
  // Tentar corrigir com 7 caracteres
  if (cleaned.length === 7) {
    const corrected = correctByPosition(cleaned);
    
    if (isValidPlate(corrected)) {
      const changes = countChanges(cleaned, corrected);
      const confidence = 1 - (changes * 0.15);
      
      return {
        isValid: true,
        original: rawPlate,
        corrected,
        formatted: formatPlateForDisplay(corrected),
        format: isOldFormat(corrected) ? 'antiga' : 'mercosul',
        confidence: Math.max(0.4, confidence),
      };
    }
    
    // NOVO: Se correção por posição falhou, tentar variações agressivas
    const variations = generateAggressiveVariations(cleaned);
    for (const variant of variations) {
      if (isValidPlate(variant)) {
        const changes = countChanges(cleaned, variant);
        const confidence = 1 - (changes * 0.12);
        
        return {
          isValid: true,
          original: rawPlate,
          corrected: variant,
          formatted: formatPlateForDisplay(variant),
          format: isOldFormat(variant) ? 'antiga' : 'mercosul',
          confidence: Math.max(0.35, confidence),
        };
      }
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
