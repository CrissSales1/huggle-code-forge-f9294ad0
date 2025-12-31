ALTER TABLE configuracoes_sistema 
ADD COLUMN sensibilidade_movimento text DEFAULT 'media';

COMMENT ON COLUMN configuracoes_sistema.sensibilidade_movimento IS 
'Sensibilidade da detecção de movimento: baixa, media, alta';