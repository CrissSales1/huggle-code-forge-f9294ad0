-- Adicionar direção nas detecções LPR
ALTER TABLE lpr_deteccoes ADD COLUMN direcao TEXT DEFAULT 'entrada';

-- Adicionar status de presença nos veículos dos moradores
ALTER TABLE veiculos_moradores ADD COLUMN status_presenca TEXT DEFAULT 'desconhecido';
ALTER TABLE veiculos_moradores ADD COLUMN ultima_movimentacao TIMESTAMP WITH TIME ZONE;

-- Criar índice para busca por status
CREATE INDEX idx_veiculos_moradores_status ON veiculos_moradores(status_presenca);
CREATE INDEX idx_lpr_deteccoes_direcao ON lpr_deteccoes(direcao);