/* ===== Aplicación ===== */
const VERSION = '1.4.1';
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
  return { id: null, nombre: 'Ejemplo · línea de 4 vanos', modo: 'manual', rows, geo: null, ctx: { ...DEF_CTX }, cableId: '', zone: null, redEx: null, entronque: null, fondos: {} };
}
const S = { poles: [], cables: [], precios: { holguraCable: 3 }, proj: exampleProject(), calc: null, sel: null, db: null, projs: [], loaded: { apoyos: false, cables: false } };

/* ---------- Base de datos ---------- */
const LOCAL = !!window.LOCAL_SEED;   // versión para abrir en el PC, fuera de Claude
/* Base de datos local (navegador) con la misma interfaz mínima que la base del artefacto */
function localDb() {
  const KEY = 'calculoApoyosBT.db'; let data;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { data = null; }
  if (!data) { data = {}; (window.LOCAL_SEED || []).forEach(o => { (data[o.collection] = data[o.collection] || {})[o.doc_id] = o.data; }); }
  const subs = [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { toast('No se pudo guardar en el navegador: ' + e.message); } subs.forEach(f => f()); };
  const snapColl = c => ({ docs: Object.entries(data[c] || {}).map(([id, v]) => ({ id, data: () => ({ ...v }) })) });
  const api = {
    collection: c => ({
      onSnapshot(cb) { const f = () => cb(snapColl(c)); subs.push(f); setTimeout(f, 0); return () => { }; },
      async add(v) { const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); (data[c] = data[c] || {})[id] = v; save(); return { id }; }
    }),
    doc: path => { const [c, id] = path.split('/'); return {
      onSnapshot(cb) { const f = () => cb({ data: () => (data[c] || {})[id] ? { ...data[c][id] } : undefined }); subs.push(f); setTimeout(f, 0); return () => { }; },
      async set(v) { (data[c] = data[c] || {})[id] = v; save(); },
      async update(v) { (data[c] = data[c] || {})[id] = { ...(data[c][id] || {}), ...v }; save(); },
      async delete() { if (data[c]) delete data[c][id]; save(); } }; },
    exportAll: () => JSON.stringify({ app: 'Calculo de Apoyos BT', version: VERSION, apoyos: data.apoyos, cables: data.cables, config: data.config }, null, 1),
    importAll(j) { for (const k of ['apoyos', 'cables', 'config']) if (j[k]) data[k] = j[k]; save(); }
  };
  if (!localStorage.getItem(KEY)) save();
  return api;
}
async function saveFile(filename, blob) {
  if (LOCAL) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); return true; }
  const dl = await window.claude?.use?.('downloads').catch(() => null);
  if (!dl) { toast('La descarga de archivos no está disponible en esta vista.'); return false; }
  try { await dl.save({ filename, data: blob }); return true; } catch (e) { if (e.code !== 'declined') toast('No se pudo guardar el archivo: ' + (e.message || e.code)); return false; }
}
async function initDb() {
  if (LOCAL) { S.db = localDb(); }
  const timer = setTimeout(() => { if (!S.db) dbMissing(); }, 10000);
  let db = S.db || null;
  if (!db) try { db = await window.claude?.use?.('db'); } catch (e) { db = null; }
  clearTimeout(timer);
  if (!db) { dbMissing(); return; }
  S.db = db;
  db.collection('apoyos').onSnapshot(qs => { S.poles = qs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0)); S.loaded.apoyos = true; renderPoleTable(); renderEntronque(); recalc(); },
    e => toast('No se pudo leer la base de apoyos: ' + (e.message || e.code)));
  db.collection('cables').onSnapshot(qs => { S.cables = qs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0)); S.loaded.cables = true; fillCableSelect(); renderCableTable(); if (S.proj.entronque && !S.proj.entronque.cableId) S.proj.entronque.cableId = (S.cables.find(c => /3x95/.test(c.designacion)) || S.cables[0] || {}).id || ''; renderEntronque(); recalc(); },
    e => toast('No se pudo leer la base de cables: ' + (e.message || e.code)));
  db.doc('config/precios').onSnapshot(d => { S.precios = { holguraCable: 3, ...(d.data() || {}) }; renderPrecios(); recalc(); }, () => { });
  db.collection('proyectos').onSnapshot(qs => { S.projs = qs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')); renderProjList(); }, () => { });
}
function dbMissing() {
  if (S.dbMissingShown || LOCAL) return; S.dbMissingShown = true;
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
  if (!S.proj.rows.length) { tb.innerHTML = '<tr><td colspan="10" class="empty">Sin apoyos. Importa el trazado, créalo con coordenadas de inicio y fin o pulsa «Añadir apoyo».</td></tr>'; return; }
  tb.innerHTML = S.proj.rows.map((r, i) => {
    const vano = i === 0 ? '—' : geo ? fmt(spans[i - 1]?.a, 1) : `<input class="num" type="number" step="0.5" data-k="vano" data-i="${i}" value="${r.vano}" aria-label="Vano anterior apoyo ${i + 1}">`;
    const ang = (i === 0 || i === S.proj.rows.length - 1) ? '—' : geo ? fmt(nodes[i].desvio, 1) : `<input class="num" type="number" step="1" data-k="angulo" data-i="${i}" value="${r.angulo}" aria-label="Desvío apoyo ${i + 1}">`;
    const zc = S.calc?.conPerfil && S.calc.nodes[i]?.z != null && !(S.proj.modo === 'manual' && !S.proj.perfil) ? fmt(S.calc.nodes[i].z, 1)
      : S.proj.modo === 'manual' && !S.proj.perfil ? `<input class="num" type="number" step="0.1" data-k="cota" data-i="${i}" value="${r.cota ?? ''}" aria-label="Cota del terreno apoyo ${i + 1}">` : '—';
    const cruce = i === 0 ? '' : `<input type="checkbox" data-k="cruce" data-i="${i}" ${r.cruce ? 'checked' : ''} aria-label="Cruce en vano anterior">`;
    const fsel = `<select data-k="funcion" data-i="${i}">${Object.entries(FUNCS).map(([k, v]) => `<option value="${k}" ${r.funcion === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`;
    const hsel = `<select data-k="alturaFija" data-i="${i}"><option value="">Auto</option>${heights.map(h => `<option value="${h}" ${String(r.alturaFija) === String(h) ? 'selected' : ''}>${h} m</option>`).join('')}</select>`;
    const msel = `<select data-k="modeloFijo" data-i="${i}"><option value="">Auto</option>${S.poles.map(p => `<option value="${esc(p.id)}" ${r.modeloFijo === p.id ? 'selected' : ''}>${poleLabel(p)}</option>`).join('')}</select>`;
    const ex = `<button class="btn small" data-act="ex" data-i="${i}">${r.existente.activo ? 'Editar' : 'No'}</button>`;
    const del = `<button class="btn small ghost" data-act="del" data-i="${i}" aria-label="Eliminar apoyo ${i + 1}">✕</button>`;
    let html = `<tr class="${S.sel === i ? 'sel' : ''}"><td><b>A${i + 1}</b>${S.proj.geo?.pts?.[i]?.nombre ? `<br><span class="note">${esc(S.proj.geo.pts[i].nombre)}</span>` : ''}</td><td class="n">${vano}</td><td class="n">${ang}</td><td class="n">${zc}</td><td>${cruce}</td><td>${fsel}</td><td>${hsel}</td><td>${msel}</td><td>${ex}</td><td>${del}</td></tr>`;
    if (S.openEx === i) html += `<tr><td colspan="10">${existEditor(r, i)}</td></tr>`;
    return html;
  }).join('');
}
function existEditor(r, i) {
  const e = r.existente;
  const cabOpts = sel => `<option value="">Otro (diámetro manual)</option>` + S.cables.map(c => `<option value="${esc(c.id)}" ${sel === c.id ? 'selected' : ''}>${esc(c.designacion)}</option>`).join('');
  const auto = i === 0 && S.proj.entronque?.k != null ? `<p class="banner info" style="margin:0 0 8px">A1 es el apoyo E${S.proj.entronque.k + 1} de la línea existente: sus conductores entran solos en el cálculo (se ajustan en «Línea existente y entronque»). Aquí solo añades otros conductores que haya en el apoyo.</p>` : '';
  return `<div class="exist">${auto}
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
    if (t.dataset.k) { r[t.dataset.k] = t.type === 'checkbox' ? t.checked : (t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value); }
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
    if (S.proj.modo === 'kml') { toast('Con un trazado con coordenadas, añade apoyos en el plano: herramienta «Insertar», capa «Apoyos nuevos».'); return; }
    const r = newRow(); if (!S.proj.rows.length) r.vano = 0; S.proj.rows.push(r); renderRows(); recalc();
  });
}

/* ---------- Cálculo ---------- */
function recalc() {
  const cable = S.cables.find(c => c.id === S.proj.cableId);
  const zh = $('#zonaHint'); zh.textContent = S.proj.geo?.altMax != null ? `Cota máxima del KML: ${fmt(S.proj.geo.altMax)} m` : '';
  if (!cable || !S.poles.length || S.proj.rows.length < 2) { S.calc = null; renderResults(); return; }
  const nodes = currentNodes();
  try { const perfil = perfilPts(); S.calc = E.calcular({ nodes, cable, ctx: S.proj.ctx, poles: S.poles, perfil }); S.calc.conPerfil = !!perfil; S.calc.perfilDist = perfil && S.proj.perfil ? Math.max(...nodes.map(n => n.dPerfil || 0)) : 0; S.calc.nodes = nodes; S.calc.cable = cable; S.calc.bud = E.presupuesto(S.calc, nodes, cable, S.precios, S.proj.ctx.terreno); }
  catch (e) { console.error(e); S.calc = null; toast('Error de cálculo: ' + e.message); }
  renderResults(); renderPerfilInfo(); drawPerfil();
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
    $('#kpis').innerHTML = ''; $('#warnings').innerHTML = S.dbMissingShown ? ($('#warnings').querySelector('.banner.bad')?.outerHTML || '') : ''; drawMap(); return;
  }
  const H = c.hyp;
  $('#cantTable').innerHTML = `<thead><tr><th>Cantón</th><th class="n">Vanos</th><th class="n">Long. (m)</th><th class="n">a regul. (m)</th><th>Gobierna</th>
    ${H.all.map(h => `<th class="n" title="${h.nombre}">T ${h.id} (daN)</th>`).join('')}<th class="n">CS</th><th class="n">EDS %</th></tr></thead><tbody>
    ${c.cantones.map((cn, k) => `<tr><td>C${k + 1} · A${cn.spans[0].i + 1}–A${cn.spans[cn.spans.length - 1].i + 2}</td><td class="n">${cn.spans.length}</td><td class="n">${fmt(cn.longitud, 1)}</td><td class="n">${fmt(cn.ar, 1)}</td>
      <td>${H.all.find(h => h.id === cn.gobierna).nombre}</td>${H.all.map(h => `<td class="n">${fmt(cn.T[h.id])}</td>`).join('')}<td class="n">${fmt(cn.cs, 2)}</td><td class="n">${fmt(cn.edsPct, 1)}</td></tr>`).join('')}</tbody>`;

  $('#resTable').innerHTML = `<thead><tr><th>Apoyo</th><th>Función</th><th class="n">Desvío</th><th>Apoyo elegido</th><th class="n">F princ. (daN)</th><th class="n">F sec. (daN)</th><th>Utilización</th><th class="n">Amarre mín. (m)</th><th class="n">Cota (m)</th><th>Estado</th></tr></thead><tbody>
    ${c.results.map((r, i) => {
      const st = statusOf(r, i), e = r.elegido, ev = e && e.r;
      const ex = S.proj.rows[i].existente.activo && r.existenteCheck;
      const shown = ex && r.existenteCheck.ok ? r.existenteCheck : e;
      const p = shown?.pole, rr = shown?.r;
      let row = `<tr data-i="${i}" class="${S.sel === i ? 'sel' : ''}" style="cursor:pointer"><td><b>A${i + 1}</b></td><td>${FUNCS[r.func]}</td><td class="n">${i && i < c.results.length - 1 ? fmt(r.desvio, 1) + '°' : '—'}</td>
        <td class="mono">${p ? poleLabel(p) : '—'}</td><td class="n">${rr ? fmt(rr.Fp) + ' / ' + fmt(p.En) : '—'}</td><td class="n">${rr ? fmt(rr.Fs) + ' / ' + fmt(p.Es) : '—'}</td>
        <td>${rr ? utilBar(rr.u) : ''}</td><td class="n">${fmt(r.need, 2)}</td><td class="n">${r.z != null ? fmt(r.z, 1) : '—'}</td><td><span class="chip ${st.cls}">${st.txt}</span>${r.tiroArriba ? ' <span class="chip warn" title="Componente vertical ascendente de los conductores">tiro arriba</span>' : ''}</td></tr>`;
      if (S.sel === i) row += `<tr><td colspan="10" class="detail">${detailHtml(r, i)}</td></tr>`;
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
  const sinLibre = c.spans.filter(s => s.libre != null && s.libre < s.dmin - 0.01);
  if (sinLibre.length) w.push(`<div class="banner bad">Distancia al suelo insuficiente en ${sinLibre.map(s => `A${s.i + 1}–A${s.i + 2} (${fmt(s.libre, 2)} m de ${fmt(s.dmin)} m)`).join(', ')}. Intercala un apoyo o permite apoyos más altos.</div>`);
  const tiro = c.results.filter(r => r.tiroArriba);
  if (tiro.length) w.push(`<div class="banner warn">Tiro hacia arriba (componente vertical ascendente) en ${tiro.map(r => 'A' + (r.i + 1)).join(', ')}: usa amarre en lugar de suspensión y asegura la sujeción (ITC-BT-06 3.9.1.1).</div>`);
  if (!c.conPerfil && (S.proj.modo === 'kml' || S.proj.entronque?.k != null)) w.push('<div class="banner warn">Cálculo sin perfil de elevación: se ha supuesto terreno llano. Carga el perfil de GPS Visualizer en «Trazado».</div>');
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
    <dl style="margin-top:6px"><dt>Altura mínima de amarre</dt><dd>${fmt(r.need, 2)} m (distancia al suelo + flecha máxima)</dd><dt>Carga vertical (conductores nuevos)</dt><dd>${fmt(r.vert)} daN</dd><dt>Gravivano</dt><dd>${fmt(r.gravivano, 1)} m${r.tiroArriba ? ' · tiro hacia arriba' : ''}</dd>${r.z != null ? `<dt>Cota terreno / amarre</dt><dd>${fmt(r.z, 1)} / ${r.zAmarre != null ? fmt(r.zAmarre, 1) : '—'} m</dd>` : ''}</dl>
    <p class="mono" style="margin:6px 0 0">${conds}</p>`;
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
<h2>4. Vanos y flechas</h2><table><thead><tr><th>Vano</th><th>Longitud (m)</th>${[H.H1, H.H2, H.H3].map(h => `<th>Flecha ${h.id} (m)</th>`).join('')}<th>Desnivel (m)</th><th>Dist. libre (m)</th><th>Dist. mínima (m)</th></tr></thead><tbody>
${c.spans.map(s => `<tr>${td(`A${s.i + 1}–A${s.i + 2}${s.cruce ? ' (cruce)' : ''}`)}${tn(fmt(s.a, 2))}${[H.H1, H.H2, H.H3].map(h => tn(fmt(s.flechas[h.id], 2))).join('')}${tn(c.conPerfil ? fmt(s.dz, 2) : '—')}${tn(s.libre != null ? fmt(s.libre, 2) : '—')}${tn(fmt(s.dmin, 1))}</tr>`).join('')}</tbody></table>
${c.conPerfil ? `<p class="s">Perfil del terreno: ${esc(S.proj.perfil?.fuente || 'cotas introducidas a mano')}. Distancia libre mínima al terreno con el conductor a flecha máxima.</p>` : '<p class="s">Sin perfil de elevación: terreno supuesto llano.</p>'}
<h2>5. Apoyos</h2><table><thead><tr><th>Apoyo</th><th>Función</th><th>Modelo</th><th>Hipótesis pésima</th><th>F princ./En (daN)</th><th>F sec./Es (daN)</th><th>Util. %</th><th>Eje principal</th><th>Cota (m)</th><th>Gravivano (m)</th><th>Estado</th></tr></thead><tbody>
${c.results.map((r, i) => { const sel = r.existenteCheck?.ok ? r.existenteCheck : r.elegido, p = sel?.pole, rr = sel?.r; return `<tr>${td('A' + (i + 1))}${td(FUNCS[r.func])}${td(p ? poleLabel(p) : '—')}${td(rr ? H.all.find(h => h.id === rr.hyp).nombre : '—')}${tn(rr ? fmt(rr.Fp) + ' / ' + fmt(p.En) : '—')}${tn(rr ? fmt(rr.Fs) + ' / ' + fmt(p.Es) : '—')}${tn(rr ? fmt(rr.u * 100, 1) : '—')}${tn(rr ? fmt(rr.phi) + '°' : '—')}${tn(r.z != null ? fmt(r.z, 1) : '—')}${tn(fmt(r.gravivano, 1))}${td(statusOf(r, i).txt + (r.tiroArriba ? ' · tiro hacia arriba' : ''))}</tr>`; }).join('')}</tbody></table>
<p class="s">Esfuerzos referidos a 0,25 m bajo cogolla por igualdad de momentos en el empotramiento; esfuerzos nominales con coeficiente de seguridad 2,5 incluido (ITC-BT-06, tabla 2). Viento sobre el fuste ${ctx.vientoPoste ? 'incluido (100 daN/m²)' : 'no incluido'}.</p>
<h2>6. Presupuesto</h2><table><thead><tr><th>Concepto</th><th>Ud</th><th>Cantidad</th><th>Coste</th><th>Venta</th></tr></thead><tbody>
${b.lineas.map(l => `<tr>${td(esc(l.concepto))}${td(l.ud)}${tn(fmt(l.cant, l.ud === 'ud' ? 0 : 1))}${tn(eur(l.coste))}${tn(eur(l.venta))}</tr>`).join('')}
<tr><th colspan="3">Total</th>${tn('<b>' + eur(b.tot.coste) + '</b>')}${tn('<b>' + eur(b.tot.venta) + '</b>')}</tr></tbody></table></body></html>`;
}
/* ---------- Nodos (coordenadas) ---------- */
/* Apoyos de la línea existente (con coordenadas UTM) */
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
  if (!rows.length) return [];
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
  if (nodes.length < 2 && ex.length < 1 && !lines.length) {
    S.mapT = null; g.fillStyle = col('--muted'); g.font = '13px ' + col('--f-body'); g.textAlign = 'center';
    g.fillText('Proyecto vacío: importa el trazado, la red existente o crea el trazado con coordenadas.', W / 2, Hh / 2); return;
  }
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
    if (S.proj.modo === 'kml') snapToEntronque(false);
    else { while (S.proj.rows.length < 2) { const r = newRow(); if (!S.proj.rows.length) r.vano = 0; S.proj.rows.push(r); } S.proj.rows[0].existente.activo = true; }
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
  if (!S.proj.rows.length) { S.proj.rows.push(Object.assign(newRow(), { vano: 0 })); S.proj.rows.push(newRow()); }
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

/* ---------- Plano: vista con desplazamiento y zoom ---------- */
function ensureImg(tipo) {
  const f = S.proj.fondos?.[tipo]; if (!f || (!f.assetId && !f.blobUrl && !f.url)) return null;
  S.img = S.img || {};
  const src = f.blobUrl || (f.assetId ? '/_blob/' + f.assetId : f.url);
  if (!S.img[tipo] || S.img[tipo].srcKey !== src) {
    const im = new Image(); im.srcKey = src; im.onload = () => drawMap(); im.onerror = () => { im.failed = true; if (f.url) toast(`No se pudo cargar ${FONDOS[tipo].nombre}. Comprueba la conexión a internet.`); drawMap(); }; im.src = src; S.img[tipo] = im;
  }
  return S.img[tipo];
}
/* ---------- Fondos: Catastro y ortofoto ---------- */
const FONDOS = {
  catastro: { nombre: 'Catastro', fmt: 'image/png', ext: 'png', wf: 'pgw',
    url: (bb, z, w, h) => `https://ovc.catastro.meh.es/cartografia/INSPIRE/spadgcwms.aspx?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=CP.CadastralParcel,BU.Building&STYLES=&CRS=EPSG:258${z}&BBOX=${bb.join(',')}&WIDTH=${w}&HEIGHT=${h}&FORMAT=image/png&TRANSPARENT=TRUE` },
  orto: { nombre: 'Ortofoto PNOA', fmt: 'image/jpeg', ext: 'jpg', wf: 'jgw',
    url: (bb, z, w, h) => `https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.OrthoimageCoverage&STYLES=&CRS=EPSG:258${z}&BBOX=${bb.join(',')}&WIDTH=${w}&HEIGHT=${h}&FORMAT=image/jpeg` }
};
function fondoBbox() {
  const pts = allPts(); if (!pts.length || !S.proj.zone) return null;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  let minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const m = Math.max(40, 0.15 * Math.max(maxx - minx, maxy - miny));
  minx -= m; maxx += m; miny -= m; maxy += m;
  const res = Math.max(0.1, Math.max(maxx - minx, maxy - miny) / 2048);
  const w = Math.round((maxx - minx) / res), h = Math.round((maxy - miny) / res);
  return { bbox: [minx, miny, minx + w * res, miny + h * res].map(v => Math.round(v * 100) / 100), w, h, res };
}
function renderFondos() {
  const box = $('#fondos'); S.proj.fondos = S.proj.fondos || {};
  if (!S.proj.zone) { box.innerHTML = '<p class="note">Los fondos de Catastro y ortofoto necesitan coordenadas reales: importa el trazado o la línea existente desde KML/KMZ.</p>'; return; }
  const fb = fondoBbox();
  box.innerHTML = Object.entries(FONDOS).map(([k, F]) => {
    const f = S.proj.fondos[k] || {}; const has = f.assetId || f.blobUrl || f.url;
    const link = fb ? F.url(fb.bbox, S.proj.zone, fb.w, fb.h) : '#';
    const stale = has && fb && f.bbox && (fb.bbox[0] < f.bbox[0] || fb.bbox[1] < f.bbox[1] || fb.bbox[2] > f.bbox[2] || fb.bbox[3] > f.bbox[3]);
    return `<div class="fondo"><div class="row" style="justify-content:space-between"><label class="chk"><input type="checkbox" data-fv="${k}" ${f.visible && has ? 'checked' : ''} ${has ? '' : 'disabled'}> <b>${F.nombre}</b></label>
      <label class="chk note">Opacidad <input type="range" min="10" max="100" step="5" data-fo="${k}" value="${f.op ?? (k === 'catastro' ? 80 : 100)}" ${has ? '' : 'disabled'} aria-label="Opacidad ${F.nombre}"></label></div>
      <div class="row" style="margin-top:6px">${LOCAL ? `<button class="btn small" data-fauto="${k}">${has ? 'Actualizar' : 'Cargar'} ${F.nombre.toLowerCase()}</button>` : `<a class="btn small" href="${esc(link)}" target="_blank" rel="noopener" data-fl="${k}">1 · Abrir imagen de la zona</a>`}
      <label class="btn small" for="ff_${k}">${LOCAL ? 'Cargar imagen propia' : '2 · Cargar imagen guardada'}</label><input id="ff_${k}" type="file" accept="image/png,image/jpeg" data-ff="${k}" hidden>
      ${has ? `<button class="btn small ghost" data-fd="${k}">Quitar</button>` : ''}</div>
      ${stale ? '<p class="note" style="color:var(--warn)">El trazado se sale de la imagen cargada. Pide una imagen nueva.</p>' : ''}</div>`;
  }).join('') + (LOCAL ? `<p class="note">La imagen se pide al servicio oficial para la zona del proyecto y se coloca sola. Necesita conexión a internet. Si cambias el trazado, pulsa «Actualizar».</p>` : '') + `<p class="note" ${LOCAL ? 'hidden' : ''}>Pulsa «Abrir imagen», guarda la imagen que aparece (clic derecho › Guardar imagen como) y cárgala aquí. La app la coloca en su sitio porque conoce sus coordenadas. Si cambias el trazado, pide la imagen de nuevo.</p>`;
}
function bindFondos() {
  const box = $('#fondos');
  box.addEventListener('click', ev => {
    const a = ev.target.closest('[data-fl]'); if (a) { const fb = fondoBbox(); S.proj.fondos[a.dataset.fl] = { ...(S.proj.fondos[a.dataset.fl] || {}), pend: fb }; }
    const au = ev.target.closest('[data-fauto]');
    if (au) { const k = au.dataset.fauto, fb = fondoBbox(); if (!fb) return; const prev = S.proj.fondos[k] || {};
      S.proj.fondos[k] = { bbox: fb.bbox, w: fb.w, h: fb.h, url: FONDOS[k].url(fb.bbox, S.proj.zone, fb.w, fb.h), op: prev.op ?? (k === 'catastro' ? 80 : 100), visible: true };
      S.img = S.img || {}; delete S.img[k]; renderFondos(); drawMap(); toast(`Cargando ${FONDOS[k].nombre}…`); }
    const d = ev.target.closest('[data-fd]'); if (d) { const k = d.dataset.fd; const f = S.proj.fondos[k]; if (f?.assetId) delAsset(f.assetId); S.proj.fondos[k] = {}; renderFondos(); drawMap(); }
  });
  box.addEventListener('change', async ev => {
    const t = ev.target;
    if (t.dataset.fv) { S.proj.fondos[t.dataset.fv].visible = t.checked; drawMap(); }
    if (t.dataset.ff) {
      const k = t.dataset.ff, file = t.files[0]; t.value = ''; if (!file) return;
      const prev = S.proj.fondos[k] || {}; const fb = prev.pend || fondoBbox();
      const blobUrl = URL.createObjectURL(file);
      const im = new Image(); im.src = blobUrl; await im.decode().catch(() => null);
      if (!im.naturalWidth) { toast('No se ha podido leer la imagen.'); return; }
      if (Math.abs(im.naturalWidth / im.naturalHeight - fb.w / fb.h) > 0.02) toast('Las proporciones de la imagen no coinciden con la zona pedida. Comprueba que es la imagen correcta.');
      const f = { bbox: fb.bbox, w: im.naturalWidth, h: im.naturalHeight, op: prev.op ?? (k === 'catastro' ? 80 : 100), visible: true, blobUrl, nombre: file.name };
      S.proj.fondos[k] = f; S.img = S.img || {}; delete S.img[k]; renderFondos(); drawMap();
      const assets = LOCAL ? null : await window.claude?.use?.('assets').catch(() => null);
      if (assets) {
        try { const r = await assets.upload(file); if (prev.assetId) delAsset(prev.assetId); f.assetId = r.id; toast(`${FONDOS[k].nombre} cargado. Se guardará con el proyecto.`); }
        catch (e) { toast('Fondo cargado solo en esta sesión: no se pudo guardar la imagen (' + (e.code || e.message) + ').'); }
      } else toast('Fondo cargado solo en esta sesión.');
    }
  });
  box.addEventListener('input', ev => { const t = ev.target; if (t.dataset.fo) { S.proj.fondos[t.dataset.fo].op = Number(t.value); drawMap(); } });
}
async function delAsset(id) { try { const a = await window.claude?.use?.('assets'); await a?.delete(id); } catch (e) { } }

/* ---------- Importación KML / KMZ ---------- */
/* Lee KML, KMZ, GPX o el texto plano de GPS Visualizer y devuelve las rutas candidatas (con cota si la hay) */
function parseGpsvText(text, fname) {
  const lines = text.split(/\r?\n/);
  const hi = lines.findIndex(l => /latitude/i.test(l) && /longitude/i.test(l));
  if (hi < 0) throw new Error('El texto no tiene columnas de latitud y longitud (formato de GPS Visualizer)');
  const sep = lines[hi].includes('\t') ? '\t' : lines[hi].includes(';') ? ';' : ',';
  const H = lines[hi].split(sep).map(h => h.trim().toLowerCase());
  const iLat = H.findIndex(h => h.startsWith('latitude')), iLon = H.findIndex(h => h.startsWith('longitude'));
  const iAlt = H.findIndex(h => /^(altitude|elevation)/.test(h)), ft = iAlt >= 0 && /ft|feet/.test(H[iAlt]);
  const num = v => Number(String(v ?? '').trim().replace(',', '.'));
  const pts = lines.slice(hi + 1).map(l => l.split(sep)).filter(c => c.length > Math.max(iLat, iLon) && !isNaN(num(c[iLat])) && !isNaN(num(c[iLon])) && String(c[iLat]).trim() !== '')
    .map(c => ({ lat: num(c[iLat]), lon: num(c[iLon]), alt: iAlt >= 0 && String(c[iAlt] ?? '').trim() !== '' && !isNaN(num(c[iAlt])) ? num(c[iAlt]) * (ft ? 0.3048 : 1) : null }));
  if (pts.length < 2) throw new Error('El texto no contiene al menos dos puntos');
  return { nombre: fname.replace(/\.\w+$/, ''), pts };
}
function hasAlt(pts) { const a = pts.map(p => p.alt); return a.every(v => v != null && !isNaN(v)) && a.some(v => v !== 0); }
function applyPerfil(opt, fname) {
  if (!opt.conCota) { toast('Ese archivo no lleva cotas. Pásalo primero por GPS Visualizer para añadir la elevación.'); return; }
  const zone = setZoneFrom(opt.pts[0]);
  S.proj.perfil = { fuente: fname, pts: opt.pts.map(p => { const u = E.utmFromLatLon(p.lat, p.lon, zone); return { x: u.x, y: u.y, z: p.alt }; }) };
  const alts = opt.pts.map(p => p.alt); const altMax = Math.max(...alts);
  const z = altMax > 1000 ? 'C' : altMax > 500 ? 'B' : 'A';
  if (z !== S.proj.ctx.zona) { S.proj.ctx.zona = z; $('#p_zona').value = z; }
  toast(`Perfil de elevación cargado: ${opt.pts.length} puntos, cotas ${fmt(Math.min(...alts))}–${fmt(altMax)} m. Zona ${z}.`);
  refreshAll();
}
function perfilPts() {
  if (S.proj.perfil?.pts?.length >= 2) return S.proj.perfil.pts;
  if (S.proj.modo === 'manual' && S.proj.rows.length > 1 && S.proj.rows.every(r => r.cota !== '' && r.cota != null && !isNaN(Number(r.cota)))) {
    const n = currentNodes(); return n.map((p, i) => ({ x: p.x, y: p.y, z: Number(S.proj.rows[i].cota) }));
  }
  return null;
}
function perfilInfoHtml() {
  const has = S.proj.perfil?.pts?.length >= 2;
  const gpsv = `<a href="https://www.gpsvisualizer.com/elevation" target="_blank" rel="noopener">GPS Visualizer (Elevation)</a>`;
  const steps = `<ol style="margin:6px 0 0;padding-left:20px"><li>Entra en ${gpsv} y sube tu archivo .kml en «Seleccionar archivo».</li><li>En «Output format» elige <b>GPX file</b> o <b>Plain text</b>.</li><li>Pulsa el botón verde «Convert &amp; add elevation».</li><li>Pulsa «Download…» y guarda el archivo.</li><li>Cárgalo aquí con «Cargar perfil de elevación» (o impórtalo directamente como trazado).</li></ol>`;
  if (has) {
    const zs = S.proj.perfil.pts.map(p => p.z);
    const d = S.calc?.perfilDist;
    return `<div class="banner info">Perfil de elevación: <b>${esc(S.proj.perfil.fuente)}</b> · ${S.proj.perfil.pts.length} puntos · cotas ${fmt(Math.min(...zs))}–${fmt(Math.max(...zs))} m. <button class="btn small ghost" id="perfilDel">Quitar</button></div>${d > 15 ? `<div class="banner warn" style="margin-top:6px">Algún apoyo está a ${fmt(d)} m del perfil cargado. Comprueba que el perfil corresponde a este trazado.</div>` : ''}`;
  }
  if (S.proj.modo === 'kml' || S.proj.entronque?.k != null) return `<div class="banner warn"><b>El trazado no tiene perfil de elevación.</b> Sin él se supone terreno llano. Pulsa «Buscar perfil de elevación automáticamente» o, con GPS Visualizer:${steps}</div>`;
  return `<p class="note">En entrada manual puedes escribir la cota del terreno de cada apoyo en la columna «Cota». Con un trazado KML, carga el perfil de GPS Visualizer.</p>`;
}
function toManual() {
  const nodes = currentNodes(); const spans = E.buildGeometry(nodes);
  S.proj.rows.forEach((r, i) => { r.vano = i ? Math.round(spans[i - 1].a * 10) / 10 : 0; r.angulo = Math.round((nodes[i].desvio || 0) * 10) / 10; });
  S.proj.ctx.rumbo0 = Math.round(spans[0].az * 10) / 10; $('#p_rumbo0').value = S.proj.ctx.rumbo0;
  if (!S.proj.entronque) toast('Entrada manual sin georreferencia: conecta el trazado a la línea existente para mantener las coordenadas reales.');
  S.proj.modo = 'manual'; S.proj.geo = null; refreshAll();
}

/* ---------- Línea existente y entronque ---------- */
function renderPerfilInfo() { const b = $('#perfilInfo'); if (!b) return; b.innerHTML = perfilInfoHtml(); const d = $('#perfilDel'); if (d) d.onclick = () => { S.proj.perfil = null; refreshAll(); }; }

/* ---------- Exportación ---------- */
const ascii = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');
function dxf(c, geo) {
  const L = [];
  const p = (...a) => { for (let k = 0; k < a.length; k += 2) L.push(String(a[k]), String(a[k + 1])); };
  const layers = [['BT_TRAZADO', 5], ['BT_APOYOS', 1], ['BT_TEXTO_APOYOS', 7], ['BT_TEXTO_VANOS', 8], ['BT_EXISTENTE', 30], ['BT_LINEA_EXISTENTE', 30], ['BT_APOYOS_EXISTENTES', 30], ['BT_TEXTO_EXISTENTE', 30], ['BT_RUTA', 4]];
  p(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC');
  p(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB');
  p(0, 'TABLE', 2, 'LAYER', 70, layers.length); layers.forEach(([n, colr]) => p(0, 'LAYER', 2, n, 70, 0, 62, colr, 6, 'CONTINUOUS')); p(0, 'ENDTAB', 0, 'ENDSEC');
  p(0, 'SECTION', 2, 'ENTITIES');
  const N = c.nodes, f3 = v => v.toFixed(3);
  const ex = geo ? exNodes() : [];
  if (geo) exLineas().forEach(l => { for (let i = 0; i < l.pts.length - 1; i++) p(0, 'LINE', 8, 'BT_LINEA_EXISTENTE', 10, f3(l.pts[i].x), 20, f3(l.pts[i].y), 30, 0, 11, f3(l.pts[i + 1].x), 21, f3(l.pts[i + 1].y), 31, 0); });
  if (geo && S.proj.geo?.ruta) { const r = S.proj.geo.ruta; for (let i = 0; i < r.length - 1; i++) p(0, 'LINE', 8, 'BT_RUTA', 10, f3(r[i].x), 20, f3(r[i].y), 30, 0, 11, f3(r[i + 1].x), 21, f3(r[i + 1].y), 31, 0); }
  for (let i = 0; i < ex.length; i++) {
    p(0, 'CIRCLE', 8, 'BT_APOYOS_EXISTENTES', 10, f3(ex[i].x), 20, f3(ex[i].y), 30, 0, 40, 0.4);
    p(0, 'TEXT', 8, 'BT_TEXTO_EXISTENTE', 10, f3(ex[i].x - 3), 20, f3(ex[i].y + 1), 30, 0, 40, 1, 1, ascii('E' + (i + 1) + (ex[i].nombre ? ' ' + ex[i].nombre : '')));
  }
  for (let i = 0; i < N.length - 1; i++) {
    p(0, 'LINE', 8, 'BT_TRAZADO', 10, f3(N[i].x), 20, f3(N[i].y), 30, 0, 11, f3(N[i + 1].x), 21, f3(N[i + 1].y), 31, 0);
    const mx = (N[i].x + N[i + 1].x) / 2, my = (N[i].y + N[i + 1].y) / 2; let ang = Math.atan2(N[i + 1].y - N[i].y, N[i + 1].x - N[i].x) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    p(0, 'TEXT', 8, 'BT_TEXTO_VANOS', 10, f3(mx), 20, f3(my + 0.6), 30, 0, 40, 0.8, 1, ascii(`${c.spans[i].a.toFixed(1)} m`), 50, ang.toFixed(2), 72, 1, 11, f3(mx), 21, f3(my + 0.6), 31, 0);
  }
  N.forEach((n, i) => {
    const r = c.results[i]; const pole = r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole;
    p(0, 'CIRCLE', 8, 'BT_APOYOS', 10, f3(n.x), 20, f3(n.y), 30, 0, 40, 0.5);
    p(0, 'TEXT', 8, 'BT_TEXTO_APOYOS', 10, f3(n.x + 1), 20, f3(n.y + 1), 30, 0, 40, 1.2, 1, ascii(`A${i + 1}` + (S.proj.geo?.pts?.[i]?.nombre ? ' ' + S.proj.geo.pts[i].nombre : '')));
    p(0, 'TEXT', 8, 'BT_TEXTO_APOYOS', 10, f3(n.x + 1), 20, f3(n.y - 0.6), 30, 0, 40, 0.8, 1, ascii(pole ? poleLabel(pole) + (n.existente?.activo ? (r.existenteCheck?.ok ? ' (existente)' : ' (sustituye)') : '') : 'SIN APOYO VALIDO'));
    const e = n.existente; if (e?.activo) (e.conductores || []).filter(cd => !cd.deLinea || !ex.length).forEach(cd => { const u = { x: Math.sin(cd.az * Math.PI / 180), y: Math.cos(cd.az * Math.PI / 180) }; p(0, 'LINE', 8, 'BT_EXISTENTE', 10, f3(n.x), 20, f3(n.y), 30, 0, 11, f3(n.x + u.x * 10), 21, f3(n.y + u.y * 10), 31, 0); });
  });
  if (!geo) p(0, 'TEXT', 8, 'BT_TEXTO_APOYOS', 10, f3(N[0].x), 20, f3(N[0].y - 4), 30, 0, 40, 1, 1, 'COORDENADAS LOCALES - SIN GEORREFERENCIAR');
  p(0, 'ENDSEC', 0, 'EOF');
  return L.join('\r\n') + '\r\n';
}
function kml(c, g) {
  const pts = g.pts, ex = exNodes();
  const pm = pts.map((pt, i) => {
    const r = c.results[i], pole = r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole, st = statusOf(r, i);
    return `<Placemark><name>A${i + 1}${pt.nombre ? ' ' + esc(pt.nombre) : ''}</name><styleUrl>#${st.cls}</styleUrl><description><![CDATA[${FUNCS[r.func]}<br>${pole ? poleLabel(pole) : 'Sin apoyo válido'}<br>${st.txt}${pole ? `<br>Utilización ${fmt((r.existenteCheck?.ok ? r.existenteCheck.r : r.elegido.r).u * 100, 1)} %` : ''}<br>UTM ${g.zone}: ${pt.x.toFixed(2)} ; ${pt.y.toFixed(2)}]]></description><Point><coordinates>${pt.lon.toFixed(8)},${pt.lat.toFixed(8)},0</coordinates></Point></Placemark>`;
  }).join('\n');
  const st = (id, color) => `<Style id="${id}"><IconStyle><color>${color}</color><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_square.png</href></Icon></IconStyle></Style>`;
  const lines = exLineas();
  const exK = (lines.length || ex.length) ? `<Folder><name>Red existente</name>${lines.map(l => `<Placemark><name>${esc(l.nombre)}</name><styleUrl>#existente</styleUrl><LineString><tessellate>1</tessellate><coordinates>${l.pts.map(p => `${p.lon.toFixed(8)},${p.lat.toFixed(8)},0`).join(' ')}</coordinates></LineString></Placemark>`).join('\n')}
${ex.map((p, i) => `<Placemark><name>E${i + 1}${p.nombre ? ' ' + esc(p.nombre) : ''}</name><styleUrl>#exApoyo</styleUrl><Point><coordinates>${p.lon.toFixed(8)},${p.lat.toFixed(8)},0</coordinates></Point></Placemark>`).join('\n')}</Folder>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(S.proj.nombre)}</name>
${st('ok', 'ff4f7d2f')}${st('warn', 'ff006aa6')}${st('bad', 'ff2c36b3')}
<Style id="linea"><LineStyle><color>ff865b1d</color><width>3</width></LineStyle></Style>
<Style id="existente"><LineStyle><color>ff737373</color><width>3</width></LineStyle></Style>
<Style id="exApoyo"><IconStyle><color>ff737373</color><scale>0.7</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>
${exK}
<Placemark><name>Línea BT nueva · ${esc(c.cable.designacion)}</name><styleUrl>#linea</styleUrl><LineString><tessellate>1</tessellate><coordinates>${pts.map(p => `${p.lon.toFixed(8)},${p.lat.toFixed(8)},0`).join(' ')}</coordinates></LineString></Placemark>
<Folder><name>Apoyos nuevos</name>
${pm}
</Folder></Document></kml>`;
}
function geojson(c, g) {
  const feats = [{ type: 'Feature', properties: { capa: 'linea_nueva', cable: c.cable.designacion }, geometry: { type: 'LineString', coordinates: g.pts.map(p => [+p.lon.toFixed(8), +p.lat.toFixed(8)]) } }];
  g.pts.forEach((p, i) => { const r = c.results[i], pole = r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole; feats.push({ type: 'Feature', properties: { capa: 'apoyo_nuevo', apoyo: 'A' + (i + 1), nombre: p.nombre || null, funcion: FUNCS[r.func], modelo: pole ? poleLabel(pole) : null, estado: statusOf(r, i).txt, utm_huso: g.zone, utm_x: +p.x.toFixed(2), utm_y: +p.y.toFixed(2) }, geometry: { type: 'Point', coordinates: [+p.lon.toFixed(8), +p.lat.toFixed(8)] } }); });
  const ex = exNodes();
  exLineas().forEach(l => feats.push({ type: 'Feature', properties: { capa: 'linea_existente', nombre: l.nombre, fuente: l.fuente }, geometry: { type: 'LineString', coordinates: l.pts.map(p => [+p.lon.toFixed(8), +p.lat.toFixed(8)]) } }));
  ex.forEach((p, i) => feats.push({ type: 'Feature', properties: { capa: 'apoyo_existente', apoyo: 'E' + (i + 1), nombre: p.nombre || null, entronque: S.proj.entronque?.k === i }, geometry: { type: 'Point', coordinates: [+p.lon.toFixed(8), +p.lat.toFixed(8)] } }));
  if (S.proj.geo?.ruta) feats.push({ type: 'Feature', properties: { capa: 'ruta' }, geometry: { type: 'LineString', coordinates: S.proj.geo.ruta.map(p => [+p.lon.toFixed(8), +p.lat.toFixed(8)]) } });
  return JSON.stringify({ type: 'FeatureCollection', name: S.proj.nombre, features: feats }, null, 1);
}
function csv(c, g) {
  const sep = ';', n = v => String(v ?? '').replace('.', ',');
  const head = ['Apoyo', 'Funcion', 'Desvio (grados)', 'Vano anterior (m)', 'Modelo', 'Tipo', 'Esfuerzo nominal (daN)', 'Esfuerzo secundario (daN)', 'Altura (m)', 'F principal (daN)', 'F secundario (daN)', 'Utilizacion (%)', 'Eje principal (acimut)', 'Estado', 'Coste (EUR)', 'Venta (EUR)', 'Cota terreno (m)', 'Cota amarre (m)', 'Gravivano (m)'];
  if (g) head.push(`UTM X (huso ${g.zone})`, 'UTM Y', 'Latitud', 'Longitud');
  const rows = c.results.map((r, i) => {
    const sel = r.existenteCheck?.ok ? r.existenteCheck : r.elegido; const p = sel?.pole, rr = sel?.r; const st = statusOf(r, i);
    const a = [`A${i + 1}`, FUNCS[r.func], n(r.desvio?.toFixed(1)), i ? n(c.spans[i - 1].a.toFixed(2)) : '', p ? poleLabel(p) : '', p?.tipo, p?.En, p?.Es, p?.altura, n(rr?.Fp.toFixed(0)), n(rr?.Fs.toFixed(0)), n(rr ? (rr.u * 100).toFixed(1) : ''), n(rr?.phi.toFixed(0)), st.txt, n(st.txt === 'Existente válido' ? 0 : p?.coste), n(st.txt === 'Existente válido' ? 0 : p?.venta), n(r.z?.toFixed(2)), n(r.zAmarre?.toFixed(2)), n(r.gravivano?.toFixed(1))];
    if (g) { const pt = g.pts[i]; a.push(n(pt.x.toFixed(2)), n(pt.y.toFixed(2)), n(pt.lat.toFixed(8)), n(pt.lon.toFixed(8))); }
    return a.join(sep);
  });
  return '﻿' + [head.join(sep), ...rows].join('\r\n');
}
function worldFile(f) { const rx = (f.bbox[2] - f.bbox[0]) / f.w, ry = (f.bbox[3] - f.bbox[1]) / f.h; return [rx, 0, 0, -ry, f.bbox[0] + rx / 2, f.bbox[3] - ry / 2].map(v => v.toFixed(6)).join('\r\n') + '\r\n'; }
function leeme(c, g, fondosIncl) {
  const base = fileBase(g); const z = g ? g.zone : 29;
  const L = [`PAQUETE DE EXPORTACION - ${ascii(S.proj.nombre)}`, `Generado con Calculo de Apoyos BT v${VERSION} el ${ascii(new Date().toLocaleString('es-ES'))}`, '',
    g ? `Sistema de coordenadas: ETRS89 / UTM huso ${z}N (EPSG:258${z}), el mismo que usa la cartografia catastral en la peninsula.`
      : 'ATENCION: trazado introducido a mano y sin conectar a una linea existente. El DXF esta en coordenadas locales (origen en A1) y no se puede superponer al Catastro. Importa un KML/KMZ o conecta el trazado a la linea existente.', '',
    'ARCHIVOS',
    `- ${base}.dxf: trazado, apoyos y textos por capas (BT_TRAZADO, BT_APOYOS, BT_TEXTO_APOYOS, BT_TEXTO_VANOS, BT_EXISTENTE${exNodes().length && g ? ', BT_LINEA_EXISTENTE, BT_APOYOS_EXISTENTES, BT_TEXTO_EXISTENTE' : ''}${S.proj.geo?.ruta && g ? ', BT_RUTA' : ''}). Unidades: metros.`,
    g ? `- ${base}.kml: linea nueva, apoyos${exNodes().length ? ' y linea existente' : ''} para Google Earth (WGS84).` : null,
    g ? `- ${base}.geojson: las mismas capas para QGIS (WGS84).` : null,
    ...fondosIncl.map(f => `- ${f.file} + ${f.wf}: fondo de ${f.nombre} georreferenciado (archivo de mundo en EPSG:258${z}).`),
    `- ${base}_apoyos.csv: tabla de apoyos (separador punto y coma) para Excel.`,
    c.conPerfil ? `- ${base}_perfil.csv: perfil longitudinal (terreno, conductor a flecha maxima y distancia libre).` : null,
    `- ${base}_anexo_calculo.html: anexo de calculo. Abrelo en el navegador e imprimelo a PDF.`, '',
    'SUPERPONER SOBRE CATASTRO', '',
    'AutoCAD:',
    '  1. Descarga la cartografia catastral vectorial del municipio en la Sede Electronica del Catastro (www.sedecatastro.gob.es, Descarga de cartografia).',
    '  2. Trabaja en el mismo sistema ETRS89 UTM del paquete.',
    `  3. Inserta ${base}.dxf con INSERTAR en el punto 0,0,0, escala 1 y rotacion 0, o copialo y pegalo en coordenadas originales.`,
    fondosIncl.length ? '  4. Las imagenes de fondo con archivo de mundo se colocan solas en AutoCAD Map 3D o Civil 3D (MAPIINSERT). En AutoCAD basico, insertalas con IMAGEN usando las coordenadas del archivo de mundo.' : null, '',
    'QGIS:',
    '  1. Capa > Anadir capa > Anadir capa WMS. Catastro (INSPIRE): https://ovc.catastro.meh.es/cartografia/INSPIRE/spadgcwms.aspx  Ortofoto PNOA: https://www.ign.es/wms-inspire/pnoa-ma',
    `  2. Arrastra ${base}.geojson al mapa (o el DXF, indicando EPSG:258${z}).`,
    fondosIncl.length ? '  3. Tambien puedes arrastrar las imagenes de fondo incluidas: QGIS lee su archivo de mundo (indica EPSG:258' + z + ').' : null, '',
    'Google Earth Pro:',
    `  1. Abre ${base}.kml.`, '',
    'Comprueba siempre la superposicion con puntos de control conocidos antes de usarla en un proyecto.'];
  return L.filter(l => l !== null).join('\r\n') + '\r\n';
}
function fileBase(g) { return ascii(S.proj.nombre || 'linea_bt').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').slice(0, 60) + (g ? `_ETRS89_UTM${g.zone}` : '_local'); }
async function fondoBlob(f) {
  if (f.blobUrl) { try { return await (await fetch(f.blobUrl)).blob(); } catch (e) { } }
  if (f.assetId) { try { const r = await fetch('/_blob/' + f.assetId); if (r.ok) return await r.blob(); } catch (e) { } }
  if (f.url) { try { const r = await fetch(f.url); if (r.ok) return await r.blob(); } catch (e) { } }
  return null;
}
async function exportZip() {
  const c = S.calc; if (!c) { toast('No hay resultados que exportar.'); return; }
  const g = getGeo(c.nodes), zip = new JSZip(), base = fileBase(g);
  zip.file(base + '.dxf', dxf(c, g));
  if (g) { zip.file(base + '.kml', kml(c, g)); zip.file(base + '.geojson', geojson(c, g)); }
  const incl = [];
  if (g) for (const [k, F] of Object.entries(FONDOS)) {
    const f = S.proj.fondos?.[k]; if (!f || !(f.assetId || f.blobUrl || f.url)) continue;
    const b = await fondoBlob(f); if (!b) continue;
    const ext = /png/.test(b.type) ? 'png' : 'jpg', wfExt = ext === 'png' ? 'pgw' : 'jgw';
    const file = `fondo_${k}_EPSG258${g.zone}.${ext}`, wf = `fondo_${k}_EPSG258${g.zone}.${wfExt}`;
    zip.file(file, b); zip.file(wf, worldFile(f)); incl.push({ file, wf, nombre: F.nombre });
  }
  zip.file(base + '_apoyos.csv', csv(c, g)); if (c.conPerfil) zip.file(base + '_perfil.csv', perfilCsv(c)); zip.file(base + '_anexo_calculo.html', informe(c)); zip.file('LEEME.txt', leeme(c, g, incl));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  if (await saveFile(base + '.zip', blob)) toast('Paquete guardado.');
}

/* ---------- Perfil longitudinal: dibujo ---------- */
function drawPerfil() {
  const cv = $('#perfil'); if (!cv) return; const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, Hh = cv.clientHeight; if (!W) return;
  cv.width = W * dpr; cv.height = Hh * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cs = getComputedStyle(document.documentElement), col = n => cs.getPropertyValue(n).trim();
  g.fillStyle = col('--map'); g.fillRect(0, 0, W, Hh);
  const c = S.calc;
  if (!c || !c.conPerfil) { g.fillStyle = col('--muted'); g.font = '13px ' + col('--f-body'); g.textAlign = 'center'; g.fillText('Sin perfil de elevación: carga o busca el perfil del trazado para verlo aquí.', W / 2, Hh / 2); $('#perfilNote').textContent = ''; return; }
  const N = c.nodes, ch0 = Math.min(...N.map(n => n.ch)), ch1 = Math.max(...N.map(n => n.ch)), rev = N[0].ch > N[N.length - 1].ch;
  const X = ch => rev ? ch1 - ch : ch - ch0, L = Math.max(ch1 - ch0, 1);
  const perf = perfilPts() ? E.buildProfile(perfilPts()) : null;
  const terr = perf ? perf.pts.filter(p => p.ch >= ch0 - 1 && p.ch <= ch1 + 1).map(p => ({ d: X(p.ch), z: p.z })) : [];
  N.forEach(n => terr.push({ d: X(n.ch), z: n.z })); terr.sort((a, b) => a.d - b.d);
  const tops = c.results.map((r, i) => r.zAmarre ?? N[i].z);
  const zMin = Math.min(...terr.map(t => t.z)) - 2, zMax = Math.max(...terr.map(t => t.z), ...tops) + 3;
  const pl = 48, pr = 14, pt = 14, pb = 26, sx = (W - pl - pr) / L, sy = (Hh - pt - pb) / Math.max(zMax - zMin, 1);
  const P = (d, z) => [pl + d * sx, Hh - pb - (z - zMin) * sy];
  // ejes
  g.strokeStyle = col('--grid'); g.fillStyle = col('--muted'); g.font = '10px ' + col('--f-mono'); g.lineWidth = 1;
  const zs = niceStep((zMax - zMin) / 4); for (let z = Math.ceil(zMin / zs) * zs; z <= zMax; z += zs) { const [, y] = P(0, z); g.beginPath(); g.moveTo(pl, y); g.lineTo(W - pr, y); g.stroke(); g.textAlign = 'right'; g.fillText(fmt(z), pl - 4, y + 3); }
  const ds = niceStep(L / 6); g.textAlign = 'center'; for (let d = 0; d <= L; d += ds) { const [x] = P(d, zMin); g.fillText(fmt(d) + ' m', x, Hh - 8); }
  // terreno
  g.beginPath(); terr.forEach((t, k) => { const [x, y] = P(t.d, t.z); k ? g.lineTo(x, y) : g.moveTo(x, y); });
  const [xe] = P(terr[terr.length - 1].d, zMin), [xs] = P(terr[0].d, zMin);
  g.lineTo(xe, Hh - pb); g.lineTo(xs, Hh - pb); g.closePath(); g.fillStyle = col('--soft'); g.fill(); g.strokeStyle = col('--exist'); g.lineWidth = 1.5; g.stroke();
  // conductor a flecha máxima y apoyos
  c.spans.forEach(s => {
    if (s.ZA == null) return; const a = X(N[s.i].ch), b = X(N[s.i + 1].ch);
    g.beginPath(); for (let k = 0; k <= 30; k++) { const t = k / 30; const [x, y] = P(a + (b - a) * t, s.ZA + (s.ZB - s.ZA) * t - 4 * s.fmax * t * (1 - t)); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = s.libre != null && s.libre < s.dmin - 0.01 ? col('--bad') : col('--accent'); g.lineWidth = 2; g.stroke();
  });
  c.results.forEach((r, i) => {
    const d = X(N[i].ch), [x, y0] = P(d, N[i].z), [, y1] = P(d, tops[i]);
    const st = statusOf(r, i); g.strokeStyle = col('--' + st.col); g.lineWidth = 3; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
    g.fillStyle = col('--ink'); g.font = '600 11px ' + col('--f-body'); g.textAlign = 'center'; g.fillText('A' + (i + 1), x, y1 - 5);
  });
  const exag = sy / sx; $('#perfilNote').textContent = `Escala vertical ×${fmt(exag, exag < 10 ? 1 : 0)} · conductor a flecha máxima`;
}

/* ---------- Trazado por coordenadas de inicio y fin ---------- */
function parseCoordText(t) {
  const n = String(t).trim().replace(/;/g, ' ').split(/[\s,]+/).filter(Boolean).map(v => Number(v));
  if (n.length < 2 || n.some(isNaN)) return null;
  const [a, b] = n;
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lon: b };
  const zone = S.proj.zone || Number($('#c_huso').value) || 29; const ll = E.latLonFromUtm(a, b, zone); return { lat: ll.lat, lon: ll.lon }; // UTM X Y
}
function bindCoordForm() {
  $('#c_crear').onclick = () => {
    const A = parseCoordText($('#c_ini').value), B = parseCoordText($('#c_fin').value);
    if (!A || !B) { toast('Escribe las coordenadas como «latitud, longitud» (42.8590, -8.6510) o «X Y» en UTM.'); return; }
    if (!S.proj.zone && /^\s*\d{5,}/.test($('#c_ini').value)) S.proj.zone = Number($('#c_huso').value) || 29;
    const prev = S.proj.ctx.dividir; S.proj.ctx.dividir = true;
    applyTrace({ nombre: 'Coordenadas', pts: [A, B] }, 'coordenadas de inicio y fin');
    S.proj.ctx.dividir = prev;
  };
}

/* ---------- Perfil automático (Copernicus DEM vía Open-Meteo, con el navegador de la app de escritorio) ---------- */
function getApiKey() { try { return localStorage.getItem('openmeteoKey') || ''; } catch (e) { return ''; } }
function setApiKey(v) { try { localStorage.setItem('openmeteoKey', v); } catch (e) { } }
function samplePolyline(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y), k = Math.max(1, Math.ceil(d / step));
    for (let j = 0; j < k; j++) out.push({ x: a.x + (b.x - a.x) * j / k, y: a.y + (b.y - a.y) * j / k });
  }
  out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
  return out;
}
async function autoPerfil() {
  const btn = $('#perfilAuto'), msg = $('#perfilAutoMsg');
  const g = getGeo(); if (!g) { msg.textContent = 'Primero importa el trazado, créalo con coordenadas de inicio y fin o conéctalo a la línea existente.'; return; }
  if (LOCAL) return autoPerfilLocal(g);
  const mcp = await window.claude?.use?.('mcp').catch(() => null);
  if (!mcp) { msg.innerHTML = 'La búsqueda automática solo funciona al abrir esta app dentro de la aplicación de escritorio de Claude. Usa GPS Visualizer (pasos de arriba).'; return; }
  let L = 0; for (let i = 1; i < g.pts.length; i++) L += Math.hypot(g.pts[i].x - g.pts[i - 1].x, g.pts[i].y - g.pts[i - 1].y);
  const step = Math.max(5, L / 900);
  const sp = samplePolyline(g.pts, step).map(p => ({ ...p, ...E.latLonFromUtm(p.x, p.y, g.zone) }));
  const key = getApiKey().trim();
  const base = key ? 'https://customer-api.open-meteo.com/v1/elevation' : 'https://api.open-meteo.com/v1/elevation';
  btn.disabled = true; let tabId = null; const z = [];
  try {
    for (let k = 0; k < sp.length; k += 100) {
      const chunk = sp.slice(k, k + 100);
      msg.textContent = `Consultando cotas ${k + 1}–${k + chunk.length} de ${sp.length}…`;
      const url = `${base}?latitude=${chunk.map(p => p.lat.toFixed(6)).join(',')}&longitude=${chunk.map(p => p.lon.toFixed(6)).join(',')}${key ? '&apikey=' + encodeURIComponent(key) : ''}`;
      if (!tabId) {
        const r = await mcp.callTool('host:claude_browser', 'preview_start', { url });
        const t = resultText(r); tabId = (t.match(/tabId\s*[:=]?\s*["']?([\w-]+)/i) || [])[1] || null;
      } else await mcp.callTool('host:claude_browser', 'navigate', tabId ? { url, tabId } : { url });
      let vals = null;
      for (let tries = 0; tries < 4 && !vals; tries++) {
        if (tries) await new Promise(res => setTimeout(res, 800));
        const r = await mcp.callTool('host:claude_browser', 'get_page_text', tabId ? { tabId } : {});
        const m = resultText(r).match(/\{\s*"(elevation|error)"[\s\S]*?\}/);
        if (m) { const j = JSON.parse(m[0]); if (j.error) throw { code: 'api', message: j.reason || 'error del servicio' }; vals = j.elevation; }
      }
      if (!vals || vals.length !== chunk.length) throw { code: 'api', message: 'el servicio no devolvió las cotas' };
      z.push(...vals);
    }
    S.proj.perfil = { fuente: `Copernicus DEM GLO-90 vía Open-Meteo (${sp.length} puntos cada ${fmt(step, 1)} m)`, pts: sp.map((p, i) => ({ x: p.x, y: p.y, z: z[i] })) };
    const altMax = Math.max(...z), zn = altMax > 1000 ? 'C' : altMax > 500 ? 'B' : 'A';
    if (zn !== S.proj.ctx.zona) { S.proj.ctx.zona = zn; $('#p_zona').value = zn; }
    msg.textContent = `Perfil obtenido: cotas ${fmt(Math.min(...z))}–${fmt(altMax)} m. Zona ${zn}.`;
    refreshAll();
  } catch (e) {
    const code = e && e.code;
    msg.textContent = code === 'server_not_connected' ? 'No se encuentra el navegador de la app de escritorio de Claude. Abre esta app desde la aplicación de escritorio, o usa GPS Visualizer.'
      : code === 'not_in_manifest' || code === 'approval_required' || code === 'cancelled' ? 'No se ha dado permiso para usar el navegador. Puedes volver a intentarlo o usar GPS Visualizer.'
      : code === 'api' ? 'El servicio de elevación respondió con un error: ' + e.message + '.'
      : 'No se pudo obtener el perfil (' + (code || 'error') + '). Inténtalo de nuevo o usa GPS Visualizer.';
  } finally { btn.disabled = false; }
}
async function autoPerfilLocal(g) {
  const btn = $('#perfilAuto'), msg = $('#perfilAutoMsg'); btn.disabled = true;
  let L = 0; for (let i = 1; i < g.pts.length; i++) L += Math.hypot(g.pts[i].x - g.pts[i - 1].x, g.pts[i].y - g.pts[i - 1].y);
  const step = Math.max(2, L / 900);
  const sp = samplePolyline(g.pts, step).map(p => ({ ...p, ...E.latLonFromUtm(p.x, p.y, g.zone) }));
  const z = []; let fuente = '';
  try {
    // 1) MDT05 del IGN (servicio getElevation de la IDEE)
    try {
      for (let k = 0; k < sp.length; k += 100) {
        const chunk = sp.slice(k, k + 100); msg.textContent = `MDT05 del IGN: cotas ${k + 1}–${k + chunk.length} de ${sp.length}…`;
        const geom = JSON.stringify({ type: 'FeatureCollection', features: chunk.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [+p.lon.toFixed(7), +p.lat.toFixed(7)] } })) });
        const r = await fetch('https://api-processes.idee.es/processes/getElevation/execution?f=json', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs: { geom, formato: 'geojson', crs: 4326, withCoord: false, outputFormat: 'array' } }) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json(); const vals = j.values || j.outputs?.values || j.value || (Array.isArray(j) ? j : null);
        if (!Array.isArray(vals) || vals.length !== chunk.length || vals.some(v => typeof v !== 'number')) throw new Error('respuesta no reconocida');
        z.push(...vals);
      }
      fuente = `MDT05 del IGN (${sp.length} puntos cada ${fmt(step, 1)} m)`;
    } catch (e1) {
      // 2) Copernicus DEM GLO-90 vía Open-Meteo
      z.length = 0; const key = getApiKey().trim();
      const base = key ? 'https://customer-api.open-meteo.com/v1/elevation' : 'https://api.open-meteo.com/v1/elevation';
      for (let k = 0; k < sp.length; k += 100) {
        const chunk = sp.slice(k, k + 100); msg.textContent = `IGN no disponible (${e1.message}). Open-Meteo: cotas ${k + 1}–${k + chunk.length} de ${sp.length}…`;
        const r = await fetch(`${base}?latitude=${chunk.map(p => p.lat.toFixed(6)).join(',')}&longitude=${chunk.map(p => p.lon.toFixed(6)).join(',')}${key ? '&apikey=' + encodeURIComponent(key) : ''}`);
        const j = await r.json(); if (j.error || !Array.isArray(j.elevation)) throw new Error(j.reason || 'respuesta no válida');
        z.push(...j.elevation);
      }
      fuente = `Copernicus DEM GLO-90 vía Open-Meteo (${sp.length} puntos cada ${fmt(step, 1)} m)`;
    }
    S.proj.perfil = { fuente, pts: sp.map((p, i) => ({ x: p.x, y: p.y, z: z[i] })) };
    const altMax = Math.max(...z), zn = altMax > 1000 ? 'C' : altMax > 500 ? 'B' : 'A';
    if (zn !== S.proj.ctx.zona) { S.proj.ctx.zona = zn; $('#p_zona').value = zn; }
    msg.textContent = `Perfil obtenido de ${fuente}: cotas ${fmt(Math.min(...z))}–${fmt(altMax)} m. Zona ${zn}.`;
    refreshAll();
  } catch (e) { msg.textContent = 'No se pudo obtener el perfil (' + e.message + '). Comprueba la conexión a internet o usa GPS Visualizer.'; }
  finally { btn.disabled = false; }
}
function resultText(r) {
  if (!r) return ''; if (typeof r.payload === 'string') return r.payload;
  const t = (r.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  return t || (r.payload ? JSON.stringify(r.payload) : '');
}
function bindPerfilAuto() {
  $('#perfilAuto').onclick = autoPerfil;
  const k = $('#omKey'); k.value = getApiKey(); k.addEventListener('change', () => setApiKey(k.value.trim()));
  $('#perfilAutoMsg').textContent = '';
}

/* ---------- Exportación del perfil ---------- */
function perfilCsv(c) {
  const N = c.nodes, sep = ';', n = v => v == null ? '' : String(v).replace('.', ',');
  const rows = ['Apoyo/vano;Distancia al origen (m);Cota terreno (m);Cota conductor flecha max (m);Distancia libre (m);Distancia minima (m)'];
  const ch0 = N[0].ch;
  c.spans.forEach(s => {
    rows.push([`A${s.i + 1}`, n(Math.abs(N[s.i].ch - ch0).toFixed(1)), n(N[s.i].z.toFixed(2)), n(s.ZA?.toFixed(2)), '', ''].join(sep));
    (s.terreno || []).filter(p => p.t > 0 && p.t < 1).forEach(p => {
      const zc = s.ZA != null ? s.ZA + (s.ZB - s.ZA) * p.t - 4 * s.fmax * p.t * (1 - p.t) : null;
      rows.push([`vano A${s.i + 1}-A${s.i + 2}`, n((Math.abs(N[s.i].ch - ch0) + p.t * s.a).toFixed(1)), n(p.z.toFixed(2)), n(zc?.toFixed(2)), n(zc != null ? (zc - p.z).toFixed(2) : ''), n(s.dmin)].join(sep));
    });
  });
  const l = N.length - 1; rows.push([`A${l + 1}`, n(Math.abs(N[l].ch - ch0).toFixed(1)), n(N[l].z.toFixed(2)), n(c.spans[l - 1]?.ZB?.toFixed(2)), '', ''].join(sep));
  return '﻿' + rows.join('\r\n');
}

/* ---------- Proyectos ---------- */
async function saveProject() {
  if (!S.db) { toast('Sin conexión a la base de datos.'); return; }
  const data = { nombre: S.proj.nombre || 'Sin nombre', fecha: new Date().toISOString(), datos: JSON.stringify({ ...S.proj, id: undefined, fondos: Object.fromEntries(Object.entries(S.proj.fondos || {}).map(([k, f]) => [k, { ...f, blobUrl: undefined }])) }) };
  if (Object.values(S.proj.fondos || {}).some(f => f.blobUrl && !f.assetId)) toast('Aviso: algún fondo no se ha podido guardar y no se conservará con el proyecto.');
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
/* Proyecto vacío: borra del área de trabajo trazado, red existente, entronque, perfil, fondos y edición. No toca las bases ni los proyectos guardados. */
function nuevoProyecto() {
  const fondos = S.proj.fondos || {}; Object.values(fondos).forEach(f => { if (f?.blobUrl) try { URL.revokeObjectURL(f.blobUrl); } catch (e) { } });
  S.proj = { id: null, nombre: '', modo: 'manual', rows: [], geo: null, ctx: { ...DEF_CTX }, cableId: S.proj.cableId || '', zone: null, redEx: null, entronque: null, perfil: null, fondos: {} };
  Object.assign(S, { img: {}, sel: null, selPt: null, openEx: null, pickEntronque: false, hist: [], calc: null, mapT: null, tool: 'pan', editLayer: 'nuevo', delConfirm: null });
  V.fitted = false; V.sc = null;
  ['#kmlPick', '#exPick'].forEach(id => { const el = $(id); if (el) { el.hidden = true; el.innerHTML = ''; } });
  const m = $('#perfilAutoMsg'); if (m) m.textContent = '';
  loadForm(); renderEdBar(); refreshAll();
  toast('Proyecto nuevo y vacío. Las bases de apoyos y cables y los proyectos guardados no se han tocado.');
}
async function exportProject() {
  const d = { app: 'Calculo de Apoyos BT', version: VERSION, proyecto: { ...S.proj, id: undefined, fondos: Object.fromEntries(Object.entries(S.proj.fondos || {}).map(([k, f]) => [k, { ...f, blobUrl: undefined }])) } };
  if (await saveFile(ascii(S.proj.nombre || 'proyecto').replace(/[^A-Za-z0-9_-]+/g, '_') + '.apoyosbt.json', new Blob([JSON.stringify(d)], { type: 'application/json' }))) toast('Proyecto exportado.');
}
async function importProject(file) {
  try { const j = JSON.parse(await file.text());
    if (j.apoyos || j.cables) { if (!S.db?.importAll) return toast('Importar bases solo está disponible en la versión local.'); S.db.importAll(j); return toast('Bases de apoyos y cables importadas.'); }
    const d = j.proyecto || j; S.proj = { ...exampleProject(), ...d, ctx: { ...DEF_CTX, ...d.ctx }, id: null };
    S.img = {}; S.sel = null; S.openEx = null; V.fitted = false; loadForm(); refreshAll(); toast('Proyecto abierto desde archivo.');
  } catch (e) { toast('El archivo no es un proyecto válido.'); }
}
function bindProjects() {
  $('#expProj').onclick = exportProject;
  $('#impProjFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importProject(f); e.target.value = ''; });
  const eb = $('#expBases'); if (eb) { eb.hidden = !LOCAL; eb.onclick = async () => { if (await saveFile('bases_apoyos_cables.json', new Blob([S.db.exportAll()], { type: 'application/json' }))) toast('Bases exportadas.'); }; }
  $('#saveProj').onclick = saveProject;
  $('#newProj').onclick = () => {
    const b = $('#newProj');
    if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Pulsa otra vez para vaciar'; b.classList.add('danger'); clearTimeout(b._t); b._t = setTimeout(() => { delete b.dataset.confirm; b.textContent = 'Nuevo proyecto'; b.classList.remove('danger'); }, 4000); return; }
    clearTimeout(b._t); delete b.dataset.confirm; b.textContent = 'Nuevo proyecto'; b.classList.remove('danger');
    nuevoProyecto();
  };
  $('#projList').addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.load) { const p = S.projs.find(x => x.id === b.dataset.load); try { const d = JSON.parse(p.datos); S.proj = { ...exampleProject(), ...d, ctx: { ...DEF_CTX, ...d.ctx }, id: p.id }; } catch (e) { toast('El proyecto guardado está dañado.'); return; }
      if (!S.proj.zone) S.proj.zone = S.proj.geo?.zone || null; S.proj.fondos = S.proj.fondos || {};
      S.img = {}; S.sel = null; S.openEx = null; S.pickEntronque = false; V.fitted = false; loadForm(); refreshAll(); toast('Proyecto abierto.'); }
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
  if (LOCAL) { document.title = 'Cálculo de Apoyos BT (local)'; $('#ver').textContent = 'v' + VERSION + ' · local'; }
  if (!LOCAL) $('#ver').textContent = 'v' + VERSION;
  loadForm(); bindForm(); bindRows(); bindMap(); bindProjects(); bindDbTables(); bindPrecios(); bindTabs();
  $('#kmlFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f, 'nuevo'); e.target.value = ''; });
  bindEntronque(); bindCoordForm(); bindPerfilAuto();
  $('#perfilFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f, 'perfil'); e.target.value = ''; });
  $('#exportZip').onclick = exportZip;
  $('#exportNote').textContent = 'Incluye DXF en ETRS89 UTM con la línea nueva y la existente, KML, GeoJSON, los fondos cargados con su archivo de mundo, tabla CSV y anexo de cálculo.';
  renderPrecios(); renderPoleTable(); renderCableTable(); renderProjList(); refreshAll();
  initDb();
}
start();
