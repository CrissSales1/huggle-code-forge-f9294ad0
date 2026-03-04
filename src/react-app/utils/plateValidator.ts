/**
 * Re-export do módulo canônico de validação de placas
 * Mantém compatibilidade com imports existentes
 * v1.2.0: Pipeline Unificado + Grid Thresholding
 */
export {
  cleanPlateString,
  isOldFormat,
  isMercosulFormat,
  isValidPlate,
  formatPlateForDisplay,
  validateAndCorrectPlate,
  correctByPosition,
  forceToLetter,
  forceToNumber,
  generateVariations,
  generateAggressiveVariations,
  generateDualVariations,
  rankCandidates,
  heuristicCorrection,
  isForbiddenText,
  extractPlateCandidate,
  validatePlateFormat,
  MERCOSUL_REGEX,
  ANTIGA_REGEX,
  CHAR_SUBSTITUTIONS,
  VISUAL_SIMILAR,
  FORBIDDEN_WORDS,
  type PlateValidationResult,
} from '../../shared/plateValidation';
