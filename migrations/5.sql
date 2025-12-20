
INSERT OR IGNORE INTO configuracoes_sistema (total_vagas_visitantes, total_prismas_magneticos, created_at, updated_at)
VALUES (10, 20, datetime('now'), datetime('now'));

-- Inserir prismas se não existirem
INSERT OR IGNORE INTO prismas_magneticos (numero, is_em_uso, created_at, updated_at)
SELECT number, 0, datetime('now'), datetime('now')
FROM (
  WITH RECURSIVE numbers(number) AS (
    SELECT 1
    UNION ALL
    SELECT number + 1 FROM numbers WHERE number < 20
  )
  SELECT number FROM numbers
) WHERE NOT EXISTS (SELECT 1 FROM prismas_magneticos WHERE numero = number);
