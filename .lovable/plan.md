

# Plano: Corrigir Contagem e Exportação Completa - v1.1.78

## Problema Identificado

Analisando o PDF da Casa 17:
- **Total Visitas**: 133 ✓ (correto, vem do `count`)
- **Finalizadas**: 100 ✗ (incorreto, limitado pela paginação)
- **PDF**: Apenas 100 registros ✗ (deveria ter todos os 133)

### Causa Raiz

O código atual calcula estatísticas e exporta PDF usando apenas `resultado.visitantes`, que é limitado a 100 registros por página:

```typescript
// calcularEstatisticas() - PROBLEMA
visitasFinalizadas: resultado.visitantes.filter(v => v.hora_saida).length,
// ↑ Apenas conta os 100 da página atual, não os 133 totais

// exportarPDF() - PROBLEMA  
const visitantesFormatados = resultado.visitantes.map(v => ({...}));
// ↑ Apenas exporta os 100 da página atual
```

---

## Solução

### Duas abordagens necessárias:

| Funcionalidade | Solução |
|----------------|---------|
| **Estatísticas** | Calcular no banco via query de agregação |
| **Exportar PDF** | Buscar TODOS os registros (sem paginação) antes de exportar |

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `src/react-app/hooks/useApi.ts` | Adicionar função para buscar estatísticas e todos os dados |
| `src/react-app/pages/Relatorios.tsx` | Usar nova função para estatísticas e exportação |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.78 |

---

## Detalhes Técnicos

### 1. Nova função em `useApi.ts`: `buscarTodosVisitantes`

Buscar TODOS os registros (sem limite de 100) para exportação:

```typescript
const buscarTodosParaExportar = async (filtros: FiltroRelatorioType): Promise<VisitanteType[]> => {
  // Query sem paginação (limite alto ou múltiplas chamadas)
  let query = supabase
    .from('visitantes')
    .select('*');
  
  // Aplicar mesmos filtros...
  
  // Buscar em lotes de 1000 para evitar limite do Supabase
  const BATCH_SIZE = 1000;
  let allData: VisitanteType[] = [];
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const { data } = await query.range(offset, offset + BATCH_SIZE - 1);
    if (data && data.length > 0) {
      allData.push(...data);
      offset += BATCH_SIZE;
      hasMore = data.length === BATCH_SIZE;
    } else {
      hasMore = false;
    }
  }
  
  return allData;
};
```

### 2. Calcular estatísticas corretas

A função `gerarRelatorio` retornará também as contagens corretas do banco:

```typescript
// Adicionar contagens separadas por status
const { count: countFinalizadas } = await supabase
  .from('visitantes')
  .select('*', { count: 'exact', head: true })
  .eq('is_ativo', false)
  // ... mesmos filtros aplicados

const { count: countAtivas } = await supabase
  .from('visitantes')
  .select('*', { count: 'exact', head: true })
  .eq('is_ativo', true)
  // ... mesmos filtros aplicados

return {
  visitantes: data,
  total_registros: totalRegistros,
  total_finalizadas: countFinalizadas || 0,  // NOVO
  total_ativas: countAtivas || 0,            // NOVO
  // ...
};
```

### 3. Modificar `exportarPDF` em `Relatorios.tsx`

```typescript
const exportarPDF = async () => {
  if (resultado.total_registros === 0) {
    alert('Não há dados para exportar.');
    return;
  }

  // Buscar TODOS os registros (não apenas os da página atual)
  const todosVisitantes = await buscarTodosParaExportar(filtros);
  
  const visitantesFormatados = todosVisitantes.map(v => ({...}));
  
  // Usar estatísticas corretas do banco
  exportarRelatorioPDF(visitantesFormatados, filtros, {
    totalVisitas: resultado.total_registros,
    visitasFinalizadas: resultado.total_finalizadas,  // Do banco
    visitasAtivas: resultado.total_ativas,            // Do banco
    tempoMedioPermanencia: tempoMedio
  });
};
```

### 4. Atualizar tipo `RelatorioResultado`

```typescript
export interface RelatorioResultado {
  visitantes: VisitanteType[];
  total_registros: number;
  total_finalizadas: number;  // NOVO
  total_ativas: number;       // NOVO
  pagina_atual: number;
  total_paginas: number;
  limite_por_pagina: number;
}
```

---

## Fluxo Corrigido

```text
Usuário busca Casa 17
        ↓
┌─────────────────────────────────┐
│ Query com count: 133 registros  │
│ Query finalizadas: 133          │  ← Estatísticas do banco
│ Query ativas: 0                 │
│ Dados página 1: 100 registros   │  ← Paginação normal
└─────────────────────────────────┘
        ↓
Tela mostra: Total 133 | Finalizadas 133 | Ativas 0
        ↓
Usuário clica "Exportar PDF"
        ↓
┌─────────────────────────────────┐
│ Buscar TODOS (sem paginação)    │
│ → 133 registros                 │
└─────────────────────────────────┘
        ↓
PDF gerado com 133 registros ✓
```

---

## Resultado Esperado

| Antes | Depois |
|-------|--------|
| Total: 133 ✓ | Total: 133 ✓ |
| Finalizadas: 100 ✗ | Finalizadas: 133 ✓ |
| PDF: 100 registros ✗ | PDF: 133 registros ✓ |

---

## Versão

```
Versão 1.1.78 (Exportação Completa)
```

