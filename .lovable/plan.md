

# Plano: Lock de Persistência OCR (v1.7.4)

## Problema

Quando o MediaPipe detecta um veículo, o pipeline OCR inicia. Porém, se o MediaPipe falha em detectar o veículo no frame seguinte (por oscilação, oclusão parcial, reflexo), o sistema reseta o buffer OCR após apenas 3 ticks (~1s) e volta ao estado `monitoring`. O veículo continua parado, mas o processo foi abortado.

## Causa raiz (linhas 1245-1258)

```
} else {
  noMotionCounterRef.current++;
  // After 3 ticks (~1s) without vehicle, reset OCR buffer
  if (noMotionCounterRef.current >= 3 && statusRef.current === 'motion_detected') {
    resetOcrBuffer();
    setStatus('monitoring');
  }
}
```

Apenas 3 frames (~1s) sem detecção já descartam todo o progresso OCR acumulado.

## Solução

Implementar um **Lock de Persistência**: quando o primeiro veículo é detectado e o OCR inicia, o sistema mantém o pipeline ativo por um período mínimo garantido, independentemente do MediaPipe perder o veículo temporariamente.

### Mudanças em `MonitoringContext.tsx`

1. **Novo ref `ocrLockUntilRef`** — timestamp até quando o pipeline deve continuar tentando OCR mesmo sem detecção de veículo
2. **Constante `OCR_LOCK_DURATION_MS = 8000`** — 8 segundos de persistência após primeira detecção
3. **Ao detectar veículo e iniciar OCR**: setar `ocrLockUntilRef.current = Date.now() + OCR_LOCK_DURATION_MS`
4. **No bloco `else` (sem veículo)**: antes de resetar, verificar se `Date.now() < ocrLockUntilRef.current`. Se sim, continuar tentando OCR usando o último `vehicleBBoxRef` salvo (não limpar o ref)
5. **Aumentar threshold de reset**: de 3 ticks para 10 ticks (~3s) como fallback adicional após o lock expirar
6. **Ao validar placa com sucesso**: resetar o lock (já concluiu)

### Lógica revisada (pseudocódigo)

```text
if hasVehicle:
    salvar bbox, resetar contador
    renovar lock (ocrLockUntilRef = now + 8s)
    tentar OCR se não em progresso
else:
    noMotionCounter++
    if now < ocrLockUntilRef:       ← NOVO: lock ativo
        continuar tentando OCR com último bbox salvo
    elif noMotionCounter >= 10:     ← era 3, agora 10
        resetar buffer e voltar a monitoring
```

### Versão

`1.7.4 (OCR Persistence Lock)`

## Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `src/react-app/contexts/MonitoringContext.tsx` | Lock de persistência OCR + threshold 10 ticks |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.7.4 |

