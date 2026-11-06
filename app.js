/* ===== Aplicación ===== */
const VERSION = '1.0.0';
const $ = s => document.querySelector(s);
const fmt = (v, d = 0) => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = v => fmt(v, 2) + ' €';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FUNCS = { auto: 'Automática', alineacion: 'Alineación', angulo: 'Ángulo', fin: 'Fin / inicio de línea', estrellamiento: 'Estrellamiento', derivacion: 'Derivación (existente)' };
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3200); }

const DEF_CTX = { zona: 'A', thetaMax: 50, tenseModo: 'max', tenseValor: 400, sobreEdificios: false, desequilibrio: 8, umbralAngulo: 3, distSuelo: 4, depthAmarre: 0.4, terreno: 'normal', tipos: 'HV+HVH', criterioPrecio: 'coste', vientoPoste: true, vanoMax: 40, dividir: true, rumbo0: 0 };
const newRow = () => ({ vano: 35, angulo: 0, funcion: 'auto', alturaFija: '', modeloFijo: '', cruce: false, existente: { activo: false, modeloId: '', azPrincipal: '', conductores: [] } });
function exampleProject() {
  const rows = [newRow(), newRow(), newRow(), newRow(), newRow()];
  rows[0].vano = 0; rows[2].angulo = 30; rows[3].vano = 38; rows[4].vano = 30;
  return { id: null, nombre: 'Ejemplo · línea de 4 vanos', modo: 'manual', rows, geo: null, ctx: { ...DEF_CTX }, cableId: '' };
}
const S = { poles: [], cables: [], precios: { holguraCable: 3 }, proj: exampleProject(), calc: null, sel: null, db: null, projs: [], loaded: { apoyos: false, cables: false } };

/* ---------- Base de datos ---------- */
async function initDb() {
  const timer = setTimeout(() => { if (!S.db) dbMissing(); }, 10000);
  let db = null;
  try { db = await window.claude?.use?.('db'); } catch (e) { db = null; }
  clearTimeout(timer);
  if (!db) { dbMissing(); return; }
  S.db = db;
  db.collection('apoyos').onSnapshot(qs => { S.poles = qs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0)); S.loaded.apoyos = true; renderPoleTable(); recalc(); },
    e => toast('No se pudo leer la base de apoyos: ' + (e.message || e.code)));
  db.collection('cables').onSnapshot(qs => { S.cables = qs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0)); S.loaded.cables = true; fillCableSelect(); renderCableTable(); recalc(); },
    e => toast('No se pudo leer la base de cables: ' + (e.message || e.code)));
  db.doc('config/precios').onSnapshot(d => { S.precios = { holguraCable: 3, ...(d.data() || {}) }; renderPrecios(); recalc(); }, () => { });
  db.collection('proyectos').onSnapshot(qs => { S.projs = qs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')); renderProjList(); }, () => { });
}
function dbMissing() {
  if (S.dbMissingShown) return; S.dbMissingShown = true;
  $('#warnings').insertAdjacentHTML('afterbegin', '<div class="banner bad">No hay conexión con la base de datos de apoyos y cables. Abre la aplicación con tu cuenta de claude.ai para cargar las bases y guardar cambios.</div>');
}
function numOrStr(v, t) { if (t === 'text') return v; const n = Number(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; }
async function updateDoc(coll, id, field, value) {
  if (!S.db) return;
  try { await S.db.doc(`${coll}/${id}`).update({ [field]: value }); }
  catch (e) { toast(e.code === 'not_granted' || e.code === 'permission_denied' ? 'No tienes permiso para editar la base.' : 'No se guardó el cambio: ' + (e.message || e.code)); }
}

/* ---------- Formulario de proyecto ---------- */
const CTX_FIELDS = ['zona', 'tenseModo', 'tenseValor', 'thetaMax', 'desequilibrio', 'depthAmarre', 'distSuelo', 'terreno', 'tipos', 'criterioPrecio', 'umbralAngulo', 'sobreEdificios', 'vientoPoste', 'vanoMax', 'dividir', 'rumbo0'];
function loadForm() {
  const c = S.proj.ctx; $('#p_nombre').value = S.proj.nombre || '';
  for (const k of CTX_FIELDS) { const el = $('#p_' + k); if (!el) continue; if (el.type === 'checkbox') el.checked = !!c[k]; else el.value = c[k]; }
  fillCableSelect();
}
function bindForm() {
  $('#p_nombre').addEventListener('input', e => { S.proj.nombre = e.target.value; });
  for (const k of CTX_FIELDS) {
    const el = $('#p_' + k); if (!el) continue;
    el.addEventListener('change', () => { S.proj.ctx[k] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? Number(el.value) : el.value); if (k === 'rumbo0') renderRows(); recalc(); });
  }
  $('#p_cable').addEventListener('change', e => { S.proj.cableId = e.target.value; recalc(); });
}
function fillCableSelect() {
  const sel = $('#p_cable'); const act = S.cables.filter(c => c.activo !== false);
  if (!S.proj.cableId || !act.find(c => c.id === S.proj.cableId)) S.proj.cableId = (act.find(c => /3x95/.test(c.designacion)) || act[0] || {}).id || '';
  sel.innerHTML = act.length ? act.map(c => `<option value="${esc(c.id)}">${esc(c.designacion)}</option>`).join('') : '<option value="">Cargando cables…</option>';
  sel.value = S.proj.cableId;
}

/* ---------- Tabla de apoyos del trazado ---------- */
function poleLabel(p) { return `${p.tipo}-${p.En}-R-${p.altura}`; }
function renderRows() {
  const tb = $('#rowsTable tbody'); const geo = S.proj.modo === 'kml';
  const heights = [...new Set(S.poles.map(p => p.altura))].sort((a, b) => a - b);
  const nodes = currentNodes(); const spans = nodes.length > 1 ? E.buildGeometry(nodes) : [];
  tb.innerHTML = S.proj.rows.map((r, i) => {
    const vano = i === 0 ? '—' : geo ? fmt(spans[i - 1]?.a, 1) : `<input class="num" type="number" step="0.5" data-k="vano" data-i="${i}" value="${r.vano}" aria-label="Vano anterior apoyo ${i + 1}">`;
    const ang = (i === 0 || i === S.proj.rows.length - 1) ? '—' : geo ? fmt(nodes[i].desvio, 1) : `<input class="num" type="number" step="1" data-k="angulo" data-i="${i}" value="${r.angulo}" aria-label="Desvío apoyo ${i + 1}">`;
    const cruce = i === 0 ? '' : `<input type="checkbox" data-k="cruce" data-i="${i}" ${r.cruce ? 'checked' : ''} aria-label="Cruce en vano anterior">`;
    const fsel = `<select data-k="funcion" data-i="${i}">${Object.entries(FUNCS).map(([k, v]) => `<option value="${k}" ${r.funcion === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
    const hsel = `<select data-k="alturaFija" data-i="${i}"><option value="">Auto</option>${heights.map(h => `<option value="${h}" ${String(r.alturaFija) === String(h) ? 'selected' : ''}>${h} m</option>`).join('')}</select>`;
    const msel = `<select data-k="modeloFijo" data-i="${i}"><option value="">Auto</option>${S.poles.map(p => `<option value="${esc(p.id)}" ${r.modeloFijo === p.id ? 'selected' : ''}>${poleLabel(p)}</option>`).join('')}</select>`;
    const ex = `<button class="btn small" data-act="ex" data-i="${i}">${r.existente.activo ? 'Editar' : 'No'}</button>`;
    const del = `<button class="btn small ghost" data-act="del" data-i="${i}" aria-label="Eliminar apoyo ${i + 1}">✕</button>`;
    let html = `<tr class="${S.sel === i ? 'sel' : ''}"><td><b>A${i + 1}</b></td><td class="n">${vano}</td><td class="n">${ang}</td><td>${cruce}</td><td>${fsel}</td><td>${hsel}</td><td>${msel}</td><td>${ex}</td><td>${del}</td></tr>`;
    if (S.openEx === i) html += `<tr><td colspan="9">${existEditor(r, i)}</td></tr>`;
    return html;
  }).join('');
}
function existEditor(r, i) {
  const e = r.existente;
  const cabOpts = sel => `<option value="">Otro (diámetro manual)</option>` + S.cables.map(c => `<option value="${esc(c.id)}" ${sel === c.id ? 'selected' : ''}>${esc(c.designacion)}</option>`).join('');
  return `<div class="exist">
    <label class="chk"><input type="checkbox" data-ex="activo" data-i="${i}" ${e.activo ? 'checked' : ''}> A${i + 1} es un apoyo existente (derivación con conductores ya instalados)</label>
    <div class="fields" style="margin-top:8px">
      <label class="f">Modelo del poste existente<select data-ex="modeloId" data-i="${i}"><option value="">Sin datos</option>${S.poles.map(p => `<option value="${esc(p.id)}" ${e.modeloId === p.id ? 'selected' : ''}>${poleLabel(p)}</option>`).join('')}</select></label>
      <label class="f">Acimut del eje principal (°)<input class="num" type="number" data-ex="azPrincipal" data-i="${i}" value="${esc(e.azPrincipal)}" placeholder="Desconocido"><span class="hint">En blanco: la orientación más favorable</span></label>
    </div>
    <div class="tablewrap" style="margin-top:8px"><table><thead><tr><th>Cable existente</th><th class="n">Acimut (°)</th><th class="n">Tense (daN)</th><th class="n">Vano (m)</th><th class="n">Ø haz (mm)</th><th class="n">Bajo cogolla (m)</th><th></th></tr></thead><tbody>
    ${(e.conductores || []).map((c, j) => `<tr>
      <td><select data-ec="cableId" data-i="${i}" data-j="${j}">${cabOpts(c.cableId)}</select></td>
      <td class="n"><input class="num" type="number" data-ec="az" data-i="${i}" data-j="${j}" value="${c.az}"></td>
      <td class="n"><input class="num" type="number" data-ec="tense" data-i="${i}" data-j="${j}" value="${c.tense}"></td>
      <td class="n"><input class="num" type="number" data-ec="vano" data-i="${i}" data-j="${j}" value="${c.vano}"></td>
      <td class="n"><input class="num" type="number" data-ec="diam" data-i="${i}" data-j="${j}" value="${c.diam}"></td>
      <td class="n"><input class="num" type="number" step="0.05" data-ec="depth" data-i="${i}" data-j="${j}" value="${c.depth}"></td>
      <td><button class="btn small ghost" data-act="exdel" data-i="${i}" data-j="${j}" aria-label="Quitar conductor">✕</button></td></tr>`).join('')}
    </tbody></table></div>
    <div class="row" style="margin-top:8px"><button class="btn small" data-act="exadd" data-i="${i}">Añadir conductor existente</button>
    <span class="note">Acimut: dirección desde el apoyo hacia el vano (0° = norte, sentido horario).${S.proj.modo === 'manual' ? ' En entrada manual, la línea nueva parte con el rumbo inicial indicado.' : ''}</span></div>
  </div>`;
}
function bindRows() {
  const tb = $('#rowsTable tbody');
  tb.addEventListener('change', ev => {
    const t = ev.target, i = Number(t.dataset.i); const r = S.proj.rows[i]; if (!r) return;
    if (t.dataset.k) { r[t.dataset.k] = t.type === 'checkbox' ? t.checked : (t.type === 'number' ? Number(t.value) : t.value); }
    else if (t.dataset.ex) { r.existente[t.dataset.ex] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.ex === 'activo') { renderRows(); } }
    else if (t.dataset.ec) {
      const c = r.existente.conductores[Number(t.dataset.j)];
      c[t.dataset.ec] = t.dataset.ec === 'cableId' ? t.value : Number(t.value);
      if (t.dataset.ec === 'cableId') { const cb = S.cables.find(x => x.id === t.value); if (cb) c.diam = cb.diamHaz; renderRows(); }
    }
    recalc(); if (t.dataset.k === 'vano' || t.dataset.k === 'angulo') renderRows();
  });
  tb.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return; const i = Number(b.dataset.i); const r = S.proj.rows[i];
    if (b.dataset.act === 'del') { if (S.proj.rows.length <= 2) { toast('El trazado necesita al menos dos apoyos.'); return; } S.proj.rows.splice(i, 1); if (S.proj.geo) S.proj.geo.pts.splice(i, 1); S.openEx = null; }
    if (b.dataset.act === 'ex') { S.openEx = S.openEx === i ? null : i; }
    if (b.dataset.act === 'exadd') r.existente.conductores.push({ cableId: '', az: 90, tense: 400, vano: 30, diam: 30.4, depth: S.proj.ctx.depthAmarre });
    if (b.dataset.act === 'exdel') r.existente.conductores.splice(Number(b.dataset.j), 1);
    renderRows(); recalc();
  });
  $('#addRow').addEventListener('click', () => {
    if (S.proj.modo === 'kml') { toast('Con un trazado importado, edita el KML o vuelve a importarlo. Puedes eliminar apoyos sobrantes.'); return; }
    S.proj.rows.push(newRow()); renderRows(); recalc();
  });
}

/* ---------- Nodos (coordenadas) ---------- */
function currentNodes() {
  const rows = S.proj.rows;
  let nodes;
  if (S.proj.modo === 'kml' && S.proj.geo) nodes = S.proj.geo.pts.map(p => ({ x: p.x, y: p.y }));
  else nodes = E.nodesFromManual(rows, Number(S.proj.ctx.rumbo0) || 0);
  nodes.forEach((n, i) => { const r = rows[i]; Object.assign(n, { funcion: r.funcion, alturaFija: r.alturaFija, modeloFijo: r.modeloFijo, cruce: r.cruce, existente: r.existente }); });
  return nodes;
}

/* ---------- Cálculo ---------- */
function recalc() {
  const cable = S.cables.find(c => c.id === S.proj.cableId);
  const zh = $('#zonaHint'); zh.textContent = S.proj.geo?.altMax != null ? `Cota máxima del KML: ${fmt(S.proj.geo.altMax)} m` : '';
  if (!cable || !S.poles.length || S.proj.rows.length < 2) { S.calc = null; renderResults(); return; }
  const nodes = currentNodes();
  try { S.calc = E.calcular({ nodes, cable, ctx: S.proj.ctx, poles: S.poles }); S.calc.nodes = nodes; S.calc.cable = cable; S.calc.bud = E.presupuesto(S.calc, nodes, cable, S.precios, S.proj.ctx.terreno); }
  catch (e) { console.error(e); S.calc = null; toast('Error de cálculo: ' + e.message); }
  renderResults();
}
function statusOf(r, i) {
  const ex = S.proj.rows[i]?.existente?.activo;
  if (ex && r.existenteCheck && r.existenteCheck.ok) return { cls: 'ok', txt: 'Existente válido', col: 'ok' };
  if (!r.elegido) return { cls: 'bad', txt: 'Sin apoyo válido', col: 'bad' };
  if (ex) return { cls: 'warn', txt: r.existenteCheck ? 'Sustituir existente' : 'Existente sin datos', col: 'warn' };
  return { cls: 'ok', txt: 'Válido', col: 'ok' };
}
function utilBar(u) { const p = Math.min(100, u * 100); const c = u > 1 ? 'b' : u > 0.9 ? 'w' : ''; return `<div class="bar" title="${fmt(u * 100)} %"><i class="${c}" style="width:${p}%"></i></div>`; }
function renderResults() {
  const c = S.calc;
  const ids = ['#cantTable', '#resTable', '#budTable'];
  if (!c) {
    const msg = !S.loaded.apoyos || !S.loaded.cables ? 'Cargando las bases de apoyos y cables…' : 'Completa el trazado (al menos dos apoyos) y elige un cable.';
    ids.forEach(id => $(id).innerHTML = `<tbody><tr><td class="empty">${msg}</td></tr></tbody>`);
    $('#kpis').innerHTML = ''; drawMap(); return;
  }
  const H = c.hyp;
  $('#cantTable').innerHTML = `<thead><tr><th>Cantón</th><th class="n">Vanos</th><th class="n">Long. (m)</th><th class="n">a regul. (m)</th><th>Gobierna</th>
    ${H.all.map(h => `<th class="n" title="${h.nombre}">T ${h.id} (daN)</th>`).join('')}<th class="n">CS</th><th class="n">EDS %</th></tr></thead><tbody>
    ${c.cantones.map((cn, k) => `<tr><td>C${k + 1} · A${cn.spans[0].i + 1}–A${cn.spans[cn.spans.length - 1].i + 2}</td><td class="n">${cn.spans.length}</td><td class="n">${fmt(cn.longitud, 1)}</td><td class="n">${fmt(cn.ar, 1)}</td>
      <td>${H.all.find(h => h.id === cn.gobierna).nombre}</td>${H.all.map(h => `<td class="n">${fmt(cn.T[h.id])}</td>`).join('')}<td class="n">${fmt(cn.cs, 2)}</td><td class="n">${fmt(cn.edsPct, 1)}</td></tr>`).join('')}</tbody>`;

  $('#resTable').innerHTML = `<thead><tr><th>Apoyo</th><th>Función</th><th class="n">Desvío</th><th>Apoyo elegido</th><th class="n">F princ. (daN)</th><th class="n">F sec. (daN)</th><th>Utilización</th><th class="n">Amarre mín. (m)</th><th>Estado</th></tr></thead><tbody>
    ${c.results.map((r, i) => {
      const st = statusOf(r, i), e = r.elegido, ev = e && e.r;
      const ex = S.proj.rows[i].existente.activo && r.existenteCheck;
      const shown = ex && r.existenteCheck.ok ? r.existenteCheck : e;
      const p = shown?.pole, rr = shown?.r;
      let row = `<tr data-i="${i}" class="${S.sel === i ? 'sel' : ''}" style="cursor:pointer"><td><b>A${i + 1}</b></td><td>${FUNCS[r.func]}</td><td class="n">${i && i < c.results.length - 1 ? fmt(r.desvio, 1) + '°' : '—'}</td>
        <td class="mono">${p ? poleLabel(p) : '—'}</td><td class="n">${rr ? fmt(rr.Fp) + ' / ' + fmt(p.En) : '—'}</td><td class="n">${rr ? fmt(rr.Fs) + ' / ' + fmt(p.Es) : '—'}</td>
        <td>${rr ? utilBar(rr.u) : ''}</td><td class="n">${fmt(r.need, 2)}</td><td><span class="chip ${st.cls}">${st.txt}</span></td></tr>`;
      if (S.sel === i) row += `<tr><td colspan="9" class="detail">${detailHtml(r, i)}</td></tr>`;
      return row;
    }).join('')}</tbody>`;

  const b = c.bud;
  $('#budTable').innerHTML = `<thead><tr><th>Concepto</th><th>Ud</th><th class="n">Cantidad</th><th class="n">Coste</th><th class="n">Venta</th></tr></thead><tbody>
    ${b.lineas.map(l => `<tr><td>${esc(l.concepto)} ${l.sinPrecio ? '<span class="chip warn">sin precio</span>' : ''}</td><td>${l.ud}</td><td class="n">${fmt(l.cant, l.ud === 'ud' ? 0 : 1)}</td><td class="n">${eur(l.coste)}</td><td class="n">${eur(l.venta)}</td></tr>`).join('')}
    <tr><td colspan="3"><b>Total</b></td><td class="n"><b>${eur(b.tot.coste)}</b></td><td class="n"><b>${eur(b.tot.venta)}</b></td></tr>
    <tr><td colspan="3">Margen</td><td class="n" colspan="2">${eur(b.tot.venta - b.tot.coste)}${b.tot.venta ? ' · ' + fmt((b.tot.venta - b.tot.coste) / b.tot.venta * 100, 1) + ' %' : ''}</td></tr></tbody>`;

  const L = c.spans.reduce((t, s) => t + s.a, 0), nBad = c.results.filter((r, i) => statusOf(r, i).cls === 'bad').length;
  $('#kpis').innerHTML = [
    ['Longitud', fmt(L, 1) + ' m'], ['Apoyos', c.results.length], ['Tense máx.', fmt(c.Tmax) + ' daN'], ['Vano máx.', fmt(Math.max(...c.spans.map(s => s.a)), 1) + ' m'],
    ['Flecha máx.', fmt(Math.max(...c.spans.map(s => s.fmax)), 2) + ' m'], ['Venta', eur(b.tot.venta)]
  ].map(([k, v]) => `<div class="kpi"><b>${v}</b><span>${k}</span></div>`).join('');
  const w = [];
  if (nBad) w.push(`<div class="banner bad">${nBad} apoyo(s) sin modelo válido en la base. Añade apoyos de mayor esfuerzo o altura, reduce el tense o acorta los vanos.</div>`);
  if (b.lineas.some(l => l.sinPrecio)) w.push('<div class="banner warn">Hay partidas sin precio. Complétalos en las bases de apoyos y cables y en Precios auxiliares.</div>');
  if (c.Tmax < c.TmaxReg - 0.5) w.push(`<div class="banner info">Tense reducido a ${fmt(c.Tmax)} daN (máximo reglamentario ${fmt(c.TmaxReg)} daN).</div>`);
  const keep = S.dbMissingShown ? $('#warnings').querySelector('.banner.bad')?.outerHTML || '' : '';
  $('#warnings').innerHTML = keep + w.join('');
  drawMap();
}
function detailHtml(r, i) {
  const c = S.calc, e = r.elegido, x = r.existenteCheck;
  const hypName = id => c.hyp.all.find(h => h.id === id)?.nombre || id;
  const block = (title, sel) => {
    if (!sel || !sel.r) return '';
    const rr = sel.r, p = sel.pole;
    return `<h4 style="margin:4px 0 6px;font-family:var(--f-display)">${title}: ${poleLabel(p)}</h4><dl>
      <dt>Hipótesis pésima</dt><dd>${hypName(rr.hyp)}${rr.viento != null ? ' · viento a ' + fmt(rr.viento) + '°' : ''}</dd>
      <dt>Eje principal orientado a</dt><dd>${fmt(rr.phi)}° (acimut)</dd>
      <dt>Esfuerzo principal</dt><dd>${fmt(rr.Fp)} de ${fmt(p.En)} daN</dd>
      <dt>Esfuerzo secundario</dt><dd>${fmt(rr.Fs)} de ${fmt(p.Es)} daN</dd>
      <dt>Utilización</dt><dd>${fmt(rr.u * 100, 1)} %</dd>
      <dt>Altura libre / amarre</dt><dd>${fmt(rr.Hl, 2)} / ${fmt(rr.Hl - S.proj.ctx.depthAmarre, 2)} m</dd></dl>`;
  };
  const conds = r.conds.map(cd => `${cd.existente ? 'Existente' : 'Nuevo'} · acimut ${fmt(cd.az)}° · vano ${fmt(cd.a, 1)} m · T(V15) ${fmt(cd.T.V15)} daN`).join('<br>');
  return `${x ? block('Apoyo existente' + (x.ok ? ' (válido)' : ' (no válido)'), x) : ''}${x && x.orientacionSupuesta ? '<p class="note">Orientación del existente desconocida: se ha supuesto la más favorable. Indica el acimut real para comprobarlo.</p>' : ''}
    ${(!x || !x.ok) ? block(x ? 'Apoyo de sustitución propuesto' : 'Apoyo elegido', e) : ''}
    <dl style="margin-top:6px"><dt>Altura mínima de amarre</dt><dd>${fmt(r.need, 2)} m (distancia al suelo + flecha máxima)</dd><dt>Carga vertical (conductores nuevos)</dt><dd>${fmt(r.vert)} daN</dd></dl>
    <p class="mono" style="margin:6px 0 0">${conds}</p>`;
}

/* ---------- Plano ---------- */
function drawMap() {
  const cv = $('#map'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, Hh = cv.clientHeight;
  if (!W) return;
  cv.width = W * dpr; cv.height = Hh * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cs = getComputedStyle(document.documentElement), col = n => cs.getPropertyValue(n).trim();
  g.fillStyle = col('--map'); g.fillRect(0, 0, W, Hh);
  const nodes = S.calc?.nodes || (S.proj.rows.length > 1 ? currentNodes() : []);
  if (nodes.length < 2) return;
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const pad = 46, sc = Math.min((W - 2 * pad) / Math.max(maxx - minx, 1), (Hh - 2 * pad) / Math.max(maxy - miny, 1));
  const ox = W / 2 - (minx + maxx) / 2 * sc, oy = Hh / 2 + (miny + maxy) / 2 * sc;
  const P = n => [ox + n.x * sc, oy - n.y * sc];
  // Cuadrícula
  const step = niceStep(80 / sc); g.strokeStyle = col('--grid'); g.lineWidth = 1;
  for (let x = Math.floor((-ox / sc) / step) * step; x * sc + ox < W; x += step) { g.beginPath(); g.moveTo(ox + x * sc, 0); g.lineTo(ox + x * sc, Hh); g.stroke(); }
  for (let y = Math.floor(((oy - Hh) / sc) / step) * step; oy - y * sc > 0; y += step) { g.beginPath(); g.moveTo(0, oy - y * sc); g.lineTo(W, oy - y * sc); g.stroke(); }
  // Línea
  g.strokeStyle = col('--accent'); g.lineWidth = 2.5; g.beginPath(); nodes.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  // Vanos
  g.font = '11px ' + col('--f-mono'); g.fillStyle = col('--muted'); g.textAlign = 'center';
  for (let i = 0; i < nodes.length - 1; i++) { const [x1, y1] = P(nodes[i]), [x2, y2] = P(nodes[i + 1]); const a = Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].y - nodes[i].y); g.fillText(fmt(a, 1) + ' m', (x1 + x2) / 2, (y1 + y2) / 2 - 6); }
  // Existentes: conductores
  nodes.forEach((n, i) => {
    const ex = n.existente; if (!ex?.activo) return; const [x, y] = P(n);
    g.strokeStyle = col('--muted'); g.setLineDash([5, 4]); g.lineWidth = 1.5;
    (ex.conductores || []).forEach(c => { const u = { x: Math.sin(c.az * Math.PI / 180), y: Math.cos(c.az * Math.PI / 180) }; g.beginPath(); g.moveTo(x, y); g.lineTo(x + u.x * 40, y - u.y * 40); g.stroke(); });
    g.setLineDash([]);
  });
  // Apoyos
  nodes.forEach((n, i) => {
    const [x, y] = P(n); const r = S.calc?.results[i]; const st = r ? statusOf(r, i) : { col: 'muted' };
    g.fillStyle = col('--' + (st.col === 'muted' ? 'muted' : st.col)); g.strokeStyle = col('--panel'); g.lineWidth = 2;
    g.beginPath(); g.rect(x - 6, y - 6, 12, 12); g.fill(); g.stroke();
    if (S.sel === i) { g.strokeStyle = col('--ink'); g.lineWidth = 2; g.strokeRect(x - 10, y - 10, 20, 20); }
    g.fillStyle = col('--ink'); g.font = '600 12px ' + col('--f-body'); g.textAlign = 'left'; g.fillText('A' + (i + 1), x + 9, y - 8);
    const p = r && (r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole);
    if (p) { g.fillStyle = col('--muted'); g.font = '10px ' + col('--f-mono'); g.fillText(poleLabel(p), x + 9, y + 15); }
  });
  // Escala y norte
  const sl = niceStep(120 / sc); g.strokeStyle = col('--ink'); g.lineWidth = 2; g.beginPath(); g.moveTo(14, Hh - 16); g.lineTo(14 + sl * sc, Hh - 16); g.stroke();
  g.fillStyle = col('--ink'); g.font = '11px ' + col('--f-mono'); g.textAlign = 'left'; g.fillText(fmt(sl) + ' m', 14, Hh - 22);
  g.textAlign = 'center'; g.font = '600 12px ' + col('--f-body'); g.fillText('N', W - 20, 20); g.beginPath(); g.moveTo(W - 20, 26); g.lineTo(W - 25, 40); g.lineTo(W - 15, 40); g.closePath(); g.fill();
  $('#mapInfo').textContent = S.proj.modo === 'kml' && S.proj.geo ? `ETRS89 · UTM huso ${S.proj.geo.zone}` : 'Coordenadas locales (entrada manual)';
  S.mapT = { P, nodes };
}
function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
function bindMap() {
  $('#map').addEventListener('click', ev => {
    if (!S.mapT) return; const rc = ev.target.getBoundingClientRect(); const mx = ev.clientX - rc.left, my = ev.clientY - rc.top;
    let best = -1, bd = 18; S.mapT.nodes.forEach((n, i) => { const [x, y] = S.mapT.P(n); const d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) { S.sel = S.sel === best ? null : best; renderRows(); renderResults(); }
  });
  $('#resTable').addEventListener('click', ev => { const tr = ev.target.closest('tr[data-i]'); if (!tr) return; const i = Number(tr.dataset.i); S.sel = S.sel === i ? null : i; renderRows(); renderResults(); });
  window.addEventListener('resize', () => drawMap());
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', drawMap);
}

/* ---------- Importación KML / KMZ ---------- */
async function importFile(file) {
  try {
    let text;
    if (/\.kmz$/i.test(file.name)) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const kml = Object.values(zip.files).find(f => /\.kml$/i.test(f.name));
      if (!kml) throw new Error('El KMZ no contiene ningún archivo .kml');
      text = await kml.async('string');
    } else text = await file.text();
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('El archivo no es un KML válido');
    const parseCoords = s => s.trim().split(/\s+/).map(t => t.split(',').map(Number)).filter(a => a.length >= 2 && !isNaN(a[0]) && !isNaN(a[1])).map(([lon, lat, alt]) => ({ lat, lon, alt: isNaN(alt) ? null : alt }));
    const lines = [...doc.getElementsByTagNameNS('*', 'LineString')].map(ls => {
      const pm = ls.closest('Placemark'); const nm = pm?.getElementsByTagNameNS('*', 'name')[0]?.textContent || 'Línea';
      return { nombre: nm, pts: parseCoords(ls.getElementsByTagNameNS('*', 'coordinates')[0]?.textContent || '') };
    }).filter(l => l.pts.length >= 2);
    const points = [...doc.getElementsByTagNameNS('*', 'Placemark')].filter(pm => pm.getElementsByTagNameNS('*', 'Point').length).map(pm => {
      const c = parseCoords(pm.getElementsByTagNameNS('*', 'coordinates')[0]?.textContent || '')[0];
      return c ? { ...c, nombre: pm.getElementsByTagNameNS('*', 'name')[0]?.textContent || '' } : null;
    }).filter(Boolean);
    const opts = lines.map((l, k) => ({ label: `${l.nombre} · ${l.pts.length} vértices`, pts: l.pts }));
    if (points.length >= 2) opts.push({ label: `Puntos del archivo como apoyos (${points.length}, en orden)`, pts: points, sinDividir: true });
    if (!opts.length) throw new Error('No se ha encontrado ninguna línea (LineString) ni puntos en el archivo');
    if (opts.length === 1) applyTrace(opts[0], file.name);
    else {
      const box = $('#kmlPick'); box.hidden = false;
      box.innerHTML = `<div class="banner info">El archivo tiene varios elementos. Elige cuál define el trazado:</div><div class="row" style="margin-top:6px">${opts.map((o, k) => `<button class="btn small" data-k="${k}">${esc(o.label)}</button>`).join('')}</div>`;
      box.onclick = ev => { const b = ev.target.closest('button[data-k]'); if (!b) return; box.hidden = true; applyTrace(opts[Number(b.dataset.k)], file.name); };
    }
  } catch (e) { toast('No se pudo importar: ' + e.message); }
}
function applyTrace(opt, fname) {
  const ctx = S.proj.ctx; const zone = E.utmFromLatLon(opt.pts[0].lat, opt.pts[0].lon).zone;
  let pts = opt.pts.map(p => ({ ...p, ...E.utmFromLatLon(p.lat, p.lon, zone), vertice: true }));
  if (ctx.dividir && !opt.sinDividir && ctx.vanoMax > 0) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y), k = Math.ceil(d / ctx.vanoMax - 1e-9);
      for (let j = 1; j < k; j++) {
        const x = a.x + (b.x - a.x) * j / k, y = a.y + (b.y - a.y) * j / k, ll = E.latLonFromUtm(x, y, zone);
        out.push({ x, y, lat: ll.lat, lon: ll.lon, alt: a.alt != null && b.alt != null ? a.alt + (b.alt - a.alt) * j / k : null, vertice: false });
      }
      out.push(b);
    }
    pts = out;
  }
  const alts = pts.map(p => p.alt).filter(v => v != null && v !== 0);
  const altMax = alts.length ? Math.max(...alts) : null;
  S.proj.geo = { zone, pts, fuente: fname, altMax };
  S.proj.modo = 'kml';
  S.proj.rows = pts.map(() => newRow());
  if (!S.proj.nombre || /^Ejemplo/.test(S.proj.nombre)) { S.proj.nombre = fname.replace(/\.(kml|kmz)$/i, ''); $('#p_nombre').value = S.proj.nombre; }
  if (altMax != null) { const z = altMax > 1000 ? 'C' : altMax > 500 ? 'B' : 'A'; if (z !== ctx.zona) { ctx.zona = z; $('#p_zona').value = z; toast(`Zona ${z} asignada por la cota máxima del KML (${fmt(altMax)} m). Revísala.`); } }
  const vert = pts.filter(p => p.vertice).length;
  $('#geoInfo').hidden = false;
  $('#geoInfo').innerHTML = `Trazado importado de <b>${esc(fname)}</b>: ${vert} vértices${pts.length > vert ? `, ${pts.length - vert} apoyos intercalados (vano máx. ${fmt(ctx.vanoMax)} m)` : ''}. ETRS89 UTM huso ${zone}. <button class="btn small" id="toManual">Pasar a entrada manual</button>`;
  $('#toManual').onclick = toManual;
  S.sel = null; S.openEx = null; renderRows(); recalc();
}
function toManual() {
  const nodes = currentNodes(); const spans = E.buildGeometry(nodes);
  S.proj.rows.forEach((r, i) => { r.vano = i ? Math.round(spans[i - 1].a * 10) / 10 : 0; r.angulo = Math.round((nodes[i].desvio || 0) * 10) / 10; });
  S.proj.ctx.rumbo0 = Math.round(spans[0].az); $('#p_rumbo0').value = S.proj.ctx.rumbo0;
  S.proj.modo = 'manual'; S.proj.geo = null; $('#geoInfo').hidden = true; renderRows(); recalc();
}

/* ---------- Exportación ---------- */
const ascii = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');
function dxf(c) {
  const geo = S.proj.modo === 'kml' && S.proj.geo; const L = [];
  const p = (...a) => { for (let k = 0; k < a.length; k += 2) L.push(String(a[k]), String(a[k + 1])); };
  const layers = [['BT_TRAZADO', 5], ['BT_APOYOS', 1], ['BT_TEXTO_APOYOS', 7], ['BT_TEXTO_VANOS', 8], ['BT_EXISTENTE', 30]];
  p(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC');
  p(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB');
  p(0, 'TABLE', 2, 'LAYER', 70, layers.length); layers.forEach(([n, colr]) => p(0, 'LAYER', 2, n, 70, 0, 62, colr, 6, 'CONTINUOUS')); p(0, 'ENDTAB', 0, 'ENDSEC');
  p(0, 'SECTION', 2, 'ENTITIES');
  const N = c.nodes, f3 = v => v.toFixed(3);
  for (let i = 0; i < N.length - 1; i++) {
    p(0, 'LINE', 8, 'BT_TRAZADO', 10, f3(N[i].x), 20, f3(N[i].y), 30, 0, 11, f3(N[i + 1].x), 21, f3(N[i + 1].y), 31, 0);
    const mx = (N[i].x + N[i + 1].x) / 2, my = (N[i].y + N[i + 1].y) / 2; let ang = Math.atan2(N[i + 1].y - N[i].y, N[i + 1].x - N[i].x) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    p(0, 'TEXT', 8, 'BT_TEXTO_VANOS', 10, f3(mx), 20, f3(my + 0.6), 30, 0, 40, 0.8, 1, ascii(`${c.spans[i].a.toFixed(1)} m`), 50, ang.toFixed(2), 72, 1, 11, f3(mx), 21, f3(my + 0.6), 31, 0);
  }
  N.forEach((n, i) => {
    const r = c.results[i]; const pole = r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole;
    p(0, 'CIRCLE', 8, 'BT_APOYOS', 10, f3(n.x), 20, f3(n.y), 30, 0, 40, 0.5);
    p(0, 'TEXT', 8, 'BT_TEXTO_APOYOS', 10, f3(n.x + 1), 20, f3(n.y + 1), 30, 0, 40, 1.2, 1, ascii(`A${i + 1}`));
    p(0, 'TEXT', 8, 'BT_TEXTO_APOYOS', 10, f3(n.x + 1), 20, f3(n.y - 0.6), 30, 0, 40, 0.8, 1, ascii(pole ? poleLabel(pole) + (S.proj.rows[i].existente.activo ? (r.existenteCheck?.ok ? ' (existente)' : ' (sustituye)') : '') : 'SIN APOYO VALIDO'));
    const ex = n.existente; if (ex?.activo) (ex.conductores || []).forEach(cd => { const u = { x: Math.sin(cd.az * Math.PI / 180), y: Math.cos(cd.az * Math.PI / 180) }; p(0, 'LINE', 8, 'BT_EXISTENTE', 10, f3(n.x), 20, f3(n.y), 30, 0, 11, f3(n.x + u.x * 10), 21, f3(n.y + u.y * 10), 31, 0); });
  });
  if (!geo) p(0, 'TEXT', 8, 'BT_TEXTO_APOYOS', 10, f3(N[0].x), 20, f3(N[0].y - 4), 30, 0, 40, 1, 1, 'COORDENADAS LOCALES - SIN GEORREFERENCIAR');
  p(0, 'ENDSEC', 0, 'EOF');
  return L.join('\r\n') + '\r\n';
}
function kml(c) {
  const g = S.proj.geo, pts = g.pts;
  const pm = pts.map((pt, i) => {
    const r = c.results[i], pole = r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole, st = statusOf(r, i);
    const style = st.cls === 'ok' ? 'ok' : st.cls === 'warn' ? 'warn' : 'bad';
    return `<Placemark><name>A${i + 1}</name><styleUrl>#${style}</styleUrl><description><![CDATA[${FUNCS[r.func]}<br>${pole ? poleLabel(pole) : 'Sin apoyo válido'}<br>${st.txt}${pole ? `<br>Utilización ${fmt((r.existenteCheck?.ok ? r.existenteCheck.r : r.elegido.r).u * 100, 1)} %` : ''}<br>UTM ${g.zone}: ${pt.x.toFixed(2)} ; ${pt.y.toFixed(2)}]]></description><Point><coordinates>${pt.lon.toFixed(8)},${pt.lat.toFixed(8)},0</coordinates></Point></Placemark>`;
  }).join('\n');
  const st = (id, color) => `<Style id="${id}"><IconStyle><color>${color}</color><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_square.png</href></Icon></IconStyle></Style>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(S.proj.nombre)}</name>
${st('ok', 'ff4f7d2f')}${st('warn', 'ff006aa6')}${st('bad', 'ff2c36b3')}
<Style id="linea"><LineStyle><color>ff865b1d</color><width>3</width></LineStyle></Style>
<Placemark><name>Línea BT ${esc(c.cable.designacion)}</name><styleUrl>#linea</styleUrl><LineString><tessellate>1</tessellate><coordinates>${pts.map(p => `${p.lon.toFixed(8)},${p.lat.toFixed(8)},0`).join(' ')}</coordinates></LineString></Placemark>
<Folder><name>Apoyos</name>
${pm}
</Folder></Document></kml>`;
}
function geojson(c) {
  const g = S.proj.geo;
  const feats = [{ type: 'Feature', properties: { tipo: 'linea', cable: c.cable.designacion }, geometry: { type: 'LineString', coordinates: g.pts.map(p => [+p.lon.toFixed(8), +p.lat.toFixed(8)]) } }];
  g.pts.forEach((p, i) => { const r = c.results[i], pole = r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole; feats.push({ type: 'Feature', properties: { apoyo: 'A' + (i + 1), funcion: FUNCS[r.func], modelo: pole ? poleLabel(pole) : null, estado: statusOf(r, i).txt, utm_huso: g.zone, utm_x: +p.x.toFixed(2), utm_y: +p.y.toFixed(2) }, geometry: { type: 'Point', coordinates: [+p.lon.toFixed(8), +p.lat.toFixed(8)] } }); });
  return JSON.stringify({ type: 'FeatureCollection', name: S.proj.nombre, features: feats }, null, 1);
}
function csv(c) {
  const g = S.proj.modo === 'kml' && S.proj.geo; const sep = ';', n = v => String(v ?? '').replace('.', ',');
  const head = ['Apoyo', 'Funcion', 'Desvio (grados)', 'Vano anterior (m)', 'Modelo', 'Tipo', 'Esfuerzo nominal (daN)', 'Esfuerzo secundario (daN)', 'Altura (m)', 'F principal (daN)', 'F secundario (daN)', 'Utilizacion (%)', 'Eje principal (acimut)', 'Estado', 'Coste (EUR)', 'Venta (EUR)'];
  if (g) head.push(`UTM X (huso ${g.zone})`, 'UTM Y', 'Latitud', 'Longitud');
  const rows = c.results.map((r, i) => {
    const sel = r.existenteCheck?.ok ? r.existenteCheck : r.elegido; const p = sel?.pole, rr = sel?.r; const st = statusOf(r, i);
    const a = [`A${i + 1}`, FUNCS[r.func], n(r.desvio?.toFixed(1)), i ? n(c.spans[i - 1].a.toFixed(2)) : '', p ? poleLabel(p) : '', p?.tipo, p?.En, p?.Es, p?.altura, n(rr?.Fp.toFixed(0)), n(rr?.Fs.toFixed(0)), n(rr ? (rr.u * 100).toFixed(1) : ''), n(rr?.phi.toFixed(0)), st.txt, n(st.txt === 'Existente válido' ? 0 : p?.coste), n(st.txt === 'Existente válido' ? 0 : p?.venta)];
    if (g) { const pt = g.pts[i]; a.push(n(pt.x.toFixed(2)), n(pt.y.toFixed(2)), n(pt.lat.toFixed(8)), n(pt.lon.toFixed(8))); }
    return a.join(sep);
  });
  return '﻿' + [head.join(sep), ...rows].join('\r\n');
}
function informe(c) {
  const ctx = S.proj.ctx, H = c.hyp, b = c.bud;
  const td = v => `<td>${v}</td>`, tn = v => `<td class="n">${v}</td>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Anexo de cálculo · ${esc(S.proj.nombre)}</title>
<style>body{font:11pt/1.45 Arial,sans-serif;color:#111;max-width:190mm;margin:12mm auto}h1{font-size:16pt;margin:0 0 4px}h2{font-size:12pt;border-bottom:1.5px solid #111;margin-top:18px;padding-bottom:2px}table{border-collapse:collapse;width:100%;font-size:9pt;margin:6px 0}th,td{border:1px solid #999;padding:3px 5px;text-align:left}th{background:#eee}td.n{text-align:right;font-variant-numeric:tabular-nums}.s{color:#555;font-size:9pt}@media print{h2{break-after:avoid}tr{break-inside:avoid}}</style></head><body>
<h1>Anexo de cálculo mecánico de apoyos · Red aérea de baja tensión</h1>
<p class="s">${esc(S.proj.nombre)} · ${new Date().toLocaleDateString('es-ES')} · Cálculo de Apoyos BT v${VERSION}</p>
<h2>1. Normativa</h2><p>REBT (RD 842/2002), ITC-BT-06 «Redes aéreas para distribución en baja tensión». Conductores según UNE 21030-1. Postes de hormigón armado vibrado HV y HVH según UNE 207016.</p>
<h2>2. Datos de partida</h2><table><tbody>
<tr><th>Conductor</th>${td(esc(c.cable.designacion))}</tr><tr><th>Fiador</th>${td(`${c.cable.secFiador} mm² Almelec · carga de rotura ${fmt(c.cable.roturaFiador)} daN · E ${fmt(c.cable.moduloE)} daN/mm² · α ${c.cable.alpha}·10⁻⁶ °C⁻¹`)}</tr>
<tr><th>Peso / diámetro del haz</th>${td(`${fmt(c.cp.w, 3)} daN/m · ${fmt(c.cable.diamHaz, 1)} mm`)}</tr><tr><th>Zona</th>${td(ctx.zona)}</tr>
<tr><th>Tracción máxima</th>${td(`${fmt(c.Tmax)} daN (coef. de seguridad ${fmt(c.cable.roturaFiador / c.Tmax, 2)})${ctx.sobreEdificios ? ' · red sobre edificaciones: coeficiente incrementado un 25 %' : ''}`)}</tr>
<tr><th>Sobrecargas</th>${td(`Viento ${fmt(H.pv, 3)} daN/m (50 daN/m²)${H.H2.ice ? ` · hielo ${fmt(H.H2.ice, 3)} daN/m` : ''}`)}</tr>
<tr><th>Hipótesis</th>${td(H.all.map(h => `${h.id}: ${h.nombre}, peso aparente ${fmt(h.p, 3)} daN/m`).join('<br>'))}</tr>
<tr><th>Desequilibrio en alineación</th>${td(ctx.desequilibrio + ' % (la ITC-BT-06 no fija valor)')}</tr><tr><th>Terreno</th>${td(ctx.terreno)}</tr></tbody></table>
<h2>3. Cantones y tensiones</h2><table><thead><tr><th>Cantón</th><th>Vanos</th><th>a regulación (m)</th>${H.all.map(h => `<th>T ${h.id} (daN)</th>`).join('')}<th>EDS %</th></tr></thead><tbody>
${c.cantones.map((cn, k) => `<tr>${td('C' + (k + 1))}${td(cn.spans.map(s => `A${s.i + 1}–A${s.i + 2}`).join(', '))}${tn(fmt(cn.ar, 1))}${H.all.map(h => tn(fmt(cn.T[h.id]))).join('')}${tn(fmt(cn.edsPct, 1))}</tr>`).join('')}</tbody></table>
<h2>4. Vanos y flechas</h2><table><thead><tr><th>Vano</th><th>Longitud (m)</th>${[H.H1, H.H2, H.H3].map(h => `<th>Flecha ${h.id} (m)</th>`).join('')}<th>Dist. mínima (m)</th></tr></thead><tbody>
${c.spans.map(s => `<tr>${td(`A${s.i + 1}–A${s.i + 2}${s.cruce ? ' (cruce)' : ''}`)}${tn(fmt(s.a, 2))}${[H.H1, H.H2, H.H3].map(h => tn(fmt(s.flechas[h.id], 2))).join('')}${tn(fmt(s.dmin, 1))}</tr>`).join('')}</tbody></table>
<h2>5. Apoyos</h2><table><thead><tr><th>Apoyo</th><th>Función</th><th>Modelo</th><th>Hipótesis pésima</th><th>F princ./En (daN)</th><th>F sec./Es (daN)</th><th>Util. %</th><th>Eje principal</th><th>Estado</th></tr></thead><tbody>
${c.results.map((r, i) => { const sel = r.existenteCheck?.ok ? r.existenteCheck : r.elegido, p = sel?.pole, rr = sel?.r; return `<tr>${td('A' + (i + 1))}${td(FUNCS[r.func])}${td(p ? poleLabel(p) : '—')}${td(rr ? H.all.find(h => h.id === rr.hyp).nombre : '—')}${tn(rr ? fmt(rr.Fp) + ' / ' + fmt(p.En) : '—')}${tn(rr ? fmt(rr.Fs) + ' / ' + fmt(p.Es) : '—')}${tn(rr ? fmt(rr.u * 100, 1) : '—')}${tn(rr ? fmt(rr.phi) + '°' : '—')}${td(statusOf(r, i).txt)}</tr>`; }).join('')}</tbody></table>
<p class="s">Esfuerzos referidos a 0,25 m bajo cogolla por igualdad de momentos en el empotramiento; esfuerzos nominales con coeficiente de seguridad 2,5 incluido (ITC-BT-06, tabla 2). Viento sobre el fuste ${ctx.vientoPoste ? 'incluido (100 daN/m²)' : 'no incluido'}.</p>
<h2>6. Presupuesto</h2><table><thead><tr><th>Concepto</th><th>Ud</th><th>Cantidad</th><th>Coste</th><th>Venta</th></tr></thead><tbody>
${b.lineas.map(l => `<tr>${td(esc(l.concepto))}${td(l.ud)}${tn(fmt(l.cant, l.ud === 'ud' ? 0 : 1))}${tn(eur(l.coste))}${tn(eur(l.venta))}</tr>`).join('')}
<tr><th colspan="3">Total</th>${tn('<b>' + eur(b.tot.coste) + '</b>')}${tn('<b>' + eur(b.tot.venta) + '</b>')}</tr></tbody></table></body></html>`;
}
function leeme(c) {
  const g = S.proj.modo === 'kml' && S.proj.geo; const base = fileBase(); const z = g ? g.zone : 29;
  const L = [`PAQUETE DE EXPORTACION - ${ascii(S.proj.nombre)}`, `Generado con Calculo de Apoyos BT v${VERSION} el ${ascii(new Date().toLocaleString('es-ES'))}`, '',
    g ? `Sistema de coordenadas: ETRS89 / UTM huso ${z}N (EPSG:258${z}), el mismo que usa la cartografia catastral en la peninsula.`
      : 'ATENCION: trazado introducido a mano. El DXF esta en coordenadas locales (origen en A1) y no se puede superponer al Catastro sin georreferenciarlo. Importa un KML/KMZ para obtener coordenadas reales.', '',
    'ARCHIVOS',
    `- ${base}.dxf: trazado, apoyos y textos por capas (BT_TRAZADO, BT_APOYOS, BT_TEXTO_APOYOS, BT_TEXTO_VANOS, BT_EXISTENTE). Unidades: metros.`,
    g ? `- ${base}.kml: trazado y apoyos para Google Earth (WGS84).` : null,
    g ? `- ${base}.geojson: trazado y apoyos para QGIS (WGS84).` : null,
    `- ${base}_apoyos.csv: tabla de apoyos (separador punto y coma) para Excel.`,
    `- ${base}_anexo_calculo.html: anexo de calculo. Abrelo en el navegador e imprimelo a PDF.`, '',
    'SUPERPONER SOBRE CATASTRO', '',
    'AutoCAD:',
    '  1. Descarga la cartografia catastral vectorial del municipio en la Sede Electronica del Catastro (www.sedecatastro.gob.es, Descarga de cartografia).',
    '  2. Trabaja en el mismo sistema ETRS89 UTM del paquete.',
    `  3. Inserta ${base}.dxf con INSERTAR en el punto 0,0,0, escala 1 y rotacion 0, o copialo y pegalo en coordenadas originales.`, '',
    'QGIS:',
    '  1. Capa > Anadir capa > Anadir capa WMS. Servicio WMS del Catastro: http://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx',
    '  2. Anade la capa Catastro.',
    `  3. Arrastra ${base}.geojson al mapa (o el DXF, indicando EPSG:258${z}).`, '',
    'Google Earth Pro:',
    `  1. Abre ${base}.kml.`,
    '  2. Opcional: Anadir > Superposicion de imagen > Actualizar > Parametros WMS, con la URL del WMS del Catastro indicada arriba.', '',
    'Comprueba siempre la superposicion con puntos de control conocidos antes de usarla en un proyecto.'];
  return L.filter(l => l !== null).join('\r\n') + '\r\n';
}
function fileBase() { const g = S.proj.modo === 'kml' && S.proj.geo; return ascii(S.proj.nombre || 'linea_bt').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').slice(0, 60) + (g ? `_ETRS89_UTM${g.zone}` : '_local'); }
async function exportZip() {
  const c = S.calc; if (!c) { toast('No hay resultados que exportar.'); return; }
  const dl = await window.claude?.use?.('downloads').catch(() => null);
  if (!dl) { toast('La descarga de archivos no está disponible en esta vista.'); return; }
  const zip = new JSZip(), base = fileBase(), g = S.proj.modo === 'kml' && S.proj.geo;
  zip.file(base + '.dxf', dxf(c));
  if (g) { zip.file(base + '.kml', kml(c)); zip.file(base + '.geojson', geojson(c)); }
  zip.file(base + '_apoyos.csv', csv(c)); zip.file(base + '_anexo_calculo.html', informe(c)); zip.file('LEEME.txt', leeme(c));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  try { await dl.save({ filename: base + '.zip', data: blob }); toast('Paquete guardado.'); }
  catch (e) { if (e.code !== 'declined') toast('No se pudo guardar el archivo: ' + (e.message || e.code)); }
}

/* ---------- Proyectos ---------- */
async function saveProject() {
  if (!S.db) { toast('Sin conexión a la base de datos.'); return; }
  const data = { nombre: S.proj.nombre || 'Sin nombre', fecha: new Date().toISOString(), datos: JSON.stringify({ ...S.proj, id: undefined }) };
  try {
    if (S.proj.id) await S.db.doc('proyectos/' + S.proj.id).set(data);
    else { const ref = await S.db.collection('proyectos').add(data); S.proj.id = ref.id; }
    toast('Proyecto guardado.');
  } catch (e) { toast('No se pudo guardar: ' + (e.message || e.code)); }
}
function renderProjList() {
  const box = $('#projList');
  if (!S.projs.length) { box.innerHTML = '<p class="note">Aún no hay proyectos guardados. Pulsa «Guardar proyecto» para conservar el trazado y los datos de cálculo.</p>'; return; }
  box.innerHTML = `<div class="tablewrap"><table><tbody>${S.projs.map(p => `<tr><td>${esc(p.nombre)}</td><td class="note">${p.fecha ? new Date(p.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : ''}</td>
    <td><button class="btn small" data-load="${esc(p.id)}">Abrir</button></td><td>${S.delConfirm === p.id ? `<button class="btn small" data-del="${esc(p.id)}" style="color:var(--bad)">Confirmar borrado</button>` : `<button class="btn small ghost" data-askdel="${esc(p.id)}" aria-label="Borrar proyecto">✕</button>`}</td></tr>`).join('')}</tbody></table></div>`;
}
function bindProjects() {
  $('#saveProj').onclick = saveProject;
  $('#newProj').onclick = () => { S.proj = exampleProject(); S.proj.nombre = ''; S.proj.rows = [newRow(), newRow()]; S.proj.rows[0].vano = 0; $('#geoInfo').hidden = true; loadForm(); renderRows(); recalc(); };
  $('#projList').addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.load) { const p = S.projs.find(x => x.id === b.dataset.load); try { const d = JSON.parse(p.datos); S.proj = { ...exampleProject(), ...d, ctx: { ...DEF_CTX, ...d.ctx }, id: p.id }; } catch (e) { toast('El proyecto guardado está dañado.'); return; }
      $('#geoInfo').hidden = !S.proj.geo; if (S.proj.geo) $('#geoInfo').innerHTML = `Trazado de <b>${esc(S.proj.geo.fuente)}</b> · ETRS89 UTM huso ${S.proj.geo.zone}.`; S.sel = null; S.openEx = null; loadForm(); renderRows(); recalc(); toast('Proyecto abierto.'); }
    if (b.dataset.askdel) { S.delConfirm = b.dataset.askdel; renderProjList(); }
    if (b.dataset.del) { try { await S.db.doc('proyectos/' + b.dataset.del).delete(); S.delConfirm = null; toast('Proyecto borrado.'); } catch (e) { toast('No se pudo borrar: ' + (e.message || e.code)); } }
  });
}

/* ---------- Bases editables ---------- */
const POLE_COLS = [['tipo', 'Tipo', 'text'], ['En', 'Nominal'], ['Es', 'Secund.'], ['altura', 'Altura (m)'], ['cogA', 'Cogolla A'], ['cogB', 'Cogolla B'], ['conA', 'Conic. A'], ['conB', 'Conic. B'], ['empFlojo', 'Emp. flojo'], ['empNormal', 'Emp. normal'], ['empFuerte', 'Emp. fuerte'], ['cimA', 'Cim. A (m)'], ['pesoKg', 'Peso (kg)'], ['coste', 'Coste (€)'], ['venta', 'Venta (€)']];
const CABLE_COLS = [['designacion', 'Designación', 'text'], ['secFase', 'Secc. fase'], ['diamHaz', 'Ø haz (mm)'], ['diamFase', 'Ø fase (mm)'], ['pesoKgKm', 'Peso (kg/km)'], ['secFiador', 'Secc. fiador'], ['roturaFiador', 'Rotura (daN)'], ['moduloE', 'E (daN/mm²)'], ['alpha', 'α (10⁻⁶/°C)'], ['coste', 'Coste (€/m)'], ['venta', 'Venta (€/m)']];
function dbTable(sel, rows, cols, coll) {
  const t = $(sel);
  if (!rows.length) { t.innerHTML = `<tbody><tr><td class="empty">${S.db ? 'La base está vacía. Añade el primer elemento.' : 'Cargando la base…'}</td></tr></tbody>`; return; }
  t.innerHTML = `<thead><tr>${cols.map(c => `<th class="${c[2] ? '' : 'n'}">${c[1]}</th>`).join('')}<th>Activo</th><th></th></tr></thead><tbody>${rows.map(r => `<tr>${cols.map(([k, , ty]) => `<td class="${ty ? '' : 'n'}"><input class="${ty ? 'txt' : 'num'}" type="${ty || 'number'}" step="any" data-coll="${coll}" data-id="${esc(r.id)}" data-f="${k}" value="${esc(r[k] ?? '')}" aria-label="${k}"></td>`).join('')}
    <td><input type="checkbox" data-coll="${coll}" data-id="${esc(r.id)}" data-f="activo" ${r.activo !== false ? 'checked' : ''} aria-label="Activo"></td>
    <td>${S.delConfirm === coll + r.id ? `<button class="btn small" data-delrow="${esc(r.id)}" data-coll="${coll}" style="color:var(--bad)">Confirmar</button>` : `<button class="btn small ghost" data-askrow="${esc(r.id)}" data-coll="${coll}" aria-label="Borrar">✕</button>`}</td></tr>`).join('')}</tbody>`;
}
function renderPoleTable() { if (document.activeElement?.closest?.('#poleTable')) return; dbTable('#poleTable', S.poles, POLE_COLS, 'apoyos'); }
function renderCableTable() { if (document.activeElement?.closest?.('#cableTable')) return; dbTable('#cableTable', S.cables, CABLE_COLS, 'cables'); }
function bindDbTables() {
  for (const sel of ['#poleTable', '#cableTable']) {
    $(sel).addEventListener('change', ev => { const t = ev.target; if (!t.dataset.f) return; updateDoc(t.dataset.coll, t.dataset.id, t.dataset.f, t.type === 'checkbox' ? t.checked : numOrStr(t.value, t.type)); });
    $(sel).addEventListener('focusout', () => setTimeout(() => { renderPoleTable(); renderCableTable(); }, 50));
    $(sel).addEventListener('click', async ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.askrow) { S.delConfirm = b.dataset.coll + b.dataset.askrow; renderPoleTable(); renderCableTable(); }
      if (b.dataset.delrow) { try { await S.db.doc(`${b.dataset.coll}/${b.dataset.delrow}`).delete(); S.delConfirm = null; } catch (e) { toast('No se pudo borrar: ' + (e.message || e.code)); } }
    });
  }
  $('#addPole').onclick = async () => { if (!S.db) return toast('Sin conexión a la base de datos.'); try { await S.db.collection('apoyos').add({ tipo: 'HV', En: 400, Es: 250, altura: 9, cogA: 140, cogB: 200, conA: 13, conB: 21, empFlojo: 1.35, empNormal: 1.25, empFuerte: 1.1, cimA: 0.8, pesoKg: 0, coste: 0, venta: 0, activo: true, orden: 999999 }); toast('Apoyo añadido al final de la tabla.'); } catch (e) { toast('No se pudo añadir: ' + (e.message || e.code)); } };
  $('#addCable').onclick = async () => { if (!S.db) return toast('Sin conexión a la base de datos.'); try { await S.db.collection('cables').add({ designacion: 'Nuevo cable', secFase: 0, diamHaz: 0, diamFase: 0, pesoKgKm: 0, secFiador: 54.6, roturaFiador: 1660, moduloE: 6200, alpha: 23, coste: 0, venta: 0, activo: true, orden: 999 }); toast('Cable añadido al final de la tabla.'); } catch (e) { toast('No se pudo añadir: ' + (e.message || e.code)); } };
}
const PRECIO_FIELDS = [['hormigonCoste', 'Hormigón cimentación · coste (€/m³)'], ['hormigonVenta', 'Hormigón cimentación · venta (€/m³)'], ['suspCoste', 'Conjunto de suspensión · coste (€)'], ['suspVenta', 'Conjunto de suspensión · venta (€)'], ['amarreCoste', 'Conjunto de amarre · coste (€)'], ['amarreVenta', 'Conjunto de amarre · venta (€)'], ['holguraCable', 'Holgura de cable (%)']];
function renderPrecios() {
  const box = $('#preciosFields'); if (box.contains(document.activeElement)) return;
  box.innerHTML = PRECIO_FIELDS.map(([k, l]) => `<label class="f">${l}<input class="num" type="number" step="any" id="pr_${k}" data-f="${k}" value="${S.precios[k] ?? 0}"></label>`).join('');
}
function bindPrecios() {
  $('#preciosFields').addEventListener('change', async ev => {
    const t = ev.target; if (!t.dataset.f || !S.db) return;
    try { await S.db.doc('config/precios').set({ ...S.precios, [t.dataset.f]: Number(t.value) || 0 }); } catch (e) { toast('No se guardó: ' + (e.message || e.code)); }
  });
}

/* ---------- Pestañas e inicio ---------- */
function bindTabs() {
  document.querySelectorAll('nav.tabs button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('nav.tabs button').forEach(x => x.setAttribute('aria-selected', x === b));
    ['calc', 'apoyos', 'cables', 'precios', 'norma'].forEach(t => $('#tab-' + t).hidden = t !== b.dataset.tab);
    if (b.dataset.tab === 'calc') drawMap();
  }));
}
function start() {
  $('#ver').textContent = 'v' + VERSION;
  loadForm(); bindForm(); bindRows(); bindMap(); bindProjects(); bindDbTables(); bindPrecios(); bindTabs();
  $('#kmlFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; });
  $('#exportZip').onclick = exportZip;
  $('#exportNote').textContent = 'Incluye DXF en ETRS89 UTM para superponer a la cartografía catastral, KML, GeoJSON, tabla CSV y anexo de cálculo.';
  renderRows(); renderPrecios(); renderPoleTable(); renderCableTable(); renderProjList(); recalc();
  initDb();
}
start();
