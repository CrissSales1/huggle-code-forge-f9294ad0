

# Plano: Vigilancia com cores e agendamento corrigido (v1.7.1)

## Problemas identificados

1. **Sem cores**: Os cards do painel lateral usam `bg-card border-border` (branco/cinza generico). O resto do app usa azul (`from-blue-600 to-blue-800`, `bg-blue-600`). A pagina ficou sem identidade visual.
2. **Agendamento nao clicavel**: O toggle "Agendar alertas sonoros" esta dentro do painel de configuracoes (`showSettings`), que so aparece ao clicar na engrenagem. Na screenshot, ele aparece como texto estatico no painel de settings, nao como botao interativo separado.

## Solucao

### 1. Adicionar cores do sistema ao painel lateral

- **Card de Status**: Usar gradiente azul quando ativo (`bg-gradient-to-r from-blue-600 to-blue-700 text-white`), manter verde/amarelo/cinza para estados
- **Cards informativos**: Adicionar borda azul sutil (`border-blue-200`), icones em azul (`text-blue-600`) em vez de `text-muted-foreground`
- **Botao Iniciar**: Ja usa `bg-primary`, mas reforcar com gradiente azul (`bg-gradient-to-r from-blue-600 to-blue-700`)
- **Header da pagina**: Adicionar um mini-banner azul ou manter o icone Shield em azul forte

### 2. Tornar "Agendar alertas sonoros" acessivel fora das configuracoes

- Mover o toggle de agendamento para o card "Alertas Sonoros" no painel lateral direito
- Clicar no card ou no toggle alterna `alertScheduleEnabled`
- Quando ativado, mostrar os inputs de horario inline no card
- Manter uma copia simplificada nas configuracoes tambem

### 3. Melhorar visual geral

- Cards com `hover:shadow-md` para dar mais vida
- Icones coloridos (azul, verde, laranja) em vez de todos cinza
- Status "Monitorando" com fundo azul gradiente + texto branco (mais impactante)

## Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `src/react-app/pages/Vigilancia.tsx` | Cores azuis nos cards, agendamento interativo no painel lateral |
| `src/react-app/pages/Configuracoes.tsx` | Versao 1.7.1 |

