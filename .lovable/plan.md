

# Bug: OCR automático não dispara ao detectar veículo

## Causa raiz

Identifiquei **dois bugs principais** em `useContinuousMonitoring.ts` que causam o travamento:

### Bug 1: Status fica preso em `'processing'` (linhas 537-541 e 480-528)

Quando `processFrameForOCR` executa, ele faz `setStatus('processing')` (linha 426). Isso causa o `useEffect` do interval (linha 664) a **parar o loop de frames** (pois status não é 'monitoring' nem 'motion_detected').

Porém, em **dois caminhos de saída**, o status NÃO é resetado para `'monitoring'`:

1. **OCR falhou** (linhas 537-541): não faz `setStatus('monitoring')` — loop morto
2. **Consenso alcançado com sucesso** (linhas 480-528): também não reseta — loop morto após primeira leitura bem-sucedida

Resultado: após qualquer tentativa de OCR que caia nesses caminhos, o motion loop para permanentemente e nenhuma detecção automática acontece mais.

### Bug 2: `fastTrackValidatedRef` não reseta quando veículo sai (handleMotionResult)

Quando o veículo sai da área de detecção (hasMotion = false), o `fastTrackValidatedRef` **não é resetado** (linha 181-184). Ele só reseta via timeout de 15 segundos. Se um novo veículo chega antes dos 15s, o OCR é bloqueado pela guarda na linha 417-419.

## Correções

| Arquivo | Linha | Mudança |
|---------|-------|---------|
| `useContinuousMonitoring.ts` | 537-541 | Adicionar `setStatus('monitoring')` no path de falha OCR |
| `useContinuousMonitoring.ts` | ~527 | Adicionar `setStatus('monitoring')` após salvar detecção com consenso |
| `useContinuousMonitoring.ts` | 181-185 | Resetar `fastTrackValidatedRef`, `ocrBufferRef` e `lastPlateRegionRef` quando hasMotion = false |

