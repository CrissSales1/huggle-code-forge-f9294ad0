

# Plano: Auto-Reset da Referência Quando Veículo Sai - v1.1.81

## Problema Identificado

Na imagem do usuário:
- O carro já saiu da área virtual
- O indicador ainda mostra "Veículo: 24%"
- Quando o próximo carro chegar, a diferença será pequena (carro vs carro) e a detecção falhará

### Causa Raiz

A imagem de referência foi capturada/atualizada **com um veículo presente**. Isso acontece porque:

1. O sistema atualiza a referência após 10 segundos de "área limpa" (`AUTO_UPDATE_DELAY_MS`)
2. Porém, o `CLEAN_THRESHOLD` (5%) é muito baixo - um carro parado pode ter variação < 5% entre frames
3. Resultado: O sistema interpreta "carro parado" como "área limpa" e atualiza a referência **com o carro**

### Fluxo Problemático

```
Carro entra → Diferença 24% → OCR executado → Sucesso
Carro para → Diferença entre frames < 5% → Sistema pensa "área limpa"
10 segundos depois → Referência atualizada COM O CARRO
Carro sai → Diferença 24% (agora a referência tem carro, mas área está vazia)
Próximo carro → Diferença carro vs carro = pequena → OCR não dispara
```

---

## Solução

### Estratégia: Reset Inteligente Baseado em Estado

1. **Nunca atualizar referência enquanto `hasMotion` ou `ocrSucceeded` for true**
2. **Após OCR bem-sucedido, esperar veículo SAIR (diferença voltar a zero) antes de permitir atualização**
3. **Quando diferença cair para < `CLEAN_THRESHOLD` E `ocrSucceeded` era true, significa que veículo saiu → capturar nova referência imediatamente**

### Nova Lógica no `processFrame`:

```typescript
// Thresholds
const DETECTION_THRESHOLD = 0.10; // 10% = veículo presente
const CLEAN_THRESHOLD = 0.05;     // 5% = área limpa
const VEHICLE_EXITED_THRESHOLD = 0.08; // 8% = transição de saída

// Novo: Rastrear estado de OCR bem-sucedido para detectar saída
private vehicleWasDetected: boolean = false;

processFrame(...) {
  // ...cálculo de diffPercent...
  
  // Detectar transição: veículo detectado → veículo saiu
  if (this.ocrSucceeded && diffPercent < VEHICLE_EXITED_THRESHOLD) {
    // Veículo saiu após detecção bem-sucedida!
    console.log('🚗 Veículo saiu da área - resetando para próximo');
    
    // Capturar nova referência AGORA (área limpa)
    shouldUpdateReference = true;
    
    // Resetar flags para próximo veículo
    this.ocrSucceeded = false;
    this.ocrAttempted = false;
    this.vehicleWasDetected = false;
  }
  
  // Nunca atualizar referência enquanto há veículo detectado
  if (vehiclePresent || this.ocrSucceeded) {
    this.lastCleanTime = 0; // Bloquear auto-update
    this.referenceUpdatePending = false;
  }
}
```

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `src/react-app/utils/motionDetection.ts` | Nova lógica de detecção de saída do veículo + bloqueio de atualização incorreta |
| `src/react-app/hooks/useContinuousMonitoring.ts` | Passar callback para resetar buffer quando veículo sair |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.81 |

---

## Detalhes Técnicos

### 1. Novo threshold para detectar saída (motionDetection.ts)

```typescript
// Linha ~369
const DETECTION_THRESHOLD = 0.10; // 10% de diferença = veículo presente
const CLEAN_THRESHOLD = 0.05;     // 5% de diferença = área considerada limpa
const VEHICLE_EXIT_THRESHOLD = 0.08; // 8% = veículo está saindo/saiu
const AUTO_UPDATE_DELAY_MS = 10000; // 10 segundos limpa = atualiza referência
```

### 2. Nova lógica em `processFrame` (motionDetection.ts)

Modificar o método `processFrame` para:

```typescript
processFrame(...): {..., vehicleExited: boolean } {
  // ...código existente de comparação...
  
  const diffPercent = compareFrames(this.referenceFrame, currentFrame, this.config);
  const vehiclePresent = diffPercent >= DETECTION_THRESHOLD;
  const areaClean = diffPercent < CLEAN_THRESHOLD;
  
  // v1.1.81: Detectar quando veículo SAI da área após detecção bem-sucedida
  let vehicleExited = false;
  
  if (this.ocrSucceeded && diffPercent < VEHICLE_EXIT_THRESHOLD) {
    // Transição: tinha veículo (OCR sucesso) → área limpa agora
    console.log('🚗💨 Veículo saiu após detecção - capturando nova referência');
    vehicleExited = true;
    shouldUpdateReference = true;
    
    // Reset completo para próximo veículo
    this.ocrSucceeded = false;
    this.ocrAttempted = false;
    this.lastOcrAttemptTime = 0;
    this.consecutiveMotionFrames = 0;
    this.lastCleanTime = Date.now();
  }
  
  // v1.1.81: BLOQUEAR atualização automática enquanto há veículo ou OCR ativo
  if (vehiclePresent || (this.ocrSucceeded && !vehicleExited)) {
    this.lastCleanTime = 0; // Impede auto-update
    this.referenceUpdatePending = false;
  }
  
  return { 
    hasMotion, 
    isStable, 
    shouldAttemptOCR, 
    motionPercent: diffPercent, 
    shouldUpdateReference,
    vehicleExited  // NOVO: sinaliza para limpar buffer OCR
  };
}
```

### 3. Hook useContinuousMonitoring.ts - Limpar buffer ao sair

```typescript
// Em processFrame callback (~linha 552)
const result = motionDetectorRef.current.processFrame(...);

// v1.1.81: Se veículo saiu, limpar buffer OCR
if (result.vehicleExited) {
  resetOcrBuffer();
  console.log('🧹 Buffer OCR limpo - veículo saiu');
}
```

---

## Fluxo Corrigido

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ESTADO INICIAL                                                          │
│ Referência: área vazia | Diferença: 0% | Status: Monitorando           │
└────────────────────────────────────┬────────────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ CARRO ENTRA                                                             │
│ Referência: área vazia | Diferença: 24% | Status: Veículo detectado!   │
│ → OCR executado → Placa identificada → ocrSucceeded = true             │
│ → Auto-update de referência BLOQUEADO (ocrSucceeded = true)            │
└────────────────────────────────────┬────────────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ CARRO SAI                                                               │
│ Diferença cai para < 8% | ocrSucceeded era true                        │
│ → DETECTADO: vehicleExited = true                                       │
│ → Captura nova referência IMEDIATAMENTE (área limpa)                   │
│ → Reset: ocrSucceeded = false, buffer OCR limpo                        │
│ → Diferença: 0% | Status: Monitorando                                  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ PRÓXIMO CARRO                                                           │
│ Referência: área vazia (atualizada!) | Diferença: 22% | Detecta OK!    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Carro sai após OCR | Diferença fica 24% | **Diferença reseta para ~0%** |
| Referência | Continha o carro | **Sempre limpa (sem veículo)** |
| Próximo carro | Detecção fraca/falha | **Detecção normal (~20%+)** |
| Atualização auto | Podia atualizar com carro | **Bloqueada enquanto há veículo** |

---

## Versão

```
Versão 1.1.81 (Auto-Reset Referência)
```

