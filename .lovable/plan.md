

# v1.1.94: Suporte WHEP (WebRTC) para mediamtx

Substituir o modo "Stream RTSP" (que usa HLS/hls.js) por WHEP, conectando diretamente ao mediamtx via WebRTC. Latência cai de 1-3s (HLS) para ~100-300ms.

## Como funciona

O mediamtx expõe um endpoint WHEP em `http://<ip>:8889/<stream>/whep`. O navegador cria um `RTCPeerConnection`, gera um SDP offer, envia via POST HTTP, recebe o SDP answer, e o vídeo chega direto no `<video>` element via WebRTC -- sem intermediários, sem hls.js.

## Mudanças

### 1. MonitoringContext.tsx

- Renomear `SourceMode` de `'hls'` para `'whep'` (manter `'webcam'`)
- Renomear `hlsUrl` / `setHlsUrl` → `streamUrl` / `setStreamUrl` (chave localStorage mantida para compatibilidade)
- Renomear `hlsStatus` → `streamStatus`
- Substituir `startMonitoringHLS` por `startMonitoringWHEP`:
  - Criar `RTCPeerConnection` com `addTransceiver("video", { direction: "recvonly" })`
  - Gerar SDP offer → `POST` para URL WHEP informada
  - Receber SDP answer → `setRemoteDescription`
  - `pc.ontrack` → atribuir stream ao `videoRef.current.srcObject`
  - Quando vídeo começa a tocar → capturar referência e iniciar loop de detecção (igual ao HLS atual)
  - Manter reconexão automática em caso de ICE failure (5s retry)
- Remover import e uso de `hls.js` e `hlsRef`
- Adicionar `peerConnectionRef` para gerenciar o WebRTC
- No `stopMonitoring`: fechar `peerConnectionRef.current` e limpar

### 2. CameraMonitor.tsx

- Atualizar UI do botão de "Stream RTSP" → "Stream WHEP"
- Atualizar label do input de URL: "URL WHEP:" com placeholder `http://192.168.1.100:8889/camera1/whep`
- Atualizar referências de `hlsUrl` → `streamUrl`, `hlsStatus` → `streamStatus`, `startMonitoringHLS` → `startMonitoringWHEP`

### 3. Configuracoes.tsx

- Versão 1.1.94 (WHEP WebRTC)

### 4. package.json

- Remover dependência `hls.js` (não será mais necessária)

## Lógica WHEP (core)

```text
Browser                        mediamtx
  |                               |
  |-- RTCPeerConnection -----------|
  |   addTransceiver("video")     |
  |   createOffer()               |
  |                               |
  |-- POST /stream/whep ---------->|
  |   Content-Type: application/sdp
  |   Body: SDP offer             |
  |                               |
  |<-- 201 Created ----------------|
  |   Body: SDP answer            |
  |   Location: /session/xxx      |
  |                               |
  |-- setRemoteDescription --------|
  |                               |
  |<== WebRTC video stream ========|
```

## Arquivos

| Arquivo | Ação |
|---------|------|
| `src/react-app/contexts/MonitoringContext.tsx` | Substituir HLS por WHEP WebRTC |
| `src/react-app/components/CameraMonitor.tsx` | Atualizar UI labels e refs |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.94 |
| `package.json` | Remover `hls.js` |

## Impacto

| Antes (HLS) | Depois (WHEP) |
|-------------|---------------|
| Latência 1-3s | Latência ~100-300ms |
| Depende de hls.js (lib extra) | WebRTC nativo do browser |
| Segmentos .ts + playlist .m3u8 | Stream direto peer-to-peer |
| Servidor precisa transcodar para HLS | mediamtx já expõe WHEP nativamente |

