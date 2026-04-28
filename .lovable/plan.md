## Objetivo

Dar ao card de Visitantes Ativos uma estética mais comercial/SaaS moderna (densidade, hierarquia, micro‑interações) e modernizar o bloco de relógio + data da barra lateral, eliminando o corte do dia da semana.

---

## 1. `VisitanteCard.tsx` — redesign moderno

### Estrutura

```text
┌────────────────────────────────────────────┐
│ [accent bar ───────────────] (gradient)    │  ← faixa superior 2px com gradiente laranja→âmbar
│                                            │
│  Nome do Visitante              ┌──────┐   │
│  ──────────────────────         │ ▙▟ 12│   │  ← prisma 3D (sm) à direita, alinhado ao topo
│  ⌂ Casa 04   🚗 Vaga Visitante  └──────┘   │
│                                            │
├────────────────────────────────────────────┤
│  [  Placa centralizada  ]                  │
│                                            │
│  ┌─────────────┬─────────────┐             │
│  │ ENTRADA     │ PERMANÊNCIA │             │
│  │ 14:32 · Hoje│ ● 02h15min  │   ← dot pulsante no tempo "vivo"
│  └─────────────┴─────────────┘             │
│                                            │
│  ⓘ Liberado por João · obs...              │
├────────────────────────────────────────────┤
│  [ Editar ]            [ Dar Baixa ↗ ]     │
└────────────────────────────────────────────┘
```

### Mudanças visuais

- **Card container**: remover `border-t-[3px]` colorido e substituir por uma faixa interna com gradiente (`bg-gradient-to-r from-[#E65100] via-[#F36F1A] to-[#FFB74D]`, h‑1) no topo. Em alerta +24h, usar gradiente em tons de error.
- **Background**: `bg-surface-container-lowest` com sutil overlay `bg-gradient-to-b from-surface-container-low/40 to-transparent` no header (substitui o `headerBg` laranja, fica mais limpo).
- **Hover**: aumentar elevação para `shadow-ambient-3`, `-translate-y-1`, e revelar uma borda lateral `ring-1 ring-primary/20`.
- **Nome**: `text-base font-semibold tracking-tight` + linha divisória sutil (`h-px bg-outline-variant/40`) abaixo, dando ar editorial.
- **Chip Casa**: pill mais slim e moderno — fundo `bg-primary/8`, ícone Home em círculo menor (5x5), tipografia `text-xs font-semibold`, sem sombra. Alinhamento à esquerda.
- **Chip Vaga**: redesenhar como "tag" minimalista (sem fundo cheio): `border border-secondary/40 text-secondary` para vaga morador, `border-outline-variant text-on-surface-variant` para visitante. Texto em `text-[10px] font-bold uppercase tracking-wider`.
- **Alerta +24h**: virar um chip discreto vermelho com ícone pulsante (`animate-pulse` no AlertTriangle).
- **Bloco Entrada/Permanência**: substituir o card laranja por um painel `bg-surface-container/60 backdrop-blur` com cantos arredondados `rounded-xl`, sem borda divisora vertical — usar duas colunas com labels uppercase em `text-outline` e valores em fonte mono (`font-mono tabular-nums`) para vibe "dashboard". Adicionar um `<span>` verde pulsante (●) antes da permanência ativa.
- **Observações**: caixa mais leve (`bg-surface-container-low`, sem borda destacada), ícone Info menor.
- **Botões de ação**:
  - Editar: ghost moderno, `bg-transparent hover:bg-primary/8`, sem borda visível por padrão (apenas underline ao hover).
  - Dar Baixa: botão sólido com gradiente sutil `bg-gradient-to-br from-secondary to-secondary-fixed-dim`, ícone `LogOut` rotacionado 0° + animação `group-hover:translate-x-0.5`.
  - Dividir com `gap-2`, padding `py-2.5`, fonte `text-sm font-semibold`.
- **PrismaBadge**: manter `size="sm"`, mas envelopar em um pequeno wrapper com `withGroundShadow` para reforçar o 3D.

### Acessibilidade

- Manter `title` e `aria-label` atuais.
- Garantir contraste AA nos novos tons translúcidos (verificar primary/8 sobre surface-lowest).

---

## 2. `SideNavBar.tsx` — relógio e data modernos

Problema atual: a data longa (`segunda-feira, 28 de abril de 2026`) é truncada porque o sidebar tem 16rem (`w-64`). O bloco também aparece como duas pílulas separadas, visualmente datadas.

### Novo design

Unificar relógio + data em **um único cartão** estilo "widget":

```text
┌──────────────────────────────┐
│  14:32:08         ●          │  ← hora grande mono, dot pulsante (live)
│  Ter, 28 abr · 2026          │  ← data compacta em uma linha
└──────────────────────────────┘
```

### Implementação

- Substituir os dois `<div>` (Clock + Calendar) por um único container:
  - `bg-gradient-to-br from-surface-container to-surface-container-high`
  - `rounded-xl border border-outline-variant/50 px-3 py-2.5 shadow-ambient-1`
- Linha 1: hora em `font-mono font-bold text-xl tabular-nums text-on-surface tracking-tight`, com dot verde `w-1.5 h-1.5 rounded-full bg-secondary animate-pulse` à direita.
- Linha 2: data **compacta** — adicionar no `useDateTime` (ou formatar inline) um `formattedDateShort`:
  - Formato: `Ter, 28 abr · 2026` (weekday `short` + day `2-digit` + month `short` + year `numeric`).
  - Classes: `text-[11px] font-medium text-on-surface-variant capitalize tracking-wide truncate`.
- Remover ícones Clock/Calendar do bloco (ficam redundantes); manter o visual limpo.

### Mobile top bar

- Trocar `font-mono font-bold text-sm` para o mesmo `tabular-nums` e adicionar dot live para consistência.

---

## 3. Pequenos ajustes de hook

`src/react-app/hooks/useDateTime.ts`: adicionar `formattedDateShort` exposto no retorno (sem quebrar consumidores existentes — só acrescenta um campo).

```ts
const formatDateShort = (d: Date) =>
  d.toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  }).replace('.', ''); // remove ponto do "abr."
```

Retornar `formattedDateShort` adicional.

---

## Arquivos afetados

- `src/react-app/components/VisitanteCard.tsx` — redesign completo do layout/estilos (mantém props e lógica).
- `src/react-app/components/SideNavBar.tsx` — substituir bloco relógio/data por widget unificado.
- `src/react-app/hooks/useDateTime.ts` — adicionar `formattedDateShort`.

Sem mudanças em tipos, rotas, API ou lógica de negócio.
