

# Plano: Corrigir Gargalos no Pipeline de Detecção e Leitura de Placas

## Problemas Identificados

### 1. Status bloqueia OCR por 2 segundos após cada tentativa
Após o OCR (sucesso ou falha), um `setTimeout` de 2s muda o status de volta para `monitoring`. Durante esses 2s, o status pode estar em um estado intermediário que impede novas tentativas de OCR para o próximo veículo.

### 2. Lock de validação bloqueia próximo veículo por 8 segundos
`fastTrackValidatedRef` fica `true` por 8s após uma placa ser validada. Se um segundo carro entra nesse período, o `processFrameForOCR` retorna imediatamente sem processar.

### 3. Intervalo de detecção recriado a cada mudança de status
O `useEffect` na linha 1305 depende de `status`, então toda mudança (`monitoring` → `motion_detected` → `processing` → `monitoring`) destrói e recria o `setInterval`, causando gaps de até 300ms a cada transição.

### 4. YOLO Swap Detection ausente
O sistema não detecta quando um veículo diferente entra na área — se a placa anterior foi validada, o buffer e lock persistem mesmo que seja um carro completamente diferente.

## Mudanças

| Arquivo | O que muda |
|---------|-----------|
| `MonitoringContext.tsx` | 4 correções no fluxo de detecção |

### Correção 1: Remover `status` da dependência do useEffect do intervalo
O intervalo de detecção deve rodar continuamente enquanto `isActive && mediapipeReady`, sem depender do `status`. O status é gerenciado internamente pelo tick.

### Correção 2: Resetar status imediatamente após OCR
Remover os `setTimeout` de 2s que atrasam o retorno ao status `monitoring`. O status de resultado (`✅ Casa X`) pode ficar na mensagem sem bloquear o fluxo.

### Correção 3: Detectar troca de veículo (Vehicle Swap)
Comparar o bounding box do veículo atual com o anterior. Se a posição/tamanho mudar >40% (IoU < 0.6), resetar `fastTrackValidatedRef`, `ocrBufferRef` e `ocrLockUntilRef` para permitir pipeline imediato do novo veículo.

### Correção 4: Reduzir VALIDATION_TIMEOUT de 8s para 5s
8 segundos é muito conservador. 5s é suficiente para a maioria dos cenários e permite que carros consecutivos sejam processados mais rapidamente.

## Detalhes Técnicos

```text
ANTES (fluxo problemático):
Carro A entra → detectado → OCR → validado → lock 8s
                                              ↓
Carro B entra (2s depois) → detectado → OCR bloqueado por lock
                                        → espera 6s → timeout → OCR começa

DEPOIS (fluxo corrigido):
Carro A entra → detectado → OCR → validado → lock 5s
                                              ↓
Carro B entra (2s depois) → bbox diferente → Vehicle Swap detectado
                           → lock resetado → OCR inicia imediatamente
```

### Implementação do Vehicle Swap

Armazenar o bounding box do último veículo validado em um ref. A cada tick, se há veículo na área e `fastTrackValidatedRef` está ativo, calcular IoU entre o bbox atual e o salvo. Se IoU < 0.6, é um veículo diferente — resetar tudo e permitir OCR.

