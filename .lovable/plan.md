

# Plano: Correções do Histórico Clicável - v1.1.80

## Problemas Identificados

| Problema | Causa | Impacto |
|----------|-------|---------|
| Nova detecção não interrompe visualização do histórico | `selectedDetectionId` não é resetado quando `latestDetection` muda | Usuário pode perder veículos chegando |
| Pipeline mostra dados incorretos ao selecionar histórico | Timing incorreto: `pipelineData` é associado ao ID errado porque o hook do banco é assíncrono | Pipeline exibe imagens da detecção atual, não da selecionada |

---

## Análise Técnica

### Fluxo Atual (Problemático)

```text
1. OCR detecta placa → pipelineData atualizado (local)
2. Detecção gravada no banco → realtime dispara
3. latestDetection atualizado → useEffect associa pipelineData ao latestDetection.id
                                      ↑
                              PROBLEMA: pipelineData pode já ter mudado!
```

### Fluxo da Imagem do Usuário

```text
20:48 - FPA5F43 detectado → pipelineData = imagens FPA5F43
20:46 - FMX5807 selecionado pelo usuário
        → displayedDetection = FMX5807 ✓
        → displayedPipeline = pipelineHistory.get(FMX5807.id) 
                            = NÃO ENCONTRADO (não foi salvo corretamente)
                            → fallback para pipelineData atual = FPA5F43 ✗
```

---

## Solução

### 1. Resetar seleção quando nova detecção chegar

Adicionar lógica no `useEffect` para limpar `selectedDetectionId` quando houver nova detecção:

```typescript
// v1.1.80: Resetar seleção quando nova detecção chegar (prioridade é saber quem está chegando)
const prevLatestIdRef = useRef<number | null>(null);

useEffect(() => {
  if (latestDetection?.id && latestDetection.id !== prevLatestIdRef.current) {
    prevLatestIdRef.current = latestDetection.id;
    
    // Nova detecção chegou - voltar ao modo automático
    if (selectedDetectionId !== null) {
      setSelectedDetectionId(null);
    }
  }
}, [latestDetection?.id, selectedDetectionId]);
```

### 2. Corrigir associação do pipeline

O problema é que o `pipelineData` e o `latestDetection` são atualizados de forma assíncrona:
- `pipelineData` vem do `CameraMonitor` (local, imediato)
- `latestDetection` vem do banco via realtime (assíncrono, com delay)

A solução é criar um **buffer de pipeline por placa** ao invés de por ID:

```typescript
// v1.1.80: Buffer de pipeline por placa (mais confiável que por ID)
const [pipelineByPlate, setPipelineByPlate] = useState<Map<string, PipelineData>>(new Map());

// Quando pipelineData muda, salvar por placa
useEffect(() => {
  if (pipelineData?.rawText) {
    const placa = pipelineData.rawText.replace(/[^A-Z0-9]/g, '').toUpperCase();
    if (placa.length >= 7) {
      setPipelineByPlate(prev => {
        const updated = new Map(prev);
        updated.set(placa, { ...pipelineData });
        
        // Manter apenas as 15 mais recentes
        if (updated.size > 15) {
          const keys = Array.from(updated.keys());
          updated.delete(keys[0]); // Remove a mais antiga
        }
        
        return updated;
      });
    }
  }
}, [pipelineData]);

// Determinar pipeline a exibir - buscar por placa
const displayedPipeline = useMemo(() => {
  if (selectedDetectionId === null) return pipelineData;
  
  const detection = detectionHistory.find(d => d.id === selectedDetectionId);
  if (!detection) return pipelineData;
  
  // Buscar pipeline pela placa
  const placaLimpa = detection.placa.replace(/[^A-Z0-9]/g, '').toUpperCase();
  return pipelineByPlate.get(placaLimpa) || null;
}, [selectedDetectionId, pipelineData, detectionHistory, pipelineByPlate]);
```

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `src/react-app/pages/Monitoramento.tsx` | Resetar seleção em nova detecção + corrigir associação pipeline por placa |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.80 |

---

## Detalhes da Implementação

### Mudanças em `Monitoramento.tsx`

1. **Adicionar ref para ID anterior**:
```typescript
const prevLatestIdRef = useRef<number | null>(null);
```

2. **Substituir `pipelineHistory` por `pipelineByPlate`**:
```typescript
// Substituir:
const [pipelineHistory, setPipelineHistory] = useState<Map<number, PipelineData>>(new Map());

// Por:
const [pipelineByPlate, setPipelineByPlate] = useState<Map<string, PipelineData>>(new Map());
```

3. **Novo useEffect para salvar pipeline por placa**:
```typescript
useEffect(() => {
  if (pipelineData?.rawText) {
    const placa = pipelineData.rawText.replace(/[^A-Z0-9]/g, '').toUpperCase();
    if (placa.length >= 7) {
      setPipelineByPlate(prev => {
        const updated = new Map(prev);
        updated.set(placa, { ...pipelineData });
        if (updated.size > 15) {
          const oldest = updated.keys().next().value;
          updated.delete(oldest);
        }
        return updated;
      });
    }
  }
}, [pipelineData]);
```

4. **useEffect para resetar seleção em nova detecção**:
```typescript
useEffect(() => {
  if (latestDetection?.id && latestDetection.id !== prevLatestIdRef.current) {
    prevLatestIdRef.current = latestDetection.id;
    if (selectedDetectionId !== null) {
      setSelectedDetectionId(null);
    }
  }
}, [latestDetection?.id]);
```

5. **Atualizar useMemo `displayedPipeline`**:
```typescript
const displayedPipeline = useMemo(() => {
  if (selectedDetectionId === null) return pipelineData;
  
  const detection = detectionHistory.find(d => d.id === selectedDetectionId);
  if (!detection) return pipelineData;
  
  const placaLimpa = detection.placa.replace(/[^A-Z0-9]/g, '').toUpperCase();
  return pipelineByPlate.get(placaLimpa) || null;
}, [selectedDetectionId, pipelineData, detectionHistory, pipelineByPlate]);
```

6. **Remover useEffect de limpeza antigo** (linhas 200-208) que não é mais necessário.

---

## Comportamento Após Correção

| Cenário | Antes | Depois |
|---------|-------|--------|
| Nova detecção com histórico selecionado | Permanece no histórico | **Volta ao modo ao vivo automaticamente** |
| Selecionar item do histórico | Pipeline mostra imagem errada | **Pipeline mostra imagem correta (por placa)** |
| Pipeline não encontrado para item antigo | Mostra pipeline atual | **Mostra vazio (null) com mensagem apropriada** |

---

## Versão

```
Versão 1.1.80 (Histórico Pipeline Fix)
```

