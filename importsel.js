/* =====================================================================
   IMPORTAR CON SELECCIÓN Y QUITAR DATOS IMPORTADOS
   Antes de importar un KMZ/KML/GPX (red aérea nueva, red subterránea o red existente) se listan sus
   elementos para elegir cuáles entran. Un panel reúne todo lo importado para quitarlo por archivo.
   ===================================================================== */
/* Qué se importa en cada botón: líneas, puntos o ambos, y qué se marca de entrada */
const IMP_CTX = {
  trLinFile: { titulo: 'Tramos de la red aérea nueva', lineas: true, pre: 'aerea' },
  kmlFile: { titulo: 'Trazado de la red aérea nueva', lineas: true, puntos: true, pre: 'aerea' },
  trApoFile: { titulo: 'Apoyos de la red aérea nueva', puntos: true },
  exApoFile: { titulo: 'Apoyos existentes', puntos: true },
  exLinFile: { titulo: 'Tramos de baja existentes', lineas: true },
  exDCFile: { titulo: 'Puntos D-C existentes', puntos: true },
  subExLinFile: { titulo: 'Líneas subterráneas existentes', lineas: true, pre: 'subt' },
  subNuLinFile: { titulo: 'Líneas subterráneas nuevas', lineas: true, pre: 'subt' },
  subExZanFile: { titulo: 'Zanjas existentes', lineas: true },
  subNuZanFile: { titulo: 'Zanjas nuevas', lineas: true },
};
S.impCtx = null;
document.addEventListener('change', ev => { const id = ev.target?.id; if (ev.target?.type === 'file' && id) S.impCtx = IMP_CTX[id] ? id : null; }, true);
const sitDe = o => String(attrFind(o.attrs, k => k === 'situacion') || '');
const impLen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; const dy = (b.lat - a.lat) * 111320, dx = (b.lon - a.lon) * 111320 * Math.cos(a.lat * Math.PI / 180); L += Math.hypot(dx, dy); } return L; };

/* Diálogo de selección: devuelve los elementos marcados o lanza «importación cancelada» */
function elegirImport(r, fname, ctxId) {
  const C = IMP_CTX[ctxId];
  const items = [
    ...(C.lineas ? r.lines.map((l, i) => ({ k: 'l' + i, tipo: 'Tramo', o: l, sit: sitDe(l), info: [tramoId(l) !== l.nombre ? tramoId(l) : '', conductorTramo(l)].filter(Boolean).join(' · '), med: fmt(impLen(l.pts), 1) + ' m' })) : []),
    ...(C.puntos ? r.points.map((p, i) => ({ k: 'p' + i, tipo: 'Punto', o: p, sit: '', info: [attrFind(p.attrs, k => k === 'identificador'), p.attrs?.CUPS || findCups(p.raw)].filter(Boolean).join(' · '), med: '' })) : []),
  ];
  if (items.length <= 1) return Promise.resolve(r);
  const haySit = items.some(it => it.sit);
  const sel = new Set(items.filter(it => !haySit || !C.pre || !it.sit || (C.pre === 'subt' ? /subterr/i.test(it.sit) : !/subterr/i.test(it.sit))).map(it => it.k));
  return new Promise((res, rej) => {
    const dlg = document.createElement('div'); dlg.className = 'wlogin impdlg'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true');
    let filtro = '';
    const vis = () => items.filter(it => !filtro || (it.o.nombre + ' ' + it.info + ' ' + it.sit).toLowerCase().includes(filtro));
    const sits = [...new Set(items.map(it => it.sit).filter(Boolean))];
    const pinta = () => {
      const v = vis();
      dlg.innerHTML = `<div class="wlbox" style="width:min(900px,100%);max-height:90vh;gap:10px">
        <h2 style="font-size:1.25rem"><small>Importar · ${esc(fname)}</small>${esc(C.titulo)}</h2>
        <p class="note" style="margin:0">Marca lo que quieres importar. ${items.length} elementos en el archivo${haySit && C.pre ? `; vienen marcados los ${C.pre === 'subt' ? 'subterráneos' : 'aéreos y de fachada'}` : ''}.</p>
        <div class="row" style="gap:6px;flex-wrap:wrap"><input id="imq" type="search" placeholder="Filtrar por nombre, identificador, conductor…" value="${esc(filtro)}" style="flex:1;min-width:180px">
          <button class="btn small" data-a="all">Marcar todos</button><button class="btn small" data-a="none">Ninguno</button>
          ${sits.map(s => `<button class="btn small ghost" data-sit="${esc(s)}">Solo ${esc(s.toLowerCase())}</button>`).join('')}</div>
        <div class="tablewrap" style="overflow:auto;flex:1;min-height:120px"><table class="vt"><thead><tr><th><input type="checkbox" id="imall" ${v.length && v.every(it => sel.has(it.k)) ? 'checked' : ''} aria-label="Marcar los visibles"></th><th>Tipo</th><th>Nombre</th><th>Datos</th><th>Situación</th><th class="n">Longitud</th></tr></thead>
          <tbody>${v.map(it => `<tr class="${sel.has(it.k) ? '' : 'off'}"><td><input type="checkbox" data-k="${it.k}" ${sel.has(it.k) ? 'checked' : ''} aria-label="Importar ${esc(it.o.nombre || it.k)}"></td><td class="note">${it.tipo}</td><td>${esc(it.o.nombre || '')}</td><td class="note">${esc(it.info)}</td><td>${esc(it.sit)}</td><td class="n">${it.med}</td></tr>`).join('')}</tbody></table></div>
        <div class="row" style="gap:8px"><button class="btn primary" data-a="ok" ${sel.size ? '' : 'disabled'}>Importar ${sel.size} de ${items.length}</button><button class="btn ghost" data-a="cancel">Cancelar</button></div></div>`;
      const q = dlg.querySelector('#imq'); q.oninput = () => { filtro = q.value.trim().toLowerCase(); const p = q.selectionStart; pinta(); const q2 = dlg.querySelector('#imq'); q2.focus(); q2.setSelectionRange(p, p); };
    };
    const fin = ok => { dlg.remove(); document.removeEventListener('keydown', esc_); if (!ok) return rej(new Error('importación cancelada'));
      res({ lines: r.lines.filter((l, i) => sel.has('l' + i)), points: C.puntos ? r.points.filter((p, i) => sel.has('p' + i)) : r.points }); };
    const esc_ = ev => { if (ev.key === 'Escape') fin(false); };
    dlg.addEventListener('change', ev => { const t = ev.target;
      if (t.dataset.k) { t.checked ? sel.add(t.dataset.k) : sel.delete(t.dataset.k); pinta(); }
      if (t.id === 'imall') { vis().forEach(it => t.checked ? sel.add(it.k) : sel.delete(it.k)); pinta(); } });
    dlg.addEventListener('click', ev => { const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'all') { items.forEach(it => sel.add(it.k)); pinta(); }
      if (b.dataset.a === 'none') { sel.clear(); pinta(); }
      if (b.dataset.sit != null) { sel.clear(); items.filter(it => it.sit === b.dataset.sit).forEach(it => sel.add(it.k)); pinta(); }
      if (b.dataset.a === 'ok') fin(true);
      if (b.dataset.a === 'cancel') fin(false); });
    document.addEventListener('keydown', esc_);
    pinta(); document.body.appendChild(dlg);
  });
}
{ const _p = parseGeoFile; parseGeoFile = async function (file) {
  const r = await _p(file); const ctx = S.impCtx; S.impCtx = null;
  if (!ctx || S.noSelImport) return r;
  return elegirImport(r, file.name, ctx);
}; }
{ const _r = readRouteOptions; readRouteOptions = async function (file) { S.noSelImport = true; try { return await _r(file); } finally { S.noSelImport = false; } }; }

/* ---- Panel «Datos importados» ---- */
function impGrupos() {
  const G = [], R = S.proj.redEx, s = S.proj.sub;
  const by = (arr, fn) => { const m = new Map(); arr.forEach(o => { const f = fn(o); if (!f) return; m.set(f, (m.get(f) || 0) + 1); }); return [...m]; };
  if (S.proj.geo?.fuente && S.proj.geo.fuente !== 'edición en el plano' && S.proj.geo.fuente !== 'dibujado en el plano') G.push({ cat: 'Red aérea nueva', txt: `Trazado y apoyos de la línea nueva (${S.proj.rows.length} apoyos)`, f: S.proj.geo.fuente, del: () => { S.proj.geo = null; S.proj.modo = 'manual'; S.proj.rows = []; S.proj.tramosAer = tramosAer().filter(t => t.nuevo); if (S.proj.perfil) S.proj.perfil = null; S.sel = null; } });
  by(tramosAer().filter(t => !t.nuevo), t => t.fuente || 'importados').forEach(([f, n]) => G.push({ cat: 'Red aérea nueva', txt: `${n} tramo(s) aéreo(s) nuevo(s)`, f, del: () => { S.proj.tramosAer = tramosAer().filter(t => t.nuevo || (t.fuente || 'importados') !== f); } }));
  if (S.proj.perfil?.fuente && S.proj.perfil.fuente !== S.proj.geo?.fuente) G.push({ cat: 'Red aérea nueva', txt: 'Perfil longitudinal', f: S.proj.perfil.fuente, del: () => { S.proj.perfil = null; } });
  if (s) for (const kind of ['lineas', 'zanjas']) for (const est of ['nuevo', 'existente'])
    by(s[kind].filter(o => o.estado === est), o => o.fuente).forEach(([f, n]) => G.push({ cat: 'Red subterránea', txt: `${n} ${kind === 'lineas' ? 'línea(s) subterránea(s)' : 'zanja(s)'} ${est === 'nuevo' ? 'nueva(s)' : 'existente(s)'}`, f,
      del: () => { const quita = s[kind].filter(o => o.estado === est && o.fuente === f); s[kind] = s[kind].filter(o => !quita.includes(o)); if (kind === 'zanjas') s.lineas.forEach(l => { if (quita.some(z => z.id === l.zanjaId)) l.zanjaId = ''; }); } }));
  if (R) {
    const enP = () => S.proj.entronque?.k != null ? exNodes()[S.proj.entronque.k] : null;
    const reEn = P => { if (!S.proj.entronque) return; const k = P ? exNodes().findIndex(a => a === P || Math.hypot(a.x - P.x, a.y - P.y) < 0.5) : -1; S.proj.entronque.k = k >= 0 ? k : null; };
    by(R.apoyos || [], o => o.fuente).forEach(([f, n]) => G.push({ cat: 'Red existente', txt: `${n} apoyo(s) existente(s)`, f, del: () => { const P = enP(); R.apoyos = R.apoyos.filter(a => a.fuente !== f); invalidateVert(); reEn(P && P.fuente !== f ? P : null); } }));
    by(R.lineas, o => o.fuente).forEach(([f, n]) => G.push({ cat: 'Red existente', txt: `${n} tramo(s) de baja existente(s)`, f, del: () => { const P = enP(); R.lineas = R.lineas.filter(l => l.fuente !== f); invalidateVert(); if (!R.apoyos?.length) reEn(P); } }));
    by(R.puntosDC || [], o => o.fuente).forEach(([f, n]) => G.push({ cat: 'Red existente', txt: `${n} punto(s) D-C`, f, del: () => { R.puntosDC = R.puntosDC.filter(d => d.fuente !== f); } }));
  }
  return G;
}
function renderImportados() {
  const box = $('#impBody'); if (!box) return; const G = impGrupos(); S.impG = G;
  const n = $('#impN'); if (n) n.textContent = G.length ? `${G.length}` : '';
  if (!G.length) { box.innerHTML = '<p class="note">No hay datos importados de archivos en este proyecto.</p>'; return; }
  const cats = [...new Set(G.map(g => g.cat))];
  box.innerHTML = cats.map(c => `<h3 class="sub">${c}</h3><div class="tablewrap"><table class="vt"><tbody>${G.map((g, i) => g.cat !== c ? '' : `<tr><td>${esc(g.txt)}</td><td class="note">${esc(g.f)}</td><td style="text-align:right"><button class="btn small ghost" data-impdel="${i}">Quitar</button></td></tr>`).join('')}</tbody></table></div>`).join('')
    + `<div class="row" style="margin-top:10px;gap:8px"><button class="btn small danger" data-impdel="all">Quitar todos los datos importados</button><span class="note">Se puede deshacer con Ctrl+Z.</span></div>`;
}
function bindImportados() {
  const box = $('#impBody'); if (!box) return;
  box.addEventListener('click', ev => {
    const b = ev.target.closest('button[data-impdel]'); if (!b) return;
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.dataset.t0 = b.textContent; b.textContent = 'Pulsa otra vez para quitar'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = b.dataset.t0; } }, 4000); return; }
    const G = S.impG || []; snapshot();
    if (b.dataset.impdel === 'all') { [...G].reverse().forEach(g => g.del()); S.proj.redZona = null; if (G.some(g => g.f.startsWith('Base '))) S.proj.redAuto = false; toast('Datos importados quitados del proyecto.'); }
    else { const g = G[Number(b.dataset.impdel)]; if (!g) return; g.del(); if (g.f.startsWith('Base ')) { S.proj.redZona = null; S.proj.redAuto = false; } toast(`Quitado: ${g.txt} (${g.f}).`); }
    S.selPt = null; S.selObj = null; invalidateVert(); V.fitted = false; refreshAll();
  });
}
{ const _ra = refreshAll; refreshAll = function () { _ra(); renderImportados(); }; }
{ const _st = start; start = async function () { await _st(); bindImportados(); renderImportados(); }; }
