/* Textos del plano de la red existente (editables) y del cable */
const shortCable = d => String(d || '').replace(/^RZ\s*0,6\/1\s*kV\s*/i, 'RZ ');
function exLabel(i) { const p = exNodes()[i]; return p && p.etiqueta != null ? p.etiqueta : 'E' + (i + 1); }
function lineLabel(l) {
  const base = l.etiqueta != null ? l.etiqueta : l.nombre || '';
  const d = lineData(l.id); const cab = d.v.cableId && d.cab ? shortCable(d.cab.designacion) : '';
  return [base, cab].filter(Boolean).join(' · ');
}
const PRINT_COLORS = { '--map': '#ffffff', '--ink': '#1b2328', '--muted': '#4c5960', '--accent': '#1d5b86', '--exist': '#6d6a64', '--panel': '#ffffff', '--grid': '#e6eaec', '--ok': '#2f7d4f', '--warn': '#a66a00', '--bad': '#b3362c', '--f-body': 'Arial, sans-serif', '--f-mono': 'Consolas, monospace' };
/* Dibuja el plano. Sin argumento, en el lienzo de la pantalla; con T = {cv, W, H, dpr, sc, cx, cy, print}, en otro lienzo (PDF) */
function drawMap(T) {
  const screen = !T;
  const cv = screen ? $('#map') : T.cv, dpr = screen ? (window.devicePixelRatio || 1) : T.dpr, W = screen ? cv.clientWidth : T.W, Hh = screen ? cv.clientHeight : T.H;
  if (!W) return;
  cv.width = W * dpr; cv.height = Hh * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cs = getComputedStyle(document.documentElement), col = n => screen ? cs.getPropertyValue(n).trim() : (PRINT_COLORS[n] || '#000');
  g.fillStyle = col('--map'); g.fillRect(0, 0, W, Hh);
  const nodes = S.drag ? currentNodes() : (S.calc?.nodes || (S.proj.rows.length > 1 ? currentNodes() : []));
  const ex = exNodes(), lines = exLineas(), ruta = S.proj.geo?.ruta || [];
  if (nodes.length < 2 && ex.length < 1 && !lines.length) {
    if (screen) S.mapT = null; g.fillStyle = col('--muted'); g.font = '13px ' + col('--f-body'); g.textAlign = 'center';
    g.fillText('Proyecto vacío: importa el trazado, la red existente o crea el trazado con coordenadas.', W / 2, Hh / 2); return;
  }
  if (screen && (!V.fitted || !V.sc)) fitView();
  const sc = screen ? V.sc : T.sc, cx = screen ? V.cx : T.cx, cy = screen ? V.cy : T.cy;
  const P = n => [W / 2 + (n.x - cx) * sc, Hh / 2 - (n.y - cy) * sc];
  const inView = (x, y, m = 20) => x > -m && y > -m && x < W + m && y < Hh + m;
  let fondoOmitido = false;
  for (const tipo of ['orto', 'catastro']) {
    const f = S.proj.fondos?.[tipo]; if (!f || !f.visible) continue;
    const im = ensureImg(tipo); if (!im || !im.complete || im.failed || !im.naturalWidth) continue;
    if (!screen && im.tainted) { fondoOmitido = true; continue; }
    const [x0, y0] = P({ x: f.bbox[0], y: f.bbox[3] }), [x1, y1] = P({ x: f.bbox[2], y: f.bbox[1] });
    g.globalAlpha = (f.op ?? 100) / 100; g.drawImage(im, x0, y0, x1 - x0, y1 - y0); g.globalAlpha = 1;
  }
  const hasFondo = ['orto', 'catastro'].some(t => S.proj.fondos?.[t]?.visible && S.img?.[t]?.naturalWidth && (screen || !S.img[t].tainted));
  if (!hasFondo) {
    const step = niceStep(80 / sc); g.strokeStyle = col('--grid'); g.lineWidth = 1;
    const x0 = cx - W / 2 / sc, y0 = cy - Hh / 2 / sc;
    for (let x = Math.floor(x0 / step) * step; (x - cx) * sc + W / 2 < W; x += step) { const px = W / 2 + (x - cx) * sc; g.beginPath(); g.moveTo(px, 0); g.lineTo(px, Hh); g.stroke(); }
    for (let y = Math.floor(y0 / step) * step; Hh / 2 - (y - cy) * sc > 0; y += step) { const py = Hh / 2 - (y - cy) * sc; g.beginPath(); g.moveTo(0, py); g.lineTo(W, py); g.stroke(); }
  }
  const halo = (txt, x, y) => { g.lineWidth = 3; g.strokeStyle = col('--map'); g.strokeText(txt, x, y); g.fillText(txt, x, y); };
  /* Texto a lo largo de un tramo, a un lado (side = -1 encima, +1 debajo) */
  const alongText = (txt, A, B, side, font, color) => {
    if (!txt) return; const [x1, y1] = P(A), [x2, y2] = P(B); let ang = Math.atan2(y2 - y1, x2 - x1); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    g.save(); g.translate((x1 + x2) / 2, (y1 + y2) / 2); g.rotate(ang); g.font = font; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = side < 0 ? 'bottom' : 'top';
    halo(txt, 0, side * 5); g.restore();
  };
  const longestSeg = pts => { let best = -1, bl = 0; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [P(pts[i]), P(pts[i + 1])]; if (!inView(a[0], a[1], 0) && !inView(b[0], b[1], 0)) continue; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d > bl) { bl = d; best = i; } } return { i: best, len: bl }; };
  const L = S.editLayer, tool = S.tool;
  const vtx = (x, y, on) => { g.fillStyle = on ? col('--accent') : col('--panel'); g.strokeStyle = col('--accent'); g.lineWidth = 1.5; g.beginPath(); g.rect(x - 4, y - 4, 8, 8); g.fill(); g.stroke(); };
  if (ruta.length > 1) {
    g.strokeStyle = col('--accent'); g.globalAlpha = 0.45; g.lineWidth = 1.5; g.setLineDash([2, 4]); g.beginPath(); ruta.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    if (screen && tool !== 'pan' && L === 'ruta') ruta.forEach((n, i) => { const [x, y] = P(n); vtx(x, y, S.selPt?.layer === 'ruta' && S.selPt.i === i); });
  }
  // Líneas existentes con su texto (y su cable verificado)
  lines.forEach((l, li) => {
    g.strokeStyle = col('--exist'); g.lineWidth = 3; g.setLineDash([8, 5]); g.beginPath(); l.pts.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
    const ls = longestSeg(l.pts); const txt = lineLabel(l);
    if (ls.i >= 0 && txt && ls.len > g.measureText(txt).width * 0.6) alongText(txt, l.pts[ls.i], l.pts[ls.i + 1], -1, 'italic 600 11px ' + col('--f-body'), col('--exist'));
    if (screen && tool !== 'pan' && L === 'exLineas') l.pts.forEach((n, i) => { const [x, y] = P(n); vtx(x, y, S.selPt?.layer === 'exLineas' && S.selPt.li === li && S.selPt.i === i); });
  });
  ex.forEach((n, i) => {
    const [x, y] = P(n); if (!inView(x, y)) return;
    const isEn = S.proj.entronque?.k === i, isSel = screen && S.selPt?.layer === 'exApoyos' && S.selPt.i === i;
    g.fillStyle = isEn ? col('--accent') : col('--exist'); g.strokeStyle = isSel ? col('--ink') : col('--panel'); g.lineWidth = isSel ? 3 : 2;
    g.beginPath(); g.arc(x, y, isEn ? 7 : 5, 0, Math.PI * 2); g.fill(); g.stroke();
    const lab = exLabel(i);
    if (lab && (sc > 0.6 || isEn || !screen)) { g.fillStyle = col('--exist'); g.font = '600 11px ' + col('--f-body'); g.textAlign = 'right'; halo(lab, x - 8, y - 7); }
  });
  if (nodes.length > 1) {
    g.strokeStyle = col('--accent'); g.lineWidth = 2.5; g.beginPath(); nodes.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    g.font = '11px ' + col('--f-mono'); g.textAlign = 'center';
    for (let i = 0; i < nodes.length - 1; i++) { const a = Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].y - nodes[i].y); alongText(fmt(a, 1) + ' m', nodes[i], nodes[i + 1], -1, '11px ' + col('--f-mono'), col('--ink')); }
    // Cable del proyecto sobre el vano más largo de la línea nueva
    const cable = S.cables.find(c => c.id === S.proj.cableId);
    if (cable) { const ls = longestSeg(nodes); if (ls.i >= 0) alongText(shortCable(cable.designacion), nodes[ls.i], nodes[ls.i + 1], 1, '600 11px ' + col('--f-body'), col('--accent')); }
    nodes.forEach(n => {
      const e = n.existente; if (!e?.activo) return; const [x, y] = P(n);
      g.strokeStyle = col('--exist'); g.setLineDash([4, 4]); g.lineWidth = 1.5;
      (e.conductores || []).filter(c => !c.deLinea).forEach(c => { const u = { x: Math.sin(c.az * Math.PI / 180), y: Math.cos(c.az * Math.PI / 180) }; g.beginPath(); g.moveTo(x, y); g.lineTo(x + u.x * 40, y - u.y * 40); g.stroke(); });
      g.setLineDash([]);
    });
    nodes.forEach((n, i) => {
      const [x, y] = P(n); const r = S.drag ? null : S.calc?.results[i]; const st = r ? statusOf(r, i) : { col: 'muted' };
      g.fillStyle = col('--' + st.col); g.strokeStyle = col('--panel'); g.lineWidth = 2;
      g.beginPath(); g.rect(x - 6, y - 6, 12, 12); g.fill(); g.stroke();
      if (screen && (S.sel === i || (S.selPt?.layer === 'nuevo' && S.selPt.i === i))) { g.strokeStyle = col('--ink'); g.lineWidth = 2; g.strokeRect(x - 10, y - 10, 20, 20); }
      g.fillStyle = col('--ink'); g.font = '600 12px ' + col('--f-body'); g.textAlign = 'left'; halo('A' + (i + 1), x + 9, y - 8);
      const p = r && (r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole);
      if (p) { g.fillStyle = col('--muted'); g.font = '10px ' + col('--f-mono'); halo(poleLabel(p), x + 9, y + 15); }
    });
  }
  if (screen) {
    const sl = niceStep(120 / sc); g.fillStyle = col('--panel'); g.fillRect(8, Hh - 38, sl * sc + 16, 30);
    g.strokeStyle = col('--ink'); g.lineWidth = 2; g.beginPath(); g.moveTo(14, Hh - 14); g.lineTo(14 + sl * sc, Hh - 14); g.stroke();
    g.fillStyle = col('--ink'); g.font = '11px ' + col('--f-mono'); g.textAlign = 'left'; g.fillText(fmt(sl) + ' m', 14, Hh - 22);
  }
  g.textAlign = 'center'; g.font = '600 12px ' + col('--f-body'); g.fillStyle = col('--ink'); halo('N', W - 20, 20); g.beginPath(); g.moveTo(W - 20, 26); g.lineTo(W - 25, 40); g.lineTo(W - 15, 40); g.closePath(); g.fill();
  if (screen) { $('#mapInfo').textContent = S.proj.zone ? `ETRS89 · UTM huso ${S.proj.zone}` : 'Coordenadas locales (entrada manual)'; S.mapT = { P, nodes, ex }; }
  return { fondoOmitido };
}
