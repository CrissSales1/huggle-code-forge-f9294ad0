
CREATE TABLE visitantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  casa_visitada TEXT NOT NULL,
  placa_veiculo TEXT NOT NULL,
  numero_prisma INTEGER,
  estacionar_vaga_morador BOOLEAN DEFAULT 0,
  hora_entrada DATETIME NOT NULL,
  hora_saida DATETIME,
  is_ativo BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE configuracoes_sistema (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  total_vagas_visitantes INTEGER NOT NULL DEFAULT 10,
  total_prismas_magneticos INTEGER NOT NULL DEFAULT 20,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prismas_magneticos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero INTEGER NOT NULL UNIQUE,
  is_em_uso BOOLEAN DEFAULT 0,
  visitante_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_visitantes_ativo ON visitantes(is_ativo);
CREATE INDEX idx_visitantes_nome ON visitantes(nome);
CREATE INDEX idx_visitantes_placa ON visitantes(placa_veiculo);
CREATE INDEX idx_prismas_em_uso ON prismas_magneticos(is_em_uso);
