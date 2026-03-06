

# v1.1.92: Habilitar Multi-Thread via _headers (Cloudflare Pages)

## Analise de Recursos Externos

O sistema consome 4 origens externas que serao afetadas pelo `require-corp`:

| Recurso | URL | CORP header? |
|---------|-----|-------------|
| ONNX WASM binaries | `cdn.jsdelivr.net/npm/onnxruntime-web@1.23.2/dist/` | Sim (jsdelivr envia `cross-origin`) |
| Imagem login | `mocha-cdn.com/...` | Incerto |
| Supabase API | `kbgftpiyzfmabrncpnas.supabase.co/...` | Sim (Supabase envia CORS headers) |
| HLS streams | URLs configuradas pelo usuario (cameras IP) | Geralmente NAO |

## Solucao Segura: `credentialless` em vez de `require-corp`

O header `Cross-Origin-Embedder-Policy: credentialless` habilita `SharedArrayBuffer` da mesma forma que `require-corp`, mas sem exigir que recursos externos enviem `Cross-Origin-Resource-Policy`. Ele apenas remove credenciais (cookies) de requisicoes cross-origin — o que e aceitavel para CDNs, modelos e streams de video.

Suporte: Chrome 96+, Firefox 119+, Edge 96+. Safari 15.2+.

## Mudancas

### 1. Criar `public/_headers`
```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: credentialless
```

### 2. Atualizar `vite.config.ts`
Mudar o header de dev server de `require-corp` para `credentialless` (consistencia com producao).

### 3. Atualizar `plateProcessor.worker.ts`
Melhorar o log de inicializacao para confirmar que multi-thread esta ativo:
```typescript
if (typeof SharedArrayBuffer !== 'undefined') {
  ort.env.wasm.numThreads = 2;
  console.log('🧵 ONNX: Multi-thread ativo (2 threads, SharedArrayBuffer disponível)');
} else {
  ort.env.wasm.numThreads = 1;
  console.log('🧵 ONNX: Single-thread (SharedArrayBuffer indisponível)');
}
```

### 4. Atualizar `Configuracoes.tsx`
Versao 1.1.92 (Multi-Thread Production).

## Arquivos

| Arquivo | Mudanca |
|---------|---------|
| `public/_headers` | Novo arquivo — headers COOP/COEP para Cloudflare Pages |
| `vite.config.ts` | `require-corp` → `credentialless` |
| `src/react-app/pages/Configuracoes.tsx` | Versao 1.1.92 |

## Nota sobre `credentialless` vs `require-corp`

`credentialless` e a escolha correta para este sistema porque:
- O HLS stream de cameras IP externas nunca vai enviar CORP headers
- A imagem do login em `mocha-cdn.com` pode nao ter CORP
- O efeito pratico (habilitar SharedArrayBuffer) e identico
- A unica diferenca e que requests cross-origin perdem cookies, o que nao afeta CDNs nem streams de video

