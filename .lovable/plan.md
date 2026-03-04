

# Diagnóstico: OCR não inicia automaticamente após detecção de veículo

## Bug Identificado

**Arquivo:** `src/react-app/hooks/useContinuousMonitoring.ts`, **linha 412**

```typescript
if (!videoRef.current || status !== 'monitoring') return false;
```

### Fluxo do problema:

1. `handleMotionResult` detecta movimento → seta `status` para `'motion_detected'` (linha 177)
2. Na mesma callback, chama `processFrameForOCRRef.current?.()` (linha 187)
3. `processFrameForOCR` verifica `status !== 'monitoring'` → como o status acabou de mudar para `'motion_detected'`, **retorna `false` imediatamente sem executar o OCR**

O status `'motion_detected'` é uma condição legítima para iniciar o OCR, mas o guard na linha 412 só aceita `'monitoring'`.

## Correção

**Linha 412** — alterar o guard para aceitar ambos os estados:

```typescript
if (!videoRef.current || (status !== 'monitoring' && status !== 'motion_detected')) return false;
```

Mudança de **1 linha**. Nenhum outro arquivo afetado.

## Por que "Leitura Manual" funciona

O botão de leitura manual provavelmente chama `recognizeFromCanvas` diretamente, sem passar pelo guard de status, por isso funciona mesmo quando o fluxo automático está bloqueado.

