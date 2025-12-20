
-- Garantir que temos dados iniciais nas configurações
INSERT OR IGNORE INTO configuracoes_sistema (id, total_vagas_visitantes, total_prismas_magneticos, created_at, updated_at) 
VALUES (1, 10, 20, datetime('now'), datetime('now'));

-- Garantir que temos os prismas magnéticos criados baseados na configuração
INSERT OR IGNORE INTO prismas_magneticos (numero, is_em_uso, created_at, updated_at)
SELECT 
  seq.numero,
  0,
  datetime('now'),
  datetime('now')
FROM (
  WITH RECURSIVE seq(numero) AS (
    SELECT 1
    UNION ALL
    SELECT numero + 1 FROM seq 
    WHERE numero < (SELECT total_prismas_magneticos FROM configuracoes_sistema LIMIT 1)
  )
  SELECT numero FROM seq
) seq
WHERE seq.numero NOT IN (SELECT numero FROM prismas_magneticos);
