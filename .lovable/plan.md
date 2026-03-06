

# v1.1.93: Otimização de Backend e Limpeza de Código

6 melhorias em 3 categorias: queries SQL, lógica client-side e limpeza.

## Mudanças

### Migration SQL (1 arquivo)

```sql
-- Índices para acelerar fuzzy matching IN()
CREATE INDEX IF NOT EXISTS idx_veiculos_moradores_placa ON veiculos_moradores(placa_veiculo);
CREATE INDEX IF NOT EXISTS idx_visitantes_placa ON visitantes(placa_veiculo);
CREATE INDEX IF NOT EXISTS idx_visitantes_ativo ON visitantes(is_ativo) WHERE is_ativo = true;
```

### MonitoringContext.tsx — 4 mudanças

**Melhoria 1: checkIfVisitanteAtivo com SQL direto**
Substituir `SELECT * FROM visitantes WHERE is_ativo = true` + filtro client-side por `.in('placa_veiculo', variacoes)` + `.eq('is_ativo', true)`, igual ao `checkIfMorador`.

**Melhoria 2: Batch de candidatos Beam Search**
Em vez de chamar `checkIfMorador` N vezes (uma por candidato), coletar TODAS as variações de TODOS os candidatos em um único array e fazer uma query `.in()` única. O mesmo para `checkIfVisitanteAtivo`. Reduz de até 6 round-trips para 2 (1 morador + 1 visitante).

**Melhoria 6: Atualizar status_presenca na detecção**
Após confirmar morador, executar `UPDATE veiculos_moradores SET status_presenca = 'presente', ultima_movimentacao = now() WHERE placa_veiculo = ?`. Adicionar na função `saveDetection` quando `isMorador = true`.

### plateValidator.ts — 1 mudança

**Melhoria 3: Limitar generateDualVariations**
Adicionar cap de 30 variações máximas. Priorizar posições com maior taxa de confusão (3→8, 0→O, 1→I) saindo do loop cedo quando atingir o limite.

### Deletar useContinuousMonitoring.ts — 1 mudança

**Melhoria 4: Remover hook legado**
O arquivo `src/react-app/hooks/useContinuousMonitoring.ts` (947 linhas) não é importado por nenhum componente. Todo o fluxo de monitoramento usa `MonitoringContext.tsx`. Deletar o arquivo. Manter os exports utilitários (`loadHlsUrl`, `saveHlsUrl`, `loadSourceMode`, `saveSourceMode`, tipos `SourceMode`, `MonitoringStatus`, etc.) movendo-os para um arquivo dedicado se necessário, ou verificar se o MonitoringContext já os reimplementa.

### Configuracoes.tsx

Versão 1.1.93 (Backend Optimization).

## Arquivos

| Arquivo | Ação |
|---------|------|
| `migrations/9.sql` | Índices em placa_veiculo + partial index is_ativo |
| `src/react-app/contexts/MonitoringContext.tsx` | Melhorias 1, 2, 6 |
| `src/react-app/utils/plateValidator.ts` | Melhoria 3: cap 30 variações |
| `src/react-app/hooks/useContinuousMonitoring.ts` | Deletar (melhoria 4) |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.93 |

## Impacto

| Antes | Depois |
|-------|--------|
| checkIfVisitanteAtivo: full table scan client-side | Query SQL indexada com IN() |
| Beam Search: até 6 round-trips Supabase | 2 queries (1 morador + 1 visitante) |
| generateDualVariations: ~100+ variações | Cap 30, priorizadas por frequência |
| 947 linhas de código morto | Removidas |
| status_presenca nunca atualizado | Atualizado automaticamente na detecção |
| Sem índice em placa_veiculo | Índice B-tree + partial index is_ativo |

