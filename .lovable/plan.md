

# Plano: Redesign da pagina Vigilancia (v1.7.0)

## Problemas atuais
1. Conteudo fica atras do menu superior (falta padding-top)
2. Video ocupa tela inteira, obrigando scroll para ver controles
3. Botoes "Redesenhar Area" e "Area Padrao" expostos desnecessariamente
4. Cards de stats (Pessoas Detectadas, Na Area Monitorada, etc.) nao sao uteis para o porteiro

## Layout proposto

```text
┌─────────────────────────────────────────────────┐
│  Header: Vigilancia [Ativo]          [⚙ Config] │
├──────────────────────────┬──────────────────────┤
│                          │  Status              │
│                          │  ● Monitorando...    │
│    VIDEO / CAMERA        │                      │
│    (~65% largura)        │  Horario ativo       │
│                          │  22:00 - 06:00       │
│                          │                      │
│                          │  Cooldown: 10s       │
│                          │                      │
│                          │  [▶ Iniciar/■ Parar] │
│                          │  [■ Desligar]        │
├──────────────────────────┴──────────────────────┤
│  Alerta vermelho (quando pessoa detectada)      │
└─────────────────────────────────────────────────┘
```

## Mudancas

### 1. Layout 2 colunas (`Vigilancia.tsx`)
- Container com `pt-2` para evitar sobreposicao do menu
- Grid: `grid-cols-1 lg:grid-cols-[2fr_1fr]` — video 2/3, painel lateral 1/3
- Video perde `aspect-video` e ganha altura fixa `h-[calc(100vh-180px)]` para caber na tela sem scroll
- Painel lateral direito com informacoes contextuais uteis para o porteiro

### 2. Painel lateral — informacoes uteis para porteiro
Em vez dos 4 cards tecnicos, mostrar:
- **Status do sistema** — indicador grande (Monitorando / Pausado / Desligado) com cor
- **Ultima movimentacao** — quanto tempo faz desde a ultima detecao de pessoa
- **Horario de alertas** — se agendamento esta ativo, mostrar a faixa
- **Cooldown atual** — intervalo entre alertas
- **Botoes de controle** — Iniciar/Parar/Desligar empilhados verticalmente no painel

### 3. Mover botoes para configuracoes
- "Redesenhar Area" e "Area Padrao" vao para dentro do painel de Settings (engrenagem)
- Remover a barra de controles inferior, controles ficam no painel lateral

### 4. Alerta visual
- Manter o banner vermelho de alerta, mas posiciona-lo acima do grid ou como overlay no video

## Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/react-app/pages/Vigilancia.tsx` | Redesign completo do layout |
| `src/react-app/pages/Configuracoes.tsx` | Versao 1.7.0 |

