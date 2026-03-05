

# v1.1.90: Corrigir Otimizacoes de Hardware

## Problemas Confirmados

### 1. WASM Multi-Thread: Falha por falta de headers COOP/COEP
O `numThreads = 2` requer que o servidor envie:
```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```
Sem isso, `SharedArrayBuffer` nao esta disponivel e o ONNX cai para single-thread.

**Solucao**: Adicionar headers no Vite dev server e no `index.html` (para producao, o unico controle disponivel sao meta tags - mas COOP/COEP **nao funcionam via meta tags**, apenas via HTTP headers). 

Para o Vite dev server, podemos adicionar `server.headers`. Para producao no Lovable, nao temos controle dos headers HTTP do hosting. Portanto a solucao realista e:
- Adicionar headers no Vite (funciona em dev/local)
- Detectar no worker se `SharedArrayBuffer` existe antes de setar `numThreads = 2`, e logar claramente quando cair para single-thread
- Manter `numThreads = 1` como fallback sem spam de warning

### 2. YOLO 320px: Config nunca chega ao Worker
O `useContinuousMonitoring.ts` nao le o localStorage e nao chama `setConfig()` no worker. O toggle na pagina de Configuracoes salva o valor mas ninguem o le.

**Solucao**: No hook de monitoramento continuo, ler `portacerta_yolo_resolution` do localStorage e enviar `SET_CONFIG` ao worker quando o monitoramento iniciar.

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `vite.config.ts` | Adicionar `server.headers` com COOP/COEP |
| `src/react-app/workers/plateProcessor.worker.ts` | Detectar `SharedArrayBuffer` antes de setar numThreads, log claro |
| `src/react-app/hooks/useContinuousMonitoring.ts` | Ler YOLO resolution do localStorage e chamar `setConfig()` no worker |

## Detalhes

### vite.config.ts
```typescript
server: {
  host: "::",
  port: 8080,
  headers: {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  },
},
```
**Nota**: Isso habilita multi-thread em ambiente local. Em producao (Lovable hosting), o fallback single-thread continua ativo.

### plateProcessor.worker.ts (linhas 188-189)
```typescript
// Detectar suporte a multi-thread
if (typeof SharedArrayBuffer !== 'undefined') {
  ort.env.wasm.numThreads = 2;
  console.log('🧵 ONNX: Multi-thread habilitado (2 threads)');
} else {
  ort.env.wasm.numThreads = 1;
  console.log('🧵 ONNX: Single-thread (SharedArrayBuffer indisponível - requer COOP/COEP headers)');
}
```

### useContinuousMonitoring.ts
Apos o worker reportar `isReady`, ler config e enviar:
```typescript
const yoloRes = localStorage.getItem('portacerta_yolo_resolution');
if (yoloRes) {
  setConfig({ yoloInputSize: parseInt(yoloRes) });
}
```

### Versao: 1.1.90

