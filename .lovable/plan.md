## Prisma 3D estilo "saquinho laranja" — card + modal de cadastro

Vou criar **um único componente reutilizável** com a forma 3D do prisma magnético (igual à foto enviada — corpo laranja brilhante, base larga, topo estreito, número escuro impresso) e aplicá-lo em todos os lugares onde o prisma aparece visualmente.

### Novo componente

**`src/react-app/components/PrismaBadge.tsx`** — props:
- `numero: number | string | null`
- `size?: 'sm' | 'md' | 'lg' | 'xl'` (sm para cards/chip, lg para grade de seleção, xl para destaque opcional)
- `variant?: 'orange' | 'error'` (vermelho quando alerta +24h)

Estrutura visual (CSS puro, sem libs 3D — performático e nítido em qualquer DPI):

```text
        ┌──────────┐        ← topo estreito, brilho especular
       /            \
      /     15       \       ← face frontal: gradiente laranja
     /                \
    └──────────────────┘    ← base larga + sombra projetada no chão
```

Camadas:
1. **Wrapper** com `filter: drop-shadow(...)` (sombra projetada respeita o clip).
2. **Face frontal** trapezoidal via `clip-path: polygon(18% 0%, 82% 0%, 100% 100%, 0% 100%)` com `linear-gradient(160deg, #FF8A3D 0%, #F36F1A 45%, #C94E08 100%)` (tons do laranja vinílico da foto).
3. **Highlight especular** — segundo div, mesmo `clip-path`, gradiente branco vertical estreito à esquerda (`linear-gradient(105deg, transparent 8%, rgba(255,255,255,.55) 14%, transparent 22%)`) imitando o brilho do plástico.
4. **Sombreamento lateral direito** — gradiente `to-right` preto/transparente baixa opacidade dando volume.
5. **Vinco superior** — linha fina escura no topo (`border-top` interno + leve gradiente) sugerindo a costura/dobra do saquinho.
6. **Número** — `<span>` absoluto centralizado, `font-black`, cor `#1a1a1a`, leve `text-shadow` quase imperceptível para parecer impresso. Levemente deslocado para baixo (`translate-y-[8%]`) acompanhando a perspectiva da face.
7. **Variant `error`**: troca a paleta para vermelhos (`#E0402E → #B0140A`), mantendo highlight branco.
8. **Sombra de chão** opcional (`::after` ou div irmão) — elipse escura com blur abaixo, sugerindo apoio na superfície (usada apenas em `lg`/`xl`).

### Onde aplicar

1. **`VisitanteCard.tsx`** — substitui o círculo `w-11 h-11` no header por `<PrismaBadge size="sm" numero={visitante.numero_prisma} variant={alertaPermanenciaProlongada ? 'error' : 'orange'} />`. Ajustar largura para ~`w-14 h-12` para acomodar a base trapezoidal sem comprimir o nome.

2. **`CadastroVisitanteModal.tsx` — etapa "prisma"** (grade de seleção, linhas 328–341): cada botão da grade passa a renderizar `<PrismaBadge size="lg" numero={prisma.numero} />` no lugar do número grande + label "Prisma". Hover mantém destaque (ex.: `hover:scale-105 hover:drop-shadow-lg`). Mantém aspect-square e o label "PRISMA" pequeno embaixo do badge para clareza.

3. **`CadastroVisitanteModal.tsx` — etapa "dados"** (chip do prisma selecionado, linhas 350–359): substitui o chip pill atual por uma versão compacta com `<PrismaBadge size="sm" />` + texto "Trocar" + ícone lápis, mantendo o mesmo botão clicável que volta para a etapa de seleção.

### Fora do escopo (não alterado)

- `EditarVisitanteModal.tsx` usa apenas um `<select>` nativo — sem visual de prisma para trocar.
- `Relatorios`, `Configuracoes`, `pdfExport` — só leem o número, sem badge visual.
- Lógica, props, dados e tipos permanecem inalterados — mudança puramente visual.

### Notas técnicas

- Tudo via CSS/Tailwind + `style` inline para `clip-path` e gradientes (clip-path arbitrário não tem utilitário nativo no Tailwind).
- Sem dependências novas, sem WebGL/Three.js — leve, acessível e renderiza igual em qualquer navegador moderno.
- Tamanhos definidos em rem para escalar bem em mobile/desktop.
