-- Tabela de visitantes
CREATE TABLE visitantes (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  casa_visitada TEXT NOT NULL,
  placa_veiculo TEXT NOT NULL,
  numero_prisma INTEGER,
  estacionar_vaga_morador BOOLEAN DEFAULT false,
  hora_entrada TIMESTAMPTZ NOT NULL,
  hora_saida TIMESTAMPTZ,
  is_ativo BOOLEAN DEFAULT true,
  observacoes TEXT,
  liberado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de configurações do sistema
CREATE TABLE configuracoes_sistema (
  id BIGSERIAL PRIMARY KEY,
  total_vagas_visitantes INTEGER NOT NULL DEFAULT 10,
  total_prismas_magneticos INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de prismas magnéticos
CREATE TABLE prismas_magneticos (
  id BIGSERIAL PRIMARY KEY,
  numero INTEGER NOT NULL UNIQUE,
  is_em_uso BOOLEAN DEFAULT false,
  visitante_id BIGINT REFERENCES visitantes(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de veículos de moradores
CREATE TABLE veiculos_moradores (
  id BIGSERIAL PRIMARY KEY,
  placa_veiculo TEXT NOT NULL UNIQUE,
  casa TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de detecções LPR
CREATE TABLE lpr_deteccoes (
  id BIGSERIAL PRIMARY KEY,
  placa_detectada TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  is_morador BOOLEAN DEFAULT false,
  casa_morador TEXT,
  confidence REAL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_visitantes_ativo ON visitantes(is_ativo);
CREATE INDEX idx_visitantes_nome ON visitantes(nome);
CREATE INDEX idx_visitantes_placa ON visitantes(placa_veiculo);
CREATE INDEX idx_prismas_em_uso ON prismas_magneticos(is_em_uso);
CREATE INDEX idx_veiculos_moradores_placa ON veiculos_moradores(placa_veiculo);
CREATE INDEX idx_lpr_deteccoes_timestamp ON lpr_deteccoes(timestamp DESC);
CREATE INDEX idx_lpr_deteccoes_placa ON lpr_deteccoes(placa_detectada);

-- Habilitar RLS (Row Level Security)
ALTER TABLE visitantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE prismas_magneticos ENABLE ROW LEVEL SECURITY;
ALTER TABLE veiculos_moradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE lpr_deteccoes ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas (acesso público por enquanto - sem autenticação)
CREATE POLICY "Allow all access to visitantes" ON visitantes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to configuracoes_sistema" ON configuracoes_sistema FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to prismas_magneticos" ON prismas_magneticos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to veiculos_moradores" ON veiculos_moradores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to lpr_deteccoes" ON lpr_deteccoes FOR ALL USING (true) WITH CHECK (true);

-- Inserir configuração inicial
INSERT INTO configuracoes_sistema (total_vagas_visitantes, total_prismas_magneticos) VALUES (10, 20);

-- Inserir prismas magnéticos iniciais
INSERT INTO prismas_magneticos (numero) VALUES 
(1), (2), (3), (4), (5), (6), (7), (8), (9), (10),
(11), (12), (13), (14), (15), (16), (17), (18), (19), (20);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_visitantes_updated_at BEFORE UPDATE ON visitantes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_configuracoes_updated_at BEFORE UPDATE ON configuracoes_sistema FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_prismas_updated_at BEFORE UPDATE ON prismas_magneticos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_veiculos_updated_at BEFORE UPDATE ON veiculos_moradores FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_lpr_updated_at BEFORE UPDATE ON lpr_deteccoes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();