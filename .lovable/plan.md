## Ajustes no VisitanteCard

### 1. Espaçamento ao redor da linha divisora (nome ↔ placa)
Atualmente: `mt-1` acima e `mt-0.5` abaixo (placa colada na linha).
Mudar para folga simétrica e respirável:
- Linha: `my-1.5` (espaço em cima e embaixo)
- Container da placa: remover `mt-0.5`

### 2. Aumentar fontes pequenas (sem mudar tamanho do card)
Os textos com `text-[9px]` / `text-[10px]` / `text-[11px]` estão difíceis de ler. Mantendo o card no mesmo tamanho global (apenas tipografia interna cresce levemente):

| Elemento | Atual | Novo |
|---|---|---|
| Label "Prisma" (acima do badge) | 9px | 10px |
| Label "Casa" (chip) | 9px | 10px |
| Valor da casa | 14px (sm) | 15px |
| "Vaga Morador / Visitante" | 10px | 11px |
| Labels "Entrada" / "Permanência" | 9px | 11px |
| Hora de entrada / permanência (valores) | 12px (xs) | 13px |
| Data ("Hoje") / "em tempo real" | 10px | 11px |
| Label "Liberado por" / "Observações" | 9px | 11px |
| Valor "Liberado por" / "Observações" | 11px | 12px |
| Badge "+24h" | 9px | 10px |
| Botões Editar / Dar Baixa | 12px (xs) | 13px |
| Texto "Confirmando saída…" | 11px | 12px |

Para evitar que a coluna direita do painel Entrada/Permanência fique apertada com fontes maiores, reduzir o `gap` interno do painel de `gap-2` para `gap-1.5` se necessário (avaliar visualmente).

### 3. Não alterar
- Tamanho/dimensões externas do card
- PrismaBadge (tamanho `md` mantido)
- PlacaVeiculo (tamanho `sm` mantido)
- Cores, ícones, layout geral

### Arquivo afetado
- `src/react-app/components/VisitanteCard.tsx`
