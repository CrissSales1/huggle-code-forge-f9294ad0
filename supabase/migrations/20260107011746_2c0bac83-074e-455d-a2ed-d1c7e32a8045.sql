-- Adicionar colunas para visitantes na tabela lpr_deteccoes
ALTER TABLE lpr_deteccoes 
ADD COLUMN IF NOT EXISTS is_visitante BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS nome_visitante TEXT;

-- Índice para buscas por visitante
CREATE INDEX IF NOT EXISTS idx_lpr_deteccoes_visitante ON lpr_deteccoes(is_visitante) WHERE is_visitante = true;