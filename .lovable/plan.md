

# Plano: Corrigir PDF de Relatórios - v1.1.76

## Problema Identificado

O usuário identificou 3 problemas no PDF de relatórios:

| Problema | Situação Atual | Correção |
|----------|----------------|----------|
| Nome do sistema | "PortaCerta" | "Condomínio Aguas da Fonte" |
| Coluna Observações | Ausente no PDF | Adicionar coluna |
| Orientação | Retrato (estreito) | Paisagem (horizontal) |

---

## Arquivos a Modificar

| Arquivo | Mudanças |
|---------|----------|
| `src/react-app/utils/pdfExport.ts` | Trocar nome, adicionar observações, orientação paisagem |
| `src/react-app/pages/Relatorios.tsx` | Passar observações para o PDF |
| `src/react-app/pages/Configuracoes.tsx` | Versão 1.1.76 |

---

## Detalhes Técnicos

### 1. `pdfExport.ts` - Mudanças

**Orientação paisagem:**
```typescript
// Antes
const doc = new jsPDF();

// Depois
const doc = new jsPDF({ orientation: 'landscape' });
```

**Nome do sistema (cabeçalho):**
```typescript
// Antes
doc.text('PortaCerta', pageWidth / 2, 18, { align: 'center' });

// Depois
doc.text('Condomínio Aguas da Fonte', pageWidth / 2, 18, { align: 'center' });
```

**Rodapé:**
```typescript
// Antes
`Página ${data.pageNumber} de ${pageCount} • PortaCerta v1.1.75`

// Depois
`Página ${data.pageNumber} de ${pageCount} • v1.1.76`
```

**Interface VisitantePDF - adicionar observações:**
```typescript
interface VisitantePDF {
  // ... campos existentes
  observacoes: string | null; // NOVO
}
```

**Tabela de visitantes - adicionar coluna:**
```typescript
// Colunas
head: [['Nome', 'Casa', 'Placa', 'Prisma', 'Observações', 'Entrada', 'Saída', 'Permanência', 'Status']]

// Dados
const dadosTabela = visitantes.map(v => [
  v.nome,
  v.casa_visitada,
  v.placa_veiculo,
  v.numero_prisma?.toString() || '-',
  v.observacoes || '-',  // NOVO
  v.hora_entrada,
  v.hora_saida || '-',
  v.permanencia,
  v.is_ativo ? 'Ativo' : 'Finalizado'
]);

// Ajustar índice do Status
columnStyles: {
  0: { cellWidth: 35 },
  4: { cellWidth: 50 }, // Observações
  8: { halign: 'center' } // Status (era 7, agora é 8)
}
```

### 2. `Relatorios.tsx` - Passar observações

```typescript
const visitantesFormatados = resultado.visitantes.map(v => ({
  // ... campos existentes
  observacoes: v.observacoes || null  // NOVO
}));
```

### 3. Atualizar versão

```
Versão 1.1.76 (PDF Paisagem + Observações)
```

---

## Resultado Esperado

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│                    Condomínio Aguas da Fonte                                        │
│                     Relatório de Visitantes                                         │
│                 Gerado em: 03/02/2026 às 19:10                                     │
├────────────────────────────────────────────────────────────────────────────────────┤
│ Nome    │Casa│ Placa   │Prisma│ Observações          │Entrada    │Saída     │Perm.│Status    │
├─────────┼────┼─────────┼──────┼──────────────────────┼───────────┼──────────┼─────┼──────────┤
│ RONALDO │ 17 │HEJ7D81  │  8   │ RG276717971 PORTO... │03/02 13:44│03/02 17:0│3h19m│Finalizado│
│ TIAGO   │ 17 │XXE7J66  │  1   │ -                    │02/02 19:05│02/02 20:1│1h7m │Finalizado│
└─────────┴────┴─────────┴──────┴──────────────────────┴───────────┴──────────┴─────┴──────────┘
│                        Página 1 de 6 • v1.1.76                                      │
└────────────────────────────────────────────────────────────────────────────────────┘
```

## Benefícios da Orientação Paisagem

- **+130mm de largura** (297mm vs 210mm)
- Mais espaço para todas as 9 colunas
- Observações cabem sem truncar

