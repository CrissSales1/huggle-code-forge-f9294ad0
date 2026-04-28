## Goal
Refinar a aparência dos cards de visitante, melhorar o widget do relógio na sidebar e padronizar o prisma 3D na tela de Busca.

---

## 1. `VisitanteCard.tsx` — chips, cores e botão "Dar Baixa"

**Chip Casa (destacar mais, sem quebrar linha):**
- Aumentar o ícone Home: bolinha interna de `w-5 h-5` → `w-6 h-6`, ícone `w-3 h-3` → `w-3.5 h-3.5`.
- Texto da casa um pouco maior (`text-xs` → `text-sm`), padding ajustado.
- Manter `flex-wrap` no container para não quebrar dentro do chip; reduzir `max-w` do nome se necessário para garantir tudo numa linha em viewports comuns.

**Chip Vaga (cores distintas):**
- **Vaga Morador** → tom âmbar/laranja suave: `bg-amber-500/10`, `text-amber-700`, `border-amber-500/40` (destaca que é vaga "privada/morador", combina com prisma laranja).
- **Vaga Visitante** → tom azul/teal: `bg-sky-500/10`, `text-sky-700`, `border-sky-500/40` (cor neutra/positiva, diferencia claramente).
- Aumentar ícone Car: `w-3 h-3` → `w-4 h-4`, texto `text-[10px]` → `text-xs`, padding `py-0.5` → `py-1`.

**Botão "Dar Baixa" (vermelho suave, não forte):**
- Substituir gradient `from-secondary to-secondary-fixed-dim` por tom rosé/coral suave: `bg-rose-500/90 hover:bg-rose-600 text-white` (ou tokens equivalentes — usar `rose-500` que é vermelho dessaturado, não vermelho-erro).
- Não usar `bg-error` (vermelho forte reservado para alertas como "+24h").

---

## 2. `useDateTime.ts` — novo formato de data

Adicionar/ajustar formatador `formatDateLong`:
- Saída: `Ter, 28 de Abril de 2026` (dia abreviado capitalizado + ponto removido + mês completo capitalizado).
- Implementação: usar `toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })` e pós-processar para:
  - Capitalizar weekday e mês (`Ter`, `Abril`).
  - Remover pontos do weekday.
  - Garantir formato `Ter, 28 de Abril de 2026`.
- Expor `formattedDateLong` no retorno do hook (mantendo os outros).

---

## 3. `SideNavBar.tsx` — widget de relógio com ícones

Substituir o widget atual por um layout com ícones lucide:
- Linha 1 (hora): ícone `Clock` (`w-4 h-4 text-secondary`) + `formattedTime` em mono bold + ponto pulsante à direita.
- Divisor sutil (linha de 1px com `bg-outline-variant/40`).
- Linha 2 (data): ícone `Calendar` (`w-3.5 h-3.5 text-on-surface-variant`) + `formattedDateLong` em texto de 11–12px.
- Manter o card com gradient e shadow já existentes; aumentar levemente o padding interno.

---

## 4. `Relatorios.tsx` — adotar `PrismaBadge`

Na coluna "Prisma" da tabela de resultados (linhas ~740–764):
- Remover todo o markup inline do prisma 3D (gradient + skew + brilho).
- Substituir por:
  ```tsx
  <PrismaBadge numero={visitante.numero_prisma} size="sm" variant="orange" />
  ```
- Importar `PrismaBadge` no topo do arquivo.
- Manter o fallback `-` quando não houver prisma.

---

## Arquivos modificados
- `src/react-app/components/VisitanteCard.tsx`
- `src/react-app/hooks/useDateTime.ts`
- `src/react-app/components/SideNavBar.tsx`
- `src/react-app/pages/Relatorios.tsx`

Nenhuma migração ou alteração de schema necessária.
