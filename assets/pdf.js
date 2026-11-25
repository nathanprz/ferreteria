"use strict";
/* Genera el catálogo en PDF con los productos, paquetes y ofertas visibles en la tienda. */
const pdfTxt = s => String(s ?? '').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"')
  .replace(/[^ -~ -ÿ]/g,'').replace(/\s+/g,' ').trim();
const pdfMoney = n => '$' + (Math.round((+n||0)*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

function buildCatalogPdf(data, lib){
  const IMG = data.images || {};
  /* data: {store:{name,tagline,whatsapp,address}, products:[...], packages:[...]}  */
  const { jsPDF } = lib || window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  const STEEL = [38,52,59], ORANGE = [217,72,15], SOFT = [246,246,242], INK = [29,35,39], MUTED = [95,107,114];
  const st = data.store || {};
  const name = pdfTxt(st.name) || 'Ferreteria';
  const wa = String(st.whatsapp||'').replace(/\D/g,'');
  const waShow = wa ? '+' + wa : '';
  const today = new Date().toLocaleDateString('es-MX',{month:'long',year:'numeric'});
  const unit = p => unitPrice(p);

  const items = data.products.filter(p => p.active !== false && (+p.stock||0) > 0).sort((a,b)=>a.name.localeCompare(b.name,'es'));
  const offers = items.filter(onOffer);
  const pkgs = (data.packages||[]).filter(k => k.active !== false).map(k => ({ k, i: pkgInfo(k) })).filter(x => x.i.items.length && x.i.max > 0);
  const byCat = {};
  items.forEach(p => { (byCat[p.category || 'General'] = byCat[p.category || 'General'] || []).push(p); });
  const catNames = Object.keys(byCat).sort((a,b)=>a.localeCompare(b,'es'));

  /* portada */
  doc.setFillColor(...STEEL); doc.rect(0,0,W,H*0.46,'F');
  doc.setFillColor(...ORANGE); doc.rect(0,H*0.46,W,10,'F');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(40);
  const nl = doc.splitTextToSize(name.toUpperCase(), W - 2*M);
  doc.text(nl, M, 150);
  doc.setFont('helvetica','normal'); doc.setFontSize(16);
  const ty = 150 + nl.length*44 - 10;
  if (st.tagline) doc.text(doc.splitTextToSize(pdfTxt(st.tagline), W-2*M), M, ty);
  doc.setFontSize(13); doc.text('Catalogo de productos - ' + today, M, H*0.46 - 28);
  doc.setTextColor(...INK); doc.setFont('helvetica','bold'); doc.setFontSize(15);
  doc.text('En este catalogo', M, H*0.46 + 52);
  doc.setFont('helvetica','normal'); doc.setFontSize(12); let y = H*0.46 + 74;
  const toc = [];
  if (offers.length) toc.push('Ofertas');
  if (pkgs.length) toc.push('Paquetes completos');
  catNames.forEach(c => toc.push(pdfTxt(c)));
  toc.slice(0,12).forEach(t => { doc.setTextColor(...ORANGE); doc.text('•', M, y); doc.setTextColor(...INK); doc.text(t, M+14, y); y += 18; });
  if (toc.length > 12) { doc.setTextColor(...MUTED); doc.text('y mas...', M+14, y); }
  if (wa) {
    const by = H - 150;
    doc.setFillColor(...SOFT); doc.roundedRect(M, by, W-2*M, 84, 8, 8, 'F');
    doc.setTextColor(...INK); doc.setFont('helvetica','bold'); doc.setFontSize(14);
    doc.text('Haz tu pedido por WhatsApp', M+16, by+30);
    doc.setFont('helvetica','normal'); doc.setFontSize(18); doc.setTextColor(...ORANGE);
    doc.text(waShow, M+16, by+56);
    doc.setFontSize(10); doc.setTextColor(...MUTED);
    doc.textWithLink('https://wa.me/' + wa, M+16, by+74, { url: 'https://wa.me/' + wa });
  }
  if (st.address) { doc.setFontSize(11); doc.setTextColor(...MUTED); doc.text(doc.splitTextToSize(pdfTxt(st.address), W-2*M), M, H-44); }

  const commonTable = {
    margin: { left: M, right: M, top: 56, bottom: 48 },
    styles: { font: 'helvetica', fontSize: 10.5, cellPadding: 6, textColor: INK, lineColor: [217,218,212], lineWidth: 0.4 },
    alternateRowStyles: { fillColor: [250,250,247] },
    theme: 'grid'
  };
  const photoCell = p => ({ content: '', styles: { minCellHeight: 50 } });
  const drawPhoto = list => d => {
    if (d.section !== 'body' || d.column.index !== 0) return;
    const p = list[d.row.index], im = p && IMG[p.id]; if (!im) return;
    const box = 42, k = Math.min(box/im.w, box/im.h), w = im.w*k, h = im.h*k;
    try { doc.addImage(im.data, 'JPEG', d.cell.x + (56-w)/2, d.cell.y + (d.cell.height-h)/2, w, h); } catch (_) {}
  };
  let firstSection = true;
  function sectionTitle(text, color){
    let ty;
    if (firstSection) { doc.addPage(); ty = 56; firstSection = false; }
    else {
      ty = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 56) + 40;
      if (ty > H - 170) { doc.addPage(); ty = 56; }
    }
    doc.setFillColor(...(color||STEEL)); doc.rect(M, ty-26, W-2*M, 34, 'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(17);
    doc.text(pdfTxt(text), M+12, ty-3);
    return ty + 20;
  }
  function needTitle(text,color){ const startY = sectionTitle(text,color); return startY; }

  if (offers.length) {
    const sy = needTitle('Ofertas', ORANGE);
    doc.autoTable({ ...commonTable, startY: sy, margin: { ...commonTable.margin, top: 56 },
      head: [['','Producto','Unidad','Precio normal','Oferta']],
      body: offers.map(p => [photoCell(p), pdfTxt(p.name), pdfTxt(p.unit||'pza'), pdfMoney(p.price), pdfMoney(p.offer)]),
      didDrawCell: drawPhoto(offers),
      headStyles: { fillColor: ORANGE, textColor: 255 },
      columnStyles: { 0:{cellWidth:56}, 2:{halign:'center'}, 3:{halign:'right', textColor: MUTED}, 4:{halign:'right', fontStyle:'bold', textColor: ORANGE} } });
  }
  if (pkgs.length) {
    const sy = needTitle('Paquetes completos', STEEL);
    doc.autoTable({ ...commonTable, startY: sy,
      head: [['Paquete','Incluye','Precio','Ahorro']],
      body: pkgs.map(({k,i}) => [pdfTxt(k.name) + (k.desc ? '\n' + pdfTxt(k.desc) : ''), i.items.map(x => `${Math.round(x.qty*100)/100} x ${pdfTxt(x.p.name)}`).join('\n'), pdfMoney(k.price), i.save > 0 ? pdfMoney(i.save) : '-']),
      headStyles: { fillColor: STEEL, textColor: 255 },
      columnStyles: { 0:{cellWidth:150, fontStyle:'bold'}, 2:{halign:'right', fontStyle:'bold', cellWidth:70}, 3:{halign:'right', textColor:[43,138,62], cellWidth:60} } });
  }
  catNames.forEach(c => {
    const sy = needTitle(c, STEEL);
    doc.autoTable({ ...commonTable, startY: sy,
      head: [['','Producto','Unidad','Precio']],
      body: byCat[c].map(p => [photoCell(p), pdfTxt(p.name) + (p.desc ? '\n' + pdfTxt(p.desc) : ''), pdfTxt(p.unit||'pza'), onOffer(p) ? pdfMoney(p.offer) + '  (oferta)' : pdfMoney(p.price)]),
      didDrawCell: drawPhoto(byCat[c]),
      headStyles: { fillColor: STEEL, textColor: 255 },
      columnStyles: { 0:{cellWidth:56}, 2:{halign:'center', cellWidth:70}, 3:{halign:'right', fontStyle:'bold', cellWidth:110} } });
  });

  /* encabezado y pie en todas las páginas menos la portada */
  const n = doc.getNumberOfPages();
  for (let i = 2; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...ORANGE); doc.setLineWidth(1.2); doc.line(M, H-36, W-M, H-36);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
    doc.text(name + (waShow ? '  |  WhatsApp ' + waShow : ''), M, H-22);
    doc.text('Pagina ' + (i-1) + ' de ' + (n-1), W-M, H-22, { align: 'right' });
  }
  if (n === 1) { doc.addPage(); doc.setTextColor(...MUTED); doc.setFontSize(13); doc.text('Aun no hay productos disponibles en el catalogo.', M, 100); }
  return doc;
}

async function downloadCatalogPdf(share){
  const images = await loadPdfImages(prods());
  const doc = buildCatalogPdf({ store: S.config, products: prods(), packages: Object.values(S.packages), images });
  const fname = 'catalogo-' + (pdfTxt(S.config.name || 'ferreteria').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'ferreteria') + '.pdf';
  if (share) {
    try {
      const file = new File([doc.output('blob')], fname, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Catalogo ' + (S.config.name||'') }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  doc.save(fname);
}

function loadPdfImages(list){
  const out = {};
  const one = p => new Promise(res => {
    if (!p.photo) return res();
    fetch(p.photo).then(r => r.ok ? r.blob() : Promise.reject()).then(b => new Promise((ok, no) => {
      const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(b);
    })).then(data => { const im = new Image(); im.onload = () => { out[p.id] = { data, w: im.width, h: im.height }; res(); }; im.onerror = () => res(); im.src = data; }).catch(() => res());
  });
  return Promise.all(list.filter(p => p.active !== false && (+p.stock||0) > 0).map(one)).then(() => out);
}
