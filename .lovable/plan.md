

# Plano: Persistência do Pipeline OCR no Histórico (v1.7.6)

## Problema

O `pipelineByPlate` é armazenado em `useState` — um Map em memória que é perdido ao recarregar a página ou fechar o app. Quando o usuário clica em uma placa do histórico, o pipeline só aparece se foi capturado na sessão atual.

## Solução

Persistir os dados de pipeline (imagens debug base64 + metadados) no **IndexedDB** (mais adequado que localStorage por suportar dados maiores — cada pipeline com 2 imagens base64 pode ter ~200KB+).

### Mudanças

#### 1. Novo utilitário: `src/react-app/utils/pipelineStorage.ts`
- Wrapper simples sobre IndexedDB usando a API nativa
- Store `pipeline_cache` com chave = placa limpa (ex: `ABC1D23`)
- Valor = `PipelineData` completo (incluindo `debugImages`)
- Limite de 20 registros (FIFO — remove os mais antigos)
- Funções: `savePipeline(placa, data)`, `loadPipeline(placa)`, `loadAllPipelines()`

#### 2. Modificar `src/react-app/pages/Monitoramento.tsx`
- Ao salvar no `pipelineByPlate` (linha ~195), também persistir no IndexedDB via `savePipeline()`
- Ao montar o componente, carregar pipelines salvos do IndexedDB para inicializar o `pipelineByPlate`
- No `displayedPipeline` memo, se não encontrou no Map em memória, tentar buscar do IndexedDB (com cache)

#### 3. Versão
- `1.7.6 (Pipeline Persistente)`

### Detalhes técnicos

```text
IndexedDB "portacerta_db" v1
  └── object store: "pipeline_cache"
       ├── key: placa limpa (ex: "ABC1D23")
       ├── value: { ...PipelineData, savedAt: timestamp }
       └── max 20 entries (FIFO cleanup)

Fluxo:
  Nova detecção → salva em useState Map + IndexedDB
  App reinicia → carrega IndexedDB → popula Map
  Clique histórico → busca no Map (já populado do IndexedDB)
```

| Arquivo | Mudança |
|---------|---------|
| `src/react-app/utils/pipelineStorage.ts` | **Novo** — wrapper IndexedDB |
| `src/react-app/pages/Monitoramento.tsx` | Persistir e carregar pipelines |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.7.6 |

