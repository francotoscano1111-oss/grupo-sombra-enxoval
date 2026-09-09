/**
 * ExportadorContabil.js — Generates the accounting ZIP package
 * Includes Excel sheets for Receitas/Despesas and prepares the folder structure for receipts.
 */
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { fmtCurrency } from './formatters';

function createExcelBlob(data, sheetName) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  // Generate buffer
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([excelBuffer], { type: 'application/octet-stream' });
}

export async function gerarPacoteContabil(competencia, extratosReceitas, extratosDespesas, contasBancarias, selectedContaId) {
  const zip = new JSZip();

  const bancosExportar = selectedContaId === 'todas'
    ? contasBancarias
    : contasBancarias.filter(c => c.id === selectedContaId);

  bancosExportar.forEach(banco => {
    const recBanco = extratosReceitas.filter(e => e.contaBancariaId === banco.id);
    const desBanco = extratosDespesas.filter(e => e.contaBancariaId === banco.id);

    if (recBanco.length === 0 && desBanco.length === 0) return; // Skip empty banks

    const safeName = (banco.nome || 'Banco').replace(/[^a-z0-9]/gi, '_');
    const folder = zip.folder(`Banco_${safeName}`);

    // Formatter helpers
    const formatRec = r => ({
      Data: r.data, Descrição: r.descricao, Valor: Math.abs(Number(r.valor)),
      Lançamento: 'Crédito', Status: r.conciliado ? 'Conciliado' : 'Pendente',
      Origem: r.matchedSource || 'Manual/Nenhuma', Ref_Origem: r.matchedId || '', Centro_Custo: 'Receitas'
    });
    const formatDes = d => ({
      Data: d.data, Descrição: d.descricao, Valor: Math.abs(Number(d.valor)),
      Lançamento: 'Débito', Status: d.conciliado ? 'Conciliado' : 'Pendente',
      Origem: d.matchedSource || 'Manual/Nenhuma', Ref_Origem: d.matchedId || '', Centro_Custo: 'Despesas'
    });

    // Generate Excel Blobs
    if (recBanco.length > 0) {
      folder.file(`1_Receitas_${safeName}_${competencia}.xlsx`, createExcelBlob(recBanco.map(formatRec), 'Entradas'));
      folder.folder('Comprovantes_Receitas');
    }
    if (desBanco.length > 0) {
      folder.file(`2_Despesas_${safeName}_${competencia}.xlsx`, createExcelBlob(desBanco.map(formatDes), 'Saidas'));
      folder.folder('Comprovantes_Despesas');
    }
  });

  // Add a global README
  zip.file('README.txt', `Pacote Contábil gerado em ${new Date().toLocaleString('pt-BR')}\nReferência: ${competencia}\n\nOs arquivos estão divididos por Conta Bancária.`);

  // Generate the final ZIP
  const content = await zip.generateAsync({ type: 'blob' });

  // Trigger download
  const url = window.URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Fechamento_Contabil_GS_${competencia}.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
