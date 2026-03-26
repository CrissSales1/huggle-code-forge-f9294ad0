

# Plano: Mover alerta para painel lateral (v1.7.3)

## Problema
O banner vermelho de alerta ocupa toda a largura acima do grid, empurrando video e painel para baixo quando aparece.

## Solucao

Mover o alerta para o topo da coluna direita (painel lateral), acima do card de Status. Usar posicao fixa dentro do painel sem afetar o layout do video.

### Mudancas em `Vigilancia.tsx`

1. **Remover** o bloco de alerta vermelho (linhas 236-247) que fica acima do grid
2. **Inserir** o alerta como primeiro item dentro da coluna direita (linha 468, dentro do `flex flex-col gap-3`), antes do card de Status
3. O alerta fica com altura fixa e nao empurra nada — ja esta dentro de um flex column com gap

### Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `src/react-app/pages/Vigilancia.tsx` | Mover alerta de cima do grid para dentro do painel lateral direito |

