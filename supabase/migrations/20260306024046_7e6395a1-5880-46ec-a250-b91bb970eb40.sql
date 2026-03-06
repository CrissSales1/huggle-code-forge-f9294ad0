-- Índices para acelerar fuzzy matching IN()
CREATE INDEX IF NOT EXISTS idx_veiculos_moradores_placa ON veiculos_moradores(placa_veiculo);
CREATE INDEX IF NOT EXISTS idx_visitantes_placa ON visitantes(placa_veiculo);
-- Partial index para visitantes ativos
CREATE INDEX IF NOT EXISTS idx_visitantes_ativo ON visitantes(is_ativo) WHERE is_ativo = true;