## Ajustes no `VisitanteCard.tsx`

### 1. Chip da Casa + Tag da Vaga lado a lado

Atualmente o chip "Casa" e a tag "Vaga" ficam em um `flex-wrap` que quebra para linha de baixo em cards estreitos. Vamos forçar lado a lado e dar mais destaque ao ícone da casa.

- Remover `flex-wrap` da linha de chips (manter `flex items-center gap-2`, com `min-w-0` para truncar nome da casa se necessário).
- **Chip Casa (maior e mais destacado):**
  - Aumentar o círculo do ícone de `w-6 h-6` → `w-8 h-8`.
  - Aumentar o ícone `Home` de `w-3.5 h-3.5` → `w-5 h-5` (strokeWidth 2.75 mantido).
  - Padding do chip: `pl-1 pr-3 py-1` → `pl-1 pr-3.5 py-1.5`.
  - Texto da casa permanece `text-sm font-bold`, com `truncate` e `max-w-[80px]` para garantir que a tag de vaga não seja empurrada para baixo.
- **Tag Vaga (ao lado, não abaixo):**
  - Manter as duas variantes (Vaga Morador âmbar / Vaga Visitante azul) com `Car` icon.
  - Reduzir levemente o texto se necessário (`text-[11px]`) para caber junto ao chip maior em viewport estreito.
  - Adicionar `whitespace-nowrap` para não quebrar.
- O badge `+24h` continua na mesma linha quando houver espaço; caso contrário, segue para baixo (mantém `flex-wrap` apenas se for o terceiro item — alternativa: mover `+24h` para próximo do `PrismaBadge`). **Decisão:** manter `+24h` como terceiro item com `flex-wrap` permitido só após a tag de vaga, usando `flex items-center gap-2` + um `<div>` interno com `flex gap-2 min-w-0` para Casa+Vaga e o `+24h` fora dele.

Estrutura final da linha:
```
[ Chip Casa (ícone grande + nº) ] [ Tag Vaga Morador/Visitante ]   [ +24h opcional ]
```

### 2. Confirmação de 5s ao "Dar Baixa"

Substituir a ação imediata por um fluxo de confirmação com countdown e cancelamento.

- Adicionar estado local no `VisitanteCard`:
  - `confirmandoBaixa: boolean`
  - `countdown: number` (inicia em 5)
- Ao clicar em **Dar Baixa**:
  - Setar `confirmandoBaixa = true`, `countdown = 5`.
  - Iniciar `setInterval` de 1s decrementando o countdown.
  - Ao chegar em 0: limpar interval e chamar `onRegistrarSaida(visitante.id)` automaticamente.
- Enquanto `confirmandoBaixa` estiver ativo, o rodapé do card troca de layout:
  - Esconde os botões "Editar" e "Dar Baixa".
  - Mostra um painel de confirmação ocupando toda a largura do rodapé:
    - Texto: `Confirmando saída em {countdown}s…`
    - Barra de progresso (largura animada baseada em `countdown/5`) com cor `bg-rose-500`.
    - Botão **Cancelar** (estilo neutro, ícone `X`) que limpa o interval e volta ao estado inicial.
    - Botão **Confirmar agora** (opcional, estilo `bg-rose-500`) que dispara `onRegistrarSaida` imediatamente sem esperar o countdown.
- `useEffect` de cleanup: limpar o interval no unmount e quando `confirmandoBaixa` virar `false`.
- Acessibilidade: `aria-live="polite"` no texto do countdown.

### 3. Detalhes técnicos

- Imports adicionais em `VisitanteCard.tsx`: `useState`, `useEffect`, `useRef` (para guardar o id do interval), e `X`, `Check` de `lucide-react`.
- Nenhuma mudança em `Dashboard.tsx` — `handleRegistrarSaida` continua igual.
- Nenhuma mudança no hook `useVisitanteActions` nem no backend.

### Arquivos afetados

- `src/react-app/components/VisitanteCard.tsx` (único arquivo alterado)
