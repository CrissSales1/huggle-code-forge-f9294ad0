
-- Atualizar visitantes ativos que não têm número do prisma definido
UPDATE visitantes 
SET numero_prisma = (
  SELECT numero 
  FROM prismas_magneticos 
  WHERE visitante_id = visitantes.id
)
WHERE is_ativo = 1 AND numero_prisma IS NULL;
