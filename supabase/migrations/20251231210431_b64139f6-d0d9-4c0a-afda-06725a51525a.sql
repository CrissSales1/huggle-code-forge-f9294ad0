ALTER TABLE lpr_deteccoes 
ADD COLUMN fonte_deteccao text DEFAULT 'local';

COMMENT ON COLUMN lpr_deteccoes.fonte_deteccao IS 'Fonte da detecção: local (Tesseract.js) ou api (Plate Recognizer)';