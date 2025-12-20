-- Habilitar Realtime na tabela lpr_deteccoes
ALTER TABLE lpr_deteccoes REPLICA IDENTITY FULL;

-- Adicionar à publicação realtime
ALTER PUBLICATION supabase_realtime ADD TABLE lpr_deteccoes;