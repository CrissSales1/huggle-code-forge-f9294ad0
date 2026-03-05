

# v1.1.91: Fix YOLO 320px - Modelo tem shape fixo

## Problema

O modelo YOLO (`model.json`) foi treinado com input fixo `[1, 640, 640, 3]`. Ele é um GraphModel congelado (frozen) — não aceita dimensões diferentes. Não é possível fazer inferência a 320px com este modelo sem retreiná-lo.

A tentativa de warmup com `[1, 320, 320, 3]` causa erro fatal: `The shape of dict['images'] must be [1,640,640,3], but was [1,320,320,3]`.

## Solução

Remover a opção de 320px das Configurações e do worker. O modelo é fixo a 640px. Manter a infraestrutura `SET_CONFIG` para futuras otimizações (ex: se um modelo 320px for treinado).

### Arquivos a modificar

| Arquivo | Mudança |
|---------|---------|
| `plateProcessor.worker.ts` | Remover lógica de `currentYoloInputSize` variável. Usar constante `YOLO_INPUT_SIZE = 640`. Manter `SET_CONFIG` handler mas ignorar `yoloInputSize` com log explicativo |
| `Configuracoes.tsx` | Remover seletor de resolução YOLO. Adicionar texto informativo: "YOLO: 640px (fixo — modelo pré-treinado)" |

### Detalhes técnicos

**Worker**: Reverter `currentYoloInputSize` para constante `640`. No handler `SET_CONFIG`, logar aviso se alguém tentar mudar:
```typescript
const YOLO_INPUT_SIZE = 640; // Modelo GraphModel fixo - não aceita outras dimensões

case 'SET_CONFIG':
  // yoloInputSize ignorado - modelo fixo a 640px
  break;
```

Substituir todas as referências a `currentYoloInputSize` por `YOLO_INPUT_SIZE`.

**Configurações**: Remover o select de resolução YOLO e a key `portacerta_yolo_resolution` do localStorage. Mostrar apenas info estática do modelo.

