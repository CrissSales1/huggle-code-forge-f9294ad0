-- Normalizar números de casa existentes (1-9 → 01-09)

-- Corrigir visitantes com casa_visitada sendo apenas um dígito
UPDATE visitantes 
SET casa_visitada = LPAD(casa_visitada, 2, '0')
WHERE casa_visitada ~ '^[1-9]$';

-- Corrigir veículos de moradores com casa sendo apenas um dígito  
UPDATE veiculos_moradores 
SET casa = LPAD(casa, 2, '0')
WHERE casa ~ '^[1-9]$';