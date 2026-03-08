

# Plano v1.2.8: Adicionar `hls.stopLoad()` antes de `hls.destroy()`

## Problema
O `hls.destroy()` sozinho nao cancela imediatamente requests HTTP em voo nem o scheduler interno do HLS.js. Isso permite que dezenas de requests 404 ja agendadas continuem disparando apos a destruicao.

## Mudancas

### 1. `src/react-app/contexts/MonitoringContext.tsx`

Adicionar `hls.stopLoad()` antes de cada `hls.destroy()` nos 4 pontos:

**Bloco HLS direto - fatal (linha 1508):**
```
hls.stopLoad();
hls.destroy();
```

**Bloco HLS direto - non-fatal (linha 1518):**
```
hls.stopLoad();
hls.destroy();
```

**Bloco HLS fallback - fatal (linha 1786):**
```
hls.stopLoad();
hls.destroy();
```

**Bloco HLS fallback - non-fatal (linha 1796):**
```
hls.stopLoad();
hls.destroy();
```

### 2. `src/react-app/pages/Configuracoes.tsx`

Versao: `1.2.8` com tag `(Fix HLS stopLoad before destroy)`

