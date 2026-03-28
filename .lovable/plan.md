

# Plano: Modelo EfficientDet-Lite2 + Ajustes (v1.7.5)

## O que muda

Trocar o modelo de detecção de `efficientdet_lite0` (~4MB, menor precisão) para `efficientdet_lite2` (~7MB, maior precisão). Também baixar o threshold de confiança para capturar veículos parcialmente visíveis ou com faróis ofuscando.

## Mudanças

### 1. `src/react-app/utils/objectDetector.ts`
- Trocar MODEL_URL de `efficientdet_lite0` para `efficientdet_lite2`
- Baixar `scoreThreshold` de 0.35 para 0.25 (captura detecções com menor confiança)
- Atualizar comentário da versão

### 2. `src/react-app/pages/Configuracoes.tsx`
- Versão `1.7.5 (EfficientDet-Lite2)`

## Notas técnicas

- O `personDetector.ts` (Vigilância) usa sua própria instância separada — será mantido em `lite0` por enquanto para não impactar performance da vigilância
- O modelo lite2 é ~2x mais lento por inferência mas significativamente mais preciso, especialmente em condições difíceis (faróis, chuva, noite)
- O OCR Persistence Lock (v1.7.4) complementa esta melhoria — mesmo que o lite2 perca um frame, o lock mantém o pipeline ativo

| Arquivo | Mudança |
|---------|---------|
| `src/react-app/utils/objectDetector.ts` | Modelo lite2 + threshold 0.25 |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.7.5 |

