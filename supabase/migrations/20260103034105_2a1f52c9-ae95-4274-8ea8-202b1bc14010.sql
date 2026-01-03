-- Função para normalizar placas (remove hífens, espaços e converte para maiúsculas)
CREATE OR REPLACE FUNCTION normalize_plate()
RETURNS TRIGGER AS $$
BEGIN
  NEW.placa_detectada = UPPER(REGEXP_REPLACE(NEW.placa_detectada, '[-\s]', '', 'g'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger para normalizar automaticamente placas em lpr_deteccoes
DROP TRIGGER IF EXISTS trigger_normalize_plate_deteccoes ON lpr_deteccoes;
CREATE TRIGGER trigger_normalize_plate_deteccoes
  BEFORE INSERT OR UPDATE ON lpr_deteccoes
  FOR EACH ROW
  EXECUTE FUNCTION normalize_plate();