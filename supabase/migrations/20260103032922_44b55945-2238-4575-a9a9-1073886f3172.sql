-- Sincronizar detecções existentes com veículos cadastrados
-- Remove hífens da placa detectada e atualiza is_morador/casa_morador
UPDATE lpr_deteccoes d
SET 
  is_morador = true,
  casa_morador = v.casa,
  placa_detectada = REPLACE(REPLACE(d.placa_detectada, '-', ''), ' ', '')
FROM veiculos_moradores v
WHERE REPLACE(REPLACE(d.placa_detectada, '-', ''), ' ', '') = v.placa_veiculo
  AND d.is_morador = false;