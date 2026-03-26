

# Plano: Filtrar logs + Corrigir video preto ao retornar (v1.6.3)

## Problema 1: Logs demais no console
O heartbeat loga a cada 30 frames (~10s), mesmo sem deteccoes. Queremos ver apenas quando ha pessoas detectadas.

## Problema 2: Video preto ao retornar para /vigilancia
Quando o usuario sai da pagina, `BackgroundVigilancia` renderiza os elementos video/img/canvas num div oculto e reconecta o stream. Quando retorna, `BackgroundVigilancia` retorna `null` (os elementos DOM sao desmontados) e a pagina Vigilancia.tsx monta novos elementos DOM com os mesmos refs. Porem o stream (srcObject/src) nao e re-aplicado nos novos elementos — resultado: video preto com imagem quebrada.

## Solucao

### 1. Filtrar logs — `usePersonDetection.ts`
- Remover o heartbeat log a cada 30 frames
- Manter apenas o log `🚨 Pessoa detectada na area!` (que ja existe)
- Adicionar log com contagem de pessoas detectadas apenas quando `allPersons.length > 0`

### 2. Reconectar ao voltar para /vigilancia — `BackgroundVigilancia.tsx`
Quando `isOnPage` volta a ser `true` e a vigilancia esta ativa, chamar `reconnectSource()` para re-aplicar o stream nos novos elementos DOM que a pagina montou.

```text
Fluxo atual (quebrado):
  Sai da pagina → Background monta elementos → reconnect → stream funciona em background
  Volta pra pagina → Background desmonta (return null) → Pagina monta novos elementos → refs apontam pra novos DOM → MAS stream nao e re-aplicado → PRETO

Fluxo corrigido:
  Volta pra pagina → Background desmonta → Pagina monta novos elementos →
  useEffect detecta isOnPage=true → reconnectSource() → stream re-aplicado → VIDEO OK
```

### 3. Versao — `Configuracoes.tsx`
Atualizar para `1.6.3`.

## Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `src/react-app/hooks/usePersonDetection.ts` | Remover heartbeat repetitivo, logar apenas deteccoes |
| `src/react-app/components/BackgroundVigilancia.tsx` | Chamar `reconnectSource()` quando voltar para /vigilancia |
| `src/react-app/pages/Configuracoes.tsx` | Versao 1.6.3 |

