## Objetivo

Eliminar a rolagem na etapa "Dados do visitante" do modal mantendo **uma única coluna** (layout vertical familiar). Vamos compactar verticalmente cada campo e o seletor de vaga, sem mexer na dinâmica de cadastro.

---

## Diagnóstico

No viewport 1106×718, o `Modal` permite ~640px de área útil (`max-h-[90vh] - 120px`). O conteúdo atual da etapa 2 ocupa ~720px, gerando a rolagem visível no print. As maiores fontes de altura são:

- Cards "Vaga Comum / Vaga Morador" (~110px cada, com ícone 48px e textos grandes).
- `<textarea>` de observações com `rows={3}` (~96px).
- Espaçamentos generosos (`space-y-4`, `pt-lg`, `mb-md`).
- Header da etapa + chip "Trocar" (~64px).

Reduzindo essas alturas dá para encaixar tudo em ~560–600px, sem rolagem, sem mudar para 2 colunas.

---

## Mudanças (apenas em `CadastroVisitanteModal.tsx`)

Tudo abaixo se aplica ao bloco `etapa === 'dados'`. A etapa de prismas e a lógica (handlers, validações, OCR, dropdown, modais auxiliares) ficam intactas.

### 1. Header da etapa mais compacto

- Reduzir `mb-md` → `mb-sm`.
- Trocar `<h3 className="text-h3">` por `text-body-md font-semibold` (rótulo discreto, já que o título do Modal já anuncia "Novo Cadastro de Visitante").
- O chip "Prisma + Trocar" continua à direita, sem mudanças.

### 2. Espaçamento do form

- `space-y-4` → `space-y-3` (reduz ~8px entre cada um dos ~5 blocos = ~32px economizados).

### 3. Linha "Casa/Apto + Placa + OCR" (já é uma linha só)

Mantém como está (3/9 grid). Sem mudanças.

### 4. Observações

- `rows={3}` → `rows={2}` (~32px economizados).
- `placeholder` mantido.

### 5. "Liberado por"

Sem mudanças (input simples já é compacto).

### 6. Bloco "Onde vai estacionar?" — versão compacta inline

Substituir os dois cards grandes por **dois botões pill lado a lado** numa única linha de ~56px de altura (~110px economizados).

```text
Onde vai estacionar?
┌──────────────────────────────┬──────────────────────────────┐
│ ⌂  Vaga Comum (PADRÃO)    ✓  │ ⌂  Vaga Morador              │
└──────────────────────────────┴──────────────────────────────┘
```

- Container: substituir `border-t pt-lg` por apenas `pt-1` (sem divisor extra) e título `text-label-caps uppercase text-on-surface-variant mb-1.5` (mesmo padrão dos outros labels do form).
- Grid: `grid grid-cols-2 gap-2`.
- Cada botão:
  - `flex items-center gap-2 px-3 py-2.5 rounded-btn border text-left`.
  - Ícone Home `w-4 h-4` (sem círculo grande).
  - Título `text-body-sm font-semibold` + caption curta `text-xs` em segunda linha apenas se couber (ou remover a caption — a label "PADRÃO" pode virar um pequeno chip à direita).
  - Selecionado:
    - Vaga Comum: `border-2 border-secondary bg-secondary-container/20` + `<UserCheck className="w-4 h-4 ml-auto text-secondary" />`.
    - Vaga Morador: `border-2 border-tertiary bg-tertiary-fixed/30` + `<UserCheck className="w-4 h-4 ml-auto text-tertiary" />`.
  - Não selecionado: `border border-outline-variant bg-surface hover:bg-surface-container-highest`.

### 7. Footer de ações

- `pt-md border-t` → `pt-3 border-t` (-8px).
- Mantém `Trocar Prisma` à esquerda e `Cancelar / Finalizar Cadastro` à direita.

### 8. Mensagem de erro

Sem mudanças (só aparece quando há erro, e empurra o conteúdo o mínimo).

---

## Estimativa de altura

| Bloco | Antes | Depois |
|---|---|---|
| Header etapa | 56px | 36px |
| Nome | 76px | 76px |
| Casa + Placa + OCR | 76px | 76px |
| Observações | 124px | 92px |
| Liberado por | 76px | 76px |
| Onde estacionar | 180px | 90px |
| Footer ações | 76px | 64px |
| Espaçamentos (4 gaps) | 64px | 48px |
| **Total** | **~728px** | **~558px** |

Com ~558px, cabe folgado nos ~640px disponíveis em 1106×718 — sem rolagem.

---

## Não muda

- Lógica de `handleSubmit`, `handlePlacaChange`, `handleNomeChange`, OCR (`CameraModal`), validação de placa, dropdown de busca por nome, `SelecionarVisitanteModal`.
- Etapa 1 (seleção de prisma) e o `Stepper`.
- `Modal.tsx` (mantém `size="lg"`).
- Estados, props e tipos.

---

## Arquivo afetado

- `src/react-app/components/CadastroVisitanteModal.tsx` — apenas ajustes de markup/estilos no bloco `etapa === 'dados'`.
