

# Plano: Melhorar Detecção de Pessoas Distantes na Vigilância

## Diagnóstico

A câmera da screenshot mostra uma vista ampla da entrada de veículos. Pessoas distantes aparecem muito pequenas no frame (ocupando talvez 20-40px de altura em uma imagem 1280x720). O EfficientDet-Lite2 redimensiona internamente para 448x448, fazendo com que pessoas pequenas fiquem com apenas ~10-15px — abaixo do limiar prático de detecção do modelo.

A outra câmera provavelmente tem um ângulo mais fechado, onde as pessoas ocupam mais pixels, por isso funciona bem.

## Limitações reais

A distância **é** um empecilho real para qualquer modelo leve rodando no navegador. Não há como resolver 100%, mas podemos melhorar significativamente.

## Solução: Detecção em Duas Escalas (Multi-Scale)

Processar o frame em **duas passadas**: uma com o frame completo (pega pessoas próximas) e outra com crops ampliados de regiões de interesse (pega pessoas distantes).

### Mudanças

| Arquivo | O que muda |
|---------|-----------|
| `src/react-app/hooks/usePersonDetection.ts` | Adicionar lógica multi-scale: dividir frame em 4 quadrantes com overlap, rodar detecção em cada crop, e mesclar resultados com deduplicação por IoU |
| `src/react-app/utils/objectDetector.ts` | Adicionar função `detectObjectsFromCanvas` (se não existir) para processar crops via canvas |
| `src/react-app/contexts/VigilanciaContext.tsx` | Adicionar config `enhancedDetection` (boolean) para ativar/desativar modo multi-scale |
| `src/react-app/pages/Vigilancia.tsx` | Adicionar toggle "Detecção Aprimorada" no painel lateral |

### Como funciona

1. **Passada 1** — Frame completo (como hoje): detecta pessoas próximas/médias
2. **Passada 2** — 4 crops com 20% de overlap cobrindo o frame inteiro, cada um escalado para o tamanho de input do modelo: detecta pessoas pequenas/distantes
3. **Deduplicação** — Remove detecções duplicadas usando IoU (Intersection over Union) > 0.4
4. **Coordenadas** — Converte bounding boxes dos crops de volta para coordenadas do frame original

### Performance

- Passada multi-scale adiciona ~4 inferências extras a cada ciclo (300ms)
- Cada inferência do EfficientDet-Lite2 leva ~15-30ms em WebGL
- Total: ~60-120ms extra por ciclo — aceitável para o intervalo de 300ms
- Se necessário, o intervalo pode ser aumentado para 500ms quando multi-scale está ativo
- Toggle permite desativar quando a câmera é próxima (sem custo extra)

### Alternativa mais simples (se multi-scale for muito pesado)

Reduzir o `scoreThreshold` de 0.25 para **0.15** e aumentar `maxResults` para 30. Isso pode gerar mais falsos positivos, mas detectaria pessoas com menor confiança. Pode ser feito como primeiro passo antes do multi-scale.

