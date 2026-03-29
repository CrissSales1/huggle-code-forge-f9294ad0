

# Plano: Corrigir Pipeline Não Exibido no Histórico (v1.7.6 fix)

## Problema

Ao clicar em uma placa no histórico, as imagens do pipeline (Placa Processada / Resultado OCR) não aparecem. Isso acontece por dois motivos:

1. **Cópia rasa (shallow copy)**: O `{ ...pipelineData }` não faz deep-copy do objeto `debugImages`. Se o `processingInfo` mudar depois (ex: pipeline resetado para próximo veículo), as referências internas são perdidas.
2. **Salvamento prematuro**: O efeito salva no momento em que `rawText` aparece, mas o `debugImages` pode ainda não estar completo nesse ponto. Depois, quando as imagens chegam, o efeito dispara de novo mas pode estar em estado transitório.

## Solução

### 1. `src/react-app/pages/Monitoramento.tsx`
- **Deep-copy ao salvar**: Trocar `{ ...pipelineData }` por uma cópia profunda que clona `debugImages` separadamente
- **Salvar apenas com imagens**: Condicionar o salvamento a `pipelineData.debugImages?.preprocessed || pipelineData.debugImages?.final` existirem — evita salvar snapshots sem imagens
- **Deep-copy no IndexedDB load**: Garantir que os dados carregados do IndexedDB são objetos independentes (já são, pois vêm de serialização)

### 2. `src/react-app/utils/pipelineStorage.ts`
- Sem alterações necessárias — IndexedDB serializa/deserializa corretamente

| Arquivo | Mudança |
|---------|---------|
| `src/react-app/pages/Monitoramento.tsx` | Deep-copy + salvar só quando imagens existem |

