-- Sincronizar prismas com visitantes ativos (correção de inconsistências)
-- Primeiro: marcar como em uso os prismas que têm visitantes ativos
UPDATE prismas_magneticos pm
SET is_em_uso = true, visitante_id = v.id
FROM visitantes v
WHERE v.is_ativo = true 
  AND v.numero_prisma IS NOT NULL 
  AND pm.numero = v.numero_prisma;

-- Segundo: liberar prismas que não têm visitantes ativos
UPDATE prismas_magneticos pm
SET is_em_uso = false, visitante_id = null
WHERE NOT EXISTS (
  SELECT 1 FROM visitantes v 
  WHERE v.is_ativo = true 
    AND v.numero_prisma = pm.numero
);