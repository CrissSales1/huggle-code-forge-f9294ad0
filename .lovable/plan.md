

# Plano: Corrigir Endpoint WebRTC (whep → webrtc)

## Problema

O sistema está fazendo POST para `/api/whep?src=externa`, mas o go2rtc usa o endpoint `/api/webrtc`. Por isso o erro 404 persiste mesmo com o Worker removido e o Tunnel funcionando.

## Correção

Trocar todas as referências de `/api/whep` para `/api/webrtc` em 2 arquivos:

### Arquivo 1: `src/react-app/contexts/MonitoringContext.tsx`

| Linha | De | Para |
|-------|-----|------|
| 1610 | `u.pathname = '/api/whep'` | `u.pathname = '/api/webrtc'` |
| 1629 | `.replace(/\/api\/whep/, '/api/stream.m3u8')` | `.replace(/\/api\/webrtc/, '/api/stream.m3u8')` |

Comentários atualizados nas linhas 1604, 1608, 1648 para refletir a mudança.

### Arquivo 2: `src/react-app/components/CameraMonitor.tsx`

| Linha | De | Para |
|-------|-----|------|
| 451 | `placeholder="http://192.168.1.x:1984/api/whep?src=camera1"` | `placeholder="http://192.168.1.x:1984/api/webrtc?src=camera1"` |

## Impacto

Correção simples de 2 arquivos. O protocolo WebRTC (SDP offer/answer) continua funcionando igual — só muda o caminho da URL. Nenhuma lógica de conexão precisa mudar.

