
# Plano: Exportar Relatório em PDF - v1.1.75

## Objetivo
Adicionar um botão "Exportar PDF" na página de Busca/Relatórios que gere um documento PDF bem formatado com:
- Cabeçalho com logo/nome do sistema e data do relatório
- Filtros aplicados claramente indicados
- Estatísticas do período
- Tabela com dados formatados e cores
- Rodapé com informações do sistema

---

## Abordagem Técnica

### Biblioteca Escolhida: jsPDF + jsPDF-AutoTable

**Por que esta escolha?**
- `jsPDF` - biblioteca leve (~300KB) para geração de PDFs no browser
- `jsPDF-autotable` - plugin para criar tabelas formatadas automaticamente
- Não requer servidor/backend
- Suporte a cores, estilos e formatação rica

---

## Estrutura do PDF Gerado

```text
┌─────────────────────────────────────────────────┐
│           🏢 PortaCerta                          │
│        Relatório de Visitantes                   │
│   Gerado em: 03/02/2026 às 14:30                │
├─────────────────────────────────────────────────┤
│  FILTROS APLICADOS:                             │
│  Período: 01/01/2026 - 31/01/2026               │
│  Casa: 85                                        │
│  (outros filtros se aplicáveis)                  │
├─────────────────────────────────────────────────┤
│  ESTATÍSTICAS:                                  │
│  ┌────────┬────────────┬────────┬─────────────┐ │
│  │ Total  │ Finalizadas│ Ativas │ Tempo Médio │ │
│  │  42    │     38     │   4    │   2h30min   │ │
│  └────────┴────────────┴────────┴─────────────┘ │
├─────────────────────────────────────────────────┤
│  VISITANTES:                                    │
│ ┌─────────┬──────┬─────────┬────────┬──────────┐│
│ │ Nome    │ Casa │ Placa   │Entrada │ Status   ││
│ ├─────────┼──────┼─────────┼────────┼──────────┤│
│ │ JOÃO... │  85  │ABC-1234 │01/01...│🟢 Ativo  ││
│ │ MARIA...│  12  │XYZ-5678 │02/01...│⚪ Final. ││
│ └─────────┴──────┴─────────┴────────┴──────────┘│
├─────────────────────────────────────────────────┤
│  Página 1 de 3 • PortaCerta v1.1.75             │
└─────────────────────────────────────────────────┘
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `package.json` | Modificar | Adicionar dependências jspdf e jspdf-autotable |
| `src/react-app/utils/pdfExport.ts` | Criar | Utilitário para geração de PDF |
| `src/react-app/pages/Relatorios.tsx` | Modificar | Adicionar botão "Exportar PDF" |
| `src/react-app/pages/Configuracoes.tsx` | Modificar | Atualizar versão para 1.1.75 |

---

## Detalhes de Implementação

### 1. Novo arquivo: `src/react-app/utils/pdfExport.ts`

```typescript
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FiltrosAplicados {
  data_inicial?: string;
  data_final?: string;
  nome?: string;
  casa_visitada?: string;
  placa_veiculo?: string;
}

interface Estatisticas {
  totalVisitas: number;
  visitasFinalizadas: number;
  visitasAtivas: number;
  tempoMedioPermanencia: number;
}

interface VisitantePDF {
  nome: string;
  casa_visitada: string;
  placa_veiculo: string;
  numero_prisma: number | null;
  hora_entrada: string;
  hora_saida: string | null;
  is_ativo: boolean;
  permanencia: string;
}

export function exportarRelatorioPDF(
  visitantes: VisitantePDF[],
  filtros: FiltrosAplicados,
  estatisticas: Estatisticas | null
) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // === CABEÇALHO ===
  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('PortaCerta', pageWidth / 2, 18, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Relatório de Visitantes', pageWidth / 2, 28, { align: 'center' });
  
  // Data de geração
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(10);
  const dataGeracao = new Date().toLocaleString('pt-BR');
  doc.text(`Gerado em: ${dataGeracao}`, pageWidth / 2, 45, { align: 'center' });
  
  let yPosition = 55;
  
  // === FILTROS APLICADOS ===
  const filtrosAtivos = [];
  if (filtros.data_inicial || filtros.data_final) {
    const periodo = `${filtros.data_inicial || '...'} até ${filtros.data_final || '...'}`;
    filtrosAtivos.push(`Período: ${periodo}`);
  }
  if (filtros.nome) filtrosAtivos.push(`Nome: ${filtros.nome}`);
  if (filtros.casa_visitada) filtrosAtivos.push(`Casa: ${filtros.casa_visitada}`);
  if (filtros.placa_veiculo) filtrosAtivos.push(`Placa: ${filtros.placa_veiculo}`);
  
  if (filtrosAtivos.length > 0) {
    doc.setFillColor(243, 244, 246); // gray-100
    doc.roundedRect(14, yPosition, pageWidth - 28, 20 + (filtrosAtivos.length * 6), 3, 3, 'F');
    
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Filtros Aplicados:', 20, yPosition + 8);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    filtrosAtivos.forEach((filtro, i) => {
      doc.text(`• ${filtro}`, 25, yPosition + 16 + (i * 6));
    });
    
    yPosition += 28 + (filtrosAtivos.length * 6);
  }
  
  // === ESTATÍSTICAS ===
  if (estatisticas) {
    autoTable(doc, {
      startY: yPosition,
      head: [['Total Visitas', 'Finalizadas', 'Ativas', 'Tempo Médio']],
      body: [[
        estatisticas.totalVisitas.toString(),
        estatisticas.visitasFinalizadas.toString(),
        estatisticas.visitasAtivas.toString(),
        `${Math.floor(estatisticas.tempoMedioPermanencia)}h${Math.floor((estatisticas.tempoMedioPermanencia % 1) * 60)}m`
      ]],
      theme: 'grid',
      styles: { halign: 'center', fontSize: 11 },
      headStyles: { 
        fillColor: [37, 99, 235],
        textColor: 255,
        fontStyle: 'bold'
      },
      margin: { left: 14, right: 14 }
    });
    
    yPosition = (doc as any).lastAutoTable.finalY + 10;
  }
  
  // === TABELA DE VISITANTES ===
  const dadosTabela = visitantes.map(v => [
    v.nome,
    v.casa_visitada,
    v.placa_veiculo,
    v.numero_prisma?.toString() || '-',
    v.hora_entrada,
    v.hora_saida || '-',
    v.permanencia,
    v.is_ativo ? 'Ativo' : 'Finalizado'
  ]);
  
  autoTable(doc, {
    startY: yPosition,
    head: [['Nome', 'Casa', 'Placa', 'Prisma', 'Entrada', 'Saída', 'Permanência', 'Status']],
    body: dadosTabela,
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { 
      fillColor: [31, 41, 55],
      textColor: 255,
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 35 }, // Nome
      7: { halign: 'center' } // Status
    },
    // Colorir status
    didParseCell: function(data) {
      if (data.column.index === 7 && data.section === 'body') {
        if (data.cell.raw === 'Ativo') {
          data.cell.styles.textColor = [22, 163, 74]; // green-600
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [107, 114, 128]; // gray-500
        }
      }
    },
    margin: { left: 14, right: 14 },
    didDrawPage: function(data) {
      // Rodapé em cada página
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(
        `Página ${data.pageNumber} de ${pageCount} • PortaCerta v1.1.75`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }
  });
  
  // Salvar arquivo
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
  doc.save(`relatorio_visitantes_${timestamp}.pdf`);
}
```

### 2. Modificar `src/react-app/pages/Relatorios.tsx`

**Adicionar import:**
```typescript
import { FileDown } from 'lucide-react';
import { exportarRelatorioPDF } from '@/react-app/utils/pdfExport';
```

**Adicionar função de exportar PDF:**
```typescript
const exportarPDF = () => {
  if (resultado.visitantes.length === 0) {
    alert('Não há dados para exportar. Faça uma busca primeiro.');
    return;
  }

  const visitantesFormatados = resultado.visitantes.map(v => ({
    nome: v.nome,
    casa_visitada: v.casa_visitada,
    placa_veiculo: v.placa_veiculo,
    numero_prisma: v.numero_prisma || null,
    hora_entrada: formatarDataHora(v.hora_entrada!),
    hora_saida: v.hora_saida ? formatarDataHora(v.hora_saida) : null,
    is_ativo: !!v.is_ativo,
    permanencia: calcularTempoPermanencia(v.hora_entrada!, v.hora_saida)
  }));

  exportarRelatorioPDF(visitantesFormatados, filtros, estatisticas);
};
```

**Adicionar botão na interface (ao lado do CSV):**
```tsx
{resultado.visitantes.length > 0 && (
  <div className="flex gap-2">
    <button 
      onClick={exportarPDF}
      className="flex items-center justify-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
    >
      <FileDown className="w-4 h-4" />
      <span>PDF</span>
    </button>
    <button 
      onClick={exportarDados}
      className="flex items-center justify-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
    >
      <Download className="w-4 h-4" />
      <span className="hidden sm:inline">Exportar</span> <span>CSV</span>
    </button>
  </div>
)}
```

### 3. Dependências a instalar

```json
{
  "jspdf": "^2.5.1",
  "jspdf-autotable": "^3.8.2"
}
```

### 4. Atualizar versão em `Configuracoes.tsx`
```
Versão 1.1.75 (Exportar PDF)
```

---

## Preview do Resultado

O PDF gerado terá:

| Elemento | Estilo |
|----------|--------|
| Cabeçalho | Faixa azul com "PortaCerta" em branco |
| Filtros | Box cinza claro com lista de filtros aplicados |
| Estatísticas | Tabela compacta azul com 4 colunas |
| Dados | Tabela zebrada com headers escuros |
| Status Ativo | Texto verde em negrito |
| Status Finalizado | Texto cinza normal |
| Rodapé | Número de página + versão do sistema |

---

## Benefícios

1. **Profissional** - PDF formatado com cores e estilos consistentes
2. **Completo** - Inclui filtros aplicados, estatísticas e todos os dados
3. **Portável** - Pode ser impresso ou compartilhado facilmente
4. **Paginado** - Suporta relatórios longos com múltiplas páginas
5. **Offline** - Gerado 100% no browser, sem dependência de servidor
