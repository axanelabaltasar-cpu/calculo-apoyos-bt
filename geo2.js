/* ===== Red existente: líneas y apoyos por separado ===== */
function redEx() {
  if (!S.proj.redEx && S.proj.lineaEx) { // proyectos guardados con la versión anterior
    const L = S.proj.lineaEx; S.proj.redEx = { lineas: [{ nombre: L.nombre, fuente: L.fuente, pts: L.pts }], apoyos: [] }; delete S.proj.lineaEx;
  }
  return S.proj.redEx || null;
}
function exLineas() { return redEx()?.lineas || []; }
/* Apoyos existentes: los importados; si no hay, los vértices de las líneas existentes */
function exNodes() {
  const R = redEx(); if (!R) return [];
  if (R.apoyos?.length) return R.apoyos;
  if (!R._vert) {
    const out = []; R.lineas.forEach(l => l.pts.forEach(p => { if (!out.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 0.5)) out.push(p); }));
    Object.defineProperty(R, '_vert', { value: out, enumerable: false, configurable: true, writable: true });
  }
  return R._vert;
}
function invalidateVert() { const R = S.proj.redEx; if (R && R._vert) delete R._vert; }
function segDist(P, A, B) {
  const dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((P.x - A.x) * dx + (P.y - A.y) * dy) / L2)) : 0;
  return { d: Math.hypot(A.x + dx * t - P.x, A.y + dy * t - P.y), t };
}
/* Conductores existentes que salen del apoyo de entronque, deducidos de las líneas existentes */
function entronqueConductores() {
  const en = S.proj.entronque, ex = exNodes(); if (!en || en.k == null || !ex[en.k]) return [];
  const P = ex[en.k], tol = 3, cab = S.cables.find(c => c.id === en.cableId), dirs = [];
  const nextPole = (V) => { // apoyo existente más cercano entre P y V sobre el segmento
    let best = Math.hypot(V.x - P.x, V.y - P.y);
    ex.forEach((Q, j) => { if (j === en.k) return; const s = segDist(Q, P, V); const d = Math.hypot(Q.x - P.x, Q.y - P.y); if (s.d < tol && s.t > 0.001 && d > 0.5 && d < best) best = d; });
    return best;
  };
  exLineas().forEach(l => {
    for (let i = 0; i < l.pts.length - 1; i++) {
      const A = l.pts[i], B = l.pts[i + 1], s = segDist(P, A, B); if (s.d > tol) continue;
      const cand = [];
      if (Math.hypot(A.x - P.x, A.y - P.y) > 0.5) cand.push(A);
      if (Math.hypot(B.x - P.x, B.y - P.y) > 0.5) cand.push(B);
      cand.forEach(V => {
        const az = (Math.atan2(V.x - P.x, V.y - P.y) * 180 / Math.PI + 360) % 360;
        if (dirs.some(d => Math.abs(((d.az - az + 540) % 360) - 180) < 3)) return;
        dirs.push({ az, vano: nextPole(V), linea: l.nombre });
      });
    }
  });
  return dirs.map(d => ({ cableId: en.cableId || '', az: Math.round(d.az * 10) / 10, vano: Math.round(d.vano * 10) / 10, tense: Number(en.tense) || 0,
    diam: cab ? cab.diamHaz : 0, depth: Number(en.depth) || S.proj.ctx.depthAmarre, deLinea: true, hacia: `${d.linea || 'línea'} (${fmt(d.az)}°)` }));
}
function currentNodes() {
  const rows = S.proj.rows;
  let nodes;
  if (S.proj.modo === 'kml' && S.proj.geo) nodes = S.proj.geo.pts.map(p => ({ x: p.x, y: p.y }));
  else {
    nodes = E.nodesFromManual(rows, Number(S.proj.ctx.rumbo0) || 0);
    const en = S.proj.entronque, ex = exNodes();
    if (en && ex[en.k]) nodes.forEach(n => { n.x += ex[en.k].x; n.y += ex[en.k].y; });
  }
  nodes.forEach((n, i) => {
    const r = rows[i]; let existente = r.existente;
    if (i === 0 && S.proj.entronque && exNodes()[S.proj.entronque.k]) existente = { ...r.existente, activo: true, conductores: [...entronqueConductores(), ...(r.existente.conductores || [])] };
    Object.assign(n, { funcion: r.funcion, alturaFija: r.alturaFija, modeloFijo: r.modeloFijo, cruce: r.cruce, existente });
  });
  return nodes;
}
function getGeo(nodes) {
  const zone = S.proj.zone; if (!zone) return null;
  if (S.proj.modo === 'kml' && S.proj.geo) return { zone, pts: S.proj.geo.pts };
  if (S.proj.entronque && exNodes()[S.proj.entronque.k]) {
    const ns = nodes || currentNodes();
    return { zone, pts: ns.map(n => ({ x: n.x, y: n.y, ...E.latLonFromUtm(n.x, n.y, zone) })) };
  }
  return null;
}

/* ===== Plano ===== */
const V = { sc: null, cx: 0, cy: 0, fitted: false };
/* Puntos que encuadran la vista y los fondos: el trazado nuevo y la red existente cercana (300 m) */
function allPts() {
  const n = S.calc?.nodes || (S.proj.rows.length > 1 ? currentNodes() : []);
  const ruta = S.proj.geo?.ruta || [];
  const ex = [...exNodes(), ...exLineas().flatMap(l => l.pts)];
  const base = [...n, ...ruta];
  if (!base.length) return ex;
  const xs = base.map(p => p.x), ys = base.map(p => p.y), m = 300;
  const x0 = Math.min(...xs) - m, x1 = Math.max(...xs) + m, y0 = Math.min(...ys) - m, y1 = Math.max(...ys) + m;
  return [...base, ...ex.filter(p => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)];
}
function fitView() {
  const pts = allPts(), cv = $('#map'); if (!pts.length || !cv.clientWidth) return;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  V.cx = (minx + maxx) / 2; V.cy = (miny + maxy) / 2;
  V.sc = Math.min((cv.clientWidth - 92) / Math.max(maxx - minx, 1), (cv.clientHeight - 92) / Math.max(maxy - miny, 1));
  V.fitted = true;
}
function drawMap() {
  const cv = $('#map'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, Hh = cv.clientHeight;
  if (!W) return;
  cv.width = W * dpr; cv.height = Hh * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cs = getComputedStyle(document.documentElement), col = n => cs.getPropertyValue(n).trim();
  g.fillStyle = col('--map'); g.fillRect(0, 0, W, Hh);
  const nodes = S.drag ? currentNodes() : (S.calc?.nodes || (S.proj.rows.length > 1 ? currentNodes() : []));
  const ex = exNodes(), lines = exLineas(), ruta = S.proj.geo?.ruta || [];
  if (nodes.length < 2 && ex.length < 1 && !lines.length) { S.mapT = null; return; }
  if (!V.fitted || !V.sc) fitView();
  const sc = V.sc, P = n => [W / 2 + (n.x - V.cx) * sc, Hh / 2 - (n.y - V.cy) * sc];
  for (const tipo of ['orto', 'catastro']) {
    const f = S.proj.fondos?.[tipo]; if (!f || !f.visible) continue;
    const im = ensureImg(tipo); if (!im || !im.complete || im.failed || !im.naturalWidth) continue;
    const [x0, y0] = P({ x: f.bbox[0], y: f.bbox[3] }), [x1, y1] = P({ x: f.bbox[2], y: f.bbox[1] });
    g.globalAlpha = (f.op ?? 100) / 100; g.drawImage(im, x0, y0, x1 - x0, y1 - y0); g.globalAlpha = 1;
  }
  const hasFondo = ['orto', 'catastro'].some(t => S.proj.fondos?.[t]?.visible && S.img?.[t]?.naturalWidth);
  if (!hasFondo) {
    const step = niceStep(80 / sc); g.strokeStyle = col('--grid'); g.lineWidth = 1;
    const x0 = V.cx - W / 2 / sc, y0 = V.cy - Hh / 2 / sc;
    for (let x = Math.floor(x0 / step) * step; (x - V.cx) * sc + W / 2 < W; x += step) { const px = W / 2 + (x - V.cx) * sc; g.beginPath(); g.moveTo(px, 0); g.lineTo(px, Hh); g.stroke(); }
    for (let y = Math.floor(y0 / step) * step; Hh / 2 - (y - V.cy) * sc > 0; y += step) { const py = Hh / 2 - (y - V.cy) * sc; g.beginPath(); g.moveTo(0, py); g.lineTo(W, py); g.stroke(); }
  }
  const halo = (txt, x, y) => { g.lineWidth = 3; g.strokeStyle = col('--map'); g.strokeText(txt, x, y); g.fillText(txt, x, y); };
  const L = S.editLayer, tool = S.tool;
  const vtx = (x, y, on) => { g.fillStyle = on ? col('--accent') : col('--panel'); g.strokeStyle = col('--accent'); g.lineWidth = 1.5; g.beginPath(); g.rect(x - 4, y - 4, 8, 8); g.fill(); g.stroke(); };
  // Ruta del KML (referencia)
  if (ruta.length > 1) {
    g.strokeStyle = col('--accent'); g.globalAlpha = 0.45; g.lineWidth = 1.5; g.setLineDash([2, 4]); g.beginPath(); ruta.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    if (tool !== 'pan' && L === 'ruta') ruta.forEach((n, i) => { const [x, y] = P(n); vtx(x, y, S.selPt?.layer === 'ruta' && S.selPt.i === i); });
  }
  // Líneas existentes
  lines.forEach((l, li) => {
    g.strokeStyle = col('--exist'); g.lineWidth = 3; g.setLineDash([8, 5]); g.beginPath(); l.pts.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
    if (tool !== 'pan' && L === 'exLineas') l.pts.forEach((n, i) => { const [x, y] = P(n); vtx(x, y, S.selPt?.layer === 'exLineas' && S.selPt.li === li && S.selPt.i === i); });
  });
  // Apoyos existentes
  ex.forEach((n, i) => {
    const [x, y] = P(n); if (x < -20 || y < -20 || x > W + 20 || y > Hh + 20) return;
    const isEn = S.proj.entronque?.k === i, isSel = S.selPt?.layer === 'exApoyos' && S.selPt.i === i;
    g.fillStyle = isEn ? col('--accent') : col('--exist'); g.strokeStyle = isSel ? col('--ink') : col('--panel'); g.lineWidth = isSel ? 3 : 2;
    g.beginPath(); g.arc(x, y, isEn ? 7 : 5, 0, Math.PI * 2); g.fill(); g.stroke();
    if (sc > 0.6 || isEn) { g.fillStyle = col('--exist'); g.font = '600 11px ' + col('--f-body'); g.textAlign = 'right'; halo('E' + (i + 1), x - 8, y - 7); }
  });
  if (nodes.length > 1) {
    g.strokeStyle = col('--accent'); g.lineWidth = 2.5; g.beginPath(); nodes.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    g.font = '11px ' + col('--f-mono'); g.textAlign = 'center';
    for (let i = 0; i < nodes.length - 1; i++) { const [x1, y1] = P(nodes[i]), [x2, y2] = P(nodes[i + 1]); const a = Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].y - nodes[i].y); g.fillStyle = col('--ink'); halo(fmt(a, 1) + ' m', (x1 + x2) / 2, (y1 + y2) / 2 - 6); }
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
      if (S.sel === i || (S.selPt?.layer === 'nuevo' && S.selPt.i === i)) { g.strokeStyle = col('--ink'); g.lineWidth = 2; g.strokeRect(x - 10, y - 10, 20, 20); }
      g.fillStyle = col('--ink'); g.font = '600 12px ' + col('--f-body'); g.textAlign = 'left'; halo('A' + (i + 1), x + 9, y - 8);
      const p = r && (r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole);
      if (p) { g.fillStyle = col('--muted'); g.font = '10px ' + col('--f-mono'); halo(poleLabel(p), x + 9, y + 15); }
    });
  }
  const sl = niceStep(120 / sc); g.fillStyle = col('--panel'); g.fillRect(8, Hh - 38, sl * sc + 16, 30);
  g.strokeStyle = col('--ink'); g.lineWidth = 2; g.beginPath(); g.moveTo(14, Hh - 14); g.lineTo(14 + sl * sc, Hh - 14); g.stroke();
  g.fillStyle = col('--ink'); g.font = '11px ' + col('--f-mono'); g.textAlign = 'left'; g.fillText(fmt(sl) + ' m', 14, Hh - 22);
  g.textAlign = 'center'; g.font = '600 12px ' + col('--f-body'); halo('N', W - 20, 20); g.beginPath(); g.moveTo(W - 20, 26); g.lineTo(W - 25, 40); g.lineTo(W - 15, 40); g.closePath(); g.fill();
  $('#mapInfo').textContent = S.proj.zone ? `ETRS89 · UTM huso ${S.proj.zone}` : 'Coordenadas locales (entrada manual)';
  S.mapT = { P, nodes, ex };
}
function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
function zoomAt(f, mx, my) {
  const cv = $('#map'), W = cv.clientWidth, Hh = cv.clientHeight; if (!V.sc) return;
  const wx = V.cx + (mx - W / 2) / V.sc, wy = V.cy - (my - Hh / 2) / V.sc;
  V.sc *= f; V.cx = wx - (mx - W / 2) / V.sc; V.cy = wy + (my - Hh / 2) / V.sc; drawMap();
}

/* ===== Edición en el plano ===== */
const LAYERS = { nuevo: 'Apoyos nuevos', exApoyos: 'Apoyos existentes', exLineas: 'Líneas existentes', ruta: 'Ruta del trazado' };
S.tool = 'pan'; S.editLayer = 'nuevo'; S.hist = [];
function snapshot() {
  S.hist.push(JSON.stringify({ geo: S.proj.geo, rows: S.proj.rows, redEx: S.proj.redEx, entronque: S.proj.entronque, modo: S.proj.modo, zone: S.proj.zone, rumbo0: S.proj.ctx.rumbo0 }));
  if (S.hist.length > 60) S.hist.shift(); updUndo();
}
function undo() {
  const h = S.hist.pop(); if (!h) return; const d = JSON.parse(h);
  Object.assign(S.proj, { geo: d.geo, rows: d.rows, redEx: d.redEx, entronque: d.entronque, modo: d.modo, zone: d.zone }); S.proj.ctx.rumbo0 = d.rumbo0;
  invalidateVert(); S.selPt = null; updUndo(); refreshAll(); toast('Cambio deshecho.');
}
function updUndo() { const b = $('#edUndo'); if (b) b.disabled = !S.hist.length; }
/* Para editar en el plano, el trazado manual pasa a coordenadas */
function ensureGeoPts() {
  if (S.proj.modo === 'kml' && S.proj.geo) return true;
  const n = currentNodes(); const z = S.proj.zone;
  S.proj.geo = { zone: z, pts: n.map(p => ({ x: p.x, y: p.y, ...(z ? E.latLonFromUtm(p.x, p.y, z) : {}), vertice: true })), fuente: 'edición en el plano' };
  S.proj.modo = 'kml'; return true;
}
function setLL(p) { if (S.proj.zone) Object.assign(p, E.latLonFromUtm(p.x, p.y, S.proj.zone)); }
function layerPts(layer) {
  if (layer === 'nuevo') return S.proj.modo === 'kml' && S.proj.geo ? [S.proj.geo.pts] : [];
  if (layer === 'exApoyos') return redEx()?.apoyos?.length ? [redEx().apoyos] : [];
  if (layer === 'exLineas') return exLineas().map(l => l.pts);
  if (layer === 'ruta') return S.proj.geo?.ruta ? [S.proj.geo.ruta] : [];
  return [];
}
function hitPoint(layer, mx, my, tolPx = 12) {
  if (layer === 'nuevo' && !(S.proj.modo === 'kml' && S.proj.geo)) { // trazado manual: se busca en los nodos actuales
    let best = null; currentNodes().forEach((n, i) => { const [x, y] = S.mapT.P(n); const d = Math.hypot(x - mx, y - my); if (d < tolPx && (!best || d < best.d)) best = { li: 0, i, d }; }); return best;
  }
  if (layer === 'exApoyos' && !redEx()?.apoyos?.length) return null;
  let best = null;
  layerPts(layer).forEach((arr, li) => arr.forEach((n, i) => { const [x, y] = S.mapT.P(n); const d = Math.hypot(x - mx, y - my); if (d < tolPx && (!best || d < best.d)) best = { li, i, d }; }));
  return best;
}
function hitSegment(arr, mx, my, tolPx = 10) {
  let best = null;
  for (let i = 0; i < arr.length - 1; i++) {
    const [ax, ay] = S.mapT.P(arr[i]), [bx, by] = S.mapT.P(arr[i + 1]);
    const s = segDist({ x: mx, y: my }, { x: ax, y: ay }, { x: bx, y: by });
    if (s.d < tolPx && (!best || s.d < best.d)) best = { i, t: s.t, d: s.d };
  }
  return best;
}
function worldAt(mx, my) { const cv = $('#map'); return { x: V.cx + (mx - cv.clientWidth / 2) / V.sc, y: V.cy - (my - cv.clientHeight / 2) / V.sc }; }
function isEntronqueA1(i) { return i === 0 && S.proj.entronque?.k != null && exNodes()[S.proj.entronque.k]; }
function editClick(mx, my) {
  const layer = S.editLayer, tool = S.tool, w = worldAt(mx, my);
  if (tool === 'insert') {
    if (layer === 'nuevo') {
      ensureGeoPts(); const pts = S.proj.geo.pts; const h = hitSegment(pts, mx, my);
      snapshot();
      const np = { x: w.x, y: w.y, vertice: true }; setLL(np);
      if (h) { pts.splice(h.i + 1, 0, np); S.proj.rows.splice(h.i + 1, 0, newRow()); toast(`Apoyo insertado entre A${h.i + 1} y A${h.i + 2}.`); }
      else { pts.push(np); S.proj.rows.push(newRow()); toast(`Apoyo A${pts.length} añadido al final del trazado.`); }
    } else if (layer === 'exApoyos') {
      const R = redEx() || (S.proj.redEx = { lineas: [], apoyos: [] }); if (!S.proj.zone) return toast('Importa primero algún elemento con coordenadas para fijar el huso UTM.');
      snapshot(); const np = { x: w.x, y: w.y, nombre: '' }; setLL(np); R.apoyos = R.apoyos || []; R.apoyos.push(np); invalidateVert(); toast(`Apoyo existente E${R.apoyos.length} añadido.`);
    } else if (layer === 'exLineas' || layer === 'ruta') {
      const arrs = layerPts(layer); let hit = null, li = -1;
      arrs.forEach((arr, k) => { const h = hitSegment(arr, mx, my); if (h && (!hit || h.d < hit.d)) { hit = h; li = k; } });
      if (!hit) return toast('Pulsa sobre un tramo de la línea para insertar un vértice.');
      snapshot(); const np = { x: w.x, y: w.y }; setLL(np); arrs[li].splice(hit.i + 1, 0, np); invalidateVert();
    }
    refreshAll(); return;
  }
  if (tool === 'delete') {
    const h = hitPoint(layer, mx, my); if (!h) return;
    if (layer === 'nuevo') {
      if (S.proj.rows.length <= 2) return toast('El trazado necesita al menos dos apoyos.');
      ensureGeoPts(); snapshot();
      if (isEntronqueA1(h.i)) S.proj.entronque.k = null;
      S.proj.geo.pts.splice(h.i, 1); S.proj.rows.splice(h.i, 1); toast(`Apoyo A${h.i + 1} borrado.`);
    } else if (layer === 'exApoyos') {
      snapshot(); const en = S.proj.entronque;
      if (en?.k === h.i) en.k = null; else if (en?.k > h.i) en.k--;
      redEx().apoyos.splice(h.i, 1); invalidateVert(); toast(`Apoyo existente E${h.i + 1} borrado.`);
    } else {
      const arr = layerPts(layer)[h.li]; snapshot();
      if (arr.length <= 2) { if (layer === 'exLineas') { exLineas().splice(h.li, 1); toast('Línea existente borrada (le quedaban dos vértices).'); } else { S.proj.geo.ruta = null; toast('Ruta borrada.'); } }
      else arr.splice(h.i, 1);
      invalidateVert();
    }
    S.selPt = null; refreshAll(); return;
  }
}
function bindMap() {
  const cv = $('#map'); let drag = null;
  cv.addEventListener('pointerdown', ev => {
    const rc = cv.getBoundingClientRect(), mx = ev.clientX - rc.left, my = ev.clientY - rc.top;
    drag = { x: ev.clientX, y: ev.clientY, cx: V.cx, cy: V.cy, moved: false, mx, my };
    if (S.tool === 'move' && S.mapT) {
      const h = hitPoint(S.editLayer, mx, my);
      if (h) {
        if (S.editLayer === 'nuevo' && isEntronqueA1(h.i)) { toast(`A1 es el apoyo existente E${S.proj.entronque.k + 1}: muévelo en la capa «Apoyos existentes».`); drag = null; return; }
        if (S.editLayer === 'nuevo') ensureGeoPts();
        snapshot(); drag.pt = { ...h, layer: S.editLayer }; S.drag = true; S.selPt = { layer: S.editLayer, li: h.li, i: h.i }; renderPtEdit();
      }
    }
    cv.setPointerCapture(ev.pointerId);
  });
  cv.addEventListener('pointermove', ev => {
    if (!drag || !V.sc) return; const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    if (drag.pt) {
      const rc = cv.getBoundingClientRect(), w = worldAt(ev.clientX - rc.left, ev.clientY - rc.top);
      const p = layerPts(drag.pt.layer)[drag.pt.li][drag.pt.i]; p.x = w.x; p.y = w.y;
      if (drag.pt.layer === 'exApoyos' && S.proj.entronque?.k === drag.pt.i && S.proj.geo?.pts?.[0]) { S.proj.geo.pts[0].x = w.x; S.proj.geo.pts[0].y = w.y; }
      if (!drag.raf) drag.raf = requestAnimationFrame(() => { drag && (drag.raf = null); drawMap(); });
    } else { V.cx = drag.cx - dx / V.sc; V.cy = drag.cy + dy / V.sc; drawMap(); }
  });
  cv.addEventListener('pointerup', ev => {
    const d = drag; drag = null; S.drag = false; if (!d || !S.mapT) return;
    if (d.pt) {
      if (!d.moved) { S.hist.pop(); updUndo(); drawMap(); return; }
      const p = layerPts(d.pt.layer)[d.pt.li][d.pt.i]; setLL(p);
      if (d.pt.layer === 'exApoyos' && S.proj.entronque?.k === d.pt.i && S.proj.geo?.pts?.[0]) setLL(S.proj.geo.pts[0]);
      invalidateVert(); refreshAll(); return;
    }
    if (d.moved) return;
    const mx = d.mx, my = d.my;
    if (S.tool === 'insert' || S.tool === 'delete') return editClick(mx, my);
    const near = list => { let best = -1, bd = 16; list.forEach((n, i) => { const [x, y] = S.mapT.P(n); const dd = Math.hypot(x - mx, y - my); if (dd < bd) { bd = dd; best = i; } }); return best; };
    if (S.pickEntronque) { const k = near(S.mapT.ex); if (k >= 0) { S.pickEntronque = false; setEntronque(k); } return; }
    const i = near(S.mapT.nodes);
    if (i >= 0) { S.sel = S.sel === i ? null : i; S.selPt = S.sel == null ? null : { layer: 'nuevo', li: 0, i }; renderRows(); renderResults(); renderPtEdit(); return; }
    const k = near(S.mapT.ex); if (k >= 0 && redEx()?.apoyos?.length) { S.selPt = { layer: 'exApoyos', li: 0, i: k }; renderPtEdit(); drawMap(); return; }
    S.selPt = null; renderPtEdit(); drawMap();
  });
  cv.addEventListener('wheel', ev => { ev.preventDefault(); const rc = cv.getBoundingClientRect(); zoomAt(ev.deltaY < 0 ? 1.25 : 0.8, ev.clientX - rc.left, ev.clientY - rc.top); }, { passive: false });
  $('#zIn').onclick = () => zoomAt(1.5, cv.clientWidth / 2, cv.clientHeight / 2);
  $('#zOut').onclick = () => zoomAt(1 / 1.5, cv.clientWidth / 2, cv.clientHeight / 2);
  $('#zFit').onclick = () => { fitView(); drawMap(); };
  $('#resTable').addEventListener('click', ev => { const tr = ev.target.closest('tr[data-i]'); if (!tr) return; const i = Number(tr.dataset.i); S.sel = S.sel === i ? null : i; renderRows(); renderResults(); });
  window.addEventListener('resize', () => { drawMap(); drawPerfil(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', drawMap);
  // Barra de edición
  $('#edBar').addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.tool) { S.tool = b.dataset.tool; renderEdBar(); drawMap(); }
    if (b.id === 'edUndo') undo();
  });
  $('#edLayer').addEventListener('change', e => { S.editLayer = e.target.value; S.selPt = null; renderEdBar(); renderPtEdit(); drawMap(); });
  document.addEventListener('keydown', ev => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) { ev.preventDefault(); undo(); }
    if (ev.key === 'Escape' && S.tool !== 'pan') { S.tool = 'pan'; renderEdBar(); drawMap(); }
  });
  $('#ptEdit').addEventListener('change', ev => {
    const t = ev.target, sp = S.selPt; if (!sp) return;
    const p = sp.layer === 'nuevo' ? (ensureGeoPts(), S.proj.geo.pts[sp.i]) : layerPts(sp.layer)[sp.li]?.[sp.i]; if (!p) return;
    snapshot();
    if (t.id === 'pe_x') p.x = Number(t.value); if (t.id === 'pe_y') p.y = Number(t.value); if (t.id === 'pe_n') p.nombre = t.value;
    setLL(p);
    if (sp.layer === 'exApoyos' && S.proj.entronque?.k === sp.i && S.proj.geo?.pts?.[0]) { Object.assign(S.proj.geo.pts[0], { x: p.x, y: p.y }); setLL(S.proj.geo.pts[0]); }
    invalidateVert(); refreshAll();
  });
  bindFondos(); renderEdBar();
}
function renderEdBar() {
  document.querySelectorAll('#edBar [data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === S.tool)));
  $('#edLayer').value = S.editLayer; $('#map').style.cursor = S.tool === 'pan' ? 'grab' : S.tool === 'move' ? 'move' : 'crosshair';
  const hint = { pan: 'Arrastra para mover el plano. Pulsa un apoyo para seleccionarlo y editar sus coordenadas.', move: `Arrastra un punto de «${LAYERS[S.editLayer]}» para moverlo.`, insert: S.editLayer === 'nuevo' ? 'Pulsa sobre un vano para intercalar un apoyo, o fuera del trazado para añadirlo al final.' : S.editLayer === 'exApoyos' ? 'Pulsa en el plano para añadir un apoyo existente.' : 'Pulsa sobre un tramo para insertar un vértice.', delete: `Pulsa un punto de «${LAYERS[S.editLayer]}» para borrarlo.` }[S.tool];
  $('#edHint').textContent = hint; updUndo();
}
function renderPtEdit() {
  const box = $('#ptEdit'), sp = S.selPt;
  if (!sp) { box.hidden = true; return; }
  let p, label;
  if (sp.layer === 'nuevo') { const n = (S.proj.modo === 'kml' && S.proj.geo) ? S.proj.geo.pts[sp.i] : currentNodes()[sp.i]; p = n; label = `Apoyo nuevo A${sp.i + 1}`; }
  else { p = layerPts(sp.layer)[sp.li]?.[sp.i]; label = sp.layer === 'exApoyos' ? `Apoyo existente E${sp.i + 1}` : sp.layer === 'ruta' ? `Vértice ${sp.i + 1} de la ruta` : `Vértice ${sp.i + 1} de ${exLineas()[sp.li]?.nombre || 'la línea'}`; }
  if (!p) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<b>${label}</b>${isEntronqueA1(sp.layer === 'nuevo' ? sp.i : -1) ? ' · es el apoyo de entronque: edítalo como apoyo existente' : ''}
    <div class="fields" style="margin-top:6px"><label class="f">${S.proj.zone ? `X UTM (huso ${S.proj.zone})` : 'X local (m)'}<input id="pe_x" class="num" type="number" step="0.01" value="${p.x.toFixed(2)}" ${isEntronqueA1(sp.layer === 'nuevo' ? sp.i : -1) ? 'disabled' : ''}></label>
    <label class="f">${S.proj.zone ? 'Y UTM' : 'Y local (m)'}<input id="pe_y" class="num" type="number" step="0.01" value="${p.y.toFixed(2)}" ${isEntronqueA1(sp.layer === 'nuevo' ? sp.i : -1) ? 'disabled' : ''}></label>
    ${sp.layer === 'nuevo' || sp.layer === 'exApoyos' ? `<label class="f full">Nombre<input id="pe_n" type="text" value="${esc(p.nombre || '')}"></label>` : ''}</div>
    ${p.lat != null ? `<p class="note mono" style="margin:6px 0 0">${p.lat.toFixed(7)}, ${p.lon.toFixed(7)}</p>` : ''}`;
}

/* ===== Lectura de archivos: KML, KMZ, GPX y texto de GPS Visualizer ===== */
async function parseGeoFile(file) {
  const name = file.name.toLowerCase();
  if (/\.(txt|csv|tsv)$/.test(name)) { const o = parseGpsvText(await file.text(), file.name); return { lines: [o], points: [] }; }
  let text;
  if (/\.kmz$/.test(name)) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const kmls = Object.values(zip.files).filter(f => /\.kml$/i.test(f.name));
    if (!kmls.length) throw new Error('El KMZ no contiene ningún archivo .kml');
    const docKml = kmls.find(f => /(^|\/)doc\.kml$/i.test(f.name)) || kmls[0];
    text = await docKml.async('string');
  } else text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('El archivo no tiene un formato KML o GPX válido');
  const tag = (el, n) => [...el.getElementsByTagNameNS('*', n)];
  const nameOf = el => { const pm = el.closest('Placemark') || el.closest('trk') || el.closest('rte') || el; const n = [...pm.children].find(c => c.localName === 'name'); return n ? n.textContent.trim() : ''; };
  const lines = [], points = [];
  if (/\.gpx$/.test(name) || doc.documentElement.localName === 'gpx') {
    const pt = el => ({ lat: Number(el.getAttribute('lat')), lon: Number(el.getAttribute('lon')), alt: tag(el, 'ele')[0] ? Number(tag(el, 'ele')[0].textContent) : null, nombre: [...el.children].find(c => c.localName === 'name')?.textContent || '' });
    tag(doc, 'trk').forEach(t => { const pts = tag(t, 'trkpt').map(pt); if (pts.length >= 2) lines.push({ nombre: nameOf(t) || 'Track', pts }); });
    tag(doc, 'rte').forEach(t => { const pts = tag(t, 'rtept').map(pt); if (pts.length >= 2) lines.push({ nombre: nameOf(t) || 'Ruta', pts }); });
    tag(doc, 'wpt').forEach(w => points.push(pt(w)));
  } else {
    const parseCoords = s => s.trim().split(/\s+/).map(t => t.split(',').map(Number)).filter(a => a.length >= 2 && !isNaN(a[0]) && !isNaN(a[1])).map(([lon, lat, alt]) => ({ lat, lon, alt: isNaN(alt) ? null : alt }));
    tag(doc, 'LineString').forEach(ls => { const pts = parseCoords(tag(ls, 'coordinates')[0]?.textContent || ''); if (pts.length >= 2) lines.push({ nombre: nameOf(ls) || `Línea ${lines.length + 1}`, pts }); });
    tag(doc, 'Point').forEach(pe => { const c = parseCoords(tag(pe, 'coordinates')[0]?.textContent || '')[0]; if (c) points.push({ ...c, nombre: nameOf(pe) }); });
  }
  lines.forEach(l => l.conCota = hasAlt(l.pts));
  return { lines, points };
}
/* Compatibilidad: opciones de ruta para el perfil */
async function readRouteOptions(file) {
  const { lines, points } = await parseGeoFile(file);
  const opts = lines.map(l => ({ ...l, label: `${l.nombre} · ${l.pts.length} puntos${l.conCota ? ' · con cotas' : ''}` }));
  if (!opts.length && points.length >= 2) opts.push({ nombre: 'Puntos', pts: points, sinDividir: true, conCota: hasAlt(points), label: `Puntos (${points.length})` });
  if (!opts.length) throw new Error('No se ha encontrado ninguna línea ni puntos en el archivo');
  return opts;
}
async function importFile(file, destino) {
  try {
    if (destino === 'perfil') {
      const opts = await readRouteOptions(file); const withAlt = opts.filter(o => o.conCota);
      return applyPerfil(withAlt[0] || opts[0], file.name);
    }
    const { lines, points } = await parseGeoFile(file);
    if (destino === 'exLineas') return applyExLineas(lines, file.name);
    if (destino === 'exApoyos') return applyExApoyos(points, file.name);
    // Trazado nuevo: ruta + marcadores de apoyos en el mismo archivo
    if (!lines.length && points.length < 2) throw new Error('No se ha encontrado la ruta ni los marcadores de los apoyos');
    const go = l => applyTrace(l || { nombre: 'Apoyos', pts: points, sinDividir: true, conCota: hasAlt(points) }, file.name, l && points.length ? points : null);
    if (lines.length <= 1) return go(lines[0]);
    const box = $('#kmlPick'); box.hidden = false;
    box.innerHTML = `<div class="banner info">El archivo tiene varias líneas. Elige la ruta del trazado nuevo${points.length ? ` (se usarán sus ${points.length} marcadores como apoyos)` : ''}:</div><div class="row" style="margin-top:6px">${lines.map((l, k) => `<button class="btn small" data-k="${k}">${esc(l.nombre)} · ${l.pts.length} puntos</button>`).join('')}</div>`;
    box.onclick = ev => { const b = ev.target.closest('button[data-k]'); if (!b) return; box.hidden = true; go(lines[Number(b.dataset.k)]); };
  } catch (e) { toast('No se pudo importar: ' + e.message); }
}
function setZoneFrom(p) { if (!S.proj.zone) S.proj.zone = E.utmFromLatLon(p.lat, p.lon).zone; return S.proj.zone; }
/* opt: ruta (línea); marcadores: puntos de los apoyos (opcional) */
function applyTrace(opt, fname, marcadores) {
  const ctx = S.proj.ctx; const zone = setZoneFrom(opt.pts[0]);
  const U = p => ({ ...p, ...E.utmFromLatLon(p.lat, p.lon, zone) });
  const ruta = opt.pts.map(U);
  let pts, aviso = '';
  if (marcadores && marcadores.length >= 2) {
    const prof = E.buildProfile(ruta.map(p => ({ x: p.x, y: p.y, z: p.alt ?? 0 })));
    const mk = marcadores.map(U).map(p => { const pr = projectOnRuta(ruta, p); return { ...p, ch: pr.ch, dRuta: pr.d, alt: p.alt != null && p.alt !== 0 ? p.alt : (opt.conCota ? pr.z : null), vertice: true }; });
    mk.sort((a, b) => a.ch - b.ch);
    const lejos = mk.filter(p => p.dRuta > 10);
    if (lejos.length) aviso = ` Atención: ${lejos.length} marcador(es) a más de 10 m de la ruta (${lejos.slice(0, 4).map(p => p.nombre || '?').join(', ')}).`;
    pts = mk.map(({ ch, dRuta, ...p }) => p);
  } else {
    pts = ruta.map(p => ({ ...p, vertice: true }));
    if (ctx.dividir && !opt.sinDividir && ctx.vanoMax > 0) {
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y), k = Math.ceil(d / ctx.vanoMax - 1e-9);
        for (let j = 1; j < k; j++) { const x = a.x + (b.x - a.x) * j / k, y = a.y + (b.y - a.y) * j / k, ll = E.latLonFromUtm(x, y, zone); out.push({ x, y, lat: ll.lat, lon: ll.lon, alt: a.alt != null && b.alt != null ? a.alt + (b.alt - a.alt) * j / k : null, vertice: false }); }
        out.push(b);
      }
      pts = out;
    }
  }
  const alts = ruta.map(p => p.alt).filter(v => v != null && v !== 0);
  const altMax = alts.length ? Math.max(...alts) : null;
  S.proj.geo = { zone, pts, fuente: fname, altMax, ruta: marcadores ? ruta.map(({ x, y, lat, lon, alt }) => ({ x, y, lat, lon, alt })) : null, conMarcadores: !!marcadores };
  if (opt.conCota) S.proj.perfil = { fuente: fname, pts: ruta.map(p => ({ x: p.x, y: p.y, z: p.alt })) };
  else if (marcadores && hasAlt(pts)) S.proj.perfil = { fuente: fname + ' (cotas de los marcadores)', pts: pts.map(p => ({ x: p.x, y: p.y, z: p.alt })) };
  else if (S.proj.perfil && /edición|\.km|\.gpx|\.txt/.test(S.proj.perfil.fuente || '') && S.proj.perfil.fuente.startsWith(fname) === false) { /* se mantiene un perfil cargado aparte */ }
  S.proj.modo = 'kml';
  S.proj.rows = pts.map(() => newRow());
  if (!S.proj.nombre || /^Ejemplo/.test(S.proj.nombre)) { S.proj.nombre = fname.replace(/\.(kml|kmz|gpx|txt)$/i, ''); $('#p_nombre').value = S.proj.nombre; }
  if (altMax != null) { const z = altMax > 1000 ? 'C' : altMax > 500 ? 'B' : 'A'; if (z !== ctx.zona) { ctx.zona = z; $('#p_zona').value = z; } }
  if (S.proj.entronque?.k != null) snapToEntronque(true);
  S.hist = []; S.sel = null; S.selPt = null; S.openEx = null; V.fitted = false; refreshAll();
  toast(marcadores ? `Trazado importado: ${pts.length} apoyos de los marcadores, ordenados a lo largo de la ruta.${aviso}` : `Trazado importado: ${pts.length} apoyos.`);
}
function projectOnRuta(ruta, q) {
  let ch = 0, best = { d: Infinity, ch: 0, z: null };
  for (let i = 0; i < ruta.length - 1; i++) {
    const A = ruta[i], B = ruta[i + 1], L = Math.hypot(B.x - A.x, B.y - A.y), s = segDist(q, A, B);
    if (s.d < best.d) best = { d: s.d, ch: ch + s.t * L, z: A.alt != null && B.alt != null ? A.alt + (B.alt - A.alt) * s.t : null };
    ch += L;
  }
  return best;
}
function geoInfoHtml() {
  const g = S.proj.geo; if (S.proj.modo !== 'kml' || !g) return '';
  if (g.conMarcadores) return `Trazado nuevo de <b>${esc(g.fuente)}</b>: ruta y ${g.pts.length} apoyos de sus marcadores. ETRS89 UTM huso ${g.zone}. <button class="btn small" id="toManual">Pasar a entrada manual</button>`;
  const vert = g.pts.filter(p => p.vertice !== false).length;
  return `Trazado nuevo de <b>${esc(g.fuente)}</b>: ${g.pts.length} apoyos${g.pts.length > vert ? ` (${g.pts.length - vert} intercalados, vano máx. ${fmt(S.proj.ctx.vanoMax)} m)` : ''}.${g.zone ? ` ETRS89 UTM huso ${g.zone}.` : ''} <button class="btn small" id="toManual">Pasar a entrada manual</button>`;
}

/* ===== Importación de la red existente ===== */
function applyExLineas(lines, fname) {
  if (!lines.length) return toast('El archivo no contiene líneas (LineString).');
  const zone = setZoneFrom(lines[0].pts[0]);
  const R = redEx() || (S.proj.redEx = { lineas: [], apoyos: [] });
  snapshot();
  R.lineas = R.lineas.filter(l => l.fuente !== fname).concat(lines.map(l => ({ nombre: l.nombre, fuente: fname, pts: l.pts.map(p => ({ lat: p.lat, lon: p.lon, ...E.utmFromLatLon(p.lat, p.lon, zone) })) })));
  invalidateVert(); ensureEntronque(); V.fitted = false; refreshAll();
  toast(`${lines.length} línea(s) existente(s) importada(s) de ${fname}.`);
}
function applyExApoyos(points, fname) {
  if (!points.length) return toast('El archivo no contiene marcadores de apoyos (Point).');
  const zone = setZoneFrom(points[0]);
  const R = redEx() || (S.proj.redEx = { lineas: [], apoyos: [] });
  snapshot();
  const prevEn = S.proj.entronque?.k != null ? exNodes()[S.proj.entronque.k] : null;
  R.apoyos = (R.apoyos || []).filter(a => a.fuente !== fname).concat(points.map(p => ({ lat: p.lat, lon: p.lon, nombre: p.nombre || '', fuente: fname, ...E.utmFromLatLon(p.lat, p.lon, zone) })));
  invalidateVert(); ensureEntronque();
  if (prevEn) { const k = exNodes().findIndex(a => Math.hypot(a.x - prevEn.x, a.y - prevEn.y) < 1); S.proj.entronque.k = k >= 0 ? k : null; }
  V.fitted = false; refreshAll();
  toast(`${points.length} apoyo(s) existente(s) importado(s) de ${fname}.`);
}
function ensureEntronque() {
  if (!S.proj.entronque) S.proj.entronque = { k: null, cableId: (S.cables.find(c => /3x95/.test(c.designacion)) || S.cables[0] || {}).id || '', tense: 500, depth: S.proj.ctx.depthAmarre };
}
function setEntronque(k) {
  const en = S.proj.entronque; if (!en) return;
  snapshot();
  en.k = Number.isInteger(k) && k >= 0 ? k : null;
  if (en.k != null) {
    S.proj.rows[0].existente.activo = true;
    if (S.proj.modo === 'kml') snapToEntronque(false);
    else if (S.proj.rows.length < 2) S.proj.rows.push(newRow());
  }
  refreshAll();
}
function snapToEntronque(silent) {
  const g = S.proj.geo, en = S.proj.entronque, ex = exNodes(); if (!g || !en || en.k == null || !ex[en.k]) return;
  const E0 = ex[en.k], d = p => Math.hypot(p.x - E0.x, p.y - E0.y);
  if (d(g.pts[g.pts.length - 1]) < d(g.pts[0]) && d(g.pts[g.pts.length - 1]) < 5) { g.pts.reverse(); S.proj.rows.reverse(); }
  const p0 = { x: E0.x, y: E0.y, lat: E0.lat, lon: E0.lon, alt: null, vertice: true, nombre: E0.nombre };
  const first = g.pts[0];
  if (d(first) < 5) { g.pts[0] = p0; if (!silent) toast(`A1 ajustado al apoyo existente E${en.k + 1}.`); }
  else { g.pts.unshift(p0); S.proj.rows.unshift(newRow()); if (!silent) toast(`Añadido el apoyo existente E${en.k + 1} como A1 (estaba a ${fmt(d(first), 1)} m del inicio del trazado).`); }
  S.proj.rows[0].existente.activo = true;
}
function renderEntronque() {
  const box = $('#exBody'), R = redEx(), en = S.proj.entronque;
  if (!R || (!R.lineas.length && !R.apoyos?.length)) { box.innerHTML = '<p class="note">Importa por separado las líneas existentes y los apoyos existentes (KMZ/KML; puedes importar varios archivos). Luego eliges el apoyo de entronque: la app añade al cálculo de A1 los conductores existentes que salen de él, con su dirección y vano reales.</p>'; return; }
  ensureEntronque();
  const r0 = S.proj.rows[0], ex = exNodes();
  const fuentes = (arr, tipo) => [...new Set(arr.map(x => x.fuente))].map(f => `<span class="chip info">${esc(f)} · ${arr.filter(x => x.fuente === f).length} ${tipo}</span> <button class="btn small ghost" data-delsrc="${esc(f)}" data-tipo="${tipo}" aria-label="Quitar ${esc(f)}">✕</button>`).join(' ');
  const cabOpts = S.cables.map(c => `<option value="${esc(c.id)}" ${en.cableId === c.id ? 'selected' : ''}>${esc(c.designacion)}</option>`).join('');
  const conds = entronqueConductores();
  box.innerHTML = `<div class="row" style="gap:6px">${fuentes(R.lineas, 'líneas')} ${fuentes(R.apoyos || [], 'apoyos')}</div>
    ${!R.apoyos?.length ? '<p class="note" style="margin-top:6px">Sin archivo de apoyos existentes: se toman como apoyos los vértices de las líneas.</p>' : ''}
    <div class="fields" style="margin-top:10px">
      <label class="f">Apoyo de entronque<select id="en_k"><option value="">Sin elegir</option>${ex.length <= 800 ? ex.map((p, i) => `<option value="${i}" ${en.k === i ? 'selected' : ''}>E${i + 1}${p.nombre ? ' · ' + esc(p.nombre) : ''}</option>`).join('') : (en.k != null ? `<option value="${en.k}" selected>E${en.k + 1}</option>` : '')}</select></label>
      <div class="f" style="justify-content:flex-end"><button class="btn small" id="en_pick">${S.pickEntronque ? 'Pulsa un apoyo E en el plano…' : 'Elegir en el plano'}</button></div>
      <label class="f">Modelo del poste existente<select id="en_modelo"><option value="">Sin datos</option>${S.poles.map(p => `<option value="${esc(p.id)}" ${r0.existente.modeloId === p.id ? 'selected' : ''}>${poleLabel(p)}</option>`).join('')}</select></label>
      <label class="f">Acimut del eje principal (°)<input id="en_az" class="num" type="number" value="${esc(r0.existente.azPrincipal)}" placeholder="Desconocido"></label>
      <label class="f">Cable de la línea existente<select id="en_cable">${cabOpts}</select></label>
      <label class="f">Tense de la línea existente (daN)<input id="en_tense" class="num" type="number" step="10" value="${en.tense}"></label>
      <label class="f">Amarre existente bajo cogolla (m)<input id="en_depth" class="num" type="number" step="0.05" value="${en.depth}"></label>
    </div>
    ${en.k != null ? `<p class="note" style="margin-top:8px">A1 = E${en.k + 1}${ex[en.k]?.nombre ? ' (' + esc(ex[en.k].nombre) + ')' : ''}. Conductores existentes en el cálculo: ${conds.map(c => `${esc(c.hacia)}, vano ${fmt(c.vano, 1)} m`).join(' · ') || '<b>ninguno: el apoyo no está sobre ninguna línea existente (tolerancia 3 m)</b>'}.${S.proj.modo === 'manual' ? ' El trazado manual parte de E' + (en.k + 1) + ' con el rumbo inicial indicado.' : ''}</p>` : ''}
    <div class="row" style="margin-top:8px"><button class="btn small ghost" id="en_del">Quitar toda la red existente</button></div>`;
}
function bindEntronque() {
  $('#exLinFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f, 'exLineas'); e.target.value = ''; });
  $('#exApoFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f, 'exApoyos'); e.target.value = ''; });
  const box = $('#exBody');
  box.addEventListener('change', ev => {
    const t = ev.target, en = S.proj.entronque, r0 = S.proj.rows[0]; if (!en) return;
    if (t.id === 'en_k') return setEntronque(t.value === '' ? null : Number(t.value));
    if (t.id === 'en_modelo') r0.existente.modeloId = t.value;
    if (t.id === 'en_az') r0.existente.azPrincipal = t.value;
    if (t.id === 'en_cable') en.cableId = t.value;
    if (t.id === 'en_tense') en.tense = Number(t.value);
    if (t.id === 'en_depth') en.depth = Number(t.value);
    refreshAll();
  });
  box.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'en_pick') { S.pickEntronque = !S.pickEntronque; S.tool = 'pan'; renderEdBar(); renderEntronque(); if (S.pickEntronque) toast('Pulsa en el plano el apoyo existente (círculo E) del que parte la línea nueva.'); }
    if (b.id === 'en_del') { snapshot(); S.proj.redEx = null; S.proj.entronque = null; if (!S.proj.geo) S.proj.zone = null; S.pickEntronque = false; V.fitted = false; refreshAll(); }
    if (b.dataset.delsrc) {
      snapshot(); const R = redEx(), f = b.dataset.delsrc;
      if (b.dataset.tipo === 'líneas') R.lineas = R.lineas.filter(l => l.fuente !== f); else { R.apoyos = R.apoyos.filter(a => a.fuente !== f); if (S.proj.entronque) S.proj.entronque.k = null; }
      invalidateVert(); refreshAll();
    }
  });
}
function refreshAll() {
  $('#geoInfo').hidden = !(S.proj.modo === 'kml' && S.proj.geo); $('#geoInfo').innerHTML = geoInfoHtml();
  const tm = $('#toManual'); if (tm) tm.onclick = toManual;
  renderRows(); renderEntronque(); recalc(); renderFondos(); renderPerfilInfo(); renderPtEdit(); updUndo();
}
