

# Plano: Fase 2 - Multi-Crop com 2 Variantes e Consenso Cruzado - v1.1.86

## Objetivo

Rodar o OCR **2 vezes** no mesmo frame da placa com crops levemente diferentes, e usar consenso cruzado para melhorar a precisao. Quando os dois crops concordam, a confianca e maxima. Quando discordam, ambos os resultados (incluindo beam search de cada) sao enviados como candidatos para matching no banco.

## Como Funciona

```text
Frame da placa (YOLO crop + padding 15px)
    |
    +---> Crop A (padrao): 15% topo, 5% base, 260px em 320px
    |         |
    |         +---> OCR -> "OVR8E54" (95%) + beam candidates
    |
    +---> Crop B (margem extra): 10% topo, 2% base, 280px em 320px
              |
              +---> OCR -> "QYR8E54" (88%) + beam candidates
    |
    Consenso cruzado:
      - Se A == B: confianca alta, resultado unico
      - Se A != B: merge dos candidatos de ambos, ordenar por confianca
```

## Impacto no Performance

- Cada OCR roda em ~50-100ms
- Com 2 crops: ~100-200ms por frame (aceitavel para tempo real)
- O YOLO e otimizacao de imagem rodam apenas 1 vez (nao duplicados)

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/react-app/workers/plateProcessor.worker.ts` | Nova funcao `preprocessForONNXVariant`, modificar `runONNXOCR` para aceitar parametros de crop, modificar `processPlate` para rodar 2 OCRs e fazer consenso |
| `src/react-app/pages/Configuracoes.tsx` | Versao 1.1.86 |

## Detalhes Tecnicos

### 1. Nova funcao `preprocessForONNXVariant`

Refatorar `preprocessForONNX` para aceitar parametros de crop configuraveis:

```typescript
interface CropParams {
  cropTopRatio: number;    // % do topo a remover
  cropBottomRatio: number; // % da base a remover
  drawWidth: number;       // largura util no tensor
}

const CROP_STANDARD: CropParams = { cropTopRatio: 0.15, cropBottomRatio: 0.05, drawWidth: 260 };
const CROP_WIDE: CropParams     = { cropTopRatio: 0.10, cropBottomRatio: 0.02, drawWidth: 280 };
```

A funcao `preprocessForONNX` passa a aceitar um `CropParams` opcional, usando `CROP_STANDARD` como default.

### 2. Nova funcao `runONNXOCRWithCrop`

Wrapper que chama `preprocessForONNX` com parametros de crop especificos e depois roda a inferencia ONNX + beam search. Evita duplicar codigo.

### 3. Modificar `processPlate` - Consenso Cruzado

Apos a etapa de otimizacao de imagem (linha ~2105), ao inves de chamar `runONNXOCR` uma vez:

1. Chamar `runONNXOCRWithCrop(data, w, h, CROP_STANDARD)` -> resultado A
2. Chamar `runONNXOCRWithCrop(data, w, h, CROP_WIDE)` -> resultado B
3. Consenso:
   - Se `A.text === B.text`: usar esse texto com confianca = max(A.conf, B.conf)
   - Se diferem: merge de todos os candidatos (A greedy, A beam, B greedy, B beam), deduplicar, ordenar por confianca
4. O resultado principal (rawText, ocrConfidence) vem do candidato mais confiante
5. O array `candidates` contem todos os candidatos unicos de ambos os crops

### 4. Log de consenso

Adicionar log conciso quando os dois crops discordam:

```typescript
console.log(`🔀 Multi-Crop: A="${textA}" B="${textB}" → merged ${totalCandidates} candidatos`);
```

Quando concordam:

```typescript
console.log(`✅ Multi-Crop: consenso "${textA}" (${confA}%/${confB}%)`);
```

### 5. Versao

```
1.1.86 (Multi-Crop OCR)
```

## Validacao Esperada

| Cenario | Crop A | Crop B | Resultado |
|---------|--------|--------|-----------|
| Placa alinhada | ENE7A63 | ENE7A63 | Consenso direto |
| Placa com margem critica | OVR8E54 | QVR8E54 | Merge candidatos, fuzzy resolve |
| Placa parcialmente cortada | SSH3A38 | SSW3A38 | Crop B acerta, merge com A |

