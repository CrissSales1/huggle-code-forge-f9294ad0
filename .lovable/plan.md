
# Plano: Modernização Visual (Tema Material 3 Aguas da Fonte)

> **Princípio absoluto:** apenas troca de classes/tokens visuais. **Zero alteração** em lógica, hooks, fluxo de dados, modais, validações, rotas, contextos, workers, AI ou Supabase. Qualquer arquivo `.ts` puro (hooks, utils, contexts, types) **não será tocado**.

## 1. Análise do tema enviado (`theme.md`)

O upload é um Design System Material 3 com:

- **Paleta**: primary `#003fb1`, primary-container `#1a56db`, secondary (verde) `#006c4b`, tertiary (laranja/queimado) `#8c2200`, error `#ba1a1a`, surface `#faf8ff`, surface-container/variant family completa, on-surface `#191b23`, outline `#737686`, outline-variant `#c3c5d7`
- **Tipografia**: Inter (já em uso) com escala semântica `h1`/`h2`/`h3`/`body-lg`/`body-md`/`body-sm`/`button`/`label-caps`
- **Spacing**: tokens `xs`(4) / `sm`(8) / `md`(16) / `lg`(24) / `xl`(32) / `xxl`(48) / `gutter`(24) / `margin`(32)
- **Radius**: `card`(12px) / `btn`(8px)
- **Shadows**: `ambient-1`, `ambient-2`, `ambient-3` (sombras suaves modernas)
- **Iconografia**: Material Symbols Outlined (mas **manteremos `lucide-react`** já em uso — apenas estilizamos com novos tokens; trocar a biblioteca de ícones seria mudança funcional/visual ampla demais)
- **Layout**: Cards mais "respiráveis", placa Mercosul estilizada, KPIs com ícone em círculo colorido suave, badges arredondados
- **Padrão**: surface-container-lowest (branco) sobre background `#F8F9FA`, em vez dos atuais gradientes coloridos por card

## 2. Estratégia de aplicação

### Fase A — Tokens (fundação, não muda visualmente sozinho)
Tudo via Tailwind config + CSS, então qualquer classe nova fica disponível em todo o projeto sem refactor por componente.

**`tailwind.config.js`** — estender com:
- `colors`: todos os tokens M3 do upload (primary, secondary, tertiary, surface-*, outline-*, on-*, etc.)
- `borderRadius`: `card: '12px'`, `btn: '8px'`
- `spacing`: `xs/sm/md/lg/xl/xxl/gutter/margin`
- `boxShadow`: `ambient-1/2/3`
- `fontSize`: escala semântica `h1/h2/h3/body-lg/body-md/body-sm/button/label-caps`

**`src/react-app/index.css`** — adicionar:
- `body { background-color: #F8F9FA; color: #191b23; }`
- Manter Inter como já está
- Preservar todas as animações/safe-areas existentes

### Fase B — Componentes globais (afetam todas as telas)

| Arquivo | Mudança visual |
|---|---|
| `src/react-app/components/Header.tsx` | Manter estrutura/menu/lógica. Trocar gradiente azul forte por **`bg-primary`** sólido (`#003fb1`) com `shadow-ambient-2`. Sub-barra de navegação com `bg-primary-container`. Pills de "Monitorando/Ativo" usam `bg-secondary text-on-secondary` em vez de verde puro. |
| `src/react-app/components/StatsCard.tsx` | Trocar gradientes pesados por **card branco** (`bg-surface-container-lowest`) com borda transparente, `shadow-ambient-1`, ícone em círculo pastel (ex.: green→`bg-[#E8F5E9] text-[#2E7D32]`, blue→`bg-[#E3F2FD] text-[#1565C0]`, purple→`bg-[#F3E5F5] text-[#7B1FA2]`, orange→`bg-[#FFF3E0] text-[#E65100]`, red→`bg-[#FFEBEE] text-[#C62828]`). Tipografia: título `text-body-sm text-on-surface-variant`, valor `text-h1 text-on-surface`. |
| `src/react-app/components/Modal.tsx` | `rounded-card`, `shadow-ambient-3`, header com `text-h3`, fechar com hover `bg-surface-variant`. Lógica intacta. |
| `src/react-app/components/VisitanteCard.tsx` | Layout do upload: header com nome (`text-h3`) + ícones inline (casa/tipo de vaga); badge prisma circular `bg-[#FFF3E0] text-[#E65100]`; placa Mercosul branca com faixa azul `#003fb1` no topo; bloco de tempo (entrada/permanência) em `bg-surface-container-low rounded-lg`; permanência em `bg-secondary/10 text-secondary`; rodapé com 2 botões — **Editar** (outline) e **Dar Baixa** (`bg-secondary text-on-secondary`). Alerta >24h muda permanência para `bg-error-container text-error`. |
| `src/react-app/components/PlacaVeiculo.tsx` | Estilo Mercosul moderno: borda `border-outline-variant`, faixa superior `bg-primary text-white text-[10px] tracking-widest` com "BR / BRASIL", número em `font-mono font-bold text-h2`. |
| `src/react-app/components/VisitanteCard` (badges) | Tipo de vaga: visitante=`bg-secondary/10 text-secondary`, morador=`bg-tertiary-container/20 text-tertiary`. |
| `DetectionToast`, `VigilanciaToast` | Cards `rounded-card shadow-ambient-2`, borda esquerda colorida (success=secondary, alert=tertiary, error=error). |
| `CadastroVisitanteModal`, `CadastroMoradorModal`, `EditarVisitanteModal`, `EditarVeiculoMoradorModal`, `SelecionarVisitanteModal` | Apenas reestilização: inputs com `border-outline-variant rounded-btn focus:border-primary focus:ring-primary/20`, botões primários `bg-primary text-on-primary`, secundários outline. **Nenhum campo, validação ou handler alterado.** |
| `CameraModal`, `CameraMonitor`, `PerformanceIndicator`, `BackgroundVideo`, `BackgroundVigilancia` | Apenas containers/badges com novos tokens. Lógica de stream/AI **intocada**. |

### Fase C — Páginas (somente classes Tailwind)

| Página | Mudanças |
|---|---|
| `Dashboard.tsx` | Background da página `bg-background`, título `text-h1`, descrição `text-body-sm text-outline`. Botão "Atualizar" outline; "Novo Cadastro" `bg-primary shadow-ambient-1`. Container de visitantes ativos: `rounded-card shadow-ambient-1 bg-surface-container-lowest`, header com badge "N REGISTROS" em `bg-surface-container-highest text-on-surface-variant rounded-full text-label-caps`. |
| `Cadastro.tsx` | Mesmo padrão de header de página + cards `rounded-card`. |
| `Relatorios.tsx` | Filtros em card branco com inputs M3; tabela com `border-surface-variant`, header `bg-surface-container text-label-caps`, linhas hover `bg-surface-container-low`. |
| `Estatisticas.tsx` | Cards de gráfico com `rounded-card shadow-ambient-1`. |
| `Configuracoes.tsx` | Seções como cards M3; botões de ação destrutiva mantêm cor mas com `bg-error text-on-error`. |
| `Monitoramento.tsx` / `MonitoramentoHelp.tsx` / `Vigilancia.tsx` | Painéis com `rounded-card shadow-ambient-2`, indicadores de status com pílulas M3. **Toda a lógica de detecção/AI intocada.** |
| `Login.tsx` | Card central `rounded-card shadow-ambient-3 bg-surface-container-lowest`, botão `bg-primary`. |
| `Instalar.tsx` | Layout em cards M3. |

## 3. O que NÃO será mexido

- Nenhum hook (`useApi`, `useAuth`, `usePlateRecognition`, `useVehicleDetection`, `usePersonDetection`, `usePlateWorker`, `usePerformanceMetrics`, `useDateTime`, `useLiveTimer`)
- Nenhum context (`MonitoringContext`, `VigilanciaContext`)
- Nenhum util (`plateValidator`, `pipelineStorage`, `pdfExport`, `objectDetector`, `personDetector`, `plateDetector`, `motionDetection`, `imagePreprocessing`, `notificationSounds`, `canvasPool`, `formatters`, `logger`, `stringUtils`)
- Nenhum worker, edge function, migração ou tipo
- Nenhum fluxo de cadastro/edição/saída/relatório/config
- Estrutura de rotas e props de componentes
- Lucide React permanece como biblioteca de ícones (não trocaremos por Material Symbols — manter dependências)

## 4. Versionamento e validação

1. Bump em `Configuracoes.tsx` para **v1.9.0 (Material 3 Visual Refresh)**
2. Atualizar `mem://design/theme-m3` com os tokens aplicados, para futuras telas/componentes seguirem o mesmo padrão automaticamente
3. Após aplicar, rodar `bun run build` para garantir que nenhuma classe inválida quebrou o build
4. Você valida visualmente (Dashboard, Cadastro, Relatórios, Configurações, Monitoramento, Vigilância, Login)

## 5. Ordem de execução sugerida

1. Tokens (`tailwind.config.js` + `index.css`)
2. Componentes globais (`Header`, `Modal`, `StatsCard`, `VisitanteCard`, `PlacaVeiculo`, toasts)
3. Modais de cadastro/edição (apenas classes)
4. Páginas (uma por vez, ordem: Dashboard → Cadastro → Relatorios → Estatisticas → Configuracoes → Monitoramento → Vigilancia → Login → Instalar)
5. Bump de versão + memória de design
6. Build de verificação

## 6. Estimativa

~12-15 arquivos editados (todos `.tsx` + `tailwind.config.js` + `index.css`), todos por substituição de classes utilitárias. Sem instalação de pacotes, sem migrações, sem mudança em código JS/TS lógico.
