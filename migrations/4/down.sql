
-- Remover apenas os prismas que foram criados por esta migration e não estão em uso
DELETE FROM prismas_magneticos WHERE is_em_uso = 0;

-- Remover configurações se não há visitantes
DELETE FROM configuracoes_sistema WHERE NOT EXISTS (SELECT 1 FROM visitantes);
