
CREATE TABLE lpr_deteccoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placa_detectada TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  is_morador BOOLEAN DEFAULT 0,
  casa_morador TEXT,
  confidence REAL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_lpr_deteccoes_timestamp ON lpr_deteccoes(timestamp DESC);
CREATE INDEX idx_lpr_deteccoes_placa ON lpr_deteccoes(placa_detectada);
