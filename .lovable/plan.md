
# Plano: Filtros de Exclusão Avançados para Relatórios - v1.1.77

## Problema Identificado

Analisando o PDF enviado (casa 17), identifiquei o padrão:

| Visitante | Observação | Frequência | Problema |
|-----------|------------|------------|----------|
| TIAGO | PERSONAL | ~15 visitas | Congestiona relatório |
| ADRIANO | PERSONAL | ~12 visitas | Congestiona relatório |
| RONALDO CESAR | RG... PORTO SEGURO | 2 visitas | Visita real |

O síndico quer ver apenas as visitas "reais" (não recorrentes), filtrando profissionais como personal trainers.

---

## Solução Proposta: Filtros de Exclusão

Criar uma seção "Filtros Avançados" na página de Busca com opções para **excluir** registros específicos:

### Tipos de Filtros de Exclusão

| Filtro | Descrição | Exemplo de Uso |
|--------|-----------|----------------|
| **Por Observação** | Excluir visitantes cuja observação contenha determinado texto | "PERSONAL", "ENTREGA", "UBER" |
| **Por Nome** | Excluir visitantes com nome específico | "TIAGO", "ADRIANO" |
| **Por Placa** | Excluir veículos específicos | "XXE7J66", "EYA1328" |
| **Visitantes Frequentes** | Excluir quem tem mais de X visitas no período | Mais de 5 visitas = frequente |

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `src/shared/types.ts` | Adicionar campos de exclusão ao FiltroRelatorioSchema |
| `src/react-app/pages/Relatorios.tsx` | Adicionar UI de filtros de exclusão |
| `src/react-app/hooks/useApi.ts` | Implementar lógica de exclusão na query |
| `src/react-app/utils/pdfExport.ts` | Incluir exclusões nos filtros do PDF |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.77 |

---

## Interface do Usuário

### Nova Seção: Filtros de Exclusão (colapsável)

```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Filtros de Busca                                         │
│ ┌───────────┐ ┌───────────┐ ┌───────────────┐ ┌───────────┐ │
│ │Data Inicial│ │Data Final│ │Nome Visitante│ │Casa      │ │
│ └───────────┘ └───────────┘ └───────────────┘ └───────────┘ │
│                                                             │
│ ▼ Filtros de Exclusão (ocultar visitantes indesejados)     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Excluir por Observação:  [___PERSONAL___] [+ Adicionar] │ │
│ │   Tags: [PERSONAL ×] [ENTREGA ×] [UBER ×]              │ │
│ │                                                         │ │
│ │ Excluir por Nome:       [_______________] [+ Adicionar] │ │
│ │   Tags: [TIAGO ×] [ADRIANO ×]                          │ │
│ │                                                         │ │
│ │ ☐ Excluir visitantes frequentes (mais de [5] visitas)  │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│                          [Limpar] [🔍 Buscar]              │
└─────────────────────────────────────────────────────────────┘
```

---

## Detalhes Técnicos

### 1. Atualizar `FiltroRelatorioSchema` em `types.ts`

```typescript
export const FiltroRelatorioSchema = z.object({
  // Filtros existentes
  data_inicial: z.string().optional(),
  data_final: z.string().optional(),
  nome: z.string().optional(),
  casa_visitada: z.string().optional(),
  placa_veiculo: z.string().optional(),
  pagina: z.number().min(1).default(1),
  limite: z.number().min(1).max(1000).default(100),
  
  // NOVOS: Filtros de exclusão
  excluir_observacoes: z.array(z.string()).optional(), // ["PERSONAL", "ENTREGA"]
  excluir_nomes: z.array(z.string()).optional(),       // ["TIAGO", "ADRIANO"]
  excluir_placas: z.array(z.string()).optional(),      // ["XXE7J66"]
  excluir_frequentes: z.boolean().optional(),          // true/false
  limite_frequencia: z.number().min(1).optional(),     // 5 (padrão)
});
```

### 2. Lógica de Exclusão em `useApi.ts`

A exclusão será aplicada em duas etapas:

**Etapa 1 - Exclusão por texto (observações, nomes, placas):**
- Usar filtros `not.ilike` do Supabase para excluir
- Aplicar antes da paginação

**Etapa 2 - Exclusão de frequentes (opcional):**
- Buscar contagem de visitas por visitante
- Filtrar localmente após receber dados
- Ajustar contagem total para paginação correta

```typescript
// Exclusão por observação (cada termo)
if (filtros.excluir_observacoes?.length) {
  for (const termo of filtros.excluir_observacoes) {
    query = query.not('observacoes', 'ilike', `%${termo}%`);
  }
}

// Exclusão por nome
if (filtros.excluir_nomes?.length) {
  for (const nome of filtros.excluir_nomes) {
    query = query.not('nome', 'ilike', `%${nome}%`);
  }
}

// Exclusão por placa
if (filtros.excluir_placas?.length) {
  for (const placa of filtros.excluir_placas) {
    query = query.not('placa_veiculo', 'eq', placa.toUpperCase());
  }
}
```

### 3. Interface de Tags em `Relatorios.tsx`

Componente de tags com input e remoção:

```tsx
// Estado para exclusões
const [excluirObservacoes, setExcluirObservacoes] = useState<string[]>([]);
const [excluirNomes, setExcluirNomes] = useState<string[]>([]);
const [novaExclusaoObs, setNovaExclusaoObs] = useState('');
const [novaExclusaoNome, setNovaExclusaoNome] = useState('');
const [excluirFrequentes, setExcluirFrequentes] = useState(false);
const [limiteFrequencia, setLimiteFrequencia] = useState(5);
const [mostrarFiltrosExclusao, setMostrarFiltrosExclusao] = useState(false);

// Componente de tag
const Tag = ({ texto, onRemove }) => (
  <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 
                   text-red-800 text-xs rounded-full">
    {texto}
    <button onClick={onRemove} className="hover:text-red-600">
      <X className="w-3 h-3" />
    </button>
  </span>
);
```

### 4. Atualizar PDF para mostrar exclusões

```typescript
// Em pdfExport.ts - adicionar exclusões aos filtros mostrados
if (filtros.excluir_observacoes?.length) {
  filtrosAtivos.push(`Excluindo obs: ${filtros.excluir_observacoes.join(', ')}`);
}
if (filtros.excluir_nomes?.length) {
  filtrosAtivos.push(`Excluindo nomes: ${filtros.excluir_nomes.join(', ')}`);
}
```

---

## Fluxo do Usuário

1. Síndico acessa página de Busca
2. Filtra por Casa = "17" e período desejado
3. Expande "Filtros de Exclusão"
4. Digita "PERSONAL" e clica "Adicionar" (ou Enter)
5. Tag [PERSONAL ×] aparece
6. Opcionalmente adiciona nomes específicos
7. Clica "Buscar"
8. Resultado mostra apenas visitas reais (sem personal trainers)
9. PDF gerado inclui nota "Excluindo obs: PERSONAL"

---

## Benefícios

| Benefício | Descrição |
|-----------|-----------|
| **Flexibilidade** | Síndico controla exatamente o que quer ver |
| **Múltiplas exclusões** | Pode excluir várias categorias simultaneamente |
| **Persistente no PDF** | Relatório documenta quais exclusões foram aplicadas |
| **Não destrutivo** | Dados não são alterados, apenas filtrados da visualização |
| **Reutilizável** | Tags ficam visíveis para referência |

---

## Versão

```
Versão 1.1.77 (Filtros de Exclusão)
```
