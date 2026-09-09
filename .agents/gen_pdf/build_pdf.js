const PDFDocument = require('pdfkit');
const fs = require('fs');

const doc = new PDFDocument({ margin: 50 });
doc.pipe(fs.createWriteStream('C:\\Users\\ft\\Desktop\\Sombra_Scanner_Guia_v3.pdf'));

// Title Block
doc.rect(0, 0, 612, 120).fill('#1e2332');
doc.fillColor('#f97316').fontSize(26).font('Helvetica-Bold').text('GUIA RÁPIDO DO SOMBRA SCANNER', 50, 40);
doc.fillColor('#8892a4').fontSize(14).font('Helvetica').text('Como enviar recibos e notas fáceis para o Setor Financeiro', 50, 75);

// Intro
doc.y = 150; // Reset Y position manually below the title
doc.fillColor('#13161e').fontSize(16).font('Helvetica-Bold').text('O que é o Sombra Scanner?');
doc.moveDown(0.5);
doc.fontSize(12).font('Helvetica').fillColor('#333333').text('O Sombra Scanner é a porta de entrada digital rápida para a empresa. Ele serve para que você envie qualquer recibo, nota fiscal ou comprovante diretamente para a fila de reconciliação de forma autônoma. Não precisa instalar nada, roda direto no navegador do seu smartphone ou computador.', { align: 'justify', lineGap: 3 });
doc.moveDown(2);

const drawStep = (number, title, desc) => {
    doc.fillColor('#f97316').fontSize(14).font('Helvetica-Bold').text(`Passo ${number}: ${title}`);
    doc.moveDown(0.3);
    doc.fillColor('#535d72').fontSize(12).font('Helvetica').text(desc, { align: 'justify', lineGap: 2 });
    doc.moveDown(1.5);
};

// Passo 1
drawStep('1', 'Acesso ao Portal', 'Abra o navegador do seu celular e acesse a central do Sombra Scanner pelo link compartilhado pelo gerente. Não requer senha técnica, ele te envia direto ao "Import Hub".');

// Passo 2
drawStep('2', 'Selecione a Empresa e a Pasta', 'Após entrar no Portal, selecione a empresa correta no menu esquerdo (Ex: ARCO-IRIS) e em seguida escolha a Pasta exata para arquivar este gasto (ex: Documentos ou Saídas).');

// Passo 3
drawStep('3', 'Preencha as Informações Vitais do Recibo', 'Digite os dados que a Contabilidade precisará processar: \n• Fornecedor: O nome de quem vendeu ou emitiu o documento.\n• Valor: O valor numérico e exato do comprovante.\n• Data: O dia efetivo em que essa despesa foi efetuada.');

// Passo 4
drawStep('4', 'Anexe: Tire a Foto na Hora!', 'Clique no botão de enviar arquivo. O sistema permite escolher um PDF salvo, mas no celular você pode clicar em Câmera e tirar uma foto ampla e com iluminação nítida do canhoto.');

// Passo 5
drawStep('5', 'Aperte Enviar e Confirme', 'Ao processar o anexo, o sistema emitirá uma verificação visual verde (Sucesso!). O documento vai direto para a fila de reconciliação. Pronto, pode seguir seu dia tranquilamente!');

// Footer Box Relative Position
doc.moveDown(1);
const footerY = doc.y;
doc.rect(50, footerY, 512, 60).fill('#f5f5f5');
doc.fillColor('#8892a4').fontSize(10).font('Helvetica-Oblique').text('Dica Importante: Por favor, não descarte ainda o papel! Guarde a via de segurança física numa pasta temporária até o fechamento mensal da conferência.', 70, footerY + 20, { width: 472, align: 'center' });

doc.end();
console.log('PDF PDF gerado com sucesso em C:\\Users\\ft\\Desktop\\Sombra_Scanner_Guia_v3.pdf');
