# Plano: refinar visual de todo o sistema (cores, linhas e destaques)

Objetivo: dar mais cor e personalidade ao sistema inteiro — não só na tela de Monitoramento — destacando cards com bordas/linhas coloridas, ícones em badges tonais, hover states e melhor hierarquia visual. Tudo dentro do design system M3 já existente (tokens `primary`/`secondary`/`tertiary`/`error` com variações `/5`, `/10`, `/20`, `/40`).

## Estratégia geral (aplicada a todas as telas)

Para garantir consistência sem reescrever cada tela manualmente, parte das melhorias acontecerá em **componentes compartilhados** (`StatsCard`, `VisitanteCard`) e em **regras CSS globais** (`index.css`), o que automaticamente atualiza Cadastro, Estatísticas, Relatórios, Configurações, Vigilância e modais.

## 1. StatsCard (cards de KPI do Dashboard)
Arquivo: `src/react-app/components/StatsCard.tsx`
- Adicionar **borda esquerda colorida de 4px** (`border-l-4`) na cor correspondente (verde/azul/roxo/laranja/vermelho).
- Aumentar tamanho do badge do ícone (10→12), com leve sombra `shadow-ambient-1`.
- Hover do card: `border-l` passa para 6px e `shadow-ambient-2` (já existe parcialmente).
- Subtítulo mais legível (`text-on-surface-variant` em vez do `text-outline` apagado).
- Pequeno indicador de "trend"/contexto opcional (barra fina horizontal colorida no rodapé do card).

## 2. VisitanteCard (cards de visitantes ativos)
Arquivo: `src/react-app/components/VisitanteCard.tsx`
- Adicionar **borda superior 3px colorida** (`border-t-[3px]`) — laranja para visitantes em geral, vermelha quando "+24H".
- Header do card recebe leve fundo tonal `bg-tertiary/5`.
- Badge do prisma (número) ganha ring branco e `shadow-ambient-2` para destacar mais.
- Caixa "Entrada / Permanência" usa `bg-primary/5` em vez de cinza, separadores verticais coloridos.
- Botão "Editar" passa a ter texto/ícone em `text-primary` com borda `border-primary/30` (atualmente neutro/sem destaque).
- Botão "Dar Baixa" mantém verde mas ganha `shadow-ambient-2` no hover.

## 3. Tela /monitoramento
Arquivo: `src/react-app/pages/Monitoramento.tsx`
- Header: ícone Activity em badge `bg-primary/10`; botão "Limpar" com tonalidade `text-error` + `border-error/40`.
- Card "Resultado": borda 2px na cor do status atual (verde/âmbar/vermelho); faixa lateral 4px com sombra; chip de status ganha `shadow-ambient-2`; caixa "Casa X" em fundo tonal (`bg-secondary/10` morador, `bg-tertiary/10` visitante).
- Card "Pipeline OCR": `border-l-4 border-l-primary`, ícone em badge primário, labels das miniaturas coloridos.
- Histórico (inline e 2XL): `border-l-4 border-l-tertiary`; cada item com fundo `bg-{status}/5`; item selecionado com `border-2 border-primary` + `ring`.
- Bloco "Veículos cadastrados": header com `border-l-4 border-l-primary`, ícone em círculo tonal, linhas zebra (`even:bg-surface-container-low/40`), hover `bg-primary/5`, cabeçalho com borda inferior `border-primary/30`, ações em `text-primary`/`text-error`.
- Estado vazio: ícone em círculo `bg-primary/10` + ponto pulsante verde "Sistema ativo".

## 4. Tela /relatorios
Arquivo: `src/react-app/pages/Relatorios.tsx`
- Cards de filtros / agrupamentos com `border-l-4` na cor do tipo (azul = filtro, verde = exportação).
- Linhas zebra na tabela de relatórios + hover tonal.
- Botões de exportação PDF/Excel com cores distintas (vermelho para PDF, verde para Excel) e ícones em badges.
- Headers de seções com ícone em círculo tonal `bg-primary/10`.

## 5. Tela /estatisticas
Arquivo: `src/react-app/pages/Estatisticas.tsx`
- Mesmo tratamento dos `StatsCard` (já beneficiado pelo item 1).
- Containers de gráficos ganham `border-l-4` colorida segundo categoria.
- Headers de seção com ícone em badge tonal.

## 6. Tela /vigilancia
Arquivo: `src/react-app/pages/Vigilancia.tsx`
- Card de status (alarmes ativos / inativos) com borda lateral colorida (verde quando ok, vermelha quando alerta).
- Histórico de eventos com itens em fundo `bg-{status}/5`.
- Chip de modo (LPR/Pessoas) com cores distintas.

## 7. Tela /configuracoes
Arquivo: `src/react-app/pages/Configuracoes.tsx`
- Cada seção (Câmeras, Backup, Som, OCR) vira um card com `border-l-4` em cor diferente para diferenciação visual rápida.
- Headers de seção com ícone em badge tonal correspondente.
- Botões destrutivos (limpar, restaurar) em `text-error` com borda.

## 8. Modais (Cadastro, Edição, Selecionar)
Arquivos: `src/react-app/components/CadastroVisitanteModal.tsx`, `EditarVisitanteModal.tsx`, `CadastroMoradorModal.tsx`, `EditarVeiculoMoradorModal.tsx`, `SelecionarVisitanteModal.tsx`
- Header do modal com leve fundo tonal `bg-primary/5` e borda inferior `border-primary/20`.
- Campos de input com foco mais marcante (`ring-primary/30` — já existe, reforçar).
- Botão de ação principal (Salvar/Cadastrar) em `bg-primary` com `shadow-ambient-2`; botão Cancelar em outline com `text-on-surface-variant`.

## 9. SideNavBar
Arquivo: `src/react-app/components/SideNavBar.tsx`
- Item ativo do menu ganha **barra lateral esquerda 4px** em `bg-primary` + fundo `bg-primary/10` (em vez de só cor de texto).
- Hover dos itens inativos: `bg-surface-container-low`.
- Ícone do logo destacado.

## 10. Refinamentos globais (index.css)
Arquivo: `src/react-app/index.css`
- Reforçar bordas dos cards genéricos: `.bg-white { border: 1px solid #e2e1ed; }` em vez de só sombra.
- Hover global de cards clicáveis: leve translação (`translate-y-[-1px]`) + sombra ambient-2.
- Ajustar zebra de tabelas legadas via seletor `tbody tr:nth-child(even)`.

## Arquivos afetados
- `src/react-app/components/StatsCard.tsx`
- `src/react-app/components/VisitanteCard.tsx`
- `src/react-app/components/SideNavBar.tsx`
- `src/react-app/components/CadastroVisitanteModal.tsx`
- `src/react-app/components/EditarVisitanteModal.tsx`
- `src/react-app/components/CadastroMoradorModal.tsx`
- `src/react-app/components/EditarVeiculoMoradorModal.tsx`
- `src/react-app/components/SelecionarVisitanteModal.tsx`
- `src/react-app/pages/Monitoramento.tsx`
- `src/react-app/pages/Relatorios.tsx`
- `src/react-app/pages/Estatisticas.tsx`
- `src/react-app/pages/Vigilancia.tsx`
- `src/react-app/pages/Configuracoes.tsx`
- `src/react-app/index.css`

## Detalhes técnicos
- Apenas tokens já definidos em `tailwind.config.js` (sem cores novas).
- Sem mudanças em lógica, estados, hooks ou contratos de props.
- Sem novas dependências.
- Mantém responsividade e acessibilidade existentes.
- Mudanças puramente cosméticas (classes CSS).
