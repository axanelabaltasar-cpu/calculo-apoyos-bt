/* =====================================================================
   PANEL DE DETALLE: datos editables del elemento seleccionado en el plano
   ===================================================================== */
S.selObj = null;
const DSET = new Map(); let dsetN = 0;
/* Campo enlazado: devuelve el HTML y registra la función que guarda el valor */
function dfield(label, value, set, opt = {}) {
  const id = 'd' + (++dsetN); DSET.set(id, { set, num: opt.type === 'number', chk: opt.type === 'checkbox' });
  const cls = 'f' + (opt.full ? ' full' : opt.w2 ? ' w2' : '');
  const txt = opt.txt ? ' data-txt="1"' : '';
  if (opt.type === 'checkbox') return `<label class="chk ${opt.full ? 'full' : ''}"><input type="checkbox" data-d="${id}" ${value ? 'checked' : ''}> ${label}</label>`;
  if (opt.options) return `<label class="${cls}">${label}<select data-d="${id}">${opt.options.map(([v, t]) => `<option value="${esc(v)}" ${String(value ?? '') === String(v) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>${opt.hint ? `<span class="hint">${opt.hint}</span>` : ''}</label>`;
  return `<label class="${cls}">${label}<input data-d="${id}"${txt} type="${opt.type || 'text'}" ${opt.type === 'number' ? 'class="num" step="any"' : ''} value="${esc(value ?? '')}" placeholder="${esc(opt.ph ?? '')}">${opt.hint ? `<span class="hint">${opt.hint}</span>` : ''}</label>`;
}
const dsec = (t, body) => `<div class="dsec"><h4>${t}</h4><div class="fields hfields">${body}</div></div>`;
const dinfo = (pairs) => `<div class="dsec"><h4>Resultado del cálculo</h4><table class="kv">${pairs.filter(Boolean).map(([k, v]) => `<tr><td class="note">${esc(k)}</td><td>${v}</td></tr>`).join('')}</table></div>`;

function renderDetail() {
  const box = $('#detailBody'); if (!box) return;
  if (box.contains(document.activeElement) && document.activeElement.matches('input[type=text],input[type=number]')) return;
  DSET.clear(); dsetN = 0;
  const sp = S.selPt, so = sp ? null : S.selObj; let html = '', info = '';
  if (sp?.layer === 'nuevo') { const r = detApoyoNuevo(sp.i); html = r.html; info = r.info; }
  else if (sp?.layer === 'exApoyos') { html = detApoyoEx(sp.i); info = 'Apoyo existente'; }
  else if (sp?.layer === 'exLineas') { html = detLineaEx(sp.li); info = 'Tramo baja existente'; }
  else if (sp?.layer === 'exDC') { html = ''; info = 'Punto D-C'; }
  else if (sp && isSubLayer(sp.layer)) { const o = subObjs(sp.layer)[sp.li]; html = o ? detSub(o) : ''; info = o ? (SUB_LAYERS[sp.layer][0] === 'lineas' ? 'Línea subterránea' : 'Zanja') : ''; }
  else if (sp?.layer === 'ruta') { info = 'Vértice de la ruta'; }
  else if (so?.kind === 'sub') { html = detSub(so.o); info = so.o.pts && SUB().lineas.includes(so.o) ? 'Línea subterránea' : 'Zanja'; }
  else if (so?.kind === 'span') { const r = detVano(so.i); html = r; info = `Vano ${apName(so.i)}–${apName(so.i + 1)}`; }
  else if (so?.kind === 'cgp') { html = detCgp(); info = 'CGP del cliente'; }
  $('#detailInfo').textContent = info;
  const empty = !sp && !so;
  box.innerHTML = empty ? '<p class="note">Pulsa en el plano un apoyo, un vano, un tramo, una línea subterránea, una zanja, un punto D-C o la CGP para ver y editar todos sus datos y sus textos. Con «Editar texto» vas directamente al texto del elemento.</p>' : html;
  const pe = $('#ptEdit'); if (pe) pe.style.display = empty ? 'none' : '';
}
function bindDetail() {
  const box = $('#detailBody'); if (!box) return;
  box.addEventListener('change', ev => {
    const t = ev.target, d = DSET.get(t.dataset.d); if (!d) return;
    const v = d.chk ? t.checked : d.num ? (t.value === '' ? '' : Number(t.value)) : t.value;
    snapshot(); d.set(v); invalidateVert(); refreshAll(); renderSub(); renderSum(); renderDetail();
  });
  box.addEventListener('focusout', () => setTimeout(() => { if (!box.contains(document.activeElement)) renderDetail(); }, 60));
  box.addEventListener('click', ev => {
    const b = ev.target.closest('button[data-act]'); if (!b) return;
    if (b.dataset.act === 'entronque') { setEntronque(Number(b.dataset.k)); renderDetail(); }
    const zo = S.selObj?.kind === 'sub' ? S.selObj.o : (S.selPt && isSubLayer(S.selPt.layer) ? subObjs(S.selPt.layer)[S.selPt.li] : null);
    if (zo && b.dataset.act === 'tuboAdd') { snapshot(); const used = new Set(tubosZ(zo).map(g => g.tuboId)); const nt = tubosSub().find(t => !used.has(t.id)) || tubosSub()[0]; zo.tubos.push({ tuboId: nt?.id || '', n: 1 }); tubosZ(zo); refreshAll(); renderSub(); renderDetail(); }
    if (zo && b.dataset.act === 'tuboDel' && zo.tubos.length > 1) { snapshot(); zo.tubos.pop(); tubosZ(zo); refreshAll(); renderSub(); renderDetail(); }
  });
}
/* ---- Apoyo nuevo ---- */
function detApoyoNuevo(i) {
  const r = S.proj.rows[i]; if (!r) return { html: '', info: '' };
  const c = S.calc, res = c?.results?.[i], heights = [...new Set(S.poles.map(p => p.altura))].sort((a, b) => a - b), geo = S.proj.modo === 'kml';
  const sel = res ? (res.existenteCheck?.ok ? res.existenteCheck : res.elegido) : null, p = sel?.pole, rr = sel?.r, st = res ? statusOf(res, i) : null;
  const nodes = c?.nodes || currentNodes(), sp = c?.spans?.[i - 1];
  let h = dsec('Textos en el plano',
    dfield('Nombre del apoyo', r.txt || '', v => { r.txt = v; }, { ph: i === 0 && S.proj.entronque?.k != null ? exLabel(S.proj.entronque.k) : 'A' + (i + 1), txt: true, hint: 'Vacío: nombre automático' }) +
    dfield('Texto del modelo', r.txtModelo || '', v => { r.txtModelo = v; }, { ph: p ? poleLabel(p) : '', hint: 'Vacío: el apoyo elegido' }) +
    (i > 0 ? dfield('Texto del vano anterior', r.txtVano || '', v => { r.txtVano = v; }, { ph: sp ? fmt(sp.a, 1) + ' m' : '', hint: 'Vacío: la longitud' }) : ''));
  h += dsec('Datos de cálculo',
    dfield('Función', r.funcion, v => { r.funcion = v; }, { options: Object.entries(FUNCS) }) +
    dfield('Altura', r.alturaFija, v => { r.alturaFija = v; }, { options: [['', 'Automática'], ...heights.map(x => [x, x + ' m'])] }) +
    dfield('Modelo', r.modeloFijo, v => { r.modeloFijo = v; }, { options: [['', 'Automático'], ...S.poles.map(q => [q.id, poleLabel(q)])], w2: true }) +
    (i > 0 ? dfield('Cruce de carretera o ferrocarril en el vano anterior', r.cruce, v => { r.cruce = v; }, { type: 'checkbox', full: true }) : '') +
    (i > 0 && geo ? dfield('Vano manual (m)', r.vanoManual ?? '', v => { r.vanoManual = v; }, { type: 'number', ph: sp ? fmt(sp.aCalc ?? sp.a, 1) : '', hint: 'Vacío: el medido en el plano' }) : '') +
    (i > 0 && !geo ? dfield('Vano (m)', r.vano, v => { r.vano = v; }, { type: 'number' }) + dfield('Ángulo (°)', r.angulo, v => { r.angulo = v; }, { type: 'number' }) : ''));
  h += dinfo([['Estado', st ? `<span class="chip ${st.cls}">${esc(st.txt)}</span>` : '—'], ['Función calculada', res ? esc(FUNCS[res.func] || res.func) : '—'],
    ['Apoyo elegido', p ? esc(poleLabel(p)) : '—'], rr && ['Esfuerzo principal / secundario', `${fmt(rr.Fp)} / ${fmt(rr.Fs)} daN`], rr && ['Utilización', fmt(rr.u * 100, 1) + ' %'],
    res?.desvio != null && ['Desvío', fmt(res.desvio, 1) + '°'], sp && ['Vano anterior', fmt(sp.a, 2) + ' m' + (sp.manual ? ` (manual; medido ${fmt(sp.aCalc, 2)} m)` : '')], res?.z != null && ['Cota', fmt(res.z, 2) + ' m']]);
  if (isEntronqueA1(i)) h += '<p class="note">Es el apoyo de entronque: sus datos de apoyo existente se verifican en «Red existente y entronque».</p>';
  return { html: h, info: 'Apoyo nuevo ' + apName(i) };
}
/* ---- Vano de la línea nueva ---- */
function detVano(i) {
  const c = S.calc, sp = c?.spans?.[i], r = S.proj.rows[i + 1]; if (!r) return '';
  const cable = c?.cable || S.cables.find(x => x.id === S.proj.cableId);
  let h = dsec('Textos en el plano',
    dfield('Texto del vano', r.txtVano || '', v => { r.txtVano = v; }, { ph: sp ? fmt(sp.a, 1) + ' m' : '', txt: true, hint: 'Vacío: la longitud' }) +
    dfield('Texto del cable de la línea', S.proj.txtCable || '', v => { S.proj.txtCable = v; }, { ph: cable ? shortCable(cable.designacion) : '', w2: true, hint: 'Se rotula en el vano más largo' }));
  h += dsec('Datos del vano',
    (S.proj.modo === 'kml' ? dfield('Vano manual (m)', r.vanoManual ?? '', v => { r.vanoManual = v; }, { type: 'number', ph: sp ? fmt(sp.aCalc ?? sp.a, 1) : '', hint: 'Vacío: el medido' }) : dfield('Vano (m)', r.vano, v => { r.vano = v; }, { type: 'number' })) +
    dfield('Cruce de carretera o ferrocarril', r.cruce, v => { r.cruce = v; }, { type: 'checkbox', full: true }) +
    dfield('Cable trenzado de la línea', S.proj.cableId, v => { S.proj.cableId = v; const s = $('#p_cable'); if (s) s.value = v; const sp2 = sumPar(); if (sp2.auto) sp2.auto = false; }, { options: S.cables.map(x => [x.id, x.designacion]), full: true, hint: sumPar().auto && Number(sumPar().pSol) > 0 ? 'Ahora lo elige la aplicación; si lo cambias, la elección automática se desactiva' : '' }));
  h += dinfo([['Longitud', sp ? fmt(sp.a, 2) + ' m' + (sp.manual ? ` (manual; medido ${fmt(sp.aCalc, 2)} m)` : '') : '—'], cable && ['Cable', esc(cable.designacion)]]);
  return h;
}
/* ---- Apoyo existente ---- */
function detApoyoEx(k) {
  const v = apoyoVerif(k), en = S.proj.entronque, isEn = en?.k === k;
  let h = dsec('Verificación',
    dfield('Modelo instalado', v.modeloId || '', val => { v.modeloId = val; if (isEn && S.proj.rows[0]) S.proj.rows[0].existente.modeloId = val; }, { options: [['', 'Sin verificar'], ...S.poles.map(q => [q.id, poleLabel(q)])], w2: true }) +
    dfield('Verificado', !!v.ok, val => { v.ok = val; delete v.autoOk; }, { type: 'checkbox' }));
  h += `<div class="dsec"><span class="row">${isEn ? '<span class="chip ok">Apoyo de entronque</span>' : `<button class="btn small" data-act="entronque" data-k="${k}">Usar como apoyo de entronque</button>`}</span></div>`;
  return h;
}
/* ---- Tramo baja existente ---- */
function detLineaEx(li) {
  const l = exLineas()[li]; if (!l) return ''; const d = lineData(l.id);
  return dsec('Cable verificado', dfield('Cable trenzado instalado', d.v.cableId || '', val => { d.v.cableId = val; }, { options: [['', 'Sin verificar'], ...S.cables.map(x => [x.id, x.designacion])], full: true }) +
    dfield('Verificado', !!d.v.ok, val => { d.v.ok = val; }, { type: 'checkbox' }));
}
/* ---- Línea subterránea o zanja ---- */
function detSub(o) {
  const s = SUB(), isL = s.lineas.includes(o), R = S.subCalc;
  if (isL) {
    const r = R?.lineas.find(q => q.l === o);
    let h = dsec('Textos en el plano', dfield('Nombre', o.nombre, v => { o.nombre = v; }) + dfield('Texto en el plano', o.txt || '', v => { o.txt = v; }, { ph: 'Automático', txt: true, w2: true, hint: 'Vacío: nombre, cable, instalación y longitud' }));
    h += dsec('Datos de la línea',
      dfield('Estado', o.estado, v => { o.estado = v; }, { options: [['nuevo', 'Nueva'], ['existente', 'Existente']] }) +
      dfield('Cable', o.cableId, v => { o.cableId = v; }, { options: [['', '—'], ...(o.estado === 'nuevo' ? [['auto', 'Automático (REBT)' + (r?.cableAuto && r.c ? ': ' + r.c.designacion : '')]] : []), ...cablesSub().map(c => [c.id, c.designacion])], w2: true }) +
      dfield('Instalación', o.instal || 'zanja', v => { o.instal = v; }, { options: SUB_INSTAL }) +
      dfield('Potencia (kW)', o.potencia, v => { o.potencia = v; }, { type: 'number', ph: sumPar().pSol || '' }) +
      dfield('cos φ', o.cosphi, v => { o.cosphi = v; }, { type: 'number', ph: sumPar().cos }) +
      dfield('ΔU previa (%)', o.dUprev, v => { o.dUprev = v; }, { type: 'number', ph: sumPar().dUcon }) +
      dfield('Zanja', o.zanjaId || '', v => { o.zanjaId = v; }, { options: [['', 'Automática'], ...s.zanjas.map(z => [z.id, z.nombre])] }) +
      dfield('Longitud manual (m)', o.lManual ?? '', v => { o.lManual = v; }, { type: 'number', ph: r ? fmt(r.Lc, 1) : '', hint: 'Vacío: la medida' }));
    if (r) h += dinfo([['Estado', `<span class="chip ${r.est}">${r.est === 'ok' ? 'cumple' : r.est === 'warn' ? 'revisar' : 'no cumple'}</span>`], ['Longitud', fmt(r.L, 1) + ' m'], r.c && ['Cable', esc(r.c.designacion)], r.I && ['Intensidad / admisible', `${fmt(r.I, 1)} / ${fmt(r.Iadm, 1)} A`], r.I && ['Caída de tensión', fmt(r.dUtot, 2) + ' %']]) + `<ul class="checks">${r.checks.map(c => `<li class="${c.ok}">${esc(c.txt)}</li>`).join('')}</ul>`;
    return h;
  }
  const r = R?.zanjas.find(q => q.z === o);
  let h = dsec('Textos en el plano', dfield('Nombre', o.nombre, v => { o.nombre = v; }) + dfield('Texto en el plano', o.txt || '', v => { o.txt = v; }, { ph: 'Automático', txt: true, w2: true, hint: 'Vacío: nombre, tubos, tipo, profundidad y longitud' }));
  h += dsec('Datos de la zanja',
    dfield('Estado', o.estado, v => { o.estado = v; }, { options: [['nuevo', 'Nueva'], ['existente', 'Existente']] }) +
    dfield('Tipo', o.tipo, v => { o.tipo = v; if (ZANJA_TIPOS[v]?.horm) { o.entubada = true; o.hormigon = true; o.prof = Math.max(Number(o.prof) || 0, 0.8); } }, { options: Object.entries(ZANJA_TIPOS).map(([k, t]) => [k, t.n]) }) +
    dfield('Profundidad (m)', o.prof, v => { o.prof = v; }, { type: 'number' }) + dfield('Ancho (m)', o.ancho, v => { o.ancho = v; }, { type: 'number' }) +
    dfield('Entubada', !!o.entubada, v => { o.entubada = v; }, { type: 'checkbox' }) + dfield('Hormigonada', !!o.hormigon, v => { o.hormigon = v; }, { type: 'checkbox' }) +
    tubosZ(o).map((g, gi) => dfield(`Tubos ${gi + 1}: número`, g.n, v => { g.n = Math.max(0, Math.round(Number(v) || 0)); tubosZ(o); }, { type: 'number' }) + dfield(`Tubos ${gi + 1}: medida`, g.tuboId, v => { g.tuboId = v; tubosZ(o); }, { options: tubosSub().map(t => [t.id, 'Ø' + t.dExt + ' mm']) })).join('') +
    `<div class="f" style="justify-content:flex-end"><span class="row"><button class="btn small" data-act="tuboAdd">+ medida de tubo</button>${o.tubos.length > 1 ? '<button class="btn small ghost" data-act="tuboDel">− última medida</button>' : ''}</span></div>` +
    dfield('Separación entre circuitos', o.sep, v => { o.sep = v; }, { options: SUB_SEP }) +
    dfield('Longitud manual (m)', o.lManual ?? '', v => { o.lManual = v; }, { type: 'number', ph: r ? fmt(r.Lc, 1) : '', hint: 'Vacío: la medida' }));
  if (r) h += dinfo([['Estado', `<span class="chip ${r.est}">${r.est === 'ok' ? 'cumple' : r.est === 'warn' ? 'revisar' : 'no cumple'}</span>`], ['Longitud', fmt(r.L, 1) + ' m'], ['Circuitos', r.lin.length], o.entubada && ['Arquetas', r.arq.length]]) + `<ul class="checks">${r.checks.map(c => `<li class="${c.ok}">${esc(c.txt)}</li>`).join('')}</ul>`;
  return h;
}
/* ---- CGP ---- */
function detCgp() {
  const c = sumPar().cgp; if (!c) return '';
  return dsec('Textos en el plano', dfield('Texto en el plano', c.txt || '', v => { c.txt = v; }, { ph: 'CGP cliente' + (c.desc ? ' · ' + c.desc : ''), txt: true, full: true })) +
    dsec('Datos de la CGP', dfield('Ubicación', c.tipo, v => { c.tipo = v; }, { options: CGP_TIPOS, w2: true }) + dfield('Descripción', c.desc || '', v => { c.desc = v; }, { w2: true }) +
      dfield('X UTM', c.x?.toFixed(2), v => { c.x = Number(v); Object.assign(c, E.latLonFromUtm(c.x, c.y, S.proj.zone)); }, { type: 'number' }) + dfield('Y UTM', c.y?.toFixed(2), v => { c.y = Number(v); Object.assign(c, E.latLonFromUtm(c.x, c.y, S.proj.zone)); }, { type: 'number' })) +
    `<ul class="checks">${cgpChecks().map(x => `<li class="${x.ok}">${esc(x.txt)}</li>`).join('')}</ul>`;
}
/* ---- Selección en el plano (además de la de puntos) ---- */
function selectExtra(mx, my, fase) {
  if (!S.mapT) return false; const P = S.mapT.P;
  if (fase === 'pre') {
    const c = S.proj.sum?.cgp; if (c?.x != null && vis('cgp')) { const [x, y] = P(c); if (Math.hypot(x - mx, y - my) < 12) { S.selPt = null; S.selObj = { kind: 'cgp' }; renderPtEdit(); drawMap(); return true; } }
    let best = null; Object.keys(SUB_LAYERS).forEach(lay => { if (!vis(lay)) return; subObjs(lay).forEach((o, li) => { const h = hitSegment(o.pts, mx, my, 8); if (h && (!best || h.d < best.d)) best = { ...h, o, lay, li }; }); });
    if (best) { S.selPt = null; S.selObj = { kind: 'sub', o: best.o }; renderPtEdit(); drawMap(); return true; }
    return false;
  }
  const nodes = S.calc?.nodes; if (!nodes || nodes.length < 2 || !vis('linea')) return false;
  const h = hitSegment(nodes, mx, my, 8); if (h) { S.selPt = null; S.selObj = { kind: 'span', i: h.i }; renderPtEdit(); drawMap(); return true; }
  return false;
}
/* Herramienta «Editar texto»: selecciona como «Navegar» y pone el cursor en el texto del elemento */
function textToolClick(mx, my) {
  const P = S.mapT.P, near = (arr, r = 12) => { let k = -1, d = r; arr.forEach((n, i) => { const [x, y] = P(n); const q = Math.hypot(x - mx, y - my); if (q < d) { d = q; k = i; } }); return k; };
  const nodes = S.calc?.nodes || [];
  let i = vis('nuevo') ? near(nodes) : -1;
  if (i >= 0) { S.selObj = null; S.selPt = { layer: 'nuevo', li: 0, i }; }
  else if (vis('exDC') && (i = near(exDC())) >= 0) { S.selPt = { layer: 'exDC', li: 0, i }; }
  else if (vis('exApoyos') && (i = near(exNodes())) >= 0) { S.selPt = { layer: 'exApoyos', li: 0, i }; }
  else if (!selectExtra(mx, my, 'pre')) {
    let hl = null; exLineas().forEach((l, li) => { if (!exLVis(l)) return; const h = hitSegment(l.pts, mx, my, 8); if (h && (!hl || h.d < hl.d)) hl = { ...h, li }; });
    if (hl) S.selPt = { layer: 'exLineas', li: hl.li, i: hl.i };
    else if (!selectExtra(mx, my, 'post')) return toast('Pulsa sobre un apoyo, un vano, un tramo, un punto D-C, una línea subterránea, una zanja o la CGP para editar su texto.');
  }
  renderPtEdit(); drawMap();
  setTimeout(() => { const el = $('#detailBody [data-txt]') || $('#ptEdit #pe_lab, #ptEdit #pe_dcl, #ptEdit #pe_ll, #ptEdit #pe_n'); if (el) { el.scrollIntoView({ block: 'nearest' }); el.focus(); el.select?.(); } }, 30);
}
{ const _rpe = renderPtEdit; renderPtEdit = function () { _rpe(); renderDetail(); }; }

/* =====================================================================
   ASISTENTE DE NUEVO PROYECTO: datos de la línea → red existente → entronque → trazado
   ===================================================================== */
function wizSteps() {
  const R = redEx(), en = S.proj.entronque, ex = exNodes();
  const ve = (() => { try { return verifEstado(); } catch (e) { return { faltan: [] }; } })();
  return [
    { id: 'datos', t: 'Datos de la línea', d: 'Nombre, CT de origen, potencia, tensión y uso solicitados y CGP del cliente.', ok: !!S.proj.nombre && Number(S.proj.sum?.pSol) > 0, go: () => { const c = $('#datosCard'); c?.scrollIntoView({ block: 'start' }); $('#p_nombre')?.focus(); } },
    { id: 'red', t: 'Red existente', d: 'Importa los apoyos, el tramo baja y los puntos D-C del GIS (KML o KMZ).', ok: !!(R?.apoyos?.length && R?.lineas?.length), acts: [['Importar apoyos', () => $('#exApoFile').click()], ['Importar tramo baja', () => $('#exLinFile').click()], ['Importar puntos D-C', () => $('#exDCFile').click()]] },
    { id: 'entronque', t: 'Apoyo de entronque', d: 'Elige en el plano el apoyo existente del que parte la línea y verifica sus datos y los de los apoyos y líneas contiguos.', ok: en?.k != null && !!ex[en.k] && !(ve.faltan || []).length, acts: [['Elegir en el plano', () => { if (!ex.length) return toast('Importa primero los apoyos existentes.'); S.pickEntronque = true; S.tool = 'pan'; renderEdBar(); renderEntronque(); toast('Pulsa en el plano el apoyo existente (círculo E) del que parte la línea.'); }], ['Ver verificación', () => $('#exBody')?.scrollIntoView({ block: 'start' })]] },
    { id: 'trazado', t: 'Trazado', d: 'Dibuja la línea en el plano («Insertar», capa «Apoyos nuevos» o «Líneas subterráneas nuevas») o importa el trazado.', ok: S.proj.rows.length > 1 && S.proj.modo === 'kml' || !!S.proj.sub?.lineas?.length, acts: [['Dibujar línea aérea', () => { S.tool = 'insert'; S.editLayer = 'nuevo'; renderEdBar(); toast('Pulsa en el plano el apoyo de entronque y después cada apoyo nuevo.'); }], ['Dibujar línea subterránea', () => { S.tool = 'insert'; S.editLayer = 'subNueva'; renderEdBar(); toast('Pulsa los vértices de la línea subterránea; termina con Intro.'); }], ['Importar trazado', () => $('#kmlFile').click()]] }
  ];
}
function renderWizard() {
  let box = $('#wizard');
  if (!S.proj.wizard) { if (box) box.hidden = true; return; }
  if (!box) { box = document.createElement('section'); box.id = 'wizard'; box.className = 'card'; $('.leftcol')?.prepend(box); }
  box.hidden = false;
  const st = wizSteps(), cur = st.findIndex(x => !x.ok);
  box.innerHTML = `<h2>Nuevo proyecto · pasos <span class="row"><button class="btn small ghost" id="wizClose">Cerrar</button></span></h2>
    <ol class="wiz">${st.map((x, k) => `<li class="${x.ok ? 'done' : k === cur ? 'cur' : ''}"><b>${k + 1}. ${x.t}</b> ${x.ok ? '<span class="chip ok">hecho</span>' : k === cur ? '<span class="chip warn">pendiente</span>' : ''}<div class="note">${x.d}</div>
      ${!x.ok || k === cur ? `<div class="row" style="margin-top:4px">${x.go ? `<button class="btn small" data-wiz="${k}:go">Ir</button>` : ''}${(x.acts || []).map((a, j) => `<button class="btn small" data-wiz="${k}:${j}">${a[0]}</button>`).join('')}</div>` : ''}</li>`).join('')}</ol>
    ${cur < 0 ? '<p class="note">Todos los pasos están hechos: revisa los resultados y descarga el plano y el anexo.</p>' : ''}`;
}
function bindWizard() {
  document.addEventListener('click', ev => {
    const b = ev.target.closest('#wizard button'); if (!b) return;
    if (b.id === 'wizClose') { S.proj.wizard = false; renderWizard(); return; }
    const [k, j] = (b.dataset.wiz || '').split(':'); const st = wizSteps()[Number(k)]; if (!st) return;
    if (j === 'go') st.go?.(); else st.acts?.[Number(j)]?.[1]();
  });
}
{ const _np = nuevoProyecto; nuevoProyecto = function () { _np(); S.trImpApoyos = null; S.proj.wizard = true; renderWizard(); $('#wizard')?.scrollIntoView({ block: 'start' }); setTimeout(() => $('#p_nombre')?.focus(), 50); }; }

/* =====================================================================
   LÍNEA AÉREA AUTOMÁTICA: se dibuja la ruta y la aplicación coloca los apoyos,
   elige el cable (REBT) y cada apoyo (ITC-BT-06), como en la red subterránea
   ===================================================================== */
const AER_AUTO_DEF = { vmax: 40, vmin: 30, optim: true };
function aerAuto() { return S.proj.aerAuto = { ...AER_AUTO_DEF, ...(S.proj.aerAuto || {}) }; }
/* Apoyos en el inicio, en cada cambio de dirección (> 2°) y en el final; entre ellos, vanos iguales ≤ vano máximo */
function colocarApoyos(ruta, vmax) {
  const az = (a, b) => Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI;
  const keep = [0]; for (let i = 1; i < ruta.length - 1; i++) { const d = Math.abs(((az(ruta[i - 1], ruta[i]) - az(ruta[i], ruta[i + 1]) + 540) % 360) - 180); if (d > 2) keep.push(i); } keep.push(ruta.length - 1);
  const out = [];
  for (let k = 0; k < keep.length - 1; k++) {
    const seg = ruta.slice(keep[k], keep[k + 1] + 1), L = polyLen(seg), n = Math.max(1, Math.ceil(L / vmax - 1e-9));
    if (!k) out.push({ ...seg[0], vertice: true });
    for (let j = 1; j <= n; j++) { let d = L * j / n; for (let q = 0; q < seg.length - 1; q++) { const s = Math.hypot(seg[q + 1].x - seg[q].x, seg[q + 1].y - seg[q].y); if (d <= s + 1e-6) { const t = s ? d / s : 0; out.push({ x: seg[q].x + (seg[q + 1].x - seg[q].x) * t, y: seg[q].y + (seg[q + 1].y - seg[q].y) * t, vertice: j === n }); break; } d -= s; } }
  }
  return out.map(p => { const q = { x: p.x, y: p.y, vertice: p.vertice }; setLL(q); return q; });
}
function aplicarApoyos(ruta, vmax) {
  const pts = colocarApoyos(ruta, vmax), old = S.proj.rows;
  S.proj.geo = { ...(S.proj.geo || {}), zone: S.proj.zone, pts, ruta, fuente: S.proj.geo?.fuente || 'ruta dibujada en el plano' }; S.proj.modo = 'kml';
  S.proj.rows = pts.map((p, i) => { const r = newRow(); if (i === pts.length - 1 && old.length && old[old.length - 1].txt) r.txt = old[old.length - 1].txt; return r; });
  const ex = exNodes(), k = ex.findIndex(n => Math.hypot(n.x - pts[0].x, n.y - pts[0].y) < 1);
  if (k >= 0 && S.proj.entronque) { S.proj.entronque.k = k; S.proj.rows[0].existente.activo = true; }
  invalidateVert(); recalc();
  const c = S.calc; if (!c) return null;
  const malos = c.results.filter((r, i) => !(r.elegido || r.existenteCheck?.ok)).length, b = c.bud?.tot || { coste: 0, venta: 0 };
  return { vmax, n: pts.length, malos, coste: b.coste, venta: b.venta, u: c.results.reduce((t, r) => t + ((r.elegido?.r?.u) || 0), 0) };
}
function lineaAereaAuto(optimizar) {
  const ruta = S.proj.geo?.ruta; if (!ruta || ruta.length < 2) return toast('Dibuja primero la ruta en el plano (botón «Dibujar ruta») o importa un trazado con ruta.');
  const A = aerAuto(); snapshot();
  let res;
  if (optimizar) {
    const opts = []; for (let v = Number(A.vmin) || 30; v <= (Number(A.vmax) || 40) + 1e-6; v += 2.5) opts.push(v);
    const tries = opts.map(v => aplicarApoyos(ruta, v)).filter(Boolean);
    const ok = tries.filter(t => !t.malos), pool = ok.length ? ok : tries;
    pool.sort((a, b) => (a.coste || 0) - (b.coste || 0) || a.n - b.n || a.u - b.u);
    res = pool[0]; if (res) aplicarApoyos(ruta, res.vmax);
    S.aerAutoRes = { ...res, probados: tries.length, okCount: ok.length };
  } else { res = aplicarApoyos(ruta, Number(A.vmax) || 40); S.aerAutoRes = { ...res, probados: 1, okCount: res && !res.malos ? 1 : 0 }; }
  V.fitted = false; refreshAll();
  if (res) toast(`${res.n} apoyos colocados con vano máximo ${fmt(res.vmax, 1)} m${res.malos ? `; ${res.malos} sin apoyo válido` : ''}. Cable y apoyos elegidos automáticamente.`);
}
function renderAerAuto() {
  let box = $('#aerAuto');
  if (!box) { const tbl = $('#rowsTable'); const card = tbl?.closest('section'); if (!card) return; box = document.createElement('div'); box.id = 'aerAuto'; box.className = 'dsec'; card.insertBefore(box, card.querySelector('h2').nextSibling); }
  if (box.contains(document.activeElement) && document.activeElement.matches('input')) return;
  const A = aerAuto(), ruta = S.proj.geo?.ruta, r = S.aerAutoRes;
  box.innerHTML = `<h4>Línea aérea automática</h4>
    <p class="note" style="margin:0 0 6px">Dibuja la ruta desde el apoyo de entronque hasta la CGP; la aplicación coloca los apoyos (en el inicio, en cada cambio de dirección y en el final, con vanos iguales que no superan el máximo), elige el cable trenzado según el REBT y cada apoyo según el ITC-BT-06.</p>
    <div class="fields hfields">
      <label class="f">Vano máximo (m)<input class="num" type="number" step="1" min="10" data-aa="vmax" value="${A.vmax}"></label>
      <label class="f">Vano mínimo a probar (m)<input class="num" type="number" step="1" min="10" data-aa="vmin" value="${A.vmin}"></label>
    </div>
    <div class="row" style="margin-top:6px"><button class="btn small" id="aaRuta">${S.tool === 'insert' && S.editLayer === 'ruta' ? 'Dibujando ruta… (Intro para terminar)' : 'Dibujar ruta'}</button>
      <button class="btn small" id="aaPlace" ${ruta?.length > 1 ? '' : 'disabled'}>Colocar apoyos</button>
      <button class="btn small primary" id="aaOpt" ${ruta?.length > 1 ? '' : 'disabled'}>Calcular y optimizar</button>
      ${ruta?.length > 1 ? `<span class="note">Ruta: ${fmt(polyLen(ruta), 1)} m · ${ruta.length} vértices</span>` : ''}</div>
    ${r ? `<p class="note" style="margin:6px 0 0">${r.probados > 1 ? `Probados ${r.probados} vanos máximos entre ${fmt(A.vmin)} y ${fmt(A.vmax)} m; ${r.okCount} con todos los apoyos válidos. ` : ''}Elegido: vano máximo ${fmt(r.vmax, 1)} m · ${r.n} apoyos${r.coste ? ` · coste ${eur(r.coste)}` : ''}${r.malos ? ` · <b>${r.malos} sin apoyo válido</b>` : ''}.</p>` : ''}`;
}
function bindAerAuto() {
  document.addEventListener('change', ev => { const t = ev.target; if (!t.dataset?.aa) return; aerAuto()[t.dataset.aa] = Number(t.value) || AER_AUTO_DEF[t.dataset.aa]; });
  document.addEventListener('click', ev => {
    const b = ev.target.closest('#aerAuto button'); if (!b) return;
    if (b.id === 'aaRuta') { if (!S.proj.zone) return toast('Importa primero la red existente (o algún elemento con coordenadas).'); S.tool = 'insert'; S.editLayer = 'ruta'; S.rutaDraw = true; renderEdBar(); renderAerAuto(); $('#map')?.scrollIntoView({ block: 'nearest' }); toast('Pulsa en el plano el apoyo de entronque y luego cada punto de la ruta hasta la CGP. Termina con Intro o pulsando otra vez el último punto.'); }
    if (b.id === 'aaPlace') lineaAereaAuto(false);
    if (b.id === 'aaOpt') lineaAereaAuto(true);
  });
  document.addEventListener('keydown', ev => { if (S.rutaDraw && (ev.key === 'Enter' || ev.key === 'Escape')) { ev.preventDefault(); rutaEnd(); } });
}
function rutaEnd() { S.rutaDraw = false; S.tool = 'pan'; renderEdBar(); renderAerAuto(); const r = S.proj.geo?.ruta; if (r?.length > 1) toast(`Ruta de ${fmt(polyLen(r), 1)} m terminada. Pulsa «Calcular y optimizar» para colocar los apoyos.`); }
/* Dibujo de la ruta: en vacío añade puntos al final (con enganche); sobre un tramo intercala un vértice */
function rutaInsert(mx, my) {
  if (!S.proj.zone) return toast('Importa primero la red existente.');
  if (!S.proj.geo) { S.proj.geo = { zone: S.proj.zone, pts: [], ruta: [], fuente: 'ruta dibujada en el plano' }; }
  const ruta = S.proj.geo.ruta || (S.proj.geo.ruta = []);
  const h = ruta.length > 1 ? hitSegment(ruta, mx, my) : null; let w = worldAt(mx, my); const sn = findSnap({ layer: '__ruta__' }, mx, my); if (sn) w = { x: sn.x, y: sn.y };
  if (ruta.length) { const [lx, ly] = S.mapT.P(ruta[ruta.length - 1]); if (Math.hypot(lx - mx, ly - my) < 8) return rutaEnd(); }
  snapshot(); const np = { x: w.x, y: w.y }; setLL(np);
  if (h && !S.rutaDraw) ruta.splice(h.i + 1, 0, np); else ruta.push(np);
  if (ruta.length === 1 && sn?.exK != null && S.proj.entronque) S.proj.entronque.k = sn.exK;
  invalidateVert(); refreshAll(); renderAerAuto();
}

/* Altura de la columna derecha: ocupa desde su borde superior visible hasta el final de la ventana */
function ajustaColDerecha() {
  const rc = document.querySelector('.rightcol'); if (!rc) return;
  if (innerWidth <= 1100) { rc.style.height = ''; return; }
  const top = Math.max(6, rc.getBoundingClientRect().top); rc.style.height = Math.max(420, innerHeight - top - 6) + 'px';
}
addEventListener('scroll', ajustaColDerecha, { passive: true }); addEventListener('resize', ajustaColDerecha); setTimeout(ajustaColDerecha, 50);

/* Tamaño del plano ajustable a mano: separador vertical (ancho) y horizontal (alto); se recuerda en este navegador */
(function () {
  const KEY = 'calculoApoyosBT.layout', split = () => document.querySelector('.split'), rc = () => document.querySelector('.rightcol');
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const save = o => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { } };
  const apply = o => { const s = split(), r = rc(); if (!s || !r) return; if (o.colL) s.style.setProperty('--colL', o.colL + 'px'); else s.style.removeProperty('--colL'); if (o.rowP) r.style.setProperty('--rowP', o.rowP + 'px'); else r.style.removeProperty('--rowP'); };
  const drag = (el, onMove) => { el.addEventListener('pointerdown', ev => { ev.preventDefault(); el.setPointerCapture(ev.pointerId); el.classList.add('drag'); const mv = e => onMove(e), up = () => { el.classList.remove('drag'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); save(st); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); }); };
  let st = load();
  addEventListener('DOMContentLoaded', init); if (document.readyState !== 'loading') setTimeout(init, 0);
  function init() {
    const v = document.querySelector('.splitV'), h = document.querySelector('.splitH'); if (!v || !h || v.dataset.ok) return; v.dataset.ok = 1; apply(st);
    drag(v, e => { const s = split().getBoundingClientRect(); st.colL = Math.round(Math.min(s.width - 420, Math.max(300, e.clientX - s.left - 8))); apply(st); });
    drag(h, e => { const r = rc().getBoundingClientRect(); st.rowP = Math.round(Math.min(r.height - 120, Math.max(220, e.clientY - r.top - 5))); apply(st); });
    v.addEventListener('dblclick', () => { st = {}; save(st); apply(st); });
    h.addEventListener('dblclick', () => { delete st.rowP; save(st); apply(st); });
  }
})();

/* =====================================================================
   TRAZADO: importar por separado los apoyos (puntos) y los tramos (líneas)
   ===================================================================== */
function puntoInicio() { const en = S.proj.entronque, ex = exNodes(); return en?.k != null && ex[en.k] ? ex[en.k] : null; }
/* Une varias líneas en una sola ruta, empezando por la más cercana al entronque */
function encadenarTramos(lines, zone) {
  const U = p => ({ ...p, ...E.utmFromLatLon(p.lat, p.lon, zone) });
  let rest = lines.filter(l => l.pts.length > 1).map(l => l.pts.map(U)); if (!rest.length) return [];
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), P0 = puntoInicio();
  let k = 0, rev = false;
  if (P0) { let best = Infinity; rest.forEach((l, i) => { const a = d(l[0], P0), b = d(l[l.length - 1], P0); if (a < best) { best = a; k = i; rev = false; } if (b < best) { best = b; k = i; rev = true; } }); }
  let ruta = rest.splice(k, 1)[0]; if (rev) ruta = ruta.reverse();
  while (rest.length) {
    const end = ruta[ruta.length - 1]; let bi = 0, br = false, bd = Infinity;
    rest.forEach((l, i) => { const a = d(l[0], end), b = d(l[l.length - 1], end); if (a < bd) { bd = a; bi = i; br = false; } if (b < bd) { bd = b; bi = i; br = true; } });
    let l = rest.splice(bi, 1)[0]; if (br) l = l.reverse(); if (d(l[0], end) < 0.5) l = l.slice(1); ruta = ruta.concat(l);
  }
  return ruta;
}
/* Ordena puntos sueltos en cadena (vecino más próximo) empezando cerca del entronque */
function ordenarApoyos(pts) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), P0 = puntoInicio(), rest = [...pts];
  let i0 = 0; if (P0) { let bd = Infinity; rest.forEach((p, i) => { const q = d(p, P0); if (q < bd) { bd = q; i0 = i; } }); }
  const out = [rest.splice(i0, 1)[0]];
  while (rest.length) { const e = out[out.length - 1]; let bi = 0, bd = Infinity; rest.forEach((p, i) => { const q = d(p, e); if (q < bd) { bd = q; bi = i; } }); out.push(rest.splice(bi, 1)[0]); }
  return out;
}
async function importTrApoyos(file) {
  try {
    const { points } = await parseGeoFile(file); if (points.length < 1) throw new Error('el archivo no tiene puntos (marcadores) de apoyos');
    S.trImpApoyos = { pts: points, nombre: file.name };
    const zone = setZoneFrom(points[0]), ruta = S.proj.geo?.ruta;
    if (ruta?.length > 1) { const tr = S.proj.geo?.tramos; applyTrace({ nombre: 'Ruta', pts: ruta.map(p => ({ lat: p.lat, lon: p.lon, alt: p.alt })), conCota: hasAlt(ruta) }, file.name, points); if (tr) { S.proj.geo.tramos = tr; refreshAll(); } return; }
    if (points.length < 2) throw new Error('hacen falta al menos dos apoyos o importar antes los tramos');
    const ord = ordenarApoyos(points.map(p => ({ ...p, ...E.utmFromLatLon(p.lat, p.lon, zone) })));
    applyTrace({ nombre: 'Apoyos', pts: ord.map(p => ({ lat: p.lat, lon: p.lon, alt: p.alt, nombre: p.nombre })), sinDividir: true, conCota: hasAlt(points) }, file.name, null);
    toast(`${points.length} apoyos importados y ordenados desde el entronque. Importa los tramos si quieres ajustar el orden a la ruta.`);
  } catch (e) { toast('No se pudieron importar los apoyos: ' + e.message); }
}
async function importTrTramos(file) {
  try {
    const { lines: todas } = await parseGeoFile(file); if (!todas.length) throw new Error('el archivo no tiene líneas (tramos)');
    // Fuera los tramos que ya son de la red existente (mismo identificador o mismo trazado que un tramo baja importado)
    const z0 = setZoneFrom(todas[0].pts[0]), exIds = new Set(exLineas().map(l => tramoId(l)).filter(Boolean));
    const U0 = l => l.pts.map(p => E.utmFromLatLon(p.lat, p.lon, z0));
    const lines = todas.filter(l => !((tramoId(l) && exIds.has(tramoId(l))) || exLineas().some(e => overlapFrac(U0(l), e.pts, 2) > 0.6)));
    const quitados = todas.length - lines.length; if (!lines.length) throw new Error('todos los tramos del archivo son de la red existente');
    const zone = setZoneFrom(lines[0].pts[0]), ruta = encadenarTramos(lines, zone); if (ruta.length < 2) throw new Error('los tramos no tienen al menos dos puntos');
    const opt = { nombre: 'Tramos', pts: ruta.map(p => ({ lat: p.lat, lon: p.lon, alt: p.alt })), conCota: hasAlt(ruta) };
    const tramos = lines.filter(l => l.pts.length > 1).map((l, i) => ({ id: tramoId(l), nombre: l.nombre || `Tramo ${i + 1}`, attrs: l.attrs || {}, fuente: file.name, pts: l.pts.map(p => ({ lat: p.lat, lon: p.lon, ...E.utmFromLatLon(p.lat, p.lon, zone) })) }));
    if (S.trImpApoyos?.pts?.length >= 2) { applyTrace(opt, file.name, S.trImpApoyos.pts); S.proj.geo.tramos = tramos; refreshAll(); if (quitados) toast(`Trazado importado con ${tramos.length} tramo(s) nuevo(s); ${quitados} tramo(s) de la red existente descartado(s).`); return; }
    snapshot();
    S.proj.geo = { zone, pts: [], ruta: ruta.map(({ x, y, lat, lon, alt }) => ({ x, y, lat, lon, alt })), fuente: file.name, tramos }; S.proj.modo = 'kml'; S.proj.rows = [];
    if (opt.conCota) S.proj.perfil = { fuente: file.name, pts: ruta.map(p => ({ x: p.x, y: p.y, z: p.alt })) };
    V.fitted = false; refreshAll();
    toast(`${lines.length} tramo(s) nuevo(s) importado(s)${quitados ? ` (${quitados} existente(s) descartado(s))` : ''}: ruta de ${fmt(polyLen(ruta), 1)} m. Importa ahora los apoyos o pulsa «Calcular y optimizar» para colocarlos automáticamente.`);
  } catch (e) { toast('No se pudieron importar los tramos: ' + e.message); }
}
