## Objetivo

Eliminar a rolagem da etapa **"Dados do Visitante"** (etapa 2) do modal de cadastro, distribuindo os campos de forma clara em duas colunas, agrupados por contexto. O foco é facilitar o uso para pessoas com pouca familiaridade com informática: tudo visível de uma só vez, sem precisar rolar.

---

## Diagnóstico atual

O modal `CadastroVisitanteModal.tsx` (size `lg`, max-h `90vh`) hoje empilha **verticalmente** na etapa 2:

1. Header + Stepper + título + chip "Trocar Prisma"
2. Nome do visitante (linha inteira)
3. Casa + Placa (linha já dividida)
4. Observações (textarea, 3 linhas)
5. Liberado por (linha inteira)
6. "Onde vai estacionar?" (2 cards grandes)
7. Botões de ação (Trocar / Cancelar / Finalizar)

Total estimado ≈ 780–850 px de altura útil → ultrapassa os ~620 px disponíveis em viewport 1106×718, gerando rolagem.

---

## Nova organização (sem rolagem)

Dividir o formulário em **duas colunas** (`grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4`) com agrupamentos visuais claros:

```text
┌───────────────────────────────────────────────────────────────┐
│  Stepper                          [Prisma 12] [Trocar ✎]      │
├───────────────────────────────┬───────────────────────────────┤
│  👤 QUEM ESTÁ ENTRANDO         │  🚗 VEÍCULO                   │
│  ─────────────────────────    │  ─────────────────────────    │
│  Nome do visitante *          │  Placa *      [📷 Ler placa]  │
│  [______________________]     │  [_______]                    │
│                               │                               │
│  Casa visitada *              │  Onde vai estacionar?         │
│  [______]                     │  ◉ Vaga Comum  ○ Vaga Morador │
│                               │   (radios compactos lado-lado)│
│  Liberado por                 │                               │
│  [______________________]     │  Observações                  │
│                               │  [___________________]        │
│                               │  [___________________]        │
├───────────────────────────────┴───────────────────────────────┤
│  ← Trocar Prisma                    [Cancelar] [✓ Finalizar] │
└───────────────────────────────────────────────────────────────┘
```

### Mudanças por bloco

**1. Cabeçalho compacto**
- Manter o stepper, mas reduzir margem inferior (`mb-md` → `mb-sm`).
- Remover o título redundante "Dados do visitante" — o stepper já indica a etapa. O chip "Prisma X / Trocar" fica alinhado à direita do stepper.

**2. Coluna esquerda — "Quem está entrando"**
- Mini-cabeçalho com ícone (`User`) + label uppercase pequeno: "QUEM ESTÁ ENTRANDO".
- Campos: Nome → Casa visitada → Liberado por.
- Casa fica em linha própria (já não está combinada com placa).

**3. Coluna direita — "Veículo & Estacionamento"**
- Mini-cabeçalho com ícone (`Car`) + label "VEÍCULO".
- Placa + botão "Ler Placa (OCR)" lado a lado (como já está).
- "Onde vai estacionar?" — converter os dois cards grandes em **dois radios horizontais compactos** (uma linha só, ~56 px de altura cada), mantendo o destaque visual de seleção (borda + cor) mas reduzindo a área:
  ```text
  [ 🏠 Vaga Comum    ●selecionado ]  [ 🏘️ Vaga Morador        ]
  ```
- Observações: textarea com `rows={2}` em vez de 3.

**4. Botões de ação**
- Manter footer fixo abaixo do grid, com a mesma divisão (esquerda: Trocar Prisma / direita: Cancelar + Finalizar).

**5. Tipografia/espaçamento**
- `space-y-4` → `gap-y-3` no grid.
- Labels: manter `text-label-caps` mas reduzir `mb-1.5` → `mb-1`.
- Inputs: manter `py-2.5` (boa área de toque).

---

## Mobile (fallback)

Em telas `< lg` (≤ 1024 px), o grid colapsa para 1 coluna naturalmente (`grid-cols-1`). Nesse caso, manter rolagem é aceitável — o foco do pedido é desktop, onde a página é usada pela portaria.

Opcional: aumentar o tamanho do modal (`size="lg"` → criar variante `xl` com `max-w-4xl`) para garantir folga horizontal nas duas colunas em desktops 1280+.

---

## Arquivos afetados

- **`src/react-app/components/CadastroVisitanteModal.tsx`** — reestruturação do JSX da etapa `'dados'` (linhas 350–614). Sem mudanças em lógica, hooks, validação ou submit.
- **`src/react-app/components/Modal.tsx`** — adicionar variante de tamanho `xl` (`max-w-4xl`) em `sizeClasses`, para acomodar as duas colunas com conforto.

Sem mudanças em tipos, API, banco ou outros componentes.

---

## Resultado esperado

- Etapa 2 cabe inteira em uma viewport de 1106×718 sem rolagem.
- Agrupamento visual ("Quem entra" × "Veículo") torna o fluxo intuitivo para usuários iniciantes.
- Cards grandes de vaga substituídos por radios horizontais compactos, sem perder clareza de seleção.
