## Reestruturação do Header e do Painel de Observações no `VisitanteCard`

### 1. Novo Header — linha divisória centralizada no badge

Hoje o nome, a linha divisória e o grupo Casa+Vaga estão empilhados na coluna esquerda, e o badge do Prisma fica solto na direita ocupando toda a altura. Vamos reorganizar para que a linha horizontal atravesse o card no meio do badge, com:

- **Acima da linha:** Nome do visitante (esquerda) + label "PRISMA" (direita, sobre o topo do badge)
- **Linha divisória:** atravessa o card inteiro, alinhada verticalmente com o meio do badge 3D
- **Abaixo da linha:** Chip Casa + Tag Vaga (esquerda, centralizados verticalmente) + metade inferior do badge Prisma (direita)

Layout esquemático:

```text
┌─────────────────────────────────────────────┐
│  ULISSES                          PRISMA    │
│                                  ╱─────╲    │
│                                 │   1   │   │
│ ─────────────────────────────── ├───────┤ ──│  ← linha no meio do badge
│  [🏠 46]  [🚗 VAGA MORADOR]    │       │   │
│                                  ╲─────╱    │
└─────────────────────────────────────────────┘
```

**Implementação:**
- Trocar a estrutura `flex items-start gap-3` por um grid de 2 colunas (`grid grid-cols-[1fr_auto] gap-3`) com 2 linhas internas (topo e base) separadas por um `border-t` que ocupa as duas colunas.
- Coluna direita: container do PrismaBadge com `justify-self-end`, ocupando as duas linhas (`row-span-2`) e centralizado verticalmente — isso garante que a borda horizontal (linha divisória) corte exatamente no meio do badge.
- Label "PRISMA" passa a ficar acima do header (mesma linha do nome), à direita, sutilmente acima do topo do badge.
- A linha divisória vira um `<div className="col-span-2 h-px bg-outline-variant/40" />` posicionado entre as duas linhas do grid (com offsets de padding ajustados para casar com o centro do badge `sm` ≈ 2.6rem de altura).
- Chip Casa e Tag Vaga descem para a linha de baixo, mantendo `flex items-center gap-2 flex-nowrap` (lado a lado, como já está). Tag `+24h` permanece como terceiro item com `flex-wrap` permitido só após a vaga.

### 2. Separar "Liberado por" de "Observações"

Hoje os dois compartilham a mesma caixa cinza com um único ícone `Info`. Vamos dividir em **dois cards distintos**, exibidos apenas quando o respectivo campo existir:

- **Card "Liberado por"** (quando `visitante.liberado_por` existir):
  - Ícone `UserCheck` (lucide) em verde/teal sutil
  - Label pequena "LIBERADO POR" em uppercase tracking-wider
  - Valor em destaque (font-semibold)
  - Fundo: `bg-emerald-500/5` + borda `border-emerald-500/20`

- **Card "Observações"** (quando `visitante.observacoes` existir):
  - Ícone `MessageSquare` (lucide) em cinza
  - Label pequena "OBSERVAÇÕES" em uppercase tracking-wider
  - Texto em `text-on-surface-variant` com `line-clamp-2` (mantém o tooltip via `title`)
  - Fundo: `bg-surface-container-low/60` (igual ao atual)

Os dois cards ficam empilhados com `gap-2`, abaixo da placa e do painel Entrada/Permanência. Se só um dos campos existir, apenas aquele card aparece — sem caixa vazia.

### 3. Detalhes técnicos

- Imports adicionais em `VisitanteCard.tsx`: `UserCheck`, `MessageSquare` de `lucide-react` (substituindo o uso único de `Info` para o bloco antigo; `Info` pode ser removido se não usado em outro lugar).
- Nenhuma mudança em props, hooks, tipos ou em `Dashboard.tsx`.
- A altura do badge `sm` é `2.6rem` — usar `pt-3` no topo do header e `pb-3` na linha de baixo com a borda no meio garante o alinhamento visual. Caso necessário, ajustar com `items-center` no container do badge (`row-span-2 self-center`).
- Manter todo o resto do card intacto: faixa de acento superior, painel Entrada/Permanência, rodapé de ações com fluxo de confirmação de 5s.

### Arquivos afetados

- `src/react-app/components/VisitanteCard.tsx` (único arquivo alterado)
