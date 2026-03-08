

# Plano: Corrigir HLS retry infinito (erros non-fatal)

## Problema

Os erros HLS `fragParsingError` e `levelLoadError` vem com `fatal: false`. O código atual so chama `hls.destroy()` quando `data.fatal === true`, entao o HLS.js continua fazendo polling infinito com 404s.

A config `manifestLoadingMaxRetry: 2` limita retries por request individual, mas o scheduler interno do HLS.js (`scheduleLoading`) continua disparando novos ciclos de loading indefinidamente.

## Solucao

No handler `Hls.Events.ERROR` dos dois blocos (HLS direto e HLS fallback), adicionar um contador de erros non-fatal. Apos 3 erros non-fatal, forcar `hls.destroy()`.

### Alteracoes em `MonitoringContext.tsx`

**Bloco HLS direto (~linha 1501):**
```typescript
let hlsErrorCount = 0;
hls.on(Hls.Events.ERROR, (_event, data) => {
  logger.error('❌ HLS Error:', data);
  if (data.fatal) {
    hls.destroy();
    hlsRef.current = null;
    setHlsStatus('error');
    setStatus('error');
    setStatusMessage(`❌ Erro no stream: ${data.type}`);
  } else {
    hlsErrorCount++;
    if (hlsErrorCount >= 3) {
      logger.warn('⚠️ HLS: muitos erros non-fatal, destruindo');
      hls.destroy();
      hlsRef.current = null;
      setHlsStatus('error');
      setStatus('error');
      setStatusMessage('❌ Stream HLS instavel');
    }
  }
});
```

**Bloco HLS fallback (~linha 1765):** Mesma logica com contador.

### Versao

Bump para `1.2.6` em `Configuracoes.tsx`.

