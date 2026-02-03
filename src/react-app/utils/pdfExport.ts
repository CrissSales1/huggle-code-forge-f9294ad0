import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface FiltrosAplicados {
  data_inicial?: string;
  data_final?: string;
  nome?: string;
  casa_visitada?: string;
  placa_veiculo?: string;
  excluir_observacoes?: string[];
  excluir_nomes?: string[];
  excluir_placas?: string[];
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
  observacoes: string | null;
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
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // === CABEÇALHO ===
  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('Condomínio Aguas da Fonte', pageWidth / 2, 18, { align: 'center' });
  
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
  const filtrosAtivos: string[] = [];
  if (filtros.data_inicial || filtros.data_final) {
    const periodo = `${filtros.data_inicial || '...'} até ${filtros.data_final || '...'}`;
    filtrosAtivos.push(`Período: ${periodo}`);
  }
  if (filtros.nome) filtrosAtivos.push(`Nome: ${filtros.nome}`);
  if (filtros.casa_visitada) filtrosAtivos.push(`Casa: ${filtros.casa_visitada}`);
  if (filtros.placa_veiculo) filtrosAtivos.push(`Placa: ${filtros.placa_veiculo}`);
  if (filtros.excluir_observacoes?.length) filtrosAtivos.push(`Excluindo obs: ${filtros.excluir_observacoes.join(', ')}`);
  if (filtros.excluir_nomes?.length) filtrosAtivos.push(`Excluindo nomes: ${filtros.excluir_nomes.join(', ')}`);
  if (filtros.excluir_placas?.length) filtrosAtivos.push(`Excluindo placas: ${filtros.excluir_placas.join(', ')}`);
  
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
    v.observacoes || '-',
    v.hora_entrada,
    v.hora_saida || '-',
    v.permanencia,
    v.is_ativo ? 'Ativo' : 'Finalizado'
  ]);
  
  autoTable(doc, {
    startY: yPosition,
    head: [['Nome', 'Casa', 'Placa', 'Prisma', 'Observações', 'Entrada', 'Saída', 'Permanência', 'Status']],
    body: dadosTabela,
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { 
      fillColor: [31, 41, 55],
      textColor: 255,
      fontStyle: 'bold'
    },
    columnStyles: {
      0: { cellWidth: 40 }, // Nome
      4: { cellWidth: 55 }, // Observações
      8: { halign: 'center' } // Status
    },
    // Colorir status
    didParseCell: function(data) {
      if (data.column.index === 8 && data.section === 'body') {
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
        `Página ${data.pageNumber} de ${pageCount} • v1.1.76`,
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
