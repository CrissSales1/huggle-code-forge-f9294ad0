
CREATE TABLE veiculos_moradores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placa_veiculo TEXT NOT NULL UNIQUE,
  casa TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_veiculos_moradores_placa ON veiculos_moradores(placa_veiculo);
