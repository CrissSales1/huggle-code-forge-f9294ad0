

# Plano: Melhorias no Sistema de Monitoramento - v1.1.87

## Problemas Identificados

1. **Area fantasma**: Sem carro mas nao fica "area limpa" - causado por mudancas de iluminacao que mantém a diferenca entre 5-10% (zona morta entre `CLEAN_THRESHOLD=5%` e `DETECTION_THRESHOLD=10%`)
2. **Carros em sequencia**: Segundo carro nao e lido porque `fastTrackValidatedRef=true` bloqueia ate o movimento cair abaixo de 8%, o que nao acontece quando outro carro ja entrou

## Melhorias Propostas (4 mudancas)

### Melhoria 1: Referencia Adaptativa (resolve area fantasma)

Ao inves de comparar sempre com a mesma foto de referencia estatica, atualizar a referencia automaticamente quando a area esta na zona intermediaria (5-10%) por mais de 15 segundos sem OCR ativo. Isso absorve mudancas graduais de iluminacao.

**Mudanca em `motionDetection.ts`:**
- Novo threshold: `INTERMEDIATE_UPDATE_DELAY_MS = 15000` (15s na zona morta → atualiza referencia)
- Na zona intermediaria (`!vehiclePresent && !areaClean`), se ficar 15s sem mudar, sinalizar `shouldUpdateReference = true`
- Isso elimina o "fantasma" de iluminacao

### Melhoria 2: Timeout de Validacao (resolve carros em sequencia)

Apos uma deteccao bem-sucedida, se passarem 15 segundos sem o veiculo sair (motion nao cai abaixo de 8%), forcar reset do `fastTrackValidated` e permitir nova leitura. Isso cobre o caso de um segundo carro entrar antes do primeiro sair.

**Mudanca em `useContinuousMonitoring.ts`:**
- Nova ref: `lastValidationTimeRef` que guarda o timestamp da ultima validacao
- No `processFrame`, se `fastTrackValidatedRef === true` e passaram 15s, fazer reset:
  - `fastTrackValidatedRef = false`
  - Limpar buffer OCR
  - Recapturar referencia
  - Log: `⏰ Timeout de validação - permitindo nova detecção`

### Melhoria 3: Cooldown por Placa (resolve carros em sequencia)

Atualmente `fastTrackValidatedRef` bloqueia TODA a area. Mudar para cooldown por placa especifica - so bloqueia a mesma placa por 30s, mas permite ler placas diferentes imediatamente.

**Mudanca em `useContinuousMonitoring.ts`:**
- Remover `fastTrackValidatedRef` como bloqueio global
- Usar `recentPlatesRef` (ja existe) para bloquear apenas a placa especifica
- Apos validacao, ao inves de setar `fastTrackValidatedRef = true`, apenas marcar a placa em `recentPlatesRef` e resetar o buffer OCR
- A flag `ocrSucceeded` no MotionDetector continua controlando a recaptura de referencia

### Melhoria 4: Deteccao de Troca de Veiculo via YOLO

Quando o YOLO detecta uma placa em posicao muito diferente da anterior (>40% de deslocamento no frame), considerar que e um veiculo novo e resetar o buffer OCR.

**Mudanca em `useContinuousMonitoring.ts`:**
- Nova ref: `lastPlateRegionRef` que guarda o ultimo `plateRegion` do resultado OCR
- Apos cada OCR, comparar posicao do bounding box YOLO com o anterior
- Se deslocamento X ou Y > 40% do frame, ou tamanho mudou >50%: resetar buffer
- Log: `🔄 Troca de veículo detectada via YOLO (posição mudou)`

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/react-app/utils/motionDetection.ts` | Melhoria 1: zona intermediaria atualiza referencia apos 15s |
| `src/react-app/hooks/useContinuousMonitoring.ts` | Melhorias 2, 3 e 4: timeout, cooldown por placa, troca YOLO |
| `src/react-app/pages/Configuracoes.tsx` | Versao 1.1.87 |

## Detalhes Tecnicos

### motionDetection.ts

```typescript
const INTERMEDIATE_UPDATE_DELAY_MS = 15000; // 15s na zona morta → atualiza ref

// Nova variavel de instancia
private intermediateZoneStart: number = 0;

// Na zona intermediaria (linhas 549-553), adicionar:
} else if (!vehicleExited) {
  // Zona intermediária - pode ser iluminação mudando
  this.consecutiveMotionFrames = 0;
  if (this.intermediateZoneStart === 0) {
    this.intermediateZoneStart = now;
  } else if (now - this.intermediateZoneStart >= INTERMEDIATE_UPDATE_DELAY_MS
             && !this.ocrSucceeded) {
    // 15s na zona morta sem OCR ativo → atualizar referência
    shouldUpdateReference = true;
    this.intermediateZoneStart = 0;
    console.log('🔄 Referência atualizada (zona intermediária por 15s)');
  }
}
```

Reset `intermediateZoneStart = 0` quando veículo presente ou area limpa.

### useContinuousMonitoring.ts

```typescript
// Melhoria 2: Timeout
const VALIDATION_TIMEOUT_MS = 15000;
const lastValidationTimeRef = useRef<number>(0);

// No processFrame, antes de checar shouldAttemptOCR:
if (fastTrackValidatedRef.current) {
  const elapsed = Date.now() - lastValidationTimeRef.current;
  if (elapsed > VALIDATION_TIMEOUT_MS) {
    console.log('⏰ Timeout de validação - permitindo nova detecção');
    fastTrackValidatedRef.current = false;
    resetOcrBuffer();
    captureReferenceFrame();
    motionDetectorRef.current.resetOcrAttempt();
  }
}

// Melhoria 3: Apos validacao bem-sucedida, NAO setar fastTrack global
// Apenas resetar buffer e marcar placa como recente
// fastTrackValidatedRef.current = true; → REMOVER
// Em vez disso: apenas markPlateDetected(placa) + resetar buffer + markOcrSuccess()
// O markOcrSuccess() ja impede novas tentativas ate veiculo sair

// Melhoria 4: Troca YOLO
const lastPlateRegionRef = useRef<{x:number,y:number,w:number,h:number}|null>(null);

// Apos receber resultado OCR com plateRegion:
if (result.plateRegion && lastPlateRegionRef.current) {
  const prev = lastPlateRegionRef.current;
  const curr = result.plateRegion;
  const dx = Math.abs(curr.x - prev.x) / canvasWidth;
  const dy = Math.abs(curr.y - prev.y) / canvasHeight;
  const dw = Math.abs(curr.width - prev.w) / prev.w;
  if (dx > 0.4 || dy > 0.4 || dw > 0.5) {
    console.log('🔄 Troca de veículo detectada via YOLO');
    resetOcrBuffer();
  }
}
lastPlateRegionRef.current = result.plateRegion ? 
  { x: result.plateRegion.x, y: result.plateRegion.y, 
    w: result.plateRegion.width, h: result.plateRegion.height } : null;
```

### Versao

```
1.1.87 (Smart Detection)
```

## Resumo do Impacto

| Problema | Melhoria | Resultado |
|----------|----------|-----------|
| Area fantasma (iluminacao) | Ref adaptativa 15s | Referencia se atualiza sozinha |
| 2o carro nao lido | Timeout 15s + cooldown por placa | Desbloqueia apos 15s OU imediatamente para placa diferente |
| Carro diferente na sequencia | Deteccao YOLO de troca | Reset instantaneo se bounding box mudou |

Zero impacto em performance - sao apenas comparacoes de numeros e timestamps.

