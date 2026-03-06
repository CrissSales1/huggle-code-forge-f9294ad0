

# v1.1.94: Suporte WHEP (WebRTC via go2rtc)

## Problema

O sistema só aceita HLS. Com go2rtc instalado, funciona via HLS mas com 3-8s de latência. O go2rtc oferece WHEP (WebRTC) com ~200ms de latência — ideal para detecção de placas em tempo real.

## Solução

Adicionar WHEP como protocolo prioritário com fallback automático para HLS.

## Mudanças

### 1. `MonitoringContext.tsx`

- Novo `SourceMode`: `'webcam' | 'hls' | 'whep'` (renomear label de "Stream RTSP" para ser genérico)
- Nova função `startMonitoringWHEP()`:
  - Cria `RTCPeerConnection` com offer SDP
  - POST para URL WHEP do go2rtc (ex: `http://IP:8889/camera1/whep`)
  - Recebe answer SDP, conecta track de vídeo ao `<video>`
  - ICE candidates via STUN local
- Fallback automático: se WHEP falhar (timeout 5s ou erro de conexão), derivar URL HLS trocando porta 8889→8888 e sufixo `/whep`→`/api/stream.m3u8?src=...`, e iniciar HLS
- Novo estado `whepStatus: 'idle' | 'connecting' | 'connected' | 'error' | 'fallback_hls'`

### 2. `CameraMonitor.tsx`

- Atualizar seletor de fonte: 3 opções (Webcam, WHEP/WebRTC, HLS)
- Ou melhor: manter 2 opções (Webcam, Stream IP) e dentro de "Stream IP" o campo URL aceita tanto WHEP quanto HLS, detectando automaticamente pelo path (`/whep` → WebRTC, `.m3u8` → HLS)
- Campo de URL com placeholder: `http://192.168.1.x:8889/camera1/whep`
- Badge de status diferenciado: "WebRTC" (verde) vs "HLS Fallback" (amarelo)

### 3. Auto-detecção de protocolo

A URL inserida pelo usuário determina o protocolo:
- Contém `/whep` → tenta WHEP primeiro, fallback HLS
- Contém `.m3u8` → HLS direto
- Caso contrário → tenta WHEP, fallback HLS

Fallback HLS derivado automaticamente:
```
WHEP:  http://192.168.1.100:8889/camera1/whep
→ HLS: http://192.168.1.100:8888/api/stream.m3u8?src=camera1
```

### 4. `Configuracoes.tsx`

Versão 1.1.94 (WHEP/WebRTC Support).

## Arquivos

| Arquivo | Ação |
|---------|------|
| `src/react-app/contexts/MonitoringContext.tsx` | Adicionar `startMonitoringWHEP`, fallback, auto-detecção |
| `src/react-app/components/CameraMonitor.tsx` | UI atualizada para Stream IP com badge de protocolo |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.94 |

## Fluxo WHEP (WebRTC)

```text
Usuario insere URL → Auto-detecta protocolo
                          │
                    ┌──────┴──────┐
                    │  /whep?     │
                    └──────┬──────┘
                     sim   │   não (.m3u8)
                     ▼          ▼
              RTCPeerConnection  HLS direto
              POST offer SDP
              Recebe answer
              ICE connected
                     │
                  sucesso?
                 /        \
               sim        não (5s timeout)
                │            │
            WebRTC ativo   Fallback HLS
            (~200ms)       (3-8s latência)
```

## Implementação WHEP (core)

```typescript
async function connectWHEP(url: string): Promise<MediaStream> {
  const pc = new RTCPeerConnection({
    iceServers: [] // go2rtc local não precisa STUN
  });
  
  pc.addTransceiver('video', { direction: 'recvonly' });
  
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp' },
    body: offer.sdp,
  });
  
  if (!res.ok) throw new Error(`WHEP ${res.status}`);
  
  const answer = await res.text();
  await pc.setRemoteDescription({ type: 'answer', sdp: answer });
  
  // Aguardar track de vídeo
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WHEP timeout')), 5000);
    pc.ontrack = (e) => {
      clearTimeout(timeout);
      resolve(e.streams[0]);
    };
  });
}
```

