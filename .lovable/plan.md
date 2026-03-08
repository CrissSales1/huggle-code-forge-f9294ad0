

# Plano: Limpeza WHEP → WebRTC + Corrigir HLS Spam

## Problemas Identificados

1. **Nomenclatura residual**: ~200 referências a "WHEP" espalhadas em 2 arquivos
2. **HLS em loop infinito**: Quando o fallback HLS falha (404 em `/api/hls/playlist.m3u8`), o HLS.js fica fazendo retry infinito sem nunca parar, gerando centenas de requisições 404 no console
3. **SourceMode inconsistente**: `'whep'` como valor de enum quando deveria ser `'stream'` (representa go2rtc WebRTC+HLS)

## Alterações

### Arquivo 1: `src/react-app/contexts/MonitoringContext.tsx`

**Renomeações (busca e substitui):**
- `SourceMode`: `'whep'` → `'stream'`
- `WhepStatus` → `WebRTCStatus`
- `StreamProtocol`: `'whep'` → `'webrtc'`
- `loadSourceMode()`: aceitar `'stream'` em vez de `'whep'`
- `whepStatus` / `setWhepStatus` → `webrtcStatus` / `setWebRTCStatus`
- `connectWHEP` → `connectWebRTC`
- `deriveHlsFromWhep` → `deriveHlsFromWebRTC`
- Todas as strings de log: `WHEP` → `WebRTC`
- Comentários: `WHEP` → `WebRTC/go2rtc`
- `activeProtocol === 'whep'` → `activeProtocol === 'webrtc'`

**Correção do HLS em loop (nova lógica):**
- No bloco de fallback HLS (catch do WebRTC), adicionar `maxMaxRetry: 2` na config do HLS para limitar retries
- Tratar erros `fatal` do HLS destruindo o HLS e parando o monitoramento definitivamente
- Nos erros não-fatais, contar retries e destruir após 3 tentativas

### Arquivo 2: `src/react-app/components/CameraMonitor.tsx`

**Renomeações:**
- `whepStatus` → `webrtcStatus`
- `sourceMode === 'whep'` → `sourceMode === 'stream'`
- `setSourceMode('whep')` → `setSourceMode('stream')`
- `sourceMode === 'hls' || sourceMode === 'whep'` → `sourceMode === 'hls' || sourceMode === 'stream'`
- `activeProtocol === 'whep'` → `activeProtocol === 'webrtc'`
- Texto `'Conectando WHEP...'` → `'Conectando WebRTC...'`

### Arquivo 3: `src/react-app/pages/Configuracoes.tsx`

- Versão → `1.2.5 (Cleanup WHEP + Fix HLS Retry)`

## Resumo

| Mudança | Impacto |
|---------|---------|
| Renomear WHEP → WebRTC/stream | Clareza no código, ~80 substituições |
| Limitar retries HLS | Para o spam de 404s, libera recursos |
| Versão 1.2.5 | Confirmação visual |

