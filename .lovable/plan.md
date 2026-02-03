
# Plano: Histórico Clicável com Exibição de Detalhes e Pipeline - v1.1.79

## Resumo da Funcionalidade

Tornar os registros do histórico na página de Monitoramento clicáveis. Ao clicar, mostrar os detalhes na seção "Resultado" e exibir as imagens do pipeline OCR correspondentes. O histórico mantém apenas 10 registros e as imagens de pipeline mais antigas são descartadas automaticamente.

---

## Análise Atual

### Estrutura Existente

| Componente | Responsabilidade |
|------------|------------------|
| `useLPRDetections()` | Retorna `latestDetection` e `detectionHistory` (máx 10 itens) |
| `Monitoramento.tsx` | Renderiza resultado + histórico + pipeline |
| `pipelineData` | Dados atuais do OCR (imagens de debug, confiança, etc.) |

### Problema Atual

O histórico exibe os registros, mas não são clicáveis. O "Resultado" sempre mostra a **última** detecção (`latestDetection`) e o pipeline mostra apenas o processamento **atual**.

---

## Arquitetura da Solução

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Monitoramento.tsx                                                          │
│                                                                            │
│  Estado Novo:                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ selectedDetection: DetectionWithPipeline | null                      │ │
│  │ pipelineHistory: Map<number, PipelineData>  (chave = id da detecção) │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│  Fluxo:                                                                    │
│  1. Nova detecção → salvar pipelineData no Map                            │
│  2. Histórico recebe 11º item → remover o mais antigo + deletar pipeline  │
│  3. Clique no histórico → atualizar selectedDetection                     │
│  4. Resultado exibe selectedDetection || latestDetection                  │
│  5. Pipeline exibe pipelineHistory.get(selectedId) || pipelineData        │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `src/react-app/pages/Monitoramento.tsx` | Adicionar estado de seleção, armazenar pipeline por detecção, tornar histórico clicável |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.79 |

---

## Detalhes Técnicos

### 1. Novos Estados em `Monitoramento.tsx`

```typescript
// Detecção selecionada pelo usuário (null = mostrar última automaticamente)
const [selectedDetection, setSelectedDetection] = useState<DetectionWithPipeline | null>(null);

// Map de pipelines por ID da detecção (para mostrar imagens ao clicar no histórico)
const [pipelineHistory, setPipelineHistory] = useState<Map<number, PipelineData>>(new Map());
```

### 2. Interface para Detecção com Pipeline

```typescript
interface DetectionWithPipeline {
  id: number;
  placa: string;
  timestamp: string;
  morador: { casa: string } | null;
  visitante: { casa: string; nome: string } | null;
  confidence: number;
  fonteDeteccao: string;
  pipelineData?: PipelineData; // Dados do pipeline armazenados
}
```

### 3. Armazenar Pipeline ao Receber Nova Detecção

```typescript
// Quando latestDetection muda E temos pipelineData novo
useEffect(() => {
  if (latestDetection?.id && pipelineData) {
    setPipelineHistory(prev => {
      const updated = new Map(prev);
      
      // Guardar pipeline para esta detecção
      updated.set(latestDetection.id, { ...pipelineData });
      
      // Manter apenas os 10 mais recentes (limpar antigos)
      if (updated.size > 10) {
        const idsNoHistorico = new Set(detectionHistory.map(d => d?.id).filter(Boolean));
        for (const key of updated.keys()) {
          if (!idsNoHistorico.has(key)) {
            updated.delete(key);
          }
        }
      }
      
      return updated;
    });
  }
}, [latestDetection?.id, pipelineData]);
```

### 4. Handler de Clique no Histórico

```typescript
const handleHistoryClick = (detection: DetectionWithPipeline) => {
  // Se clicou na mesma detecção, desselecionar (voltar para auto)
  if (selectedDetection?.id === detection.id) {
    setSelectedDetection(null);
  } else {
    setSelectedDetection(detection);
  }
};
```

### 5. Determinar o que Exibir

```typescript
// Detecção a exibir no Resultado
const displayedDetection = selectedDetection || latestDetection;

// Pipeline a exibir
const displayedPipeline = selectedDetection 
  ? pipelineHistory.get(selectedDetection.id) 
  : pipelineData;
```

### 6. Tornar Histórico Clicável (JSX)

```tsx
{detectionHistory.map((det, idx) => (
  <div 
    key={det.id || idx}
    onClick={() => handleHistoryClick(det)}
    className={`p-2 rounded-lg border text-xs cursor-pointer transition-all
      ${selectedDetection?.id === det.id 
        ? 'ring-2 ring-blue-500 ring-offset-1 shadow-md' 
        : 'hover:shadow-md hover:scale-[1.01]'
      }
      ${det.morador 
        ? 'bg-green-50 border-green-200 hover:bg-green-100' 
        : det.visitante
        ? 'bg-amber-50 border-amber-200 hover:bg-amber-100'
        : 'bg-red-50 border-red-200 hover:bg-red-100'
      }`}
  >
    {/* Conteúdo existente */}
  </div>
))}
```

### 7. Indicador Visual de Modo Selecionado

Adicionar badge no header do Resultado quando exibindo histórico:

```tsx
<div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
  <h3 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
    <Activity className="w-4 h-4 text-blue-600" />
    <span>Resultado</span>
    {selectedDetection && (
      <button 
        onClick={() => setSelectedDetection(null)}
        className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex items-center gap-1 hover:bg-blue-200"
      >
        <Clock className="w-3 h-3" />
        Histórico
        <X className="w-3 h-3" />
      </button>
    )}
  </h3>
  {/* Badge de status */}
</div>
```

---

## Fluxo de Limpeza Automática

```text
Histórico tem 10 itens
        ↓
Nova detecção chega (11º item)
        ↓
┌───────────────────────────────────┐
│ 1. Realtime adiciona nova no topo │
│ 2. Remove item mais antigo (10º)  │
│ 3. pipelineHistory.delete(oldId)  │
│ 4. Se oldId === selectedId:       │
│    → setSelectedDetection(null)   │
└───────────────────────────────────┘
        ↓
UI atualizada automaticamente
```

---

## Resultado Visual Esperado

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Resultado        🕐 Histórico ×     │ Histórico                    10  │
├─────────────────────────────────────┼──────────────────────────────────┤
│  ┌────────────────────────────────┐ │  ┌────────────────────────┐      │
│  │     🟢 MORADOR AUTORIZADO      │ │  │ SSW3A38 ← SELECIONADO  │ ◀──┐ │
│  │         ⬛ SSW3A38 ⬛           │ │  │ Casa 14           19:56│    │ │
│  │         🏠 Casa 14              │ │  └────────────────────────┘    │ │
│  │     19:56:28 • OCR (95%)       │ │  ┌────────────────────────┐    │ │
│  └────────────────────────────────┘ │  │ DID5155              19:54│  │ │
│                                     │  │ Casa 75                  │  │ │
│  Pipeline OCR: "SSW3A38"           │  └────────────────────────────┘  │ │
│  ┌─────────────┐ ┌─────────────┐   │  ┌────────────────────────┐    │ │
│  │ Processada  │ │ Resultado   │   │  │ GDM5J48              19:52│  │ │
│  │ [imagem]    │ │ [imagem]    │   │  │ Casa 55                  │  │ │
│  └─────────────┘ └─────────────┘   │  └────────────────────────────┘  │ │
└─────────────────────────────────────┴──────────────────────────────────┘
                                            ↑
                                   Clique para ver detalhes
```

---

## Comportamentos

| Cenário | Comportamento |
|---------|---------------|
| Usuário clica em item do histórico | Exibe detalhes + pipeline daquele item |
| Usuário clica no mesmo item | Volta ao modo automático (última detecção) |
| Usuário clica no botão "× Histórico" | Volta ao modo automático |
| Nova detecção chega | Se em modo auto: atualiza. Se selecionado: mantém seleção |
| Item selecionado sai do histórico | Volta ao modo automático automaticamente |

---

## Versão

```
Versão 1.1.79 (Histórico Clicável)
```
