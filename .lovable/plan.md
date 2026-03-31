

# Plano: Corrigir Pipeline Não Iniciando para Veículo Atual (v1.7.8)

## Problema Raiz

Identifiquei **3 bugs** que explicam por que o pipeline não inicia para o carro atual mesmo com "Veículo detectado!":

### Bug 1: `processFrameForOCR` retorna `true` ao pular por fastTrack
Na linha 785, quando o fastTrack bloqueia o OCR (placa anterior ainda válida), a função retorna `true`. O caller na linha 1273 interpreta `success=true` como "parar de tentar" e zera `ocrLockUntilRef = 0`. Resultado: o sistema para de tentar OCR mesmo com veículo presente.

### Bug 2: Vehicle Swap falha para carros na mesma posição
Carros que passam pelo mesmo ponto (mesma faixa/vaga) têm bounding boxes similares → IoU > 0.6 → swap não detectado → fastTrack do carro anterior bloqueia o novo.

### Bug 3: Lock é zerado prematuramente no sucesso
Quando OCR valida com sucesso, `ocrLockUntilRef = 0` é definido imediatamente. Se o veículo seguinte já está no quadro, o lock está morto e o sistema depende apenas do próximo tick para reativar — criando um gap.

## Mudanças

| Arquivo | Correção |
|---------|----------|
| `MonitoringContext.tsx` | 4 correções no fluxo |

### Correção 1: Retornar `false` no skip de fastTrack
Mudar linha 785 de `return true` para `return false`. Isso mantém o lock ativo e o caller continua tentando OCR nos próximos ticks até o timeout expirar ou Vehicle Swap ser detectado.

### Correção 2: Adicionar detecção de swap por distância do centro
Além do IoU, calcular a distância do centro do bbox. Se o centro se moveu mais de 25% do frame (horizontalmente ou verticalmente), considerar como novo veículo — mesmo que o tamanho do bbox seja similar.

### Correção 3: Não zerar lock no sucesso quando veículo está presente
Remover `ocrLockUntilRef.current = 0` após sucesso. O lock deve expirar naturalmente (5s) ou ser resetado por Vehicle Swap. Isso garante que o sistema continue monitorando mesmo após um OCR bem-sucedido.

### Correção 4: Reduzir IoU threshold de 0.6 para 0.45
Para capturar trocas de veículos que ocupam posições similares.

## Versão
Atualizar para **v1.7.8 (Pipeline Flow Fix)** em `Configuracoes.tsx` e arquivos relevantes.

```text
ANTES:
Carro A valida → fastTrack=true → processFrameForOCR retorna true
  → caller: success! zera lock → pipeline morto
  → Carro B chega → "Veículo detectado!" mas nada acontece

DEPOIS:
Carro A valida → fastTrack=true → processFrameForOCR retorna false
  → caller: mantém lock, continua tentando
  → Carro B chega → centro mudou 30% → Vehicle Swap → pipeline inicia
```

