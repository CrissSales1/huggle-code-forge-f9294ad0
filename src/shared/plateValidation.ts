/**
 * Módulo canônico de validação de placas brasileiras
 * Centraliza toda lógica de validação, correção e variação
 * Zero dependências de browser (sem DOM, ImageData, Canvas)
 * 
 * v1.2.0: Grid Thresholding — fonte única de verdade
 */

// ============ INTERFACE ============

export interface PlateValidationResult {
  isValid: boolean;
  original: string;
  corrected: string;
  formatted: string;
  format: 'antiga' | 'mercosul' | 'unknown';
  confidence: number;
}

// ============ CONSTANTES E REGEX ============

export const MERCOSUL_REGEX = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;
export const ANTIGA_REGEX = /^[A-Z]{3}[0-9]{4}$/;

export const FORBIDDEN_WORDS = [
  'ENTRADA', 'SAIDA', 'VEICULO', 'VEICULOS', 'CAMERA', 'PORTARIA',
  'ESTACIONAMENTO', 'CONDOMINIO', 'RESIDENCIAL', 'COMERCIAL', 'GARAGEM',
  'PORTAO', 'ACESSO', 'VISITANTE', 'VISITANTES', 'MORADOR', 'MORADORES',
  'PROIBIDO', 'PERMITIDO', 'VELOCIDADE', 'PARE', 'ATENCAO', 'CUIDADO',
  'NTVEICU', 'NTVEICULOS', 'ENTVEICULOS', 'SAIDAVEICULOS'
];

// ============ TABELAS CANÔNICAS UNIFICADAS ============

/**
 * Merge canônico das tabelas de substituição OCR
 * Base: plateValidator (mais completo) + adições do worker
 */
export const CHAR_SUBSTITUTIONS: Record<string, string[]> = {
  // Números → possíveis confusões
  '0': ['O', 'D', 'Q', 'C', '6'],
  '1': ['I', 'L', 'T', '7', '|'],
  '2': ['Z', '7'],
  '3': ['E', '8'],
  '4': ['A', 'H'],
  '5': ['S', '6'],
  '6': ['G', 'B', '5', '0', '9'],
  '7': ['T', 'Y', '1', '2'],
  '8': ['B', '3', '0'],
  '9': ['G', 'Q', 'P', '6'],
  // Letras → possíveis confusões
  'A': ['4', 'H'],
  'B': ['8', '6', '3', 'D'],
  'C': ['0', 'G', '('],
  'D': ['0', 'O', 'B', 'I'],
  'E': ['3', 'F', 'B'],
  'F': ['E', 'P', 'T'],
  'G': ['6', '9', 'C', '0'],
  'H': ['4', 'N', 'M', 'W'],
  'I': ['1', 'L', 'T', '|', 'J', 'D'],
  'J': ['1', ']', 'I'],
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
  'W': ['V', 'M', 'N', 'H'],
  'Y': ['V', '7', 'T'],
  'Z': ['2', '7'],
};

/**
 * Mapeamento de caracteres visualmente similares (para correção agressiva)
 */
export const VISUAL_SIMILAR: Record<string, string[]> = {
  'D': ['0', 'O', 'Q', 'B', 'I'],
  'O': ['0', 'D', 'Q', '6', 'U'],
  '0': ['O', 'D', 'Q', '6', '8'],
  '1': ['I', 'L', '7', 'T', '|'],
  'I': ['1', 'L', '|', 'J', 'D'],
  '4': ['A', 'H'],
  'A': ['4', 'H'],
  '8': ['B', '3', '0'],
  'B': ['8', '3', '6', 'E', 'D'],
  '5': ['S', '6'],
  'S': ['5'],
  '6': ['G', 'B', '0', '9', '5'],
  'G': ['6', '9', '0'],
  '9': ['G', '6', '0', '2'],
  '2': ['Z', '7', '9'],
  '7': ['T', '1', '2'],
  'Z': ['2', '7'],
  'E': ['3', 'B', 'F'],
  'U': ['0', 'O', 'D', 'V'],
  'V': ['U', 'W', 'Y'],
  'Y': ['V', '7', 'T'],
  'F': ['E', 'P', 'T'],
  'H': ['4', 'N', 'M', 'W'],
  'W': ['V', 'M', 'N', 'H'],
  'J': ['1', '2', '3', ']', 'I'],
};

// ============ FUNÇÕES DE LIMPEZA E FORMATAÇÃO ============

export function cleanPlateString(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

export function isOldFormat(plate: string): boolean {
  return ANTIGA_REGEX.test(plate);
}

export function isMercosulFormat(plate: string): boolean {
  return MERCOSUL_REGEX.test(plate);
}

export function isValidPlate(plate: string): boolean {
  const cleaned = cleanPlateString(plate);
  return cleaned.length === 7 && (isOldFormat(cleaned) || isMercosulFormat(cleaned));
}

export function formatPlateForDisplay(plate: string): string {
  const cleaned = cleanPlateString(plate);
  if (isOldFormat(cleaned)) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  }
  return cleaned;
}

export function isForbiddenText(rawText: string): boolean {
  if (!rawText || rawText.length < 3) return false;
  
  const upperText = rawText.toUpperCase().replace(/[^A-Z]/g, '');
  
  for (const word of FORBIDDEN_WORDS) {
    if (upperText.includes(word) || word.includes(upperText)) {
      console.log(`🚫 OCR: Texto proibido detectado, ignorando: "${rawText}" (match: ${word})`);
      return true;
    }
  }
  
  if (upperText.length > 10) {
    console.log(`🚫 OCR: Texto muito longo para ser placa, ignorando: "${rawText}" (${upperText.length} chars)`);
    return true;
  }
  
  return false;
}

// ============ FUNÇÕES DE CORREÇÃO POSICIONAL ============

export function forceToLetter(char: string): string {
  if (/[A-Z]/.test(char)) return char;
  
  const numberToLetter: Record<string, string> = {
    '0': 'O', '1': 'I', '2': 'Z', '3': 'E', '4': 'A',
    '5': 'S', '6': 'G', '7': 'T', '8': 'B', '9': 'G',
  };
  
  return numberToLetter[char] || char;
}

export function forceToNumber(char: string): string {
  if (/[0-9]/.test(char)) return char;
  
  const letterToNumber: Record<string, string> = {
    'O': '0', 'D': '0', 'Q': '0', 'I': '1', 'L': '1',
    'Z': '2', 'E': '3', 'A': '4', 'S': '5', 'G': '6',
    'B': '8', 'T': '7',
  };
  
  return letterToNumber[char] || char;
}

export function correctByPosition(plate: string, formatHint?: 'antiga' | 'mercosul' | 'unknown'): string {
  const chars = plate.split('');
  if (chars.length !== 7) return plate;
  
  // Posições 0, 1, 2 devem ser letras
  for (let i = 0; i < 3; i++) {
    chars[i] = forceToLetter(chars[i]);
  }
  
  // Posição 3 deve ser número
  chars[3] = forceToNumber(chars[3]);
  
  if (formatHint === 'antiga') {
    chars[4] = forceToNumber(chars[4]);
    chars[5] = forceToNumber(chars[5]);
    chars[6] = forceToNumber(chars[6]);
    return chars.join('');
  }
  
  // Posições 5, 6 devem ser números
  chars[5] = forceToNumber(chars[5]);
  chars[6] = forceToNumber(chars[6]);
  
  // Posição 4: pode ser letra (Mercosul) ou número (antigo)
  const withLetterAt4 = [...chars];
  withLetterAt4[4] = forceToLetter(chars[4]);
  
  const withNumberAt4 = [...chars];
  withNumberAt4[4] = forceToNumber(chars[4]);
  
  const mercosulCandidate = withLetterAt4.join('');
  const oldCandidate = withNumberAt4.join('');
  
  const originalChar4 = plate[4];
  if (/[0-9]/.test(originalChar4)) {
    if (isOldFormat(oldCandidate)) return oldCandidate;
    if (isMercosulFormat(mercosulCandidate)) return mercosulCandidate;
  } else {
    if (isMercosulFormat(mercosulCandidate)) return mercosulCandidate;
    if (isOldFormat(oldCandidate)) return oldCandidate;
  }
  
  return chars.join('');
}

// ============ HEURÍSTICA (do worker, 154 linhas) ============

/**
 * Correção Heurística de Homoglifos para placas brasileiras
 * Corrige confusões de caracteres baseado na posição (formato BR)
 * Limpa ruído e garante máximo 7 caracteres
 * 
 * Detecta formato pelo hífen/traço ANTES de limpar
 * Se hífen detectado → Formato ANTIGO forçado (LLL-NNNN)
 */
export function heuristicCorrection(text: string): { text: string; detectedFormat: 'antiga' | 'mercosul' | 'unknown' } {
  // Detectar formato pelo hífen/ponto ANTES de limpar
  const hasSeparator = /[-.\•–—·]/.test(text);
  const detectedFormat: 'antiga' | 'mercosul' | 'unknown' = hasSeparator ? 'antiga' : 'unknown';
  
  // 1. Limpeza básica
  let clean = text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  
  // 2. Remoção de ruído de borda
  if (clean.length > 7) {
    const withoutFirst = clean.substring(1);
    if (/^[A-Z]{3}/.test(withoutFirst)) {
      clean = withoutFirst;
    }
  }
  
  clean = clean.substring(0, 7);
  
  if (clean.length < 3) return { text: clean, detectedFormat };
  
  // 3. Mapeamentos de correção (Homoglifos)
  const numToLetter: Record<string, string> = {
    '0': 'O', '1': 'I', '2': 'Z', '3': 'J', '4': 'A', '5': 'S', '6': 'G', '7': 'T', '8': 'B', '9': 'G'
  };
  
  const letterToNum: Record<string, string> = {
    'O': '0', 'I': '1', 'Z': '2', 'J': '3', 'A': '4', 'S': '5', 'G': '6', 'T': '7', 'B': '8', 'D': '0', 'Q': '0'
  };
  
  const letterToNumPos3: Record<string, string> = {
    'O': '0', 'I': '1', 'L': '1',
    'A': '1',
    'Z': '2', 'J': '3', 'S': '5',
    'G': '6', 'T': '7', 'B': '8', 'D': '0', 'Q': '0'
  };
  
  const numToNum: Record<string, string[]> = {
    '2': ['7', '9'],
    '7': ['2', '1'],
    '9': ['2', '6', '0'],
    '6': ['9', '0', '8'],
    '0': ['6', '8', '9'],
    '1': ['7', '4'],
    '5': ['6', '8'],
    '8': ['0', '6'],
    '4': ['1', 'A'],
  };
  
  const numToLetterPos4: Record<string, string> = {
    '0': 'D', '1': 'I', '2': 'J', '3': 'J', '6': 'G', '8': 'B', '9': 'G'
  };
  
  const chars = clean.split('');
  
  // 4. Correção baseada na posição
  
  // Posições 0, 1, 2: SEMPRE letras
  for (let i = 0; i < 3 && i < chars.length; i++) {
    if (/[0-9]/.test(chars[i]) && numToLetter[chars[i]]) {
      chars[i] = numToLetter[chars[i]];
    }
  }
  
  // Posição 3: SEMPRE número
  if (chars.length > 3 && /[A-Z]/.test(chars[3]) && letterToNumPos3[chars[3]]) {
    chars[3] = letterToNumPos3[chars[3]];
  }
  
  // Posição 4: Detecção inteligente Mercosul vs Antiga
  if (chars.length > 4) {
    const char4 = chars[4];
    
    if (detectedFormat === 'antiga') {
      if (/[A-Z]/.test(char4) && letterToNum[char4]) {
        chars[4] = letterToNum[char4];
      }
    } else if (/[0-9]/.test(char4)) {
      if (numToLetterPos4[char4]) {
        const testMercosul = [...chars];
        testMercosul[4] = numToLetterPos4[char4];
        const testStr = testMercosul.join('');
        
        if (MERCOSUL_REGEX.test(testStr)) {
          chars[4] = numToLetterPos4[char4];
        }
      }
    }
  }
  
  // Posições 5, 6: SEMPRE números
  for (let i = 5; i <= 6 && i < chars.length; i++) {
    if (/[A-Z]/.test(chars[i]) && letterToNum[chars[i]]) {
      chars[i] = letterToNum[chars[i]];
    }
  }
  
  // Correção de confusões numéricas
  const currentResult = chars.join('');
  const isMercosul = MERCOSUL_REGEX.test(currentResult);
  const isAntiga = ANTIGA_REGEX.test(currentResult);
  
  if (isMercosul || isAntiga) {
    const finalFormat = detectedFormat === 'antiga' ? 'antiga' : (isAntiga ? 'antiga' : 'mercosul');
    return { text: currentResult, detectedFormat: finalFormat };
  }
  
  // Tentar correções de confusão numérica nas posições de números
  const numPositions = [3, 5, 6];
  for (const pos of numPositions) {
    if (pos < chars.length && /[0-9]/.test(chars[pos])) {
      const alternatives = numToNum[chars[pos]];
      if (alternatives) {
        for (const alt of alternatives) {
          const testChars = [...chars];
          testChars[pos] = alt;
          const testStr = testChars.join('');
          
          if (MERCOSUL_REGEX.test(testStr) || ANTIGA_REGEX.test(testStr)) {
            chars[pos] = alt;
            break;
          }
        }
      }
    }
  }
  
  const finalResult = chars.join('');
  const finalIsMercosul = MERCOSUL_REGEX.test(finalResult);
  const finalIsAntiga = ANTIGA_REGEX.test(finalResult);
  const finalFormat = detectedFormat === 'antiga' ? 'antiga' : (finalIsAntiga ? 'antiga' : (finalIsMercosul ? 'mercosul' : 'unknown'));
  
  return { text: finalResult, detectedFormat: finalFormat };
}

// ============ VALIDAÇÃO DE FORMATO ============

export function validatePlateFormat(plate: string): { isValid: boolean; format: 'mercosul' | 'antiga' | 'unknown' } {
  if (plate.length !== 7) {
    return { isValid: false, format: 'unknown' };
  }
  
  if (MERCOSUL_REGEX.test(plate)) {
    return { isValid: true, format: 'mercosul' };
  }
  
  if (ANTIGA_REGEX.test(plate)) {
    return { isValid: true, format: 'antiga' };
  }
  
  return { isValid: false, format: 'unknown' };
}

// ============ VARIAÇÕES ============

export function generateVariations(plate: string): string[] {
  const variations = new Set<string>();
  variations.add(plate);
  
  const chars = plate.split('');
  
  for (let i = 0; i < chars.length; i++) {
    const corrections = CHAR_SUBSTITUTIONS[chars[i]];
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

export function generateAggressiveVariations(plate: string): string[] {
  const variations = new Set<string>();
  const chars = plate.split('');
  
  const positionCorrected = correctByPosition(plate);
  variations.add(positionCorrected);
  
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
      variations.add(correctByPosition(variant.join('')));
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
  
  // Variações com substituição dupla
  const dualVariations = generateDualVariations(plate);
  for (const v of dualVariations) {
    variations.add(v);
  }
  
  return Array.from(variations);
}

export function generateDualVariations(plate: string): string[] {
  const variations = new Set<string>();
  const chars = plate.split('');
  
  for (let i = 0; i < 7; i++) {
    const altsI = VISUAL_SIMILAR[chars[i]] || [];
    for (let j = i + 1; j < 7 && j <= i + 2; j++) {
      const altsJ = VISUAL_SIMILAR[chars[j]] || [];
      for (const ai of altsI) {
        for (const aj of altsJ) {
          const variant = [...chars];
          variant[i] = ai;
          variant[j] = aj;
          const corrected = correctByPosition(variant.join(''));
          if (isValidPlate(corrected)) {
            variations.add(corrected);
          }
        }
      }
    }
  }
  
  return Array.from(variations);
}

// ============ EXTRAÇÃO DE CANDIDATOS ============

export function extractPlateCandidate(rawText: string): string {
  const cleaned = rawText.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  if (cleaned.length === 7) return cleaned;
  if (cleaned.length < 7) return cleaned;
  
  let candidate = cleaned;
  
  while (candidate.length > 7 && (candidate[0] === 'I' || candidate[0] === '1')) {
    candidate = candidate.slice(1);
  }
  while (candidate.length > 7 && (candidate.slice(-1) === 'I' || candidate.slice(-1) === '1' || candidate.slice(-1) === 'E')) {
    candidate = candidate.slice(0, -1);
  }
  
  if (candidate.length === 7) {
    const tempValidation = validatePlateFormat(candidate);
    if (tempValidation.isValid) return candidate;
  }
  
  if (candidate.length > 7) {
    const candidates: string[] = [];
    for (let i = 0; i <= candidate.length - 7; i++) {
      candidates.push(candidate.slice(i, i + 7));
    }
    
    for (let i = 0; i <= cleaned.length - 7; i++) {
      candidates.push(cleaned.slice(i, i + 7));
    }
    
    for (const c of candidates) {
      const tempValidation = validatePlateFormat(c);
      if (tempValidation.isValid) return c;
    }
    
    for (const c of candidates) {
      const variations = generateVariations(c);
      for (const v of variations) {
        const tempValidation = validatePlateFormat(v);
        if (tempValidation.isValid) return v;
      }
    }
    
    return candidate.slice(0, 7);
  }
  
  return candidate;
}

// ============ RANKING DE CANDIDATOS ============

export function rankCandidates(
  candidates: Array<{ text: string; confidence: number; format: string }>
): Array<{ text: string; confidence: number; format: string; corrected: string }> {
  const ranked: Array<{ text: string; confidence: number; format: string; corrected: string }> = [];
  const seen = new Set<string>();
  
  for (const candidate of candidates) {
    const cleaned = cleanPlateString(candidate.text);
    if (cleaned.length !== 7) continue;
    if (seen.has(cleaned)) continue;
    
    if (isValidPlate(cleaned)) {
      seen.add(cleaned);
      ranked.push({ ...candidate, corrected: cleaned });
      continue;
    }
    
    const corrected = correctByPosition(cleaned);
    if (isValidPlate(corrected) && !seen.has(corrected)) {
      seen.add(corrected);
      ranked.push({ ...candidate, corrected, confidence: candidate.confidence * 0.9 });
    }
  }
  
  ranked.sort((a, b) => b.confidence - a.confidence);
  return ranked;
}

// ============ VALIDAÇÃO PRINCIPAL ============

function countChanges(original: string, corrected: string): number {
  let changes = 0;
  for (let i = 0; i < Math.min(original.length, corrected.length); i++) {
    if (original[i] !== corrected[i]) changes++;
  }
  return changes;
}

/**
 * Valida e corrige uma placa
 * Aceita formatHint para respeitar formato detectado pelo hífen
 */
export function validateAndCorrectPlate(rawPlate: string, formatHint?: 'antiga' | 'mercosul' | 'unknown'): PlateValidationResult {
  const cleaned = cleanPlateString(rawPlate);
  
  // Se já é válida, retornar diretamente
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
  
  // Se tem 8 caracteres, testar sem o primeiro (ruído comum)
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
    
    // Variações agressivas
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
