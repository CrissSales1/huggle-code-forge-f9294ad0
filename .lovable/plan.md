

# v1.1.95: Fallback HLS quando WHEP falhar (B-frames)

O erro é claro: sua câmera usa H264 com B-frames (perfil Main/High), que WebRTC não suporta. O mediamtx já expõe HLS na porta 8888 que aceita B-frames sem problemas.

## Solução

Manter WHEP como tentativa primária. Quando a conexão falhar (ICE failed/disconnected), fazer fallback automático para HLS usando o mesmo path da câmera. O usuário continua digitando apenas a URL WHEP — o app deriva a URL HLS automaticamente.

## Mudanças

### MonitoringContext.tsx

1. **Re-adicionar hls.js** no package.json
2. **Adicionar `streamProtocol` state**: `'whep' | 'hls'` — indica qual protocolo está ativo no momento
3. **Modificar `startMonitoringWHEP`**:
   - No `oniceconnectionstatechange`, quando `state === 'failed'`:
     - Em vez de retry WHEP, chamar nova função `fallbackToHLS()`
     - Logar: "WHEP falhou (provável B-frames), usando HLS..."
4. **Nova função `fallbackToHLS()`**:
   - Derivar URL HLS da URL WHEP: `http://ip:8889/path/whep` → `http://ip:8888/path/`
   - Importar `hls.js` dinamicamente (`import('hls.js')`)
   - Criar instância HLS, configurar `liveSyncDurationCount: 1` para baixa latência
   - Conectar ao `<video>` element
   - Quando começar a tocar, capturar referência e iniciar monitoramento (igual ao WHEP)
5. **No `stopMonitoring`**: destruir instância HLS se existir (`hlsRef`)
6. **Adicionar `hlsRef`** para gerenciar instância

### CameraMonitor.tsx

- Exibir indicador de qual protocolo está ativo: "WHEP" ou "HLS (fallback)"
- Quando `streamStatus === 'connected'`, mostrar badge com protocolo usado

### Configuracoes.tsx

- Versão 1.1.95 (HLS Fallback)

### Derivação de URL

```text
WHEP:  http://192.168.1.100:8889/entrada/whep
 ↓ extrair host + path
HLS:   http://192.168.1.100:8888/entrada/
```

Lógica: trocar porta 8889→8888, remover `/whep` do final.

## Arquivos

| Arquivo | Ação |
|---------|------|
| `package.json` | Adicionar `hls.js` |
| `src/react-app/contexts/MonitoringContext.tsx` | Fallback HLS + protocol state |
| `src/react-app/components/CameraMonitor.tsx` | Badge de protocolo ativo |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.95 |

## Fluxo

```text
Usuário clica "Iniciar"
  → Tenta WHEP (WebRTC)
    → ICE connected? → Monitoramento OK (latência ~200ms)
    → ICE failed?    → fallbackToHLS()
      → Conecta HLS  → Monitoramento OK (latência ~2-3s)
```

## Recomendação para o usuário

Para eliminar o fallback e usar WHEP direto (latência mínima), configure sua câmera para usar **H264 Baseline Profile** (sem B-frames). Geralmente fica em Configurações > Vídeo > Perfil de codificação.

