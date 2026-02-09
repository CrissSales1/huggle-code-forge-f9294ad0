

# Melhorias Significativas para Leitura de Placas - Analise e Opcoes

## Situacao Atual

O sistema usa um pipeline local com:
1. **YOLO** (TensorFlow.js) para detectar a regiao da placa no frame
2. **PaddleOCR** (ONNX Runtime) para ler os caracteres
3. **Heuristica posicional** para corrigir confusoes comuns (0/O, 1/I, etc.)
4. **Fuzzy matching** com variações simples e duplas para encontrar no banco
5. **Consistencia temporal** (3 leituras iguais antes de confirmar)
6. **Fallback opcional** para API externa (Plate Recognizer)

Os erros recentes (SSH->SSW, TKG2I97->TKG9D97) foram resolvidos adicionando mapeamentos no fuzzy matching. Mas isso trata o **sintoma** (matching pos-erro), nao a **causa** (OCR lendo errado).

---

## 3 Estrategias de Melhoria (da mais simples a mais impactante)

### Opcao A: Multi-Crop OCR (Impacto Medio, Esforco Baixo)

Rodar o OCR **3 vezes** na mesma placa com crops levemente diferentes e usar votacao majoritaria.

**Como funciona:**
- Crop 1: Padrao atual (15% topo, 5% base)
- Crop 2: Mais apertado (20% topo, 10% base)
- Crop 3: Mais largo (10% topo, 0% base)
- Comparar as 3 leituras caractere a caractere e escolher o mais frequente

**Vantagem:** Resolve confusoes causadas por alinhamento do crop (W/H, D/I)
**Desvantagem:** 3x mais lento por frame (~300ms vs ~100ms)

**Arquivos:** `plateProcessor.worker.ts` (funcao processPlate)

---

### Opcao B: Modelo OCR Maior/Melhor (Impacto Alto, Esforco Alto)

Substituir o modelo PaddleOCR atual (PP-OCRv3 generico) por um modelo treinado/fine-tuned especificamente para placas brasileiras.

**Opcoes de modelo:**
- PaddleOCR PP-OCRv4 (mais recente, melhor accuracy)
- Modelo treinado com dataset de placas BR (fontes Mercosul e antiga)
- Modelo CRNN customizado exportado para ONNX

**Vantagem:** Resolve a causa raiz -- o modelo atual nao conhece bem a fonte de placas BR
**Desvantagem:** Requer treinar/encontrar modelo, converter para ONNX, testar extensivamente

**Arquivos:** Modelo em `public/models/plate-ocr/`, worker para adapter

---

### Opcao C: Multi-Crop + Consenso Inteligente (Impacto Alto, Esforco Medio) -- RECOMENDADO

Combina Multi-Crop com o sistema de consenso ja existente de forma inteligente:

1. **Multi-Crop com 2 variantes** (nao 3, para manter performance):
   - Crop padrao + Crop com margem extra lateral
   - Se ambos concordam: confianca alta, aceitar direto (bypass consistencia temporal)
   - Se discordam: usar fuzzy matching para encontrar a variante que bate no banco

2. **Pre-processamento adaptativo**:
   - Detectar se a placa tem fundo claro ou escuro
   - Aplicar contraste invertido para placas Mercosul (fundo branco) vs antigas (fundo cinza)

3. **OCR com beam search** ao inves de greedy:
   - Em vez de pegar apenas o caractere mais provavel em cada posicao, manter top-3
   - Gerar ate 3 candidatos de placa e validar todos contra o banco

**Arquivos a modificar:**

| Arquivo | Mudanca |
|---------|---------|
| `plateProcessor.worker.ts` | Multi-crop, beam search no decodeCTC, pre-processamento adaptativo |
| `plateValidator.ts` | Nova funcao `rankCandidates` que ordena multiplos candidatos por probabilidade |
| `MonitoringContext.tsx` | Aceitar lista de candidatos do worker e buscar todos no banco |

**Estimativa de performance:** ~200ms por frame (vs ~100ms atual) -- ainda rapido o suficiente para tempo real

---

## Recomendacao

A **Opcao C** oferece o melhor custo-beneficio. Atacar em 2 fases:

**Fase 1** (rapida): Beam search no decodeCTC -- gerar top-3 candidatos em vez de 1
**Fase 2**: Multi-crop com 2 variantes + consenso cruzado

Isso reduz erros de OCR na origem sem precisar treinar modelos novos.

---

## Detalhes Tecnicos da Fase 1: Beam Search

### Mudanca no `decodeCTC` (worker)

Atualmente o decodeCTC usa decodificacao greedy (pega o caractere com maior probabilidade em cada posicao). Com beam search, mantemos os top-K candidatos:

```typescript
// Beam search simplificado para placas (7 posicoes fixas)
// Em vez de 1 resultado, retorna ate 3 candidatos ordenados por score
function decodeCTCBeam(output: Float32Array, outputShape: number[], beamWidth: number = 3): 
  Array<{ text: string; confidence: number; detectedFormat: string }>
```

### Mudanca no `processPlate` (worker)

```typescript
// Retornar multiplos candidatos no resultado
interface OCRResult {
  // ... campos existentes ...
  candidates?: Array<{ text: string; confidence: number }>;  // Top-3 candidatos
}
```

### Mudanca no `MonitoringContext.tsx`

```typescript
// Ao receber resultado com multiplos candidatos:
// 1. Buscar TODOS no banco (moradores + visitantes)
// 2. Se algum bate: usar esse
// 3. Se nenhum bate: usar o de maior confianca
```

---

## Resultado Esperado

| Cenario | Antes | Depois |
|---------|-------|--------|
| SSH3A38 (real: SSW3A38) | Depende de fuzzy matching | Beam search gera SSW3A38 como candidato #2, match direto |
| TKG2I97 (real: TKG9D97) | Depende de dual substitution | Beam search pode gerar TKG9D97 como candidato, ou Multi-crop resolve |
| Placas noturnas | Alta taxa de erro | Pre-processamento adaptativo melhora |

