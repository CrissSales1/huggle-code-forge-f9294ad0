

# Correção: OCR Execution Lock em `useContinuousMonitoring.ts`

## Problema

O Motion Worker dispara `processFrameForOCR` a cada ~350ms. Como o OCR leva ~150-300ms, múltiplas invocações se acumulam no Worker, afogando a fila de mensagens e paralisando o sistema.

Falta um Execution Lock dedicado ao OCR — existe apenas `isProcessingMotionRef` para o movimento.

## Correção (1 arquivo, ~6 linhas)

**`src/react-app/hooks/useContinuousMonitoring.ts`:**

1. **Adicionar ref** após linha 157:
```typescript
const isProcessingOcrRef = useRef(false);
```

2. **Guard no início de `processFrameForOCR`** (após linha 412, antes do check de `fastTrackValidatedRef`):
```typescript
if (isProcessingOcrRef.current) return false;
isProcessingOcrRef.current = true;
```

3. **Unlock no `finally`** — envolver o bloco `try/catch` existente (linhas 428-543) para garantir desbloqueio em todos os caminhos:
   - Adicionar `finally { isProcessingOcrRef.current = false; }` ao bloco try/catch existente
   - Remover os `return` soltos que ficam antes do try (linhas 415-417 do `fastTrackValidatedRef`) e movê-los para dentro do try, após o lock

4. **Reset na parada** — adicionar `isProcessingOcrRef.current = false;` no `stopMonitoring` para garantir estado limpo ao reiniciar.

Nenhuma alteração no Worker ou em outros hooks.

