/* =====================================================================
   CAPAS DE TRAMOS: aéreos y subterráneos (existentes y nuevos), puntos D-C y zanjas.
   Crear desde el plano y editar o borrar todos los datos (también los importados del KML)
   ===================================================================== */
/* Tramos existentes: el GIS marca la situación (Aérea / Subterránea) */
function exLSubt(l) { return /subterr/i.test(String(attrFind(l?.attrs, k => k === 'situacion') || '')); }
function exLVis(l) { return vis(exLSubt(l) ? 'subEx' : 'exLineas'); }
/* Tramos aéreos nuevos: importados (con su identificador del GIS) o dibujados en el plano */
function tramosAer() {
  const g = S.proj.geo; if (g?.tramos) { S.proj.tramosAer = g.tramos; delete g.tramos; }
  return S.proj.tramosAer || (S.proj.tramosAer = []);
}
function tramosAerVis() {
  const exIds = new Set(exLineas().map(l => tramoId(l)).filter(Boolean));
  const subIds = new Set((S.proj.sub?.lineas || []).map(l => l.idTramo).filter(Boolean));
  return tramosAer().filter(t => t.nuevo || !((t.id && exIds.has(t.id)) || (t.id && subIds.has(t.id)) || exLSubt(t)));
}
function tramoAerNombre(t, i) { return t ? (t.nombre || t.id || 'Tramo aéreo nuevo ' + (i + 1)) : ''; }
function attrSet(o, norm, defKey, v) {
  o.attrs = o.attrs || {}; const k = Object.keys(o.attrs).find(kk => normKey(kk) === norm);
  if (v === '' && k) { delete o.attrs[k]; return; } if (v === '') return;
  o.attrs[k || defKey] = v;
}

/* ---- Dibujo de los tramos aéreos nuevos ---- */
function drawTramosAer({ g, P, screen, col, alongText, longestSeg, vtx, L, tool }) {
  if (!vis('linea')) return;
  tramosAerVis().forEach((t, li) => {
    if (t.pts.length < 2) { if (screen && t.pts[0]) { const [x, y] = P(t.pts[0]); vtx(x, y, true); } return; }
    const sel = screen && S.selPt?.layer === 'aerNuevo' && S.selPt.li === li;
    if (sel) { g.save(); g.strokeStyle = col('--ink'); g.globalAlpha = 0.35; g.lineWidth = 9; g.beginPath(); t.pts.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.restore(); }
    g.strokeStyle = col('--accent'); g.lineWidth = 2.5; g.setLineDash([]); g.beginPath(); t.pts.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    const txt = t.txt || conductorTramo(t); const ls = longestSeg(t.pts);
    if (txt && vis('cable') && ls.i >= 0) alongText(txt, t.pts[ls.i], t.pts[ls.i + 1], 1, '600 11px ' + col('--f-body'), col('--accent'));
    if (screen && tool !== 'pan' && L === 'aerNuevo') t.pts.forEach((n, i) => { const [x, y] = P(n); vtx(x, y, sel && S.selPt.i === i); });
  });
}
function aerSnapTargets(dp) {
  if (!vis('linea')) return [];
  const out = [];
  tramosAerVis().forEach((t, li) => { const n = t.pts.length; [0, n - 1].forEach((i, k) => {
    if (n < 1 || (k && i === 0)) return; if (dp.layer === 'aerNuevo' && dp.li === li && dp.i === i) return;
    if (S.polyDraw?.obj === t && i === n - 1) return;
    out.push({ x: t.pts[i].x, y: t.pts[i].y, label: (k ? 'Fin' : 'Inicio') + ' de tramo ' + tramoAerNombre(t, li) }); }); });
  return out;
}
function selectTramoAer(mx, my) {
  if (!vis('linea')) return false;
  let best = null; tramosAerVis().forEach((t, li) => { const h = hitSegment(t.pts, mx, my, 8); if (h && (!best || h.d < best.d)) best = { ...h, li }; });
  if (!best) return false;
  S.selObj = null; S.selPt = { layer: 'aerNuevo', li: best.li, i: best.t < 0.5 ? best.i : best.i + 1 }; renderPtEdit(); drawMap(); return true;
}

/* ---- Crear tramos aéreos (existentes o nuevos) desde el plano ---- */
function polyInsert(layer, mx, my) {
  if (!S.proj.zone) return toast('Importa primero algún elemento con coordenadas para fijar el huso UTM.');
  let w = worldAt(mx, my); const sn = findSnap({ layer: '__nuevo__' }, mx, my); if (sn) w = { x: sn.x, y: sn.y };
  const d = S.polyDraw;
  if (d && d.layer === layer) {
    const last = d.obj.pts[d.obj.pts.length - 1]; const [lx, ly] = S.mapT.P(last);
    if (Math.hypot(lx - mx, ly - my) < 8) return polyEnd();
    snapshot(); const np = { x: w.x, y: w.y }; setLL(np); d.obj.pts.push(np); invalidateVert(); refreshAll(); return;
  }
  const arrs = layerPts(layer); let hit = null, li = -1;
  arrs.forEach((arr, k) => { if (layer === 'exLineas' && !exLVis(exLineas()[k])) return; const h = hitSegment(arr, mx, my); if (h && (!hit || h.d < hit.d)) { hit = h; li = k; } });
  snapshot(); const np = { x: w.x, y: w.y }; setLL(np);
  if (hit) { arrs[li].splice(hit.i + 1, 0, np); invalidateVert(); refreshAll(); toast('Vértice intercalado en el tramo.'); return; }
  let o;
  if (layer === 'exLineas') { const R = redEx() || (S.proj.redEx = { lineas: [], apoyos: [] }); o = { id: uid('l'), nombre: 'Tramo existente ' + (R.lineas.length + 1), fuente: 'dibujado en el plano', attrs: { 'Situación': 'Aérea' }, pts: [np] }; R.lineas.push(o); }
  else { o = { id: '', nuevo: true, nombre: 'Tramo aéreo nuevo ' + (tramosAerVis().length + 1), attrs: {}, pts: [np] }; tramosAer().push(o); }
  S.polyDraw = { layer, obj: o }; invalidateVert(); refreshAll();
  toast(`Dibujando «${o.nombre}»: pulsa los siguientes puntos. Para terminar pulsa otra vez el último punto o Intro.`);
}
function polyEnd() {
  const d = S.polyDraw; S.polyDraw = null; if (!d) return;
  const arr = d.layer === 'exLineas' ? exLineas() : tramosAer();
  if (d.obj.pts.length < 2) { const i = arr.indexOf(d.obj); if (i >= 0) arr.splice(i, 1); toast('Tramo descartado: necesita al menos dos puntos.'); }
  else {
    const li = d.layer === 'exLineas' ? exLineas().indexOf(d.obj) : tramosAerVis().indexOf(d.obj);
    if (li >= 0) { S.selObj = null; S.selPt = { layer: d.layer, li, i: 0 }; }
    toast(`«${d.obj.nombre}» terminado (${fmt(polyLen(d.obj.pts), 1)} m). Completa sus datos en «Elemento seleccionado».`);
  }
  invalidateVert(); refreshAll();
}
document.addEventListener('keydown', ev => { if (S.polyDraw && (ev.key === 'Enter' || ev.key === 'Escape') && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) { ev.preventDefault(); polyEnd(); } });

/* ---- Panel «Elemento seleccionado»: datos importados editables y borrar ---- */
function dreg(fn) { const id = 'd' + (++dsetN); DSET.set(id, { set: fn }); return id; }
function dattrs(o, titulo = 'Datos importados (KML / GIS)') {
  o.attrs = o.attrs || {}; const ks = Object.keys(o.attrs);
  const rows = ks.map(k => {
    const idk = dreg(v => { v = String(v).trim(); if (!v || v === k || v in o.attrs) return; o.attrs = Object.fromEntries(Object.entries(o.attrs).map(([kk, vv]) => [kk === k ? v : kk, vv])); });
    const idv = dreg(v => { o.attrs[k] = v; });
    const idd = dreg(() => { delete o.attrs[k]; });
    return `<tr><td><input data-d="${idk}" type="text" value="${esc(k)}" aria-label="Nombre del dato"></td><td><input data-d="${idv}" type="text" value="${esc(o.attrs[k])}" aria-label="Valor de ${esc(k)}"></td><td><button class="btn small ghost" type="button" data-fn="${idd}" title="Borrar el dato «${esc(k)}»" aria-label="Borrar el dato ${esc(k)}">✕</button></td></tr>`;
  }).join('');
  const idAdd = dreg(() => { let n = 1, k = 'Nuevo dato'; while (k in o.attrs) k = 'Nuevo dato ' + (++n); o.attrs[k] = ''; });
  const idAll = ks.length ? dreg(() => { o.attrs = {}; }) : null;
  return `<div class="dsec"><h4>${titulo} · ${ks.length}</h4>
    ${ks.length ? `<div class="tablewrap" style="max-height:300px;overflow:auto"><table class="vt attrs"><thead><tr><th>Dato</th><th>Valor</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="note">Sin datos importados.</p>'}
    <div class="row" style="margin-top:6px"><button class="btn small" type="button" data-fn="${idAdd}">+ Añadir dato</button>${idAll ? `<button class="btn small ghost" type="button" data-fn="${idAll}" data-confirm="Pulsa otra vez para borrar todos los datos">Borrar todos los datos</button>` : ''}</div></div>`;
}
function ddel(texto, fn) { const id = dreg(() => { fn(); S.selPt = null; S.selObj = null; }); return `<div class="dsec"><button class="btn small danger" type="button" data-fn="${id}" data-confirm="Pulsa otra vez para borrar">${texto}</button> <span class="note">Se puede deshacer con Ctrl+Z.</span></div>`; }

/* Tramo existente (aéreo o subterráneo) importado de la red */
detLineaEx = function (li) {
  const l = exLineas()[li]; if (!l) return ''; const d = lineData(l.id);
  let h = dsec('Datos del tramo',
    dfield('Nombre', l.nombre || '', v => { l.nombre = v; }) +
    dfield('Situación', exLSubt(l) ? 'Subterránea' : 'Aérea', v => attrSet(l, 'situacion', 'Situación', v), { options: [['Aérea', 'Aérea'], ['Subterránea', 'Subterránea']], hint: 'Decide en qué capa se ve' }) +
    dfield('Identificador', attrFind(l.attrs, k => k === 'identificador') || '', v => attrSet(l, 'identificador', 'Identificador', v), { w2: true }) +
    dfield('Conductor', conductorTramo(l), v => { if (l.conductor != null) l.conductor = v; else attrSet(l, 'conductor', 'Conductor', v); }, { w2: true }) +
    dfield('Texto en el plano', l.txt || '', v => { l.txt = v; }, { txt: true, full: true, ph: mapLineLabel({ ...l, txt: '' }) || 'conductor', hint: 'Vacío: el conductor' }));
  h += dsec('Cable verificado', dfield('Cable trenzado instalado', d.v.cableId || '', val => { d.v.cableId = val; }, { options: [['', 'Sin verificar'], ...S.cables.map(x => [x.id, x.designacion])], full: true }) +
    dfield('Verificado', !!d.v.ok, val => { d.v.ok = val; }, { type: 'checkbox' }));
  h += dinfo([['Longitud', fmt(polyLen(l.pts), 1) + ' m'], ['Vértices', l.pts.length], l.fuente && ['Origen', esc(l.fuente)]]);
  return h + dattrs(l) + ddel('Borrar este tramo', () => { const R = exLineas(), id = tramoId(l); R.splice(R.indexOf(l), 1); if (id) { const A = tramosAer(); for (let i = A.length - 1; i >= 0; i--) if (!A[i].nuevo && A[i].id === id) A.splice(i, 1); } invalidateVert(); });
};
/* Tramo aéreo nuevo */
function detTramoAer(t) {
  let h = dsec('Datos del tramo',
    dfield('Nombre', t.nombre || '', v => { t.nombre = v; }) +
    dfield('Identificador (GIS)', t.id || '', v => { t.id = String(v).trim(); t.nuevo = true; }, { w2: true, hint: 'Es la identificación del ANEXO I' }) +
    dfield('Conductor', conductorTramo(t), v => { if (t.conductor != null) t.conductor = v; else attrSet(t, 'conductor', 'Conductor', v); }, { w2: true }) +
    dfield('Texto en el plano', t.txt || '', v => { t.txt = v; }, { txt: true, full: true, ph: conductorTramo(t) || 'sin texto', hint: 'Vacío: el conductor' }));
  h += dinfo([['Longitud', fmt(polyLen(t.pts), 1) + ' m'], ['Vértices', t.pts.length], ['En el ANEXO I', anexoFilas().some(r => r.id && r.id === t.id) ? 'Sí' : 'No (sin identificador o no sigue la línea nueva)']]);
  return h + dattrs(t) + ddel('Borrar este tramo', () => { const A = tramosAer(); A.splice(A.indexOf(t), 1); });
}
/* Punto D-C */
function detDC(i) {
  const d = exDC()[i]; if (!d) return '';
  return dattrs(d) + ddel('Borrar este punto D-C', () => { const A = exDC(); A.splice(A.indexOf(d), 1); });
}
/* Apoyo existente: además de la verificación, sus datos importados y borrar */
{ const _ae = detApoyoEx; detApoyoEx = function (k) {
  const a = redEx()?.apoyos?.[k]; let h = _ae(k); if (!a) return h;
  return h + dattrs(a) + ddel('Borrar este apoyo existente', () => { const en = S.proj.entronque, A = redEx().apoyos, i = A.indexOf(a); if (en?.k === i) en.k = null; else if (en?.k > i) en.k--; A.splice(i, 1); invalidateVert(); });
}; }
/* Línea subterránea o zanja: identificador, datos importados y borrar */
{ const _ds = detSub; detSub = function (o) {
  const s = SUB(), isL = s.lineas.includes(o);
  let h = _ds(o);
  if (isL) h += dsec('Identificación', dfield('Identificador del tramo (GIS)', o.idTramo || '', v => { o.idTramo = String(v).trim(); }, { full: true, hint: 'Es la identificación del ANEXO I' }));
  return h + dattrs(o) + ddel(isL ? 'Borrar esta línea subterránea' : 'Borrar esta zanja', () => { const arr = isL ? s.lineas : s.zanjas; arr.splice(arr.indexOf(o), 1); if (!isL) s.lineas.forEach(l => { if (l.zanjaId === o.id) l.zanjaId = ''; }); });
}; }
/* Paneles que faltaban en «Elemento seleccionado» */
{ const _rd = renderDetail; renderDetail = function () {
  const box = $('#detailBody'); if (!box) return;
  if (box.contains(document.activeElement) && document.activeElement.matches('input[type=text],input[type=number]')) return;
  _rd(); const sp = S.selPt; let html = null, info = null;
  if (sp?.layer === 'exDC') { html = detDC(sp.i); info = 'Punto D-C'; }
  else if (sp?.layer === 'aerNuevo') { const t = tramosAerVis()[sp.li]; if (t) { html = detTramoAer(t); info = 'Tramo aéreo nuevo · ' + tramoAerNombre(t, sp.li); } }
  else if (sp?.layer === 'exLineas') { const l = exLineas()[sp.li]; if (l) info = (exLSubt(l) ? 'Tramo subterráneo existente' : 'Tramo aéreo existente') + (l.nombre ? ' · ' + l.nombre : ''); }
  if (html != null) { box.innerHTML = html; const pe = $('#ptEdit'); if (pe) pe.style.display = ''; }
  if (info) $('#detailInfo').textContent = info;
}; }
/* Botones de acción del panel (borrar dato, añadir dato, borrar elemento), con confirmación en dos pulsaciones */
document.addEventListener('click', ev => {
  const b = ev.target.closest('#detailBody button[data-fn]'); if (!b) return;
  const d = DSET.get(b.dataset.fn); if (!d) return;
  if (b.dataset.confirm && !b.dataset.armed) { b.dataset.armed = '1'; b.dataset.txt0 = b.textContent; b.textContent = b.dataset.confirm; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = b.dataset.txt0; } }, 4000); return; }
  snapshot(); d.set(); invalidateVert(); refreshAll(); renderDetail();
});
