

# Plano: Corrigir HLS destroy que nao para o loop de erros (v1.2.7)

## Problema

O contador de erros non-fatal (`hlsFallbackErrorCount >= 3`) chama `hls.destroy()`, mas:
1. O `logger.error()` executa **antes** do guard, entao mesmo apos destroy, dezenas de erros em voo continuam sendo logados
2. Nao ha early return apos o destroy -- erros 4, 5, 6... continuam passando pelo handler
3. Requests HTTP ja em voo (lancados pelo `scheduleLoading` interno do HLS.js) disparam callbacks de erro mesmo apos `destroy()`

## Solucao

Adicionar uma flag `hlsDestroyed` que faz **early return silencioso** no handler de erro, impedindo qualquer log ou processamento apos o destroy.

### Alteracoes em `MonitoringContext.tsx`

**Bloco HLS direto (~linha 1501):**
```typescript
let hlsErrorCount = 0;
let hlsDestroyed = false;
hls.on(Hls.Events.ERROR, (_event, data) => {
  if (hlsDestroyed) return; // silenciar erros pos-destroy
  logger.error('❌ HLS Error:', data);
  if (data.fatal) {
    hlsDestroyed = true;
    hls.destroy();
    hlsRef.current = null;
    setHlsStatus('error');
    setStatus('error');
    setStatusMessage(`❌ Erro no stream: ${data.type}`);
  } else {
    hlsErrorCount++;
    if (hlsErrorCount >= 3) {
      hlsDestroyed = true;
      logger.warn('⚠️ HLS: muitos erros, destruindo');
      hls.destroy();
      hlsRef.current = null;
      setHlsStatus('error');
      setStatus('error');
      setStatusMessage('❌ Stream HLS instável');
    }
  }
});
```

**Bloco HLS fallback (~linha 1775):** Mesma logica com `hlsFallbackDestroyed`.

### Versao

Bump para `1.2.7` em `Configuracoes.tsx`.

