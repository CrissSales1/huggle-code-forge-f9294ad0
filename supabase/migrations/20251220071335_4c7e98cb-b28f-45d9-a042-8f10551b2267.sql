-- Remover políticas RESTRICTIVE existentes e recriar como PERMISSIVE

-- configuracoes_sistema
DROP POLICY IF EXISTS "Allow all access to configuracoes_sistema" ON configuracoes_sistema;
CREATE POLICY "Allow all access to configuracoes_sistema" 
ON configuracoes_sistema FOR ALL 
USING (true) 
WITH CHECK (true);

-- lpr_deteccoes
DROP POLICY IF EXISTS "Allow all access to lpr_deteccoes" ON lpr_deteccoes;
CREATE POLICY "Allow all access to lpr_deteccoes" 
ON lpr_deteccoes FOR ALL 
USING (true) 
WITH CHECK (true);

-- prismas_magneticos
DROP POLICY IF EXISTS "Allow all access to prismas_magneticos" ON prismas_magneticos;
CREATE POLICY "Allow all access to prismas_magneticos" 
ON prismas_magneticos FOR ALL 
USING (true) 
WITH CHECK (true);

-- veiculos_moradores
DROP POLICY IF EXISTS "Allow all access to veiculos_moradores" ON veiculos_moradores;
CREATE POLICY "Allow all access to veiculos_moradores" 
ON veiculos_moradores FOR ALL 
USING (true) 
WITH CHECK (true);

-- visitantes
DROP POLICY IF EXISTS "Allow all access to visitantes" ON visitantes;
CREATE POLICY "Allow all access to visitantes" 
ON visitantes FOR ALL 
USING (true) 
WITH CHECK (true);