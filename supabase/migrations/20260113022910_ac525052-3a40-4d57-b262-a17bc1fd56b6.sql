-- Drop existing permissive policies and create authenticated-only policies

-- configuracoes_sistema
DROP POLICY IF EXISTS "Allow all access to configuracoes_sistema" ON configuracoes_sistema;
CREATE POLICY "Authenticated users can access configuracoes_sistema" 
ON configuracoes_sistema 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- lpr_deteccoes
DROP POLICY IF EXISTS "Allow all access to lpr_deteccoes" ON lpr_deteccoes;
CREATE POLICY "Authenticated users can access lpr_deteccoes" 
ON lpr_deteccoes 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- prismas_magneticos
DROP POLICY IF EXISTS "Allow all access to prismas_magneticos" ON prismas_magneticos;
CREATE POLICY "Authenticated users can access prismas_magneticos" 
ON prismas_magneticos 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- veiculos_moradores
DROP POLICY IF EXISTS "Allow all access to veiculos_moradores" ON veiculos_moradores;
CREATE POLICY "Authenticated users can access veiculos_moradores" 
ON veiculos_moradores 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- visitantes
DROP POLICY IF EXISTS "Allow all access to visitantes" ON visitantes;
CREATE POLICY "Authenticated users can access visitantes" 
ON visitantes 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);