

# Fix: Motion Worker MIME Error + Version Update

## Problema Principal

O `motion.worker.ts` falha ao carregar com erro de MIME type (`text/html` em vez de `application/javascript`). Isso acontece porque o Service Worker em cache tenta buscar o arquivo antigo (`motion.worker-CfDvscAB.js`) que não existe mais no servidor após o rebuild — o servidor retorna uma página 404 HTML.

O motion worker não carrega → toda a detecção de movimento morre → OCR nunca dispara automaticamente.

## Correção

### 1. Forçar rebuild limpo do worker

O Vite gera workers com hash no nome. O Service Worker (PWA) cacheia o hash antigo. Ao atualizar o `motion.worker.ts`, o hash muda mas o SW ainda tenta o antigo.

**Solução:** Adicionar `skipWaiting` na config do PWA em `vite.config.ts` para forçar ativação imediata do novo Service Worker:

```typescript
workbox: {
  skipWaiting: true,
  clientsClaim: true,
  // ... resto existente
}
```

### 2. Atualizar versões nos comentários

Arquivos que ainda mostram `v1.1.89` / `v1.1.90` e precisam refletir `v1.2.0`:

| Arquivo | Versão atual | Ação |
|---------|-------------|------|
| `useMotionWorker.ts` | v1.1.89 | → v1.2.0 |
| `motionDetection.ts` | v1.1.89 | → v1.2.0 |
| `usePlateWorker.ts` | v1.1.90 | → v1.2.0 |
| `plateProcessor.worker.ts` | v1.1.90 | → v1.2.0 |
| `plateValidator.ts` | v1.1.90 | → v1.2.0 |

### Arquivos afetados

| Arquivo | Mudança |
|---------|---------|
| `vite.config.ts` | Adicionar `skipWaiting: true, clientsClaim: true` no workbox |
| 5 arquivos | Atualizar strings de versão para v1.2.0 |

