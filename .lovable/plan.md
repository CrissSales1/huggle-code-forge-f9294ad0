

# Plano v1.2.9: Stream WebRTC persistente com reconexão automática

## Problema

O stream WebRTC (câmera IP via go2rtc) **para e não reconecta** quando a conexão cai. Diferente da webcam local (que usa `getUserMedia` e mantém o stream estável), o WebRTC:

1. **`onconnectionstatechange`** com `disconnected` → rejeita a Promise e para tudo (linha 1620)
2. Esse handler só funciona durante a conexão inicial — após o stream conectar, **não há monitoramento contínuo** do estado da conexão
3. Não há lógica de **reconexão automática** como a webcam tem naturalmente

## Solução

Adicionar monitoramento contínuo da conexão WebRTC e reconexão automática, fazendo o stream se comportar como a webcam local.

### Mudanças em `MonitoringContext.tsx`

**1. Monitoramento contínuo pós-conexão (após linha 1719)**

Após o WebRTC conectar com sucesso, registrar um handler persistente no `peerConnectionRef` que detecta desconexão e reconecta automaticamente:

```typescript
// Monitorar conexão WebRTC continuamente (como webcam faz naturalmente)
pc.onconnectionstatechange = () => {
  const state = pc.connectionState;
  if (state === 'disconnected' || state === 'failed') {
    logger.warn(`⚠️ WebRTC ${state} - reconectando em 3s...`);
    setStatusMessage(`⚠️ Conexão perdida, reconectando...`);
    setTimeout(() => {
      if (isActiveRef.current) {
        startMonitoringStream(); // reconecta automaticamente
      }
    }, 3000);
  }
};
```

**2. Guardar o PeerConnection para monitoramento**

O `connectWebRTC` já salva em `peerConnectionRef.current`, mas o handler `onconnectionstatechange` é sobrescrito após a Promise resolver. Mover o handler persistente para **depois** da conexão bem-sucedida em `startMonitoringStream`.

**3. Limpeza adequada ao reconectar**

Antes de reconectar, fechar o PeerConnection antigo:

```typescript
// No stopMonitoring, garantir que fecha o PeerConnection
if (peerConnectionRef.current) {
  peerConnectionRef.current.close();
  peerConnectionRef.current = null;
}
```

**4. Retry com backoff**

Máximo 5 tentativas com intervalo crescente (3s, 6s, 9s...). Após 5 falhas, mostrar erro permanente.

### Mudanças em `Configuracoes.tsx`

Versão: `1.2.9 (WebRTC Auto-Reconnect)`

## Arquivos

| Arquivo | Mudança |
|---------|---------|
| `MonitoringContext.tsx` | Handler persistente de reconexão WebRTC + limpeza de PeerConnection + retry com backoff |
| `Configuracoes.tsx` | Versão 1.2.9 |

## Resultado

O stream WebRTC vai se comportar como a webcam local: reconecta sozinho se a conexão cair, sem precisar de intervenção manual.

