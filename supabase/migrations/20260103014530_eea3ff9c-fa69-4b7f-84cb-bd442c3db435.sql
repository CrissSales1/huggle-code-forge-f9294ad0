-- Atualizar todas as detecções existentes que correspondem a veículos cadastrados
UPDATE lpr_deteccoes d
SET 
  is_morador = true,
  casa_morador = v.casa
FROM veiculos_moradores v
WHERE d.placa_detectada = v.placa_veiculo
  AND d.is_morador = false;