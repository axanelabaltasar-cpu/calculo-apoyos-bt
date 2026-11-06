/* ===== Plano en PDF ===== */
const WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function pdfTxt(s) {
  return String(s ?? '').replace(/→/g, '->').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/α/g, 'alfa').replace(/⁻¹/g, '-1').replace(/⁻/g, '-')
    .split('').map(ch => { const c = ch.charCodeAt(0); return (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WINANSI_EXTRA.includes(ch) ? ch : (c === 10 ? ' ' : '?'); }).join('');
}
const ESCALAS = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000];
function pdfOpts() { S.proj.pdf = { papel: 'A3', orient: 'h', escala: 'auto', titulo: 'Plano de trazado de línea aérea BT', autor: '', ...(S.proj.pdf || {}) }; return S.proj.pdf; }
function renderPdfOpts() {
  const o = pdfOpts(), box = $('#pdfOpts'); if (!box || box.contains(document.activeElement)) return;
  box.innerHTML = `<div class="fields">
    <label class="f">Papel<select id="pdf_papel"><option value="A3" ${o.papel === 'A3' ? 'selected' : ''}>A3</option><option value="A4" ${o.papel === 'A4' ? 'selected' : ''}>A4</option></select></label>
    <label class="f">Orientación<select id="pdf_orient"><option value="h" ${o.orient === 'h' ? 'selected' : ''}>Horizontal</option><option value="v" ${o.orient === 'v' ? 'selected' : ''}>Vertical</option></select></label>
    <label class="f">Escala<select id="pdf_escala"><option value="auto">Automática (que quepa)</option>${ESCALAS.map(e => `<option value="${e}" ${String(o.escala) === String(e) ? 'selected' : ''}>1:${e.toLocaleString('es-ES')}</option>`).join('')}</select></label>
    <label class="f">Autor o empresa<input id="pdf_autor" type="text" value="${esc(o.autor)}"></label>
    <label class="f full">Título del plano<input id="pdf_titulo" type="text" value="${esc(o.titulo)}"></label></div>
    <p class="note">El plano se centra en el trazado nuevo y la red existente cercana, con lo que se ve en pantalla (fondos activados incluidos). La segunda hoja lleva la relación de apoyos.</p>`;
}
function bindPdf() {
  $('#pdfOpts').addEventListener('change', ev => { const t = ev.target, o = pdfOpts(); const k = t.id.replace('pdf_', ''); if (k in o) o[k] = t.value; });
  $('#exportPdf').onclick = exportPdf;
  renderPdfOpts();
}
async function exportPdf() {
  if (typeof PDFLib === 'undefined') { toast('No se ha podido cargar el generador de PDF. Comprueba la conexión a internet.'); return; }
  const c = S.calc, nodes = c?.nodes || currentNodes();
  if (nodes.length < 2 && !exNodes().length) { toast('No hay nada que dibujar en el plano.'); return; }
  const btn = $('#exportPdf'); btn.disabled = true; const prevTxt = btn.textContent; btn.textContent = 'Generando PDF…';
  try {
    const o = pdfOpts(), { PDFDocument, StandardFonts, rgb } = PDFLib;
    const MM = 72 / 25.4, PXMM = 96 / 25.4;
    let [pw, ph] = o.papel === 'A4' ? [297, 210] : [420, 297]; if (o.orient === 'v') [pw, ph] = [ph, pw];
    const m = 10, strip = o.papel === 'A4' ? 34 : 40;
    const mapW = pw - 2 * m, mapH = ph - 2 * m - strip;
    // Encuadre y escala
    const pts = allPts(); const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const need = Math.max((Math.max(...xs) - Math.min(...xs)) / mapW, (Math.max(...ys) - Math.min(...ys)) / mapH) * 1000 * 1.12;
    const N = o.escala === 'auto' ? (ESCALAS.find(e => e >= need) || Math.ceil(need / 1000) * 1000) : Number(o.escala);
    const W = mapW * PXMM, H = mapH * PXMM, dpr = 2.5;
    const cv = document.createElement('canvas');
    const res = drawMap({ cv, W, H, dpr, sc: PXMM * 1000 / N, cx, cy, print: true });
    const conFondo = ['orto', 'catastro'].some(t => S.proj.fondos?.[t]?.visible && S.img?.[t]?.naturalWidth && !S.img[t].tainted);
    const blob = await new Promise(r => cv.toBlob(r, conFondo ? 'image/jpeg' : 'image/png', 0.92));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pdf = await PDFDocument.create();
    pdf.setTitle(pdfTxt(o.titulo + ' - ' + (S.proj.nombre || ''))); pdf.setProducer('Cálculo de Apoyos BT v' + VERSION); pdf.setCreator('Cálculo de Apoyos BT');
    const F = await pdf.embedFont(StandardFonts.Helvetica), FB = await pdf.embedFont(StandardFonts.HelveticaBold);
    const img = conFondo ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
    const ink = rgb(0.106, 0.137, 0.157), mut = rgb(0.30, 0.35, 0.38), acc = rgb(0.114, 0.357, 0.525), exi = rgb(0.427, 0.416, 0.392);
    const page = pdf.addPage([pw * MM, ph * MM]);
    const X = mm => mm * MM, Y = mm => (ph - mm) * MM; // origen arriba-izquierda en mm
    const txt = (s, x, y, size = 8, font = F, color = ink) => page.drawText(pdfTxt(s), { x: X(x), y: Y(y), size, font, color });
    const fit = (s, maxW, size, font = F) => { s = pdfTxt(s); while (s.length > 3 && font.widthOfTextAtSize(s, size) > X(maxW)) s = s.slice(0, -2); return s; };
    const rect = (x, y, w, h, opt = {}) => page.drawRectangle({ x: X(x), y: Y(y + h), width: X(w), height: X(h), borderColor: ink, borderWidth: 0.6, ...opt });
    // Mapa y marco
    page.drawImage(img, { x: X(m), y: Y(m + mapH), width: X(mapW), height: X(mapH) });
    rect(m, m, mapW, mapH, { borderWidth: 0.8 });
    rect(m, m, pw - 2 * m, ph - 2 * m, { borderWidth: 1.2 });
    // Leyenda
    const ly = m + mapH + 4; let lx = m + 3;
    txt('LEYENDA', lx, ly + 3, 7, FB);
    const leg = [
      ['sq', acc, 'Apoyo nuevo (A)'], ['line', acc, 'Línea nueva: ' + shortCable(S.cables.find(x => x.id === S.proj.cableId)?.designacion || '')],
      ['circ', exi, 'Apoyo existente'], ['dash', exi, 'Línea existente'], ['circ', acc, 'Apoyo de entronque']];
    leg.forEach((it, k) => {
      const yy = ly + 8 + k * 4.6, [kind, colr, label] = it;
      if (kind === 'sq') page.drawRectangle({ x: X(lx), y: Y(yy + 1), width: X(2.4), height: X(2.4), color: rgb(0.184, 0.49, 0.31) });
      if (kind === 'circ') page.drawCircle({ x: X(lx + 1.2), y: Y(yy - 0.2), size: X(1.2), color: colr });
      if (kind === 'line') page.drawLine({ start: { x: X(lx - 0.5), y: Y(yy - 0.2) }, end: { x: X(lx + 3), y: Y(yy - 0.2) }, thickness: 1.6, color: colr });
      if (kind === 'dash') page.drawLine({ start: { x: X(lx - 0.5), y: Y(yy - 0.2) }, end: { x: X(lx + 3), y: Y(yy - 0.2) }, thickness: 1.6, color: colr, dashArray: [3, 2] });
      txt(fit(label, 70, 6.5), lx + 5, yy + 0.8, 6.5);
    });
    // Barra de escala
    const bx = m + 82, by = ly + 12, step = niceStep(N * 0.03), segMm = step * 1000 / N;
    txt('ESCALA 1:' + N.toLocaleString('es-ES'), bx, ly + 3, 7, FB);
    for (let k = 0; k < 4; k++) page.drawRectangle({ x: X(bx + k * segMm), y: Y(by + 1.5), width: X(segMm), height: X(1.5), color: k % 2 ? rgb(1, 1, 1) : ink, borderColor: ink, borderWidth: 0.4 });
    for (let k = 0; k <= 4; k += 2) txt(fmt(step * k) + (k === 4 ? ' m' : ''), bx + k * segMm - 1, by + 5.5, 6);
    txt(S.proj.zone ? `Sistema de referencia: ETRS89 · UTM huso ${S.proj.zone}N (EPSG:258${S.proj.zone})` : 'Coordenadas locales (sin georreferenciar)', bx, by + 10, 6, F, mut);
    if (res?.fondoOmitido) txt('Fondo no incluido: el servidor de la imagen no permite copiarla al PDF.', bx, by + 14, 6, F, rgb(0.65, 0.42, 0));
    // Cajetín
    const cw = o.papel === 'A4' ? 120 : 150, cxp = pw - m - cw, cyp = m + mapH, ch = strip;
    rect(cxp, cyp, cw, ch, { borderWidth: 0.8 });
    const row = (y) => page.drawLine({ start: { x: X(cxp), y: Y(y) }, end: { x: X(cxp + cw), y: Y(y) }, thickness: 0.5, color: ink });
    txt(fit(o.titulo, cw - 4, 9, FB), cxp + 2, cyp + 6, 9, FB);
    txt(fit(S.proj.nombre || 'Proyecto sin nombre', cw - 4, 8), cxp + 2, cyp + 11, 8);
    row(cyp + 13.5);
    const cab = S.cables.find(x => x.id === S.proj.cableId);
    const cells = [['Cable', cab ? cab.designacion : '—'], ['Zona', S.proj.ctx.zona], ['Escala', '1:' + N.toLocaleString('es-ES')], ['Formato', o.papel], ['Fecha', new Date().toLocaleDateString('es-ES')], ['Autor', o.autor || '—']];
    const colW = cw / 2;
    cells.forEach(([k, v], i) => { const cxx = cxp + 2 + (i % 2) * colW, cyy = cyp + 18 + Math.floor(i / 2) * 7.5; txt(k.toUpperCase(), cxx, cyy, 5.5, FB, mut); txt(fit(v, colW - 4, 7.5), cxx, cyy + 3.6, 7.5); });
    page.drawLine({ start: { x: X(cxp + colW), y: Y(cyp + 13.5) }, end: { x: X(cxp + colW), y: Y(cyp + ch) }, thickness: 0.5, color: ink });
    txt(`Hoja 1 · Cálculo de Apoyos BT v${VERSION} · ITC-BT-06`, cxp + 2, cyp + ch - 1.5, 5.5, F, mut);
    // Hoja 2: relación de apoyos
    if (c) {
      const cols = [['Apoyo', 14], ['Nombre', 30], ['Función', 30], ['Modelo', 26], ['Util. %', 13], ['Estado', 32], ['Cota (m)', 15], [S.proj.zone ? 'X UTM' : 'X (m)', 24], [S.proj.zone ? 'Y UTM' : 'Y (m)', 25]];
      const g = getGeo(c.nodes);
      const rowsT = c.results.map((r, i) => { const sel = r.existenteCheck?.ok ? r.existenteCheck : r.elegido, p = sel?.pole; const pt = g?.pts?.[i] || c.nodes[i];
        return ['A' + (i + 1), S.proj.geo?.pts?.[i]?.nombre || '', FUNCS[r.func], p ? poleLabel(p) : '—', sel?.r ? fmt(sel.r.u * 100, 1) : '—', statusOf(r, i).txt, r.z != null ? fmt(r.z, 1) : '—', fmt(pt.x, 2), fmt(pt.y, 2)]; });
      const ve = verifEstado();
      if (ve.it) ve.it.apoyos.forEach(a => { const v = apoyoVerif(a.k), p = S.poles.find(x => x.id === v.modeloId), P = exNodes()[a.k];
        const cc = a.k === S.proj.entronque.k ? null : (p ? calcApoyoExistente(a.k) : null);
        rowsT.push([exLabel(a.k), P.nombre || '', a.k === S.proj.entronque.k ? 'Entronque (A1)' : 'Existente contiguo', p ? poleLabel(p) : '—', cc?.r ? fmt(cc.r.u * 100, 1) : '—', v.ok ? 'Verificado' : 'Sin verificar', '—', fmt(P.x, 2), fmt(P.y, 2)]); });
      const [qw, qh] = [297, 210]; let pg2 = null, yy = 0, hoja = 2;
      const newPage = () => { pg2 = pdf.addPage([qw * MM, qh * MM]); yy = 22; const t2 = (s, x, y, size = 8, font = F, color = ink) => pg2.drawText(pdfTxt(s), { x: x * MM, y: (qh - y) * MM, size, font, color });
        t2('Relación de apoyos', 12, 14, 12, FB); t2(fit(S.proj.nombre || '', 150, 9), 12 + 50, 14, 9); t2(`Hoja ${hoja++}`, qw - 30, 14, 8, F, mut);
        let x = 12; cols.forEach(([h, w]) => { t2(h, x, yy, 7, FB, mut); x += w; }); pg2.drawLine({ start: { x: 12 * MM, y: (qh - yy - 1.5) * MM }, end: { x: (qw - 12) * MM, y: (qh - yy - 1.5) * MM }, thickness: 0.5, color: ink }); yy += 6; return t2; };
      let t2 = newPage();
      rowsT.forEach(rw => { if (yy > qh - 12) t2 = newPage(); let x = 12; rw.forEach((v, k) => { t2(fit(String(v ?? ''), cols[k][1] - 1.5, 7), x, yy, 7); x += cols[k][1]; }); yy += 4.6; });
    }
    const out = await pdf.save();
    const name = ascii(S.proj.nombre || 'plano').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) + `_plano_${o.papel}_1-${N}.pdf`;
    if (await saveFile(name, new Blob([out], { type: 'application/pdf' }))) toast(`Plano en PDF guardado (${o.papel}, escala 1:${N.toLocaleString('es-ES')}).` + (res?.fondoOmitido ? ' El fondo no se ha podido incluir.' : ''));
  } catch (e) { console.error(e); toast('No se pudo generar el PDF: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = prevTxt; }
}
