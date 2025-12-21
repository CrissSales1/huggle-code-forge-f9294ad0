-- Adicionar coluna para tempo de deduplicação configurável
ALTER TABLE public.configuracoes_sistema 
ADD COLUMN tempo_deduplicacao_segundos integer NOT NULL DEFAULT 30;