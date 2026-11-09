/* ===== Aplicación ===== */
const VERSION = '1.17.0';
const $ = s => document.querySelector(s);
const fmt = (v, d = 0) => (v == null || isNaN(v)) ? '—' : Number(v).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const eur = v => fmt(v, 2) + ' €';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FUNCS = { auto: 'Automática', alineacion: 'Alineación', angulo: 'Ángulo', fin: 'Fin / inicio de línea', estrellamiento: 'Estrellamiento', derivacion: 'Derivación (existente)' };
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3200); }

const DEF_CTX = { zona: 'A', thetaMax: 50, tenseModo: 'normal', tenseNormal: 180, tenseReducido: 90, sobreEdificios: false, desequilibrio: 8, umbralAngulo: 3, distSuelo: 4, depthAmarre: 0.4, terreno: 'normal', tipos: 'HV+HVH', criterioPrecio: 'coste', vientoPoste: true, vanoMax: 40, dividir: true, rumbo0: 0 };
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
const CTX_FIELDS = ['zona', 'tenseModo', 'tenseNormal', 'tenseReducido', 'thetaMax', 'desequilibrio', 'depthAmarre', 'distSuelo', 'terreno', 'tipos', 'criterioPrecio', 'umbralAngulo', 'sobreEdificios', 'vientoPoste', 'vanoMax', 'dividir', 'rumbo0'];
function loadForm() {
  const c = S.proj.ctx; $('#p_nombre').value = S.proj.nombre || '';
  for (const k of CTX_FIELDS) { const el = $('#p_' + k); if (!el) continue; if (el.type === 'checkbox') el.checked = !!c[k]; else el.value = c[k]; }
  fillCableSelect();
}
function bindForm() {
  $('#p_nombre').addEventListener('input', e => { S.proj.nombre = e.target.value; renderProjName(); });
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
    let html = `<tr class="${S.sel === i ? 'sel' : ''}"><td><b>${apName(i)}</b>${S.proj.geo?.pts?.[i]?.nombre ? `<br><span class="note">${esc(S.proj.geo.pts[i].nombre)}</span>` : ''}</td><td class="n">${vano}</td><td class="n">${ang}</td><td class="n">${zc}</td><td>${cruce}</td><td>${fsel}</td><td>${hsel}</td><td>${msel}</td><td>${ex}</td><td>${del}</td></tr>`;
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
/* Entronque: si el modelo no está elegido, se toma de los datos del GIS (altura/esfuerzo) */
function autoModeloEntronque() {
  const k = S.proj.entronque?.k, r0 = S.proj.rows[0]; if (k == null || !r0 || !exNodes()[k] || !S.poles.length) return;
  if (r0.existente.modeloId) return;
  const p = modeloGis(k); if (!p) return;
  r0.existente.modeloId = p.id; const v = apoyoVerif(k); v.modeloId = p.id; v.modeloGis = true;
}
/* Entronque: cuando el cálculo de la línea nueva da el existente como válido, queda fijado como válido */
function autoValidaEntronque() {
  const k = S.proj.entronque?.k; if (k == null || !exNodes()[k]) return;
  const v = apoyoVerif(k), ok = !!S.calc?.results?.[0]?.existenteCheck?.ok;
  if (ok && !v.ok) { v.ok = true; v.autoOk = true; }
  else if (!ok && v.autoOk) { v.ok = false; delete v.autoOk; }
}

function recalc() {
  const cable = S.cables.find(c => c.id === S.proj.cableId);
  const zh = $('#zonaHint'); zh.textContent = S.proj.geo?.altMax != null ? `Cota máxima del KML: ${fmt(S.proj.geo.altMax)} m` : '';
  if (!cable || !S.poles.length || S.proj.rows.length < 2) { S.calc = null; renderResults(); return; }
  autoModeloEntronque();
  const nodes = currentNodes();
  try { const perfil = perfilPts(); S.calc = E.calcular({ nodes, cable, ctx: S.proj.ctx, poles: S.poles, perfil }); S.calc.conPerfil = !!perfil; S.calc.perfilDist = perfil && S.proj.perfil ? Math.max(...nodes.map(n => n.dPerfil || 0)) : 0; S.calc.nodes = nodes; S.calc.cable = cable; S.calc.bud = E.presupuesto(S.calc, nodes, cable, S.precios, S.proj.ctx.terreno); }
  catch (e) { console.error(e); S.calc = null; toast('Error de cálculo: ' + e.message); }
  autoValidaEntronque();
  renderResults(); renderPerfilInfo(); drawPerfil(); renderAnexo();
  if (S.proj.entronque?.k != null && !$('#exBody').contains(document.activeElement)) renderEntronque();
}
function statusOf(r, i) {
  const ex = S.proj.rows[i]?.existente?.activo;
  if (i === 0 && ex && S.proj.entronque?.k != null && r.existenteCheck?.ok) return { cls: 'ok', txt: 'Existente válido', col: 'ok' };
  if (i === 0 && ex && S.proj.entronque?.k != null && verifEstado().faltan.length) return { cls: 'warn', txt: 'Pendiente de verificar', col: 'warn' };
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
      let row = `<tr data-i="${i}" class="${S.sel === i ? 'sel' : ''}" style="cursor:pointer"><td><b>${apName(i)}</b></td><td>${FUNCS[r.func]}</td><td class="n">${i && i < c.results.length - 1 ? fmt(r.desvio, 1) + '°' : '—'}</td>
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
  const ve = verifEstado();
  if (ve.faltan.length) w.push(`<div class="banner bad">Verificación de la red existente incompleta: falta ${ve.faltan.map(esc).join(', ')}. La exportación está bloqueada hasta completarla.</div>`);
  if (ve.it) ve.it.apoyos.filter(a => a.k !== S.proj.entronque.k).forEach(a => { const cc = apoyoVerif(a.k).modeloId ? calcApoyoExistente(a.k) : null; if (cc?.r && cc.r.u > 1) w.push(`<div class="banner bad">El apoyo existente contiguo E${a.k + 1} no cumple con sus conductores (${fmt(cc.r.u * 100)} %). Revísalo.</div>`); });
  const sinLibre = c.spans.filter(s => s.libre != null && s.libre < s.dmin - 0.01);
  if (sinLibre.length) w.push(`<div class="banner bad">Distancia al suelo insuficiente en ${sinLibre.map(s => `A${s.i + 1}–A${s.i + 2} (${fmt(s.libre, 2)} m de ${fmt(s.dmin)} m)`).join(', ')}. Intercala un apoyo o permite apoyos más altos.</div>`);
  const tiro = c.results.filter(r => r.tiroArriba);
  if (tiro.length) w.push(`<div class="banner warn">Tiro hacia arriba (componente vertical ascendente) en ${tiro.map(r => apName(r.i)).join(', ')}: usa amarre en lugar de suspensión y asegura la sujeción (ITC-BT-06 3.9.1.1).</div>`);
  if (!c.conPerfil && (S.proj.modo === 'kml' || S.proj.entronque?.k != null)) w.push('<div class="banner warn">Cálculo sin perfil de elevación: se ha supuesto terreno llano. Carga el perfil de GPS Visualizer en «Trazado».</div>');
  { const mo = S.proj.ctx.tenseModo; const pedido = mo === 'normal' ? S.proj.ctx.tenseNormal : mo === 'reducido' ? S.proj.ctx.tenseReducido : null;
    w.push(`<div class="banner info">Tense de cálculo ${mo === 'max' ? 'máximo reglamentario' : mo}: ${fmt(c.Tmax)} daN (máximo reglamentario ${fmt(c.TmaxReg)} daN).${pedido != null && Number(pedido) > c.TmaxReg ? ' El valor indicado supera el máximo y se ha limitado.' : ''}</div>`); }
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

function informeRedEx() {
  const ve = verifEstado(); if (!ve.aplica || !ve.it) return '';
  const ex = exNodes(), en = S.proj.entronque, td = v => `<td>${v}</td>`, tn = v => `<td class="n">${v}</td>`;
  const rows = ve.it.apoyos.map(a => { const v = apoyoVerif(a.k), p = S.poles.find(x => x.id === v.modeloId), isEn = a.k === en.k;
    const c = isEn ? S.calc?.results?.[0]?.existenteCheck : (p ? calcApoyoExistente(a.k) : null);
    return `<tr>${td('E' + (a.k + 1) + (ex[a.k].nombre ? ' · ' + esc(ex[a.k].nombre) : ''))}${td(isEn ? 'Entronque (A1)' : esc(a.rol))}${td(p ? poleLabel(p) : '—')}${tn(c?.r ? fmt(c.r.u * 100, 1) : '—')}${td(c?.r ? (c.r.u <= 1 ? 'Cumple' : (isEn ? 'Sustituir' : 'No cumple')) : '—')}${td(v.ok ? 'Sí' : 'No')}</tr>`; }).join('');
  const lin = ve.it.lineas.map(L => { const d = lineData(L.lineId); return `<tr>${td(esc(L.nombre))}${tn(L.vanos.map(x => fmt(x, 1)).join(' / '))}${td(d.cab ? esc(d.cab.designacion) : '—')}${tn(fmt(d.tense))}${td(d.ok ? 'Sí' : 'No')}</tr>`; }).join('');
  return `<h2>5 bis. Red existente en el entronque</h2><table><thead><tr><th>Línea</th><th>Vanos (m)</th><th>Cable</th><th>Tense (daN)</th><th>Verificada</th></tr></thead><tbody>${lin}</tbody></table>
<table><thead><tr><th>Apoyo</th><th>Situación</th><th>Modelo</th><th>Util. %</th><th>Resultado</th><th>Verificado</th></tr></thead><tbody>${rows}</tbody></table>`;
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
${c.results.map((r, i) => { const sel = r.existenteCheck?.ok ? r.existenteCheck : r.elegido, p = sel?.pole, rr = sel?.r; return `<tr>${td(apName(i))}${td(FUNCS[r.func])}${td(p ? poleLabel(p) : '—')}${td(rr ? H.all.find(h => h.id === rr.hyp).nombre : '—')}${tn(rr ? fmt(rr.Fp) + ' / ' + fmt(p.En) : '—')}${tn(rr ? fmt(rr.Fs) + ' / ' + fmt(p.Es) : '—')}${tn(rr ? fmt(rr.u * 100, 1) : '—')}${tn(rr ? fmt(rr.phi) + '°' : '—')}${tn(r.z != null ? fmt(r.z, 1) : '—')}${tn(fmt(r.gravivano, 1))}${td(statusOf(r, i).txt + (r.tiroArriba ? ' · tiro hacia arriba' : ''))}</tr>`; }).join('')}</tbody></table>
<p class="s">Esfuerzos referidos a 0,25 m bajo cogolla por igualdad de momentos en el empotramiento; esfuerzos nominales con coeficiente de seguridad 2,5 incluido (ITC-BT-06, tabla 2). Viento sobre el fuste ${ctx.vientoPoste ? 'incluido (100 daN/m²)' : 'no incluido'}.</p>
${informeRedEx()}
<h2>6. Presupuesto</h2><table><thead><tr><th>Concepto</th><th>Ud</th><th>Cantidad</th><th>Coste</th><th>Venta</th></tr></thead><tbody>
${b.lineas.map(l => `<tr>${td(esc(l.concepto))}${td(l.ud)}${tn(fmt(l.cant, l.ud === 'ud' ? 0 : 1))}${tn(eur(l.coste))}${tn(eur(l.venta))}</tr>`).join('')}
<tr><th colspan="3">Total</th>${tn('<b>' + eur(b.tot.coste) + '</b>')}${tn('<b>' + eur(b.tot.venta) + '</b>')}</tr></tbody></table></body></html>`;
}
/* ---------- Nodos (coordenadas) ---------- */
/* Apoyos de la línea existente (con coordenadas UTM) */
/* ===== Red existente: líneas y apoyos por separado ===== */
/* ===== Red existente: identificadores estables ===== */
const uid = p => p + Math.random().toString(36).slice(2, 9);
function redEx() {
  if (!S.proj.redEx && S.proj.lineaEx) { const L = S.proj.lineaEx; S.proj.redEx = { lineas: [{ nombre: L.nombre, fuente: L.fuente, pts: L.pts }], apoyos: [] }; delete S.proj.lineaEx; }
  const R = S.proj.redEx; if (!R) return null;
  R.lineas.forEach(l => { if (!l.id) l.id = uid('l'); });
  (R.apoyos || []).forEach(a => { if (!a.id) a.id = uid('e'); });
  return R;
}
const poleKey = p => p.id || ('v:' + p.x.toFixed(1) + ',' + p.y.toFixed(1));
function verifData() { S.proj.verif = S.proj.verif || { apoyos: {}, lineas: {} }; return S.proj.verif; }

/* Recorre cada línea existente que pasa por P y devuelve, en cada sentido, el siguiente apoyo existente */
function polesAlong(P, kSelf, tol = 3) {
  const ex = exNodes(), hasApoyos = !!redEx()?.apoyos?.length, out = [];
  const isSelf = (Q, j) => j === kSelf || Math.hypot(Q.x - P.x, Q.y - P.y) < 0.5;
  const firstPoleOnSeg = (A, B) => { // apoyo más cercano a A sobre el segmento A→B
    let best = null;
    ex.forEach((Q, j) => { if (isSelf(Q, j)) return; const s = segDist(Q, A, B); if (s.d < tol && s.t > 0.001 && (!best || s.t < best.t)) best = { k: j, t: s.t, Q }; });
    return best;
  };
  exLineas().forEach(l => {
    const pts = l.pts;
    for (let i = 0; i < pts.length - 1; i++) {
      const s = segDist(P, pts[i], pts[i + 1]); if (s.d > tol) continue;
      for (const dir of [1, -1]) {
        let cur = P, idx = dir === 1 ? i + 1 : i, found = null, endPt = null;
        while (idx >= 0 && idx < pts.length) {
          const V = pts[idx];
          if (Math.hypot(V.x - cur.x, V.y - cur.y) > 0.5) {
            if (hasApoyos) found = firstPoleOnSeg(cur, V);
            else { const k = ex.findIndex(q => Math.hypot(q.x - V.x, q.y - V.y) < 0.5); if (k >= 0 && !isSelf(V, k)) found = { k, Q: V }; }
            if (found) break;
            endPt = V; cur = V;
          }
          idx += dir;
        }
        const Q = found ? found.Q : endPt; if (!Q) continue;
        const az = (Math.atan2(Q.x - P.x, Q.y - P.y) * 180 / Math.PI + 360) % 360;
        if (out.some(o => o.lineId === l.id && Math.abs(((o.az - az + 540) % 360) - 180) < 3)) continue;
        out.push({ lineId: l.id, lineName: l.nombre, k: found ? found.k : -1, Q, az, vano: Math.hypot(Q.x - P.x, Q.y - P.y) });
      }
    }
  });
  // líneas superpuestas (mismo tramo en dos archivos): se queda una por dirección
  return out.filter((o, i) => !out.slice(0, i).some(p => Math.abs(((p.az - o.az + 540) % 360) - 180) < 3));
}
/* Datos verificados de cada línea (cable y tense); sin datos, el cable y tense por defecto */
function lineData(lineId) {
  const v = verifData().lineas[lineId] || {}, en = S.proj.entronque || {};
  const cableId = v.cableId || en.cableId || '';
  return { cableId, tense: v.tense != null && v.tense !== '' ? Number(v.tense) : Number(en.tense) || 0, cab: S.cables.find(c => c.id === cableId), ok: !!v.ok, v };
}
function condsFromAlong(list, depth) {
  return list.map(d => { const L = lineData(d.lineId); return { cableId: L.cableId, az: Math.round(d.az * 10) / 10, vano: Math.round(d.vano * 10) / 10, tense: L.tense, diam: L.cab ? L.cab.diamHaz : 0, depth, deLinea: true, lineId: d.lineId, hacia: `${d.lineName || 'línea'} → ${d.k >= 0 ? 'E' + (d.k + 1) : 'extremo'}` }; });
}
function entronqueConductores() {
  const en = S.proj.entronque, ex = exNodes(); if (!en || en.k == null || !ex[en.k]) return [];
  return condsFromAlong(polesAlong(ex[en.k], en.k), Number(en.depth) || S.proj.ctx.depthAmarre);
}
/* Apoyos y líneas que hay que verificar: entronque, apoyos anterior y posterior en cada línea que pasa por él, y esas líneas */
function verifItems() {
  const en = S.proj.entronque, ex = exNodes(); if (!en || en.k == null || !ex[en.k]) return null;
  const along = polesAlong(ex[en.k], en.k);
  const apoyos = [{ k: en.k, rol: 'Entronque' }];
  along.forEach(d => { if (d.k >= 0 && !apoyos.some(a => a.k === d.k)) apoyos.push({ k: d.k, rol: `${d.lineName}: contiguo` }); });
  const lineas = [...new Map(along.map(d => [d.lineId, { lineId: d.lineId, nombre: d.lineName, vanos: along.filter(x => x.lineId === d.lineId).map(x => x.vano) }])).values()];
  return { apoyos, lineas, along };
}
function apoyoVerif(k) {
  const ex = exNodes(), key = poleKey(ex[k]), v = verifData().apoyos[key] || (verifData().apoyos[key] = {});
  if (k === S.proj.entronque?.k) { const r0 = S.proj.rows[0]; if (r0) { v.modeloId = r0.existente.modeloId || v.modeloId || ''; v.azPrincipal = r0.existente.azPrincipal ?? v.azPrincipal ?? ''; } }
  return v;
}
/* Comprobación mecánica de un apoyo existente contiguo con sus líneas verificadas */
function calcApoyoExistente(k) {
  const ex = exNodes(), P = ex[k], v = apoyoVerif(k), pole = S.poles.find(p => p.id === v.modeloId);
  const conds = condsFromAlong(polesAlong(P, k), Number(S.proj.entronque?.depth) || S.proj.ctx.depthAmarre);
  if (!pole || !conds.length) return { conds, pole, r: null };
  const cable = S.cables.find(c => c.id === S.proj.cableId) || S.cables[0]; if (!cable) return { conds, pole, r: null };
  const hyp = E.hypotheses(S.proj.ctx.zona, E.cableProps(cable), S.proj.ctx.thetaMax);
  const ctx = { ...S.proj.ctx, hyp, deseq: (S.proj.ctx.desequilibrio || 0) / 100 };
  let func = 'estrellamiento';
  if (conds.length === 1) func = 'fin';
  else if (conds.length === 2) { const dv = 180 - Math.abs(((conds[0].az - conds[1].az + 540) % 360) - 180); func = dv <= S.proj.ctx.umbralAngulo ? 'alineacion' : 'angulo'; }
  const ap = { func, conds: conds.map(c => ({ az: c.az, T: { V15: c.tense, V0: c.tense, H0: c.tense }, a: c.vano, pv: 50 * (c.diam || 0) / 1000, depth: c.depth })) };
  let rx = 0, ry = 0; ap.conds.forEach(c => { const r = c.az * Math.PI / 180; rx += c.T.V15 * Math.sin(r); ry += c.T.V15 * Math.cos(r); });
  ap.ref = Math.hypot(rx, ry) > 1 ? (Math.atan2(rx, ry) * 180 / Math.PI + 360) % 180 : conds[0].az % 180;
  const phi = v.azPrincipal === '' || v.azPrincipal == null ? null : Number(v.azPrincipal);
  return { conds, pole, func, r: E.evaluatePole(pole, ap, ctx, phi), orientacionSupuesta: phi == null };
}
/* Estado de la verificación obligatoria */
function verifEstado() {
  const R = redEx(); if (!R || (!R.lineas.length && !R.apoyos?.length)) return { aplica: false, faltan: [] };
  const faltan = [];
  const it = verifItems();
  if (!it) return { aplica: true, faltan: ['elegir el apoyo de entronque'], it: null };
  if (!it.lineas.length) faltan.push(`el apoyo E${S.proj.entronque.k + 1} no está sobre ninguna línea existente`);
  it.lineas.forEach(L => { const d = lineData(L.lineId); if (!d.v.cableId || !(d.tense > 0) || !d.ok) faltan.push(`línea «${L.nombre}»`); });
  it.apoyos.forEach(a => { const v = apoyoVerif(a.k); if (!v.modeloId || !v.ok) faltan.push(`apoyo E${a.k + 1}${a.k === S.proj.entronque.k ? ' (entronque)' : ''}`); });
  return { aplica: true, faltan, it };
}

function applyExLineas(lines, fname) {
  if (!lines.length) return toast('El archivo no contiene líneas (LineString).');
  const zone = setZoneFrom(lines[0].pts[0]);
  const R = redEx() || (S.proj.redEx = { lineas: [], apoyos: [] });
  snapshot();
  R.lineas = R.lineas.filter(l => l.fuente !== fname).concat(lines.map(l => ({ id: uid('l'), nombre: l.nombre, fuente: fname, attrs: l.attrs || {}, pts: l.pts.map(p => ({ lat: p.lat, lon: p.lon, ...E.utmFromLatLon(p.lat, p.lon, zone) })) })));
  invalidateVert(); ensureEntronque(); V.fitted = false; refreshAll();
  toast(`${lines.length} línea(s) existente(s) importada(s) de ${fname}. Elige el apoyo de entronque y verifica sus datos.`);
}
function applyExApoyos(points, fname) {
  if (!points.length) return toast('El archivo no contiene marcadores de apoyos (Point).');
  const zone = setZoneFrom(points[0]);
  const R = redEx() || (S.proj.redEx = { lineas: [], apoyos: [] });
  snapshot();
  const prevEn = S.proj.entronque?.k != null ? exNodes()[S.proj.entronque.k] : null;
  R.apoyos = (R.apoyos || []).filter(a => a.fuente !== fname).concat(points.map(p => ({ id: uid('e'), lat: p.lat, lon: p.lon, nombre: p.nombre || '', attrs: p.attrs || {}, fuente: fname, ...E.utmFromLatLon(p.lat, p.lon, zone) })));
  invalidateVert(); ensureEntronque();
  if (prevEn) { const k = exNodes().findIndex(a => Math.hypot(a.x - prevEn.x, a.y - prevEn.y) < 1); S.proj.entronque.k = k >= 0 ? k : null; }
  V.fitted = false; refreshAll();
  toast(`${points.length} apoyo(s) existente(s) importado(s) de ${fname}.`);
}

/* ===== Panel de red existente, entronque y verificación ===== */
function renderEntronque() {
  const box = $('#exBody'), R = redEx(), en = S.proj.entronque;
  if (!R || (!R.lineas.length && !R.apoyos?.length && !R.puntosDC?.length)) { box.innerHTML = '<p class="note">Importa por separado los tres archivos de la red existente: apoyos, tramo baja y puntos D-C (KMZ/KML; puedes importar varios de cada tipo). Después eliges el apoyo de entronque y verificas sus datos, los de los apoyos contiguos y los de los tramos que pasan por él. De los puntos D-C solo se rotula parte del CUPS.</p>'; return; }
  ensureEntronque();
  if (!S.proj.rows.length) { S.proj.rows.push(Object.assign(newRow(), { vano: 0 })); S.proj.rows.push(newRow()); }
  const ex = exNodes();
  const fuentes = (arr, tipo) => [...new Set(arr.map(x => x.fuente))].map(f => `<span class="chip info">${esc(f)} · ${arr.filter(x => x.fuente === f).length} ${tipo}</span> <button class="btn small ghost" data-delsrc="${esc(f)}" data-tipo="${tipo}" aria-label="Quitar ${esc(f)}">✕</button>`).join(' ');
  const poleOpts = sel => `<option value="">Elegir modelo…</option>` + S.poles.map(p => `<option value="${esc(p.id)}" ${sel === p.id ? 'selected' : ''}>${poleLabel(p)}</option>`).join('');
  const cabOpts = sel => `<option value="">Elegir cable…</option>` + S.cables.map(c => `<option value="${esc(c.id)}" ${sel === c.id ? 'selected' : ''}>${esc(c.designacion)}</option>`).join('');
  const est = verifEstado(), it = est.it;
  if (it) it.lineas.forEach(L => { const l = exLineas().find(x => x.id === L.lineId), v = verifData().lineas[L.lineId] || (verifData().lineas[L.lineId] = {}); if (l && !v.cableId && !v.gisTried) { v.gisTried = true; const id = cableFromConductor(conductorTramo(l)); if (id) v.cableId = id; } });
  let html = `<div class="row" style="gap:6px">${fuentes(R.apoyos || [], 'apoyos')} ${fuentes(R.lineas, 'tramos')} ${fuentes(R.puntosDC || [], 'puntos D-C')}</div>
    ${!R.apoyos?.length ? '<p class="note" style="margin-top:6px">Sin archivo de apoyos existentes: se toman como apoyos los vértices de las líneas.</p>' : ''}
    <div class="fields" style="margin-top:10px">
      <label class="f">Apoyo de entronque<select id="en_k"><option value="">Sin elegir</option>${ex.length <= 800 ? ex.map((p, i) => `<option value="${i}" ${en.k === i ? 'selected' : ''}>E${i + 1}${p.nombre ? ' · ' + esc(p.nombre) : ''}</option>`).join('') : (en.k != null ? `<option value="${en.k}" selected>E${en.k + 1}</option>` : '')}</select></label>
      <div class="f" style="justify-content:flex-end"><button class="btn small" id="en_pick">${S.pickEntronque ? 'Pulsa un apoyo E en el plano…' : 'Elegir en el plano'}</button></div>
      <label class="f">Amarre existente bajo cogolla (m)<input id="en_depth" class="num" type="number" step="0.05" value="${en.depth}"></label>
    </div>`;
  if (it) {
    const done = est.faltan.length === 0;
    html += `<h3 class="vh">Verificación obligatoria <span class="chip ${done ? 'ok' : 'bad'}">${done ? 'completa' : `faltan ${est.faltan.length}`}</span></h3>
      <p class="note">Comprueba en campo o en tu inventario cada dato y marca «Verificado». Si cambias un dato verificado, hay que volver a marcarlo. Sin la verificación completa no se puede exportar.</p>
      <div class="tablewrap"><table class="vt"><thead><tr><th>Línea que pasa por E${en.k + 1}</th><th class="n">Vanos (m)</th><th>Cable</th><th class="n">Tense (daN)</th><th>Verificada</th></tr></thead><tbody>
      ${it.lineas.map(L => { const d = lineData(L.lineId), cond = conductorTramo(exLineas().find(x => x.id === L.lineId) || {}); return `<tr><td>${esc(L.nombre)}${cond ? `<br><span class="note">GIS: ${esc(cond)}</span>` : ''}</td><td class="n">${L.vanos.map(v => fmt(v, 1)).join(' / ')}</td>
        <td><select data-vl="cableId" data-id="${esc(L.lineId)}">${cabOpts(d.v.cableId)}</select></td>
        <td class="n"><input class="num" type="number" step="10" data-vl="tense" data-id="${esc(L.lineId)}" value="${d.v.tense ?? ''}" placeholder="daN"></td>
        <td><label class="chk"><input type="checkbox" data-vl="ok" data-id="${esc(L.lineId)}" ${d.ok ? 'checked' : ''} ${d.v.cableId && d.tense > 0 ? '' : 'disabled'}> ${d.ok ? '<span class="chip ok">sí</span>' : '<span class="chip bad">no</span>'}</label></td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">Ninguna línea existente pasa por este apoyo (tolerancia 3 m). Revisa el apoyo de entronque o mueve el apoyo en el plano.</td></tr>'}
      </tbody></table></div>
      <div class="tablewrap" style="margin-top:8px"><table class="vt"><thead><tr><th>Apoyo existente</th><th>Modelo</th><th class="n">Eje principal (°)</th><th>Comprobación</th><th>Verificado</th></tr></thead><tbody>
      ${it.apoyos.map(a => {
        const v = apoyoVerif(a.k), P = ex[a.k], isEn = a.k === en.k;
        let comp = '—';
        { const pm = S.poles.find(x => x.id === v.modeloId), eg = parseFloat(String(esfuerzoApoyo(redEx()?.apoyos?.[a.k] || {})).replace(',', '.')); if (pm && eg && Math.abs(pm.En - eg) > 1) v.avisoEsf = `El modelo elegido (${pm.En} daN) no coincide con el esfuerzo del GIS (${eg} daN).`; else delete v.avisoEsf; }
        if (isEn) { const r = S.calc?.results?.[0]; const c = r?.existenteCheck; comp = c?.r ? `${fmt(c.r.u * 100)} % · ${c.ok ? '<span class="chip ok">válido</span>' : '<span class="chip bad">sustituir</span>'}` : (v.modeloId ? 'pendiente de cálculo' : '—'); }
        else { const c = v.modeloId ? calcApoyoExistente(a.k) : null; comp = c?.r ? `${FUNCS[c.func]} · ${fmt(c.r.u * 100)} % · ${c.r.u <= 1 ? '<span class="chip ok">válido</span>' : '<span class="chip bad">no cumple</span>'}` : (v.modeloId ? 'sin conductores' : '—'); }
        return `<tr data-k="${a.k}"><td><b>E${a.k + 1}</b>${P.nombre ? ' · ' + esc(P.nombre) : ''}<br><span class="note">${isEn ? 'Entronque (A1)' : esc(a.rol)}${esfLabel(a.k) ? ' · GIS: ' + esc(esfLabel(a.k)) : ''}</span></td>
          <td><select data-va="modeloId" data-k="${a.k}">${poleOpts(v.modeloId)}</select></td>
          <td class="n"><input class="num" type="number" data-va="azPrincipal" data-k="${a.k}" value="${esc(v.azPrincipal ?? '')}" placeholder="Desconocido"></td>
          <td>${comp}${v.avisoEsf ? `<br><span class="chip warn">${esc(v.avisoEsf)}</span>` : ''}</td>
          <td><label class="chk"><input type="checkbox" data-va="ok" data-k="${a.k}" ${v.ok ? 'checked' : ''} ${v.modeloId ? '' : 'disabled'}> ${v.ok ? '<span class="chip ok">sí</span>' : '<span class="chip bad">no</span>'}</label></td></tr>`; }).join('')}
      </tbody></table></div>
      ${!done ? `<div class="banner bad" style="margin-top:8px">Falta verificar: ${est.faltan.map(esc).join(', ')}.</div>` : ''}`;
  } else html += `<div class="banner warn" style="margin-top:8px">Elige el apoyo de entronque para verificar la red existente.</div>`;
  html += `<details style="margin-top:10px"><summary class="note">Textos de la red existente en el plano</summary>
    <div class="tablewrap" style="margin-top:6px;max-height:260px;overflow:auto"><table class="vt"><thead><tr><th>Elemento</th><th>Texto en el plano</th></tr></thead><tbody>
    ${exLineas().map((l, li) => `<tr><td>Línea · ${esc(l.nombre)}</td><td><input type="text" data-lab-l="${li}" value="${esc(l.etiqueta ?? l.nombre ?? '')}"></td></tr>`).join('')}
    ${(R.apoyos || []).map((a, i) => `<tr><td>Apoyo E${i + 1}${a.nombre ? ' · ' + esc(a.nombre) : ''}</td><td><input type="text" data-lab-a="${i}" value="${esc(exLabel(i))}"></td></tr>`).join('')}
    ${(R.puntosDC || []).map((d, i) => `<tr><td>Punto D-C · ${d.cups ? esc(d.cups) : '<span class="chip warn">sin CUPS</span>'}</td><td><input type="text" data-lab-dc="${i}" value="${esc(dcLabel(d))}"></td></tr>`).join('')}
    </tbody></table></div><p class="note">En las líneas se añade detrás el cable verificado. Deja un texto vacío para no rotularlo.</p></details>
    <div class="row" style="margin-top:8px"><button class="btn small ghost" id="en_del">Quitar toda la red existente</button></div>`;
  box.innerHTML = html;
}
function bindEntronque() {
  $('#exLinFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f, 'exLineas'); e.target.value = ''; });
  $('#exApoFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f, 'exApoyos'); e.target.value = ''; });
  $('#exDCFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f, 'exDC'); e.target.value = ''; });
  const box = $('#exBody');
  box.addEventListener('change', ev => {
    const t = ev.target, en = S.proj.entronque; if (!en) return;
    if (t.id === 'en_k') return setEntronque(t.value === '' ? null : Number(t.value));
    if (t.id === 'en_depth') en.depth = Number(t.value);
    if (t.dataset.labL != null) { const l = exLineas()[Number(t.dataset.labL)]; if (l) l.etiqueta = t.value; drawMap(); return; }
    if (t.dataset.labDc != null) { const d = exDC()[Number(t.dataset.labDc)]; if (d) d.etiqueta = t.value; drawMap(); return; }
    if (t.dataset.labA != null) { const a = redEx().apoyos[Number(t.dataset.labA)]; if (a) a.etiqueta = t.value; drawMap(); return; }
    if (t.dataset.vl) {
      const L = verifData().lineas[t.dataset.id] || (verifData().lineas[t.dataset.id] = {});
      if (t.dataset.vl === 'ok') L.ok = t.checked;
      else { L[t.dataset.vl] = t.dataset.vl === 'tense' ? (t.value === '' ? '' : Number(t.value)) : t.value; L.ok = false; }
    }
    if (t.dataset.va) {
      const k = Number(t.dataset.k), v = apoyoVerif(k);
      if (t.dataset.va === 'ok') v.ok = t.checked;
      else { v[t.dataset.va] = t.value; v.ok = false; if (k === en.k) { const r0 = S.proj.rows[0]; if (r0) r0.existente[t.dataset.va] = t.value; } }
    }
    refreshAll();
  });
  box.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    const tr = ev.target.closest('tr[data-k]'); if (tr && !b && !ev.target.closest('select,input,label')) { S.selPt = { layer: 'exApoyos', li: 0, i: Number(tr.dataset.k) }; renderPtEdit(); drawMap(); }
    if (!b) return;
    if (b.id === 'en_pick') { S.pickEntronque = !S.pickEntronque; S.tool = 'pan'; renderEdBar(); renderEntronque(); if (S.pickEntronque) toast('Pulsa en el plano el apoyo existente (círculo E) del que parte la línea nueva.'); }
    if (b.id === 'en_del') { snapshot(); S.proj.redEx = null; S.proj.entronque = null; S.proj.verif = null; if (!S.proj.geo) S.proj.zone = null; S.pickEntronque = false; V.fitted = false; refreshAll(); }
    if (b.dataset.delsrc) {
      snapshot(); const R = redEx(), f = b.dataset.delsrc;
      if (b.dataset.tipo === 'tramos') R.lineas = R.lineas.filter(l => l.fuente !== f);
      else if (b.dataset.tipo === 'puntos D-C') R.puntosDC = (R.puntosDC || []).filter(a => a.fuente !== f);
      else { R.apoyos = R.apoyos.filter(a => a.fuente !== f); if (S.proj.entronque) S.proj.entronque.k = null; }
      invalidateVert(); refreshAll();
    }
  });
}

/* ===== Tarjetas plegables ===== */
function initCollapsibles() {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('apoyosBT.plegadas') || '{}'); } catch (e) { }
  document.querySelectorAll('section.card').forEach((sec, n) => {
    const h = sec.querySelector(':scope > h2'); if (!h || sec.dataset.fold) return;
    const key = (sec.closest('[id^="tab-"]')?.id || '') + ':' + (h.childNodes[0]?.textContent || '').trim();
    sec.dataset.fold = key;
    const body = document.createElement('div'); body.className = 'cardbody';
    while (h.nextSibling) body.appendChild(h.nextSibling);
    sec.appendChild(body);
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'fold'; btn.setAttribute('aria-label', 'Minimizar o desplegar');
    h.prepend(btn);
    const set = c => { sec.classList.toggle('folded', c); btn.setAttribute('aria-expanded', String(!c)); btn.textContent = c ? '▸' : '▾'; if (!c) { drawMap(); drawPerfil(); } };
    set(!!saved[key]);
    const toggle = () => { const c = !sec.classList.contains('folded'); set(c); saved[key] = c; try { localStorage.setItem('apoyosBT.plegadas', JSON.stringify(saved)); } catch (e) { } };
    btn.addEventListener('click', toggle);
    h.addEventListener('dblclick', ev => { if (!ev.target.closest('button,label,input,select')) toggle(); });
  });
  const all = $('#foldAll'); if (all) all.onclick = () => {
    const secs = [...document.querySelectorAll('section.card[data-fold]')].filter(s => s.offsetParent); const anyOpen = secs.some(s => !s.classList.contains('folded'));
    secs.forEach(s => { if (anyOpen !== s.classList.contains('folded')) s.querySelector('.fold').click(); });
  };
}

/* Puntos D-C: solo se rotula parte del CUPS (7 caracteres a partir del 12.º) */
function exDC() { return redEx()?.puntosDC || []; }
const CUPS_RE = /ES[\s.-]?(?:\d[\s.-]?){16}[A-Z]{2}(?:[\s.-]?\d[A-Z])?/i;
function findCups(txt) { const m = String(txt || '').match(CUPS_RE); return m ? m[0].replace(/[\s.-]/g, '').toUpperCase() : ''; }
function cupsCorto(c) { c = String(c || '').replace(/\s/g, ''); return c.length >= 18 ? c.substring(11, 18) : ''; }
function dcLabel(p) { return p.etiqueta != null ? p.etiqueta : cupsCorto(p.cups); }
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
  const ex = [...exNodes(), ...exLineas().flatMap(l => l.pts), ...exDC()];
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
/* ===== Capas visibles del plano ===== */
const CAPAS = [
  ['grupo', 'Proyecto'], ['nuevo', 'Apoyos nuevos'], ['nuevoTxt', 'Textos de apoyos nuevos'], ['linea', 'Línea nueva'], ['vanos', 'Longitud de vanos'], ['cable', 'Cable del proyecto'], ['ruta', 'Ruta del trazado'],
  ['grupo', 'Red existente'], ['exApoyos', 'Apoyos existentes'], ['exApoyosTxt', 'Textos de apoyos'], ['exLineas', 'Tramos baja'], ['exLineasTxt', 'Textos y conductor de tramos'], ['exDC', 'Puntos D-C'], ['exDCTxt', 'CUPS de puntos D-C'],
  ['grupo', 'Fondo'], ['orto', 'Ortofoto PNOA'], ['catastro', 'Catastro'], ['rejilla', 'Cuadrícula']];
function vis(k) { if (k === 'orto' || k === 'catastro') return S.proj.fondos?.[k]?.visible !== false; return S.proj.capas?.[k] !== false; }
function setVis(k, on) {
  if (k === 'orto' || k === 'catastro') { S.proj.fondos = S.proj.fondos || {}; const f = S.proj.fondos[k] || (S.proj.fondos[k] = {}); f.visible = on; f.userVis = true; renderFondos(); }
  else { S.proj.capas = S.proj.capas || {}; S.proj.capas[k] = on; }
  drawMap(); renderCapas();
}
function renderCapas() {
  const box = $('#capasPanel'); if (!box) return;
  let html = '';
  CAPAS.forEach(([k, n]) => {
    if (k === 'grupo') { html += `${html ? '</div>' : ''}<div class="capgrp"><b>${n}</b>`; return; }
    const fondoSin = (k === 'orto' || k === 'catastro') && !(S.proj.fondos?.[k]?.url || S.proj.fondos?.[k]?.blobUrl || S.proj.fondos?.[k]?.assetId);
    html += `<label class="chk"><input type="checkbox" data-capa="${k}" ${vis(k) ? 'checked' : ''} ${fondoSin ? 'disabled' : ''}> ${n}${fondoSin ? ' <span class="note">(sin cargar)</span>' : ''}</label>`;
  });
  box.innerHTML = html + '</div><button class="btn small" id="capasTodas" type="button">Mostrar todas</button>';
  $('#capasTodas').onclick = mostrarTodas;
  const n = CAPAS.filter(([k]) => k !== 'grupo' && !vis(k)).length; $('#capasBtn').textContent = n ? `Capas (${n} ocultas)` : 'Capas';
}
function bindCapas() {
  $('#capasBtn').onclick = () => { const p = $('#capasPanel'); p.hidden = !p.hidden; $('#capasBtn').setAttribute('aria-expanded', String(!p.hidden)); renderCapas(); };
  $('#capasPanel').addEventListener('change', ev => { const k = ev.target.dataset.capa; if (k) setVis(k, ev.target.checked); });
  window.mostrarTodas = () => { CAPAS.forEach(([k]) => { if (k !== 'grupo') { if (k === 'orto' || k === 'catastro') { if (S.proj.fondos?.[k]) { S.proj.fondos[k].visible = true; S.proj.fondos[k].userVis = true; } } else { S.proj.capas = S.proj.capas || {}; S.proj.capas[k] = true; } } }); renderFondos(); renderCapas(); drawMap(); };
  renderCapas();
}
/* Textos del plano de la red existente (editables) y del cable */
const shortCable = d => String(d || '').replace(/^RZ\s*0,6\/1\s*kV\s*/i, 'RZ ');
/* Nombre de los apoyos de la línea nueva: A1 toma el nombre del apoyo existente de entronque */
function apName(i) { const k = S.proj.entronque?.k; if (i === 0 && k != null && exNodes()[k]) return exLabel(k); return 'A' + (i + 1); }
/* Modelo de la base que corresponde a los datos del GIS de un apoyo existente (altura y esfuerzo) */
function modeloGis(k) {
  const a = redEx()?.apoyos?.[k], P = exNodes()[k]; if (!P) return null;
  const num = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(x) ? null : x; };
  let esf = a ? num(esfuerzoApoyo(a)) : null, alt = a ? num(attrFind(a.attrs, kk => /^altura\b/.test(kk) || /altura total/.test(kk))) : null;
  for (const t of [P.etiqueta, P.nombre, a?.nombre]) { const m = String(t || '').match(/(\d{1,2}(?:[.,]\d+)?)\s*\/\s*(\d{3,4})/); if (m) { alt = alt ?? num(m[1]); esf = esf ?? num(m[2]); break; } }
  if (esf == null || alt == null) return null;
  const c = S.poles.filter(p => Math.abs(p.En - esf) < 1 && Math.abs(p.altura - alt) < 0.01);
  return c.find(p => /^HV$/i.test(p.tipo)) || c[0] || null;
}
function exLabel(i) { const p = exNodes()[i]; return p && p.etiqueta != null ? p.etiqueta : 'E' + (i + 1); }
function lineLabel(l) {
  const base = l.etiqueta != null ? l.etiqueta : l.nombre || '';
  const cond = conductorTramo(l);
  const d = lineData(l.id); const cab = cond || (d.v.cableId && d.cab ? shortCable(d.cab.designacion) : '');
  return [base, cab].filter(Boolean).join(' · ');
}
function esfLabel(i) { const a = redEx()?.apoyos?.[i]; if (!a) return ''; const v = esfuerzoApoyo(a); if (!v) return ''; return /dan/i.test(v) ? v : `${v} daN`; }
const PRINT_COLORS = { '--dc': '#7a3e8f', '--map': '#ffffff', '--ink': '#1b2328', '--muted': '#4c5960', '--accent': '#1d5b86', '--exist': '#6d6a64', '--panel': '#ffffff', '--grid': '#e6eaec', '--ok': '#2f7d4f', '--warn': '#a66a00', '--bad': '#b3362c', '--f-body': 'Arial, sans-serif', '--f-mono': 'Consolas, monospace' };
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
  if (nodes.length < 2 && ex.length < 1 && !lines.length && !exDC().length) {
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
  if (!hasFondo && vis('rejilla')) {
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
  if (ruta.length > 1 && vis('ruta')) {
    g.strokeStyle = col('--accent'); g.globalAlpha = 0.45; g.lineWidth = 1.5; g.setLineDash([2, 4]); g.beginPath(); ruta.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    if (screen && tool !== 'pan' && L === 'ruta') ruta.forEach((n, i) => { const [x, y] = P(n); vtx(x, y, S.selPt?.layer === 'ruta' && S.selPt.i === i); });
  }
  // Líneas existentes con su texto (y su cable verificado)
  if (vis('exLineas')) lines.forEach((l, li) => {
    g.strokeStyle = col('--exist'); g.lineWidth = 3; g.setLineDash([8, 5]); g.beginPath(); l.pts.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
    const ls = longestSeg(l.pts); const txt = lineLabel(l);
    if (vis('exLineasTxt') && ls.i >= 0 && txt && ls.len > g.measureText(txt).width * 0.6) alongText(txt, l.pts[ls.i], l.pts[ls.i + 1], -1, 'italic 600 11px ' + col('--f-body'), col('--exist'));
    if (screen && tool !== 'pan' && L === 'exLineas') l.pts.forEach((n, i) => { const [x, y] = P(n); vtx(x, y, S.selPt?.layer === 'exLineas' && S.selPt.li === li && S.selPt.i === i); });
  });
  if (vis('exApoyos') || S.pickEntronque) ex.forEach((n, i) => {
    const [x, y] = P(n); if (!inView(x, y)) return;
    const isEn = S.proj.entronque?.k === i, isSel = screen && S.selPt?.layer === 'exApoyos' && S.selPt.i === i;
    g.fillStyle = isEn ? col('--accent') : col('--exist'); g.strokeStyle = isSel ? col('--ink') : col('--panel'); g.lineWidth = isSel ? 3 : 2;
    g.beginPath(); g.arc(x, y, isEn ? 7 : 5, 0, Math.PI * 2); g.fill(); g.stroke();
    const lab = exLabel(i);
    const dupA1 = isEn && vis('nuevo') && vis('nuevoTxt') && (S.proj.rows.length > 1);   // el nombre ya lo lleva A1
    if (vis('exApoyosTxt') && lab && !dupA1 && (sc > 0.6 || isEn || !screen)) { g.fillStyle = col('--exist'); g.font = '600 11px ' + col('--f-body'); g.textAlign = 'right'; halo(lab, x - 8, y - 7); }
  });
  // Puntos D-C: rombo y CUPS abreviado
  if (vis('exDC')) exDC().forEach((d, i) => {
    const [x, y] = P(d); if (!inView(x, y)) return;
    const isSel = screen && S.selPt?.layer === 'exDC' && S.selPt.i === i;
    g.fillStyle = col('--dc'); g.strokeStyle = isSel ? col('--ink') : col('--panel'); g.lineWidth = isSel ? 2.5 : 1.5;
    g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath(); g.fill(); g.stroke();
    const lab = dcLabel(d);
    if (!vis('exDCTxt')) return;
    if (lab && (sc > 0.5 || !screen)) { g.fillStyle = col('--dc'); g.font = '600 10px ' + col('--f-mono'); g.textAlign = 'left'; halo(lab, x + 8, y + 4); }
    else if (!d.cups && screen) { g.fillStyle = col('--bad'); g.font = '600 10px ' + col('--f-body'); g.textAlign = 'left'; halo('sin CUPS', x + 8, y + 4); }
  });
  if (nodes.length > 1) {
    if (vis('linea')) { g.strokeStyle = col('--accent'); g.lineWidth = 2.5; g.beginPath(); nodes.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    g.font = '11px ' + col('--f-mono'); g.textAlign = 'center';
    if (vis('vanos')) for (let i = 0; i < nodes.length - 1; i++) { const a = Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].y - nodes[i].y); alongText(fmt(a, 1) + ' m', nodes[i], nodes[i + 1], -1, '11px ' + col('--f-mono'), col('--ink')); }
    // Cable del proyecto sobre el vano más largo de la línea nueva
    const cable = S.cables.find(c => c.id === S.proj.cableId);
    if (cable && vis('cable')) { const ls = longestSeg(nodes); if (ls.i >= 0) alongText(shortCable(cable.designacion), nodes[ls.i], nodes[ls.i + 1], 1, '600 11px ' + col('--f-body'), col('--accent')); }
    nodes.forEach(n => {
      const e = n.existente; if (!e?.activo) return; const [x, y] = P(n);
      g.strokeStyle = col('--exist'); g.setLineDash([4, 4]); g.lineWidth = 1.5;
      (e.conductores || []).filter(c => !c.deLinea).forEach(c => { const u = { x: Math.sin(c.az * Math.PI / 180), y: Math.cos(c.az * Math.PI / 180) }; g.beginPath(); g.moveTo(x, y); g.lineTo(x + u.x * 40, y - u.y * 40); g.stroke(); });
      g.setLineDash([]);
    });
    if (vis('nuevo')) nodes.forEach((n, i) => {
      const [x, y] = P(n); const r = S.drag ? null : S.calc?.results[i]; const st = r ? statusOf(r, i) : { col: 'muted' };
      g.fillStyle = col('--' + st.col); g.strokeStyle = col('--panel'); g.lineWidth = 2;
      g.beginPath(); g.rect(x - 6, y - 6, 12, 12); g.fill(); g.stroke();
      if (screen && (S.sel === i || (S.selPt?.layer === 'nuevo' && S.selPt.i === i))) { g.strokeStyle = col('--ink'); g.lineWidth = 2; g.strokeRect(x - 10, y - 10, 20, 20); }
      if (!vis('nuevoTxt')) return;
      g.fillStyle = col('--ink'); g.font = '600 12px ' + col('--f-body'); g.textAlign = 'left'; halo(apName(i), x + 9, y - 8);
      const p = r && (r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole);
      if (p && !(isEntronqueA1(i) && r.existenteCheck?.ok)) { g.fillStyle = col('--muted'); g.font = '10px ' + col('--f-mono'); halo((isEntronqueA1(i) ? 'Sustituir por ' : '') + poleLabel(p), x + 9, y + 15); }
    });
  }
  if (screen) {
    const sl = niceStep(120 / sc); g.fillStyle = col('--panel'); g.fillRect(8, Hh - 38, sl * sc + 16, 30);
    g.strokeStyle = col('--ink'); g.lineWidth = 2; g.beginPath(); g.moveTo(14, Hh - 14); g.lineTo(14 + sl * sc, Hh - 14); g.stroke();
    g.fillStyle = col('--ink'); g.font = '11px ' + col('--f-mono'); g.textAlign = 'left'; g.fillText(fmt(sl) + ' m', 14, Hh - 22);
  }
  g.textAlign = 'center'; g.font = '600 12px ' + col('--f-body'); g.fillStyle = col('--ink'); halo('N', W - 20, 20); g.beginPath(); g.moveTo(W - 20, 26); g.lineTo(W - 25, 40); g.lineTo(W - 15, 40); g.closePath(); g.fill();
  if (screen && S.snap) { const [sx, sy] = P(S.snap); g.save(); g.strokeStyle = col('--accent'); g.lineWidth = 2.5; g.setLineDash([5, 3]); g.beginPath(); g.arc(sx, sy, 18, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.moveTo(sx - 6, sy); g.lineTo(sx + 6, sy); g.moveTo(sx, sy - 6); g.lineTo(sx, sy + 6); g.stroke();
    g.font = '600 11px ' + col('--f-body'); g.fillStyle = col('--accent'); g.textAlign = 'left'; halo(S.snap.label, sx + 22, sy - 12); g.restore(); }
  if (screen) { $('#mapInfo').textContent = S.proj.zone ? `ETRS89 · UTM huso ${S.proj.zone}` : 'Coordenadas locales (entrada manual)'; S.mapT = { P, nodes, ex }; }
  return { fondoOmitido };
}
function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
function zoomAt(f, mx, my) {
  const cv = $('#map'), W = cv.clientWidth, Hh = cv.clientHeight; if (!V.sc) return;
  const wx = V.cx + (mx - W / 2) / V.sc, wy = V.cy - (my - Hh / 2) / V.sc;
  V.sc *= f; V.cx = wx - (mx - W / 2) / V.sc; V.cy = wy + (my - Hh / 2) / V.sc; drawMap();
}

/* ===== Edición en el plano ===== */
const LAYERS = { nuevo: 'Apoyos nuevos', exApoyos: 'Apoyos existentes', exLineas: 'Tramos baja existentes', exDC: 'Puntos D-C', ruta: 'Ruta del trazado' };
S.tool = 'pan'; S.editLayer = 'nuevo'; S.hist = [];
function snapshot() {
  S.hist.push(JSON.stringify({ geo: S.proj.geo, rows: S.proj.rows, redEx: S.proj.redEx, entronque: S.proj.entronque, verif: S.proj.verif, modo: S.proj.modo, zone: S.proj.zone, rumbo0: S.proj.ctx.rumbo0 }));
  if (S.hist.length > 60) S.hist.shift(); updUndo();
}
function undo() {
  const h = S.hist.pop(); if (!h) return; const d = JSON.parse(h);
  Object.assign(S.proj, { geo: d.geo, rows: d.rows, redEx: d.redEx, entronque: d.entronque, verif: d.verif, modo: d.modo, zone: d.zone }); S.proj.ctx.rumbo0 = d.rumbo0;
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
  if (layer === 'exDC') return exDC().length ? [exDC()] : [];
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
/* Puntos de enganche al mover: centros de apoyos (nuevos y existentes), inicio/fin de tramos baja y de la ruta, puntos D-C */
const SNAP_PX = 14;
function snapTargets(dp) {
  const out = [], own = (layer, li, i) => dp.layer === layer && dp.li === li && dp.i === i;
  const enK = S.proj.entronque?.k;
  const linkedA1 = (dp.layer === 'exApoyos' && dp.i === enK) || (dp.layer === 'nuevo' && dp.i === 0 && enK != null);
  if (vis('nuevo')) {
    const pts = S.proj.modo === 'kml' && S.proj.geo ? S.proj.geo.pts : currentNodes();
    pts.forEach((p, i) => { if (own('nuevo', 0, i) || (i === 0 && linkedA1)) return; out.push({ x: p.x, y: p.y, label: 'Apoyo A' + (i + 1) }); });
  }
  if (vis('exApoyos')) (redEx()?.apoyos || []).forEach((p, i) => { if (own('exApoyos', 0, i) || (i === enK && linkedA1)) return; out.push({ x: p.x, y: p.y, label: 'Apoyo existente E' + (i + 1) }); });
  if (vis('exLineas')) exLineas().forEach((l, li) => { const n = l.pts.length; [0, n - 1].forEach((i, k) => { if (n < 2 || (k && i === 0) || own('exLineas', li, i)) return; out.push({ x: l.pts[i].x, y: l.pts[i].y, label: (k ? 'Fin' : 'Inicio') + ' de tramo ' + (lineLabel(l) || 'L' + (li + 1)) }); }); });
  if (vis('ruta') && S.proj.geo?.ruta?.length > 1) { const r = S.proj.geo.ruta; [0, r.length - 1].forEach((i, k) => { if (!own('ruta', 0, i)) out.push({ x: r[i].x, y: r[i].y, label: (k ? 'Fin' : 'Inicio') + ' de ruta' }); }); }
  if (vis('exDC')) exDC().forEach((p, i) => { if (!own('exDC', 0, i)) out.push({ x: p.x, y: p.y, label: 'Punto D-C' + (dcLabel(p) ? ' ' + dcLabel(p) : '') }); });
  return out;
}
function findSnap(dp, mx, my) {
  let best = null;
  for (const t of snapTargets(dp)) { const [x, y] = S.mapT.P(t); const d = Math.hypot(x - mx, y - my); if (d <= SNAP_PX && (!best || d < best.d)) best = { ...t, d }; }
  return best;
}
function worldAt(mx, my) { const cv = $('#map'); return { x: V.cx + (mx - cv.clientWidth / 2) / V.sc, y: V.cy - (my - cv.clientHeight / 2) / V.sc }; }
function isEntronqueA1(i) { return i === 0 && S.proj.entronque?.k != null && exNodes()[S.proj.entronque.k]; }
function editClick(mx, my) {
  const layer = S.editLayer, tool = S.tool, w = worldAt(mx, my);
  if ((tool === 'insert' || tool === 'delete') && !vis(layer)) return toast(`La capa «${LAYERS[layer]}» está oculta. Muéstrala en «Capas» para editarla.`);
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
    } else if (layer === 'exDC') {
      const R = redEx() || (S.proj.redEx = { lineas: [], apoyos: [] }); if (!S.proj.zone) return toast('Importa primero algún elemento con coordenadas para fijar el huso UTM.');
      snapshot(); const np = { id: uid('d'), x: w.x, y: w.y, nombre: '', cups: '', fuente: 'añadido en el plano' }; setLL(np); R.puntosDC = R.puntosDC || []; R.puntosDC.push(np);
      S.selPt = { layer: 'exDC', li: 0, i: R.puntosDC.length - 1 }; toast('Punto D-C añadido: escribe su CUPS abajo.');
    } else if (layer === 'exLineas' || layer === 'ruta') {
      const arrs = layerPts(layer); let hit = null, li = -1;
      arrs.forEach((arr, k) => { const h = hitSegment(arr, mx, my); if (h && (!hit || h.d < hit.d)) { hit = h; li = k; } });
      if (!hit) return toast('Pulsa sobre un tramo de la línea para insertar un vértice.');
      snapshot(); const np = { x: w.x, y: w.y }; setLL(np); arrs[li].splice(hit.i + 1, 0, np); invalidateVert();
    }
    refreshAll(); return;
  }
  if (tool === 'text') {
    const pick = (lay, list) => { if (!vis(lay)) return null; let best = null; list.forEach((n, i) => { const [x, y] = S.mapT.P(n); const d = Math.hypot(x - mx, y - my); if (d < 14 && (!best || d < best.d)) best = { lay, i, d }; }); return best; };
    let hit = pick('exDC', exDC()) || (redEx()?.apoyos?.length ? pick('exApoyos', exNodes()) : null) || pick('nuevo', S.mapT.nodes || []);
    if (!hit && vis('exLineas')) { let hl = null; exLineas().forEach((l, li) => { const h = hitSegment(l.pts, mx, my, 10); if (h && (!hl || h.d < hl.d)) hl = { ...h, li }; }); if (hl) hit = { lay: 'exLineas', li: hl.li, i: hl.i }; }
    if (!hit) return toast('Pulsa sobre un apoyo, un tramo existente o un punto D-C para editar su texto.');
    S.selPt = { layer: hit.lay, li: hit.li || 0, i: hit.i }; renderPtEdit(); drawMap();
    const f = { exDC: '#pe_dcl', exApoyos: '#pe_lab', exLineas: '#pe_ll', nuevo: '#pe_n' }[hit.lay]; const el = $(f);
    if (el) { el.focus(); el.select(); el.scrollIntoView({ block: 'nearest' }); }
    return;
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
    } else if (layer === 'exDC') {
      snapshot(); redEx().puntosDC.splice(h.i, 1); toast('Punto D-C borrado.');
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
    if (S.tool === 'move' && S.mapT && !vis(S.editLayer)) { toast(`La capa «${LAYERS[S.editLayer]}» está oculta. Muéstrala en «Capas» para editarla.`); drag = null; return; }
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
      const rc = cv.getBoundingClientRect(), mx = ev.clientX - rc.left, my = ev.clientY - rc.top; let w = worldAt(mx, my);
      const sn = findSnap(drag.pt, mx, my); S.snap = sn; if (sn) w = { x: sn.x, y: sn.y };
      const p = layerPts(drag.pt.layer)[drag.pt.li][drag.pt.i]; p.x = w.x; p.y = w.y;
      if (drag.pt.layer === 'exApoyos' && S.proj.entronque?.k === drag.pt.i && S.proj.geo?.pts?.[0]) { S.proj.geo.pts[0].x = w.x; S.proj.geo.pts[0].y = w.y; }
      if (!drag.raf) drag.raf = requestAnimationFrame(() => { drag && (drag.raf = null); drawMap(); });
    } else { V.cx = drag.cx - dx / V.sc; V.cy = drag.cy + dy / V.sc; drawMap(); }
  });
  cv.addEventListener('pointerup', ev => {
    const d = drag; drag = null; S.drag = false; const snapped = S.snap; S.snap = null; if (!d || !S.mapT) return;
    if (d.pt) {
      if (!d.moved) { S.hist.pop(); updUndo(); drawMap(); return; }
      if (snapped) toast(`Posicionado en la misma coordenada que: ${snapped.label}.`);
      const p = layerPts(d.pt.layer)[d.pt.li][d.pt.i]; setLL(p);
      if (d.pt.layer === 'exApoyos' && S.proj.entronque?.k === d.pt.i && S.proj.geo?.pts?.[0]) setLL(S.proj.geo.pts[0]);
      invalidateVert(); refreshAll(); return;
    }
    if (d.moved) return;
    const mx = d.mx, my = d.my;
    if (S.tool === 'insert' || S.tool === 'delete' || S.tool === 'text') return editClick(mx, my);
    const near = list => { let best = -1, bd = 16; list.forEach((n, i) => { const [x, y] = S.mapT.P(n); const dd = Math.hypot(x - mx, y - my); if (dd < bd) { bd = dd; best = i; } }); return best; };
    if (S.pickEntronque) { const k = near(S.mapT.ex); if (k >= 0) { S.pickEntronque = false; setEntronque(k); } return; }
    const i = vis('nuevo') ? near(S.mapT.nodes) : -1;
    if (i >= 0) { S.sel = S.sel === i ? null : i; S.selPt = S.sel == null ? null : { layer: 'nuevo', li: 0, i }; renderRows(); renderResults(); renderPtEdit(); return; }
    const kd = vis('exDC') ? near(exDC()) : -1; if (kd >= 0) { S.selPt = { layer: 'exDC', li: 0, i: kd }; renderPtEdit(); drawMap(); return; }
    const k = vis('exApoyos') ? near(S.mapT.ex) : -1; if (k >= 0 && redEx()?.apoyos?.length) { S.selPt = { layer: 'exApoyos', li: 0, i: k }; renderPtEdit(); drawMap(); return; }
    let hl = null; if (vis('exLineas')) exLineas().forEach((l, li) => { const h = hitSegment(l.pts, mx, my, 8); if (h && (!hl || h.d < hl.d)) hl = { ...h, li }; });
    if (hl) { S.selPt = { layer: 'exLineas', li: hl.li, i: hl.t < 0.5 ? hl.i : hl.i + 1 }; renderPtEdit(); drawMap(); return; }
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
    if (t.id === 'pe_lab') { p.etiqueta = t.value; drawMap(); renderEntronque(); return; }
    if (t.id === 'pe_cups') { p.cups = t.value.replace(/[\s.-]/g, '').toUpperCase(); if (p.etiqueta != null && p.etiqueta === cupsCorto('')) delete p.etiqueta; drawMap(); renderPtEdit(); renderEntronque(); return; }
    if (t.id === 'pe_dcl') { p.etiqueta = t.value === cupsCorto(p.cups) ? undefined : t.value; if (p.etiqueta === undefined) delete p.etiqueta; drawMap(); renderEntronque(); return; }
    if (t.id === 'pe_ll') { const l = exLineas()[sp.li]; if (l) l.etiqueta = t.value; drawMap(); renderEntronque(); return; }
    if (t.id === 'pe_x') p.x = Number(t.value); if (t.id === 'pe_y') p.y = Number(t.value); if (t.id === 'pe_n') p.nombre = t.value;
    setLL(p);
    if (sp.layer === 'exApoyos' && S.proj.entronque?.k === sp.i && S.proj.geo?.pts?.[0]) { Object.assign(S.proj.geo.pts[0], { x: p.x, y: p.y }); setLL(S.proj.geo.pts[0]); }
    invalidateVert(); refreshAll();
  });
  bindFondos(); renderEdBar();
}
function renderEdBar() {
  document.querySelectorAll('#edBar [data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === S.tool)));
  $('#edLayer').value = S.editLayer; $('#map').style.cursor = S.tool === 'pan' ? 'grab' : S.tool === 'move' ? 'move' : S.tool === 'text' ? 'text' : 'crosshair';
  $('#edLayer').disabled = S.tool === 'text' || S.tool === 'pan';
  const hint = { pan: 'Arrastra para mover el plano. Pulsa un apoyo para seleccionarlo y editar sus coordenadas.', move: `Arrastra un punto de «${LAYERS[S.editLayer]}» para moverlo.`, insert: S.editLayer === 'nuevo' ? 'Pulsa sobre un vano para intercalar un apoyo, o fuera del trazado para añadirlo al final.' : S.editLayer === 'exApoyos' ? 'Pulsa en el plano para añadir un apoyo existente.' : 'Pulsa sobre un tramo para insertar un vértice.', delete: `Pulsa un punto de «${LAYERS[S.editLayer]}» para borrarlo.`, text: 'Pulsa un apoyo existente, un tramo baja, un punto D-C o un apoyo nuevo para cambiar el texto que se rotula en el plano.' }[S.tool];
  $('#edHint').textContent = hint; updUndo();
}
function p0dc(sp) { return exDC()[sp.i]?.nombre || ''; }
function renderPtEdit() {
  const box = $('#ptEdit'), sp = S.selPt;
  if (!sp) { box.hidden = true; return; }
  let p, label;
  if (sp.layer === 'nuevo') { const n = (S.proj.modo === 'kml' && S.proj.geo) ? S.proj.geo.pts[sp.i] : currentNodes()[sp.i]; p = n; label = `Apoyo nuevo A${sp.i + 1}`; }
  else { p = layerPts(sp.layer)[sp.li]?.[sp.i]; label = sp.layer === 'exDC' ? `Punto D-C${p0dc(sp) ? ' · ' + esc(p0dc(sp)) : ''}` : sp.layer === 'exApoyos' ? `Apoyo existente E${sp.i + 1}` : sp.layer === 'ruta' ? `Vértice ${sp.i + 1} de la ruta` : `Línea existente «${exLineas()[sp.li]?.nombre || ''}» · vértice ${sp.i + 1}`; }
  if (!p) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<b>${label}</b>${isEntronqueA1(sp.layer === 'nuevo' ? sp.i : -1) ? ' · es el apoyo de entronque: edítalo como apoyo existente' : ''}
    <div class="fields hfields" style="margin-top:6px"><label class="f">${S.proj.zone ? `X UTM (huso ${S.proj.zone})` : 'X local (m)'}<input id="pe_x" class="num" type="number" step="0.01" value="${p.x.toFixed(2)}" ${isEntronqueA1(sp.layer === 'nuevo' ? sp.i : -1) ? 'disabled' : ''}></label>
    <label class="f">${S.proj.zone ? 'Y UTM' : 'Y local (m)'}<input id="pe_y" class="num" type="number" step="0.01" value="${p.y.toFixed(2)}" ${isEntronqueA1(sp.layer === 'nuevo' ? sp.i : -1) ? 'disabled' : ''}></label>
    ${sp.layer === 'nuevo' || sp.layer === 'exApoyos' || sp.layer === 'exDC' ? `<label class="f full">Nombre<input id="pe_n" type="text" value="${esc(p.nombre || '')}"></label>` : ''}
    ${sp.layer === 'exApoyos' ? `<label class="f full">Texto en el plano<input id="pe_lab" type="text" value="${esc(exLabel(sp.i))}" placeholder="E${sp.i + 1}"><span class="hint">Vacío: no se rotula. Por defecto: E${sp.i + 1}</span></label>` : ''}
    ${sp.layer === 'exDC' ? `<label class="f full">CUPS<input id="pe_cups" type="text" value="${esc(p.cups || '')}" placeholder="ES0000000000000000XX"></label>
      <label class="f full">Texto en el plano<input id="pe_dcl" type="text" value="${esc(dcLabel(p))}" placeholder="${esc(cupsCorto(p.cups))}"><span class="hint">Por defecto: caracteres 12 a 18 del CUPS (${esc(cupsCorto(p.cups) || '—')}).</span></label>` : ''}
    ${sp.layer === 'exLineas' ? `<label class="f full">Texto de la línea en el plano<input id="pe_ll" type="text" value="${esc(exLineas()[sp.li]?.etiqueta ?? exLineas()[sp.li]?.nombre ?? '')}"><span class="hint">El cable verificado se añade detrás. Vacío: solo el cable.</span></label>` : ''}</div>
    ${p.lat != null ? `<p class="note mono" style="margin:6px 0 0">${p.lat.toFixed(7)}, ${p.lon.toFixed(7)}</p>` : ''}
    ${(() => { const at = sp.layer === 'exLineas' ? exLineas()[sp.li]?.attrs : p.attrs; const ks = at ? Object.keys(at) : []; return ks.length ? `<details style="margin-top:6px"><summary class="note">Datos del GIS (${ks.length})</summary><div class="tablewrap" style="margin-top:4px;max-height:200px;overflow:auto"><table class="vt"><tbody>${ks.map(k => `<tr><td class="note">${esc(k)}</td><td>${esc(at[k])}</td></tr>`).join('')}</tbody></table></div></details>` : ''; })()}`;
}

/* ===== Lectura de archivos: KML, KMZ, GPX y texto de GPS Visualizer ===== */
/* Atributos de un elemento del GIS: ExtendedData (Data, SimpleData) y tabla o líneas «Campo: valor» de la descripción */
function kmlAttrs(pm, doc) {
  const A = {}; const put = (k, v) => { k = String(k || '').replace(/\s+/g, ' ').trim(); v = String(v ?? '').replace(/\s+/g, ' ').trim(); if (k && v && !(k in A)) A[k] = v; };
  [...pm.getElementsByTagNameNS('*', 'Data')].forEach(d => { const dn = [...d.children].find(c => c.localName === 'displayName')?.textContent; const val = [...d.children].find(c => c.localName === 'value')?.textContent; put(dn || d.getAttribute('name'), val); });
  [...pm.getElementsByTagNameNS('*', 'SimpleData')].forEach(d => put(d.getAttribute('name'), d.textContent));
  const desc = [...pm.children].find(c => c.localName === 'description')?.textContent || '';
  if (desc) {
    const h = new DOMParser().parseFromString(desc, 'text/html');
    h.querySelectorAll('tr').forEach(tr => { const cells = [...tr.children].filter(c => /^(TD|TH)$/.test(c.tagName)); if (cells.length === 2) put(cells[0].textContent, cells[1].textContent); });
    (h.body?.innerText || h.body?.textContent || desc).split(/\n|<br\s*\/?>/i).forEach(line => { const m = line.match(/^\s*([^:=]{2,60}?)\s*[:=]\s*(.+)$/); if (m) put(m[1], m[2]); });
  }
  return A;
}
const normKey = k => String(k).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function attrFind(attrs, test) { if (!attrs) return ''; for (const [k, v] of Object.entries(attrs)) if (test(normKey(k))) return v; return ''; }
function esfuerzoApoyo(a) { return a.esfuerzo ?? attrFind(a.attrs, k => /esfuerzo/.test(k) && /max/.test(k)) ?? ''; }
function conductorTramo(l) { return l.conductor ?? attrFind(l.attrs, k => k === 'conductor' || /^conductor\b/.test(k) || /dato tecnico.*conductor/.test(k)) ?? ''; }
/* Busca en la base el cable que corresponde al texto del conductor (p. ej. «RZ 3x95 + 54,6 AL») */
function cableFromConductor(txt) {
  const m = String(txt || '').replace(/\s/g, '').match(/(\d)[x×](\d+(?:[,.]\d+)?)/i); if (!m) return '';
  const n = m[1], s = m[2].replace('.', ',');
  const c = S.cables.find(c => new RegExp(`\\b${n}[x×]${s.replace(',', '[,.]')}\\s*Al`, 'i').test(c.designacion.replace(/\s/g, ' ')) || c.designacion.replace(/\s/g, '').includes(`${n}x${s}Al`));
  return c ? c.id : '';
}
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
    tag(doc, 'wpt').forEach(w => points.push({ ...pt(w), raw: w.textContent }));
  } else {
    const parseCoords = s => s.trim().split(/\s+/).map(t => t.split(',').map(Number)).filter(a => a.length >= 2 && !isNaN(a[0]) && !isNaN(a[1])).map(([lon, lat, alt]) => ({ lat, lon, alt: isNaN(alt) ? null : alt }));
    tag(doc, 'LineString').forEach(ls => { const pts = parseCoords(tag(ls, 'coordinates')[0]?.textContent || ''); if (pts.length >= 2) lines.push({ nombre: nameOf(ls) || `Línea ${lines.length + 1}`, pts, attrs: kmlAttrs(ls.closest('Placemark') || ls, doc) }); });
    tag(doc, 'Point').forEach(pe => { const c = parseCoords(tag(pe, 'coordinates')[0]?.textContent || '')[0]; const pm = pe.closest('Placemark') || pe;
      const ed = [...tag(pm, 'Data'), ...tag(pm, 'SimpleData')].map(d => (d.getAttribute('name') || '') + ' ' + (d.textContent || '')).join(' ');
      if (c) points.push({ ...c, nombre: nameOf(pe), attrs: kmlAttrs(pm, doc), raw: [nameOf(pe), ed, tag(pm, 'description')[0]?.textContent || ''].join(' ') }); });
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
    if (destino === 'exDC') return applyExDC(points, file.name);
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
function applyExDC(points, fname) {
  if (!points.length) return toast('El archivo no contiene puntos D-C (marcadores).');
  const zone = setZoneFrom(points[0]);
  const R = redEx() || (S.proj.redEx = { lineas: [], apoyos: [] });
  snapshot();
  const nuevos = points.map(p => ({ id: uid('d'), lat: p.lat, lon: p.lon, nombre: p.nombre || '', cups: findCups(p.raw || p.nombre), fuente: fname, ...E.utmFromLatLon(p.lat, p.lon, zone) }));
  R.puntosDC = (R.puntosDC || []).filter(a => a.fuente !== fname).concat(nuevos);
  V.fitted = false; refreshAll();
  const sin = nuevos.filter(p => !p.cups).length;
  toast(`${nuevos.length} punto(s) D-C importado(s) de ${fname}.` + (sin ? ` ${sin} sin CUPS reconocible: escríbelo seleccionando el punto en el plano.` : ''));
}
function ensureEntronque() {
  if (!S.proj.entronque) S.proj.entronque = { k: null, cableId: (S.cables.find(c => /3x95/.test(c.designacion)) || S.cables[0] || {}).id || '', tense: S.proj.ctx.tenseNormal || 180, depth: S.proj.ctx.depthAmarre };
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
/* ===== Carga automática de fondos y perfil ===== */
function scheduleAuto() { clearTimeout(S.autoT); S.autoT = setTimeout(runAuto, 1200); }
async function runAuto() {
  if (S.drag) return scheduleAuto();
  autoFondos();
  await autoPerfilMaybe();
}
function autoFondos() {
  if (!LOCAL || !S.proj.zone) return; const fb = fondoBbox(); if (!fb) return;
  const covers = (a, b) => a && a[0] <= b[0] + 1 && a[1] <= b[1] + 1 && a[2] >= b[2] - 1 && a[3] >= b[3] - 1;
  let changed = false; S.proj.fondos = S.proj.fondos || {};
  for (const k of Object.keys(FONDOS)) {
    const f = S.proj.fondos[k];
    if (f?.off || f?.blobUrl || f?.assetId) continue;
    if (f?.url && covers(f.bbox, fb.bbox)) continue;
    S.proj.fondos[k] = { bbox: fb.bbox, w: fb.w, h: fb.h, url: FONDOS[k].url(fb.bbox, S.proj.zone, fb.w, fb.h), op: f?.op ?? 50, visible: f?.userVis ? f.visible : true, userVis: f?.userVis, auto: true };
    if (S.img) delete S.img[k]; changed = true;
  }
  if (changed) { renderFondos(); drawMap(); }
}
function perfilKey(g) { return g.zone + ':' + g.pts.map(p => p.x.toFixed(0) + ',' + p.y.toFixed(0)).join(';'); }
/* Geometría del perfil longitudinal: SOLO el trazado de la línea nueva, empezando en el apoyo de entronque.
   Devuelve null mientras falte el entronque o el trazado. */
function perfilGeo() {
  const en = S.proj.entronque, ex = exNodes(); if (!en || en.k == null || !ex[en.k]) return null;
  const g = getGeo(); if (!g || g.pts.length < 2) return null;
  const E0 = ex[en.k]; let pts = g.pts.map(p => ({ x: p.x, y: p.y, lat: p.lat, lon: p.lon }));
  const d = p => Math.hypot(p.x - E0.x, p.y - E0.y);
  if (d(pts[pts.length - 1]) < d(pts[0])) pts.reverse();
  if (d(pts[0]) > 0.5) pts.unshift({ x: E0.x, y: E0.y, ...E.latLonFromUtm(E0.x, E0.y, g.zone) });
  else pts[0] = { x: E0.x, y: E0.y, ...E.latLonFromUtm(E0.x, E0.y, g.zone) };
  if (pts.length < 2) return null;
  return { zone: g.zone, pts };
}
async function autoPerfilMaybe() {
  const P = S.proj.perfil;
  const g = perfilGeo();
  if (!g) { if (P?.auto) { S.proj.perfil = null; S.perfilFail = null; refreshAll(); } return; }   // sin entronque o sin trazado: no hay perfil automático
  if (P && !P.auto) return;           // perfil cargado por el usuario: se respeta
  const key = perfilKey(g); if (P?.key === key || S.perfilFail === key || S.perfilBusy) return;
  S.perfilBusy = true; renderPerfilInfo();
  try {
    const prev = S.proj.perfil;
    if (LOCAL) await autoPerfilLocal(g); else await autoPerfil(g);
    if (S.proj.perfil && S.proj.perfil !== prev) { S.proj.perfil.auto = true; S.proj.perfil.key = key; }
    else S.perfilFail = key;
  } finally { S.perfilBusy = false; renderPerfilInfo(); }
}
function refreshAll() {
  $('#geoInfo').hidden = !(S.proj.modo === 'kml' && S.proj.geo); $('#geoInfo').innerHTML = geoInfoHtml();
  const tm = $('#toManual'); if (tm) tm.onclick = toManual;
  renderRows(); renderEntronque(); recalc(); renderFondos(); renderPerfilInfo(); renderPtEdit(); updUndo();
  renderCapas(); renderProjName(); scheduleAuto();
}

/* ---------- Plano: vista con desplazamiento y zoom ---------- */
function ensureImg(tipo) {
  const f = S.proj.fondos?.[tipo]; if (!f || (!f.assetId && !f.blobUrl && !f.url)) return null;
  S.img = S.img || {};
  const src = f.blobUrl || (f.assetId ? '/_blob/' + f.assetId : f.url);
  if (!S.img[tipo] || S.img[tipo].srcKey !== src) {
    const make = cors => { const im = new Image(); im.srcKey = src; if (cors) im.crossOrigin = 'anonymous'; im.tainted = !!(f.url && !cors);
      im.onload = () => drawMap();
      im.onerror = () => { if (cors) { S.img[tipo] = make(false); return; } im.failed = true; if (f.url) toast(`No se pudo cargar ${FONDOS[tipo].nombre}. Comprueba la conexión a internet.`); drawMap(); };
      im.src = src; return im; };
    S.img[tipo] = make(!!f.url && !f.blobUrl && !f.assetId);
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
      <label class="chk note">Opacidad <input type="range" min="10" max="100" step="5" data-fo="${k}" value="${f.op ?? 50}" ${has ? '' : 'disabled'} aria-label="Opacidad ${F.nombre}"></label></div>
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
      S.proj.fondos[k] = { bbox: fb.bbox, w: fb.w, h: fb.h, url: FONDOS[k].url(fb.bbox, S.proj.zone, fb.w, fb.h), op: prev.op ?? 50, visible: true };
      S.img = S.img || {}; delete S.img[k]; renderFondos(); drawMap(); toast(`Cargando ${FONDOS[k].nombre}…`); }
    const d = ev.target.closest('[data-fd]'); if (d) { const k = d.dataset.fd; const f = S.proj.fondos[k]; if (f?.assetId) delAsset(f.assetId); S.proj.fondos[k] = { off: true }; renderFondos(); drawMap(); }
  });
  box.addEventListener('change', async ev => {
    const t = ev.target;
    if (t.dataset.fv) { S.proj.fondos[t.dataset.fv].visible = t.checked; S.proj.fondos[t.dataset.fv].userVis = true; drawMap(); renderCapas(); }
    if (t.dataset.ff) {
      const k = t.dataset.ff, file = t.files[0]; t.value = ''; if (!file) return;
      const prev = S.proj.fondos[k] || {}; const fb = prev.pend || fondoBbox();
      const blobUrl = URL.createObjectURL(file);
      const im = new Image(); im.src = blobUrl; await im.decode().catch(() => null);
      if (!im.naturalWidth) { toast('No se ha podido leer la imagen.'); return; }
      if (Math.abs(im.naturalWidth / im.naturalHeight - fb.w / fb.h) > 0.02) toast('Las proporciones de la imagen no coinciden con la zona pedida. Comprueba que es la imagen correcta.');
      const f = { bbox: fb.bbox, w: im.naturalWidth, h: im.naturalHeight, op: prev.op ?? 50, visible: true, blobUrl, nombre: file.name };
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
  if (S.proj.modo === 'kml' || S.proj.entronque?.k != null) {
    const falta = [S.proj.entronque?.k == null ? 'el apoyo de entronque (en «Red existente»)' : null, !(getGeo()?.pts?.length >= 2) ? 'el trazado de la línea nueva' : null].filter(Boolean);
    if (falta.length) return `<div class="banner info">El perfil longitudinal se calcula <b>solo para la línea nueva, desde el apoyo de entronque</b>, y se busca automáticamente en cuanto estén los dos datos. Falta: ${falta.join(' y ')}.</div>`;
    return `<div class="banner warn"><b>El trazado no tiene perfil de elevación.</b> Sin él se supone terreno llano. ${S.perfilBusy ? 'Buscando el perfil automáticamente…' : 'La búsqueda automática no ha dado resultado (¿sin conexión?).'} Pulsa «Buscar perfil de elevación automáticamente» o, con GPS Visualizer:${steps}</div>`;
  }
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
  const layers = [['BT_TRAZADO', 5], ['BT_APOYOS', 1], ['BT_TEXTO_APOYOS', 7], ['BT_TEXTO_VANOS', 8], ['BT_EXISTENTE', 30], ['BT_LINEA_EXISTENTE', 30], ['BT_APOYOS_EXISTENTES', 30], ['BT_TEXTO_EXISTENTE', 30], ['BT_RUTA', 4], ['BT_PUNTOS_DC', 6], ['BT_TEXTO_PUNTOS_DC', 6]];
  p(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC');
  p(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB');
  p(0, 'TABLE', 2, 'LAYER', 70, layers.length); layers.forEach(([n, colr]) => p(0, 'LAYER', 2, n, 70, 0, 62, colr, 6, 'CONTINUOUS')); p(0, 'ENDTAB', 0, 'ENDSEC');
  p(0, 'SECTION', 2, 'ENTITIES');
  const N = c.nodes, f3 = v => v.toFixed(3);
  const ex = geo ? exNodes() : [];
  if (geo) exLineas().forEach(l => { const lab = lineLabel(l); if (lab && l.pts.length > 1) { let bi = 0, bl = 0; for (let i = 0; i < l.pts.length - 1; i++) { const d = Math.hypot(l.pts[i + 1].x - l.pts[i].x, l.pts[i + 1].y - l.pts[i].y); if (d > bl) { bl = d; bi = i; } } const A = l.pts[bi], B = l.pts[bi + 1]; let an = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI; if (an > 90) an -= 180; if (an < -90) an += 180; p(0, 'TEXT', 8, 'BT_TEXTO_EXISTENTE', 10, f3((A.x + B.x) / 2), 20, f3((A.y + B.y) / 2 + 1), 30, 0, 40, 1, 1, ascii(lab), 50, an.toFixed(2), 72, 1, 11, f3((A.x + B.x) / 2), 21, f3((A.y + B.y) / 2 + 1), 31, 0); } });
  if (geo) exLineas().forEach(l => { for (let i = 0; i < l.pts.length - 1; i++) p(0, 'LINE', 8, 'BT_LINEA_EXISTENTE', 10, f3(l.pts[i].x), 20, f3(l.pts[i].y), 30, 0, 11, f3(l.pts[i + 1].x), 21, f3(l.pts[i + 1].y), 31, 0); });
  if (geo && S.proj.geo?.ruta) { const r = S.proj.geo.ruta; for (let i = 0; i < r.length - 1; i++) p(0, 'LINE', 8, 'BT_RUTA', 10, f3(r[i].x), 20, f3(r[i].y), 30, 0, 11, f3(r[i + 1].x), 21, f3(r[i + 1].y), 31, 0); }
  if (geo && !ex.length) exDC().forEach(d => { p(0, 'CIRCLE', 8, 'BT_PUNTOS_DC', 10, f3(d.x), 20, f3(d.y), 30, 0, 40, 0.3); const lb = dcLabel(d); if (lb) p(0, 'TEXT', 8, 'BT_TEXTO_PUNTOS_DC', 10, f3(d.x + 0.8), 20, f3(d.y - 0.4), 30, 0, 40, 0.8, 1, ascii(lb)); });
  for (let i = 0; i < ex.length; i++) {
    p(0, 'CIRCLE', 8, 'BT_APOYOS_EXISTENTES', 10, f3(ex[i].x), 20, f3(ex[i].y), 30, 0, 40, 0.4);
    if (i === 0 && geo) exDC().forEach(d => { p(0, 'CIRCLE', 8, 'BT_PUNTOS_DC', 10, f3(d.x), 20, f3(d.y), 30, 0, 40, 0.3); const lb = dcLabel(d); if (lb) p(0, 'TEXT', 8, 'BT_TEXTO_PUNTOS_DC', 10, f3(d.x + 0.8), 20, f3(d.y - 0.4), 30, 0, 40, 0.8, 1, ascii(lb)); });
    if (exLabel(i) && !(i === S.proj.entronque?.k && N.length > 1)) p(0, 'TEXT', 8, 'BT_TEXTO_EXISTENTE', 10, f3(ex[i].x - 3), 20, f3(ex[i].y + 1), 30, 0, 40, 1, 1, ascii(exLabel(i)));
  }
  for (let i = 0; i < N.length - 1; i++) {
    p(0, 'LINE', 8, 'BT_TRAZADO', 10, f3(N[i].x), 20, f3(N[i].y), 30, 0, 11, f3(N[i + 1].x), 21, f3(N[i + 1].y), 31, 0);
    const mx = (N[i].x + N[i + 1].x) / 2, my = (N[i].y + N[i + 1].y) / 2; let ang = Math.atan2(N[i + 1].y - N[i].y, N[i + 1].x - N[i].x) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    p(0, 'TEXT', 8, 'BT_TEXTO_VANOS', 10, f3(mx), 20, f3(my + 0.6), 30, 0, 40, 0.8, 1, ascii(`${c.spans[i].a.toFixed(1)} m`), 50, ang.toFixed(2), 72, 1, 11, f3(mx), 21, f3(my + 0.6), 31, 0);
  }
  { const cab = c.cable; let bi = 0, bl = 0; for (let i = 0; i < N.length - 1; i++) { const d = Math.hypot(N[i + 1].x - N[i].x, N[i + 1].y - N[i].y); if (d > bl) { bl = d; bi = i; } }
    if (cab && N.length > 1) { const A = N[bi], B = N[bi + 1]; let an = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI; if (an > 90) an -= 180; if (an < -90) an += 180; p(0, 'TEXT', 8, 'BT_TEXTO_VANOS', 10, f3((A.x + B.x) / 2), 20, f3((A.y + B.y) / 2 - 1.6), 30, 0, 40, 0.9, 1, ascii(shortCable(cab.designacion)), 50, an.toFixed(2), 72, 1, 11, f3((A.x + B.x) / 2), 21, f3((A.y + B.y) / 2 - 1.6), 31, 0); } }
  N.forEach((n, i) => {
    const r = c.results[i]; const pole = r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole;
    p(0, 'CIRCLE', 8, 'BT_APOYOS', 10, f3(n.x), 20, f3(n.y), 30, 0, 40, 0.5);
    p(0, 'TEXT', 8, 'BT_TEXTO_APOYOS', 10, f3(n.x + 1), 20, f3(n.y + 1), 30, 0, 40, 1.2, 1, ascii(apName(i) + (S.proj.geo?.pts?.[i]?.nombre && !isEntronqueA1(i) ? ' ' + S.proj.geo.pts[i].nombre : '')));
    if (!(isEntronqueA1(i) && r.existenteCheck?.ok)) p(0, 'TEXT', 8, 'BT_TEXTO_APOYOS', 10, f3(n.x + 1), 20, f3(n.y - 0.6), 30, 0, 40, 0.8, 1, ascii(pole ? poleLabel(pole) + (n.existente?.activo ? (r.existenteCheck?.ok ? ' (existente)' : ' (sustituye)') : '') : 'SIN APOYO VALIDO'));
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
    return `<Placemark><name>${apName(i)}${pt.nombre && !isEntronqueA1(i) ? ' ' + esc(pt.nombre) : ''}</name><styleUrl>#${st.cls}</styleUrl><description><![CDATA[${FUNCS[r.func]}<br>${pole ? poleLabel(pole) : 'Sin apoyo válido'}<br>${st.txt}${pole ? `<br>Utilización ${fmt((r.existenteCheck?.ok ? r.existenteCheck.r : r.elegido.r).u * 100, 1)} %` : ''}<br>UTM ${g.zone}: ${pt.x.toFixed(2)} ; ${pt.y.toFixed(2)}]]></description><Point><coordinates>${pt.lon.toFixed(8)},${pt.lat.toFixed(8)},0</coordinates></Point></Placemark>`;
  }).join('\n');
  const st = (id, color) => `<Style id="${id}"><IconStyle><color>${color}</color><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_square.png</href></Icon></IconStyle></Style>`;
  const lines = exLineas();
  const exK = (lines.length || ex.length) ? `<Folder><name>Red existente</name>${lines.map(l => `<Placemark><name>${esc(lineLabel(l) || l.nombre)}</name><styleUrl>#existente</styleUrl><LineString><tessellate>1</tessellate><coordinates>${l.pts.map(p => `${p.lon.toFixed(8)},${p.lat.toFixed(8)},0`).join(' ')}</coordinates></LineString></Placemark>`).join('\n')}
${ex.map((p, i) => `<Placemark><name>${esc(exLabel(i) || 'E' + (i + 1))}${p.nombre && exLabel(i) !== p.nombre ? ' · ' + esc(p.nombre) : ''}</name><styleUrl>#exApoyo</styleUrl><Point><coordinates>${p.lon.toFixed(8)},${p.lat.toFixed(8)},0</coordinates></Point></Placemark>`).join('\n')}</Folder>` : '';
  const dcK = exDC().length ? `<Folder><name>Puntos D-C</name>${exDC().map(d => `<Placemark><name>${esc(dcLabel(d) || d.nombre || 'D-C')}</name><styleUrl>#puntoDC</styleUrl>${d.cups ? `<description>CUPS ${esc(d.cups)}</description>` : ''}<Point><coordinates>${d.lon.toFixed(8)},${d.lat.toFixed(8)},0</coordinates></Point></Placemark>`).join('\n')}</Folder>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(S.proj.nombre)}</name>
${st('ok', 'ff4f7d2f')}${st('warn', 'ff006aa6')}${st('bad', 'ff2c36b3')}
<Style id="linea"><LineStyle><color>ff865b1d</color><width>3</width></LineStyle></Style>
<Style id="existente"><LineStyle><color>ff737373</color><width>3</width></LineStyle></Style>
<Style id="exApoyo"><IconStyle><color>ff737373</color><scale>0.7</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>
${exK}
${dcK}
<Style id="puntoDC"><IconStyle><color>ff8f3e7a</color><scale>0.7</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>
<Placemark><name>Línea BT nueva · ${esc(c.cable.designacion)}</name><styleUrl>#linea</styleUrl><LineString><tessellate>1</tessellate><coordinates>${pts.map(p => `${p.lon.toFixed(8)},${p.lat.toFixed(8)},0`).join(' ')}</coordinates></LineString></Placemark>
<Folder><name>Apoyos nuevos</name>
${pm}
</Folder></Document></kml>`;
}
function geojson(c, g) {
  const feats = [{ type: 'Feature', properties: { capa: 'linea_nueva', cable: c.cable.designacion }, geometry: { type: 'LineString', coordinates: g.pts.map(p => [+p.lon.toFixed(8), +p.lat.toFixed(8)]) } }];
  g.pts.forEach((p, i) => { const r = c.results[i], pole = r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole; feats.push({ type: 'Feature', properties: { capa: 'apoyo_nuevo', apoyo: apName(i), nombre: p.nombre || null, funcion: FUNCS[r.func], modelo: pole ? poleLabel(pole) : null, estado: statusOf(r, i).txt, utm_huso: g.zone, utm_x: +p.x.toFixed(2), utm_y: +p.y.toFixed(2) }, geometry: { type: 'Point', coordinates: [+p.lon.toFixed(8), +p.lat.toFixed(8)] } }); });
  const ex = exNodes();
  exLineas().forEach(l => feats.push({ type: 'Feature', properties: { capa: 'linea_existente', nombre: l.nombre, fuente: l.fuente }, geometry: { type: 'LineString', coordinates: l.pts.map(p => [+p.lon.toFixed(8), +p.lat.toFixed(8)]) } }));
  ex.forEach((p, i) => feats.push({ type: 'Feature', properties: { capa: 'apoyo_existente', apoyo: 'E' + (i + 1), nombre: p.nombre || null, entronque: S.proj.entronque?.k === i }, geometry: { type: 'Point', coordinates: [+p.lon.toFixed(8), +p.lat.toFixed(8)] } }));
  exDC().forEach(d => feats.push({ type: 'Feature', properties: { capa: 'punto_dc', cups: d.cups || null, texto: dcLabel(d) || null, nombre: d.nombre || null }, geometry: { type: 'Point', coordinates: [+d.lon.toFixed(8), +d.lat.toFixed(8)] } }));
  if (S.proj.geo?.ruta) feats.push({ type: 'Feature', properties: { capa: 'ruta' }, geometry: { type: 'LineString', coordinates: S.proj.geo.ruta.map(p => [+p.lon.toFixed(8), +p.lat.toFixed(8)]) } });
  return JSON.stringify({ type: 'FeatureCollection', name: S.proj.nombre, features: feats }, null, 1);
}
function csv(c, g) {
  const sep = ';', n = v => String(v ?? '').replace('.', ',');
  const head = ['Apoyo', 'Funcion', 'Desvio (grados)', 'Vano anterior (m)', 'Modelo', 'Tipo', 'Esfuerzo nominal (daN)', 'Esfuerzo secundario (daN)', 'Altura (m)', 'F principal (daN)', 'F secundario (daN)', 'Utilizacion (%)', 'Eje principal (acimut)', 'Estado', 'Coste (EUR)', 'Venta (EUR)', 'Cota terreno (m)', 'Cota amarre (m)', 'Gravivano (m)'];
  if (g) head.push(`UTM X (huso ${g.zone})`, 'UTM Y', 'Latitud', 'Longitud');
  const rows = c.results.map((r, i) => {
    const sel = r.existenteCheck?.ok ? r.existenteCheck : r.elegido; const p = sel?.pole, rr = sel?.r; const st = statusOf(r, i);
    const a = [apName(i), FUNCS[r.func], n(r.desvio?.toFixed(1)), i ? n(c.spans[i - 1].a.toFixed(2)) : '', p ? poleLabel(p) : '', p?.tipo, p?.En, p?.Es, p?.altura, n(rr?.Fp.toFixed(0)), n(rr?.Fs.toFixed(0)), n(rr ? (rr.u * 100).toFixed(1) : ''), n(rr?.phi.toFixed(0)), st.txt, n(st.txt === 'Existente válido' ? 0 : p?.coste), n(st.txt === 'Existente válido' ? 0 : p?.venta), n(r.z?.toFixed(2)), n(r.zAmarre?.toFixed(2)), n(r.gravivano?.toFixed(1))];
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
    `- ${base}.dxf: trazado, apoyos y textos por capas (BT_TRAZADO, BT_APOYOS, BT_TEXTO_APOYOS, BT_TEXTO_VANOS, BT_EXISTENTE${exNodes().length && g ? ', BT_LINEA_EXISTENTE, BT_APOYOS_EXISTENTES, BT_TEXTO_EXISTENTE' : ''}${exDC().length && g ? ', BT_PUNTOS_DC, BT_TEXTO_PUNTOS_DC' : ''}${S.proj.geo?.ruta && g ? ', BT_RUTA' : ''}). Unidades: metros.`,
    g ? `- ${base}.kml: linea nueva, apoyos${exNodes().length ? ' y linea existente' : ''} para Google Earth (WGS84).` : null,
    g ? `- ${base}.geojson: las mismas capas para QGIS (WGS84).` : null,
    ...fondosIncl.map(f => `- ${f.file} + ${f.wf}: fondo de ${f.nombre} georreferenciado (archivo de mundo en EPSG:258${z}).`),
    g && anexoActivo() ? `- ${anexoNombre()}: ANEXO I (informacion de lineas, Galicia) en coordenadas ETRS89 huso 30N.` : null,
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
  const ve = verifEstado(); if (ve.faltan.length) { toast('No se puede exportar: falta verificar ' + ve.faltan.join(', ') + '. Hazlo en «Red existente y entronque».'); return; }
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
  if (g && anexoActivo()) {
    const fa = anexoFaltan(); if (fa.length) { toast('Proyecto en Galicia: completa el ANEXO I antes de exportar (falta ' + fa.join(', ') + ').'); return; }
    zip.file(anexoNombre(), await anexoXlsx());
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
  if (!c || !c.conPerfil) { g.fillStyle = col('--muted'); g.font = '13px ' + col('--f-body'); g.textAlign = 'center'; g.fillText(S.proj.entronque?.k == null ? 'El perfil se calcula automáticamente con el trazado nuevo y el apoyo de entronque.' : 'Sin perfil de elevación del trazado nuevo todavía.', W / 2, Hh / 2); $('#perfilNote').textContent = ''; return; }
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
    g.fillStyle = col('--ink'); g.font = '600 11px ' + col('--f-body'); g.textAlign = 'center'; g.fillText(apName(i), x, y1 - 5);
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
async function autoPerfil(g0) {
  const btn = $('#perfilAuto'), msg = $('#perfilAutoMsg');
  const g = g0?.pts ? g0 : perfilGeo(); if (!g) { msg.textContent = 'El perfil se calcula solo con el trazado de la línea nueva desde el apoyo de entronque: importa el trazado y elige el apoyo de entronque en «Red existente».'; return; }
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
    S.proj.perfil = { fuente: `Copernicus DEM GLO-90 vía Open-Meteo (${sp.length} puntos cada ${fmt(step, 1)} m)`, pts: sp.map((p, i) => ({ x: p.x, y: p.y, z: z[i] })), auto: true, key: perfilKey(g) };
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
    S.proj.perfil = { fuente, pts: sp.map((p, i) => ({ x: p.x, y: p.y, z: z[i] })), auto: true, key: perfilKey(g) };
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
      ['circ', exi, 'Apoyo existente'], ['dash', exi, 'Tramo baja existente'], ['circ', acc, 'Apoyo de entronque']];
    if (exDC().length) leg.push(['diam', rgb(0.478, 0.243, 0.561), 'Punto D-C (CUPS, caracteres 12-18)']);
    const lstep = leg.length > 5 ? 4.0 : 4.6;
    leg.forEach((it, k) => {
      const yy = ly + 8 + k * lstep, [kind, colr, label] = it;
      if (kind === 'diam') page.drawRectangle({ x: X(lx + 1.2), y: Y(yy + 1.5), width: X(2), height: X(2), color: colr, rotate: PDFLib.degrees(45) });
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
        return [apName(i), S.proj.geo?.pts?.[i]?.nombre || '', FUNCS[r.func], p ? poleLabel(p) : '—', sel?.r ? fmt(sel.r.u * 100, 1) : '—', statusOf(r, i).txt, r.z != null ? fmt(r.z, 1) : '—', fmt(pt.x, 2), fmt(pt.y, 2)]; });
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

/* ===== ANEXO I (Galicia): información de liñas, sobre la plantilla del usuario ===== */
const PROV_GAL = [['A CORUÑA', 43.362, -8.411], ['LUGO', 43.012, -7.556], ['OURENSE', 42.336, -7.864], ['PONTEVEDRA', 42.431, -8.645]];
function enGalicia() { const g = getGeo(); if (!g?.pts?.length) return false; const p = g.pts[0]; return p.lat > 41.8 && p.lat < 43.82 && p.lon > -9.35 && p.lon < -6.7; }
function anexo() {
  const A = S.proj.anexo = { galicia: null, provincia: '', concello: '', ct: '', modelo: '', idBase: '', tramos: {}, ...(S.proj.anexo || {}) };
  if (!A.provincia) { const g = getGeo(); if (g?.pts?.length) { const p = g.pts[0];
    // Aproximación por zonas (se pide revisarla)
    A.provincia = p.lat < 42.45 && p.lon > -8.3 ? 'OURENSE' : p.lon > -7.9 ? (p.lat < 42.45 ? 'OURENSE' : 'LUGO') : p.lat < 42.7 ? 'PONTEVEDRA' : 'A CORUÑA'; A.provSugerida = true; } }
  return A;
}
function anexoActivo() { const A = anexo(); return A.galicia == null ? enGalicia() : !!A.galicia; }
function modeloConstructivo(cab) {
  const m = String(cab?.designacion || '').match(/(\d)\s*x\s*(\d+(?:,\d+)?)\s*Al\s*\/\s*(\d+(?:,\d+)?)\s*Alm/i);
  return m ? `RZ ${m[1]}x${m[2]} + ${m[3]} AL` : shortCable(cab?.designacion || '');
}
function anexoFilas() {
  const c = S.calc, g = c && getGeo(c.nodes); if (!c || !g) return [];
  const A = anexo(), cab = c.cable;
  return c.spans.map((s, i) => {
    const a = g.pts[s.i], b = g.pts[s.i + 1];
    const u0 = E.utmFromLatLon(a.lat, a.lon, 30), u1 = E.utmFromLatLon(b.lat, b.lon, 30);
    const t = A.tramos[i] || {};
    return { provincia: A.provincia, concello: A.concello, tipo: t.tipo || 'AEREO', id: t.id ?? (A.idBase ? `${A.idBase}_${i + 1}` : ''), ct: A.ct,
      modelo: A.modelo || modeloConstructivo(cab), km: Math.round((s.aReal || s.a) / 1000 * 1000) / 1000, seccion: Number(cab?.secFase) || '',
      x0: Math.round(u0.x * 1000) / 1000, y0: Math.round(u0.y * 1000) / 1000, x1: Math.round(u1.x * 1000) / 1000, y1: Math.round(u1.y * 1000) / 1000, tramo: `A${s.i + 1}–A${s.i + 2}` };
  });
}
function anexoFaltan() {
  const A = anexo(), f = [];
  if (!getGeo()) f.push('trazado con coordenadas');
  if (!A.provincia) f.push('provincia'); if (!A.concello) f.push('concello'); if (!A.ct) f.push('matrícula del CT');
  if (anexoFilas().some(r => !r.id)) f.push('identificación de todos los tramos');
  return f;
}
function renderAnexo() {
  const box = $('#anexoBody'); if (!box || box.contains(document.activeElement)) return;
  const A = anexo(), act = anexoActivo(), filas = anexoFilas(), faltan = anexoFaltan();
  $('#anexoCard').classList.toggle('inactive', !act);
  box.innerHTML = `<label class="chk"><input type="checkbox" id="ax_gal" ${act ? 'checked' : ''}> Proyecto en Galicia: generar el ANEXO I ${A.galicia == null ? `<span class="note">(${enGalicia() ? 'detectado por las coordenadas' : 'el trazado no está en Galicia'})</span>` : ''}</label>
    ${act ? `<div class="fields" style="margin-top:10px">
      <label class="f">Provincia<select id="ax_provincia">${PROV_GAL.map(([n]) => `<option ${A.provincia === n ? 'selected' : ''}>${n}</option>`).join('')}</select>${A.provSugerida ? '<span class="hint">Propuesta por la situación: revísala</span>' : ''}</label>
      <label class="f">Concello<input id="ax_concello" type="text" value="${esc(A.concello)}" placeholder="p. ej. PADERNE DE ALLARIZ"></label>
      <label class="f">Matrícula CT<input id="ax_ct" type="text" value="${esc(A.ct)}" placeholder="p. ej. CTC002"></label>
      <label class="f">Modelo constructivo<input id="ax_modelo" type="text" value="${esc(A.modelo)}" placeholder="${esc(modeloConstructivo(S.calc?.cable))}"></label>
      <label class="f full">Identificación base de los tramos<input id="ax_idBase" type="text" value="${esc(A.idBase)}" placeholder="p. ej. 220.BTV.SG000821851"><span class="hint">Se numeran como base_1, base_2…; puedes cambiar cada una en la tabla.</span></label>
    </div>
    <div class="tablewrap" style="margin-top:8px"><table class="vt"><thead><tr><th>Tramo</th><th>Tipo</th><th>Identificación</th><th class="n">Long. (km)</th><th class="n">X inicio</th><th class="n">Y inicio</th><th class="n">X fin</th><th class="n">Y fin</th></tr></thead><tbody>
    ${filas.map((r, i) => `<tr><td>${r.tramo}</td><td><select data-axt="tipo" data-i="${i}">${['AEREO', 'FACHADA', 'SUBTERRANEO'].map(t => `<option ${r.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
      <td><input type="text" data-axt="id" data-i="${i}" value="${esc(r.id)}" style="min-width:170px"></td><td class="n">${r.km.toFixed(3)}</td><td class="n">${fmt(r.x0, 3)}</td><td class="n">${fmt(r.y0, 3)}</td><td class="n">${fmt(r.x1, 3)}</td><td class="n">${fmt(r.y1, 3)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Sin tramos calculados con coordenadas.</td></tr>'}
    </tbody></table></div>
    <p class="note">Coordenadas ETRS89 huso 30N, como pide el formato, aunque el proyecto esté en el huso 29. Longitud real del tramo en km, con el desnivel si hay perfil.</p>
    ${faltan.length ? `<div class="banner warn">Para generar el ANEXO I falta: ${faltan.join(', ')}.</div>` : ''}
    <div class="row" style="margin-top:8px"><button class="btn" id="ax_dl" ${faltan.length ? 'disabled' : ''}>Descargar ANEXO I (Excel)</button></div>` : ''}`;
}
function bindAnexo() {
  const box = $('#anexoBody');
  box.addEventListener('change', ev => {
    const t = ev.target, A = anexo();
    if (t.id === 'ax_gal') A.galicia = t.checked;
    else if (t.id && t.id.startsWith('ax_')) { const k = t.id.slice(3); A[k] = k === 'concello' ? t.value.trim().toUpperCase() : t.value.trim(); if (k === 'provincia') A.provSugerida = false; }
    if (t.dataset.axt) { const i = Number(t.dataset.i); A.tramos[i] = { ...(A.tramos[i] || {}), [t.dataset.axt]: t.value.trim() }; }
    renderAnexo();
  });
  box.addEventListener('click', ev => { if (ev.target.id === 'ax_dl') descargarAnexo(); });
}
const xmlEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
async function anexoXlsx() {
  const filas = anexoFilas(); if (!filas.length) throw new Error('no hay tramos');
  const bin = Uint8Array.from(atob(ANEXO_TPL), ch => ch.charCodeAt(0));
  const zip = await JSZip.loadAsync(bin); const path = 'xl/worksheets/sheet1.xml';
  let x = await zip.file(path).async('string');
  const rowRe = r => new RegExp(`<row r="${r}"[^>]*>[\\s\\S]*?</row>`);
  const styles = r => { const m = x.match(rowRe(r)); const st = {}; m[0].replace(/<c r="([A-Z]+)\d+" s="(\d+)"/g, (_, col, s) => { st[col] = s; }); return { st, attrs: m[0].match(/^<row r="\d+"([^>]*)>/)[1] }; };
  const first = styles(5), mid = styles(6), last = styles(38);
  first.st.L = mid.st.L; // en la plantilla L5 es texto
  const tail = []; for (let r = 39; r <= 42; r++) { const m = x.match(rowRe(r)); if (m) tail.push(m[0]); }
  const cell = (col, r, s, v) => v === '' || v == null ? `<c r="${col}${r}" s="${s}"/>` : typeof v === 'number' ? `<c r="${col}${r}" s="${s}"><v>${v}</v></c>` : `<c r="${col}${r}" s="${s}" t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`;
  const n = filas.length;
  const rows = filas.map((f, k) => {
    const r = 5 + k, sty = n === 1 ? first : k === 0 ? first : k === n - 1 ? last : mid;
    const attrs = sty.attrs.replace(/ r="\d+"/, '');
    const vals = { A: '', B: f.provincia, C: f.concello, D: f.tipo, E: f.id, F: f.ct, G: f.modelo, H: f.km, I: f.seccion, J: f.x0, K: f.y0, L: f.x1, M: f.y1, N: '' };
    return `<row r="${r}"${attrs}>${Object.entries(vals).map(([col, v]) => cell(col, r, sty.st[col] ?? '0', v)).join('')}</row>`;
  });
  const tailRen = tail.map((t, k) => t.replace(/<row r="\d+"/, `<row r="${5 + n + k}"`).replace(/(<c r="[A-Z]+)\d+"/g, `$1${5 + n + k}"`));
  const start = x.indexOf('<row r="5"'), endTag = x.indexOf('</sheetData>');
  x = x.slice(0, start) + rows.join('') + tailRen.join('') + x.slice(endTag);
  x = x.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:N${4 + n + tail.length}"/>`).replace(/<selection [^>]*\/>/, '<selection activeCell="B5" sqref="B5"/>');
  zip.file(path, x);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
function anexoNombre() { return 'ANEXO_I_' + ascii(S.proj.nombre || 'proyecto').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 50) + '.xlsx'; }
async function descargarAnexo() {
  const f = anexoFaltan(); if (f.length) { toast('Para el ANEXO I falta: ' + f.join(', ') + '.'); return; }
  try { const data = await anexoXlsx(); if (await saveFile(anexoNombre(), new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))) toast('ANEXO I guardado.'); }
  catch (e) { toast('No se pudo generar el ANEXO I: ' + e.message); }
}

/* ---------- Proyectos ---------- */
/* Guardar: primero pregunta en qué carpeta (y con qué nombre) se guarda el archivo del proyecto; después lo añade a «Proyectos guardados». */
function projFileData() { return { app: 'Calculo de Apoyos BT', version: VERSION, proyecto: { ...S.proj, id: undefined, fondos: Object.fromEntries(Object.entries(S.proj.fondos || {}).map(([k, f]) => [k, { ...f, blobUrl: undefined }])) } }; }
function projFileName() { return ascii(S.proj.nombre || 'proyecto').replace(/[^A-Za-z0-9_-]+/g, '_') + '.apoyosbt.json'; }
async function pickAndWrite(name, blob) {
  // Devuelve {ok, archivo} · {cancel} · {noPicker}
  if (typeof window.showSaveFilePicker !== 'function') return { noPicker: true };
  let h;
  try { h = await window.showSaveFilePicker({ id: 'apoyosbt-proyectos', suggestedName: name, startIn: 'documents', types: [{ description: 'Proyecto de Cálculo de Apoyos BT', accept: { 'application/json': ['.json'] } }] }); }
  catch (e) { if (e?.name === 'AbortError') return { cancel: true }; return { noPicker: true }; }
  try { const w = await h.createWritable(); await w.write(blob); await w.close(); return { ok: true, archivo: h.name }; }
  catch (e) { toast('No se pudo escribir el archivo: ' + (e.message || e.name)); return { cancel: true }; }
}
async function saveProject() {
  const blob = new Blob([JSON.stringify(projFileData())], { type: 'application/json' });
  const r = await pickAndWrite(projFileName(), blob);       // el selector de carpeta se abre directamente con el clic
  if (r.cancel) { toast('Guardado cancelado: no se ha elegido carpeta.'); return; }
  let archivo = r.archivo || '';
  if (r.noPicker) {
    if (!(await saveFile(projFileName(), blob))) return;
    archivo = projFileName();
    toast('Este navegador no deja elegir la carpeta desde la app: el archivo va a la carpeta de descargas, salvo que actives «Preguntar dónde guardar cada archivo» en los ajustes de descargas del navegador.');
  }
  if (Object.values(S.proj.fondos || {}).some(f => f.blobUrl && !f.assetId)) toast('Aviso: algún fondo cargado a mano no se conservará con el proyecto.');
  if (!S.db) { toast(`Proyecto guardado en el archivo «${archivo}».`); return; }
  const data = { nombre: S.proj.nombre || 'Sin nombre', fecha: new Date().toISOString(), archivo, datos: JSON.stringify({ ...S.proj, id: undefined, fondos: Object.fromEntries(Object.entries(S.proj.fondos || {}).map(([k, f]) => [k, { ...f, blobUrl: undefined }])) }) };
  try {
    if (S.proj.id) await S.db.doc('proyectos/' + S.proj.id).set(data);
    else { const ref = await S.db.collection('proyectos').add(data); S.proj.id = ref.id; }
    if (!r.noPicker) toast(`Proyecto guardado en el archivo «${archivo}» de la carpeta elegida y en «Proyectos guardados».`);
    renderProjName();
  } catch (e) { toast('Archivo guardado, pero no se pudo añadir a «Proyectos guardados»: ' + (e.message || e.code)); }
}
function renderProjList() {
  const box = $('#projList');
  const b = $('#projBtn'); if (b) b.textContent = `Proyectos guardados${S.projs.length ? ' (' + S.projs.length + ')' : ''} ▾`;
  if (!S.projs.length) { box.innerHTML = '<p class="note">Aún no hay proyectos guardados. Pulsa «Guardar» para conservar el trazado y los datos de cálculo.</p>'; return; }
  box.innerHTML = `<div class="tablewrap"><table><tbody>${S.projs.map(p => `<tr><td>${esc(p.nombre)}${p.archivo ? `<div class="note">${esc(p.archivo)}</div>` : ''}</td><td class="note">${p.fecha ? new Date(p.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) : ''}</td>
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
  const blob = new Blob([JSON.stringify(projFileData())], { type: 'application/json' });
  const r = await pickAndWrite(projFileName(), blob);
  if (r.cancel) return;
  if (r.ok) { toast(`Proyecto exportado a «${r.archivo}».`); return; }
  if (await saveFile(projFileName(), blob)) toast('Proyecto exportado.');
}
async function importProject(file) {
  try { const j = JSON.parse(await file.text());
    if (j.apoyos || j.cables) { if (!S.db?.importAll) return toast('Importar bases solo está disponible en la versión local.'); S.db.importAll(j); return toast('Bases de apoyos y cables importadas.'); }
    const d = j.proyecto || j; S.proj = { ...exampleProject(), ...d, ctx: { ...DEF_CTX, ...d.ctx }, id: null };
    S.img = {}; S.sel = null; S.openEx = null; V.fitted = false; loadForm(); refreshAll(); toast('Proyecto abierto desde archivo.');
  } catch (e) { toast('El archivo no es un proyecto válido.'); }
}
function renderProjName() { const el = $('#projName'); if (el) { el.textContent = S.proj.nombre ? S.proj.nombre + (S.proj.id ? '' : ' · sin guardar') : 'Proyecto sin nombre'; } }
function bindProjects() {
  const btn = $('#projBtn'), panel = $('#projPanel');
  btn.onclick = ev => { ev.stopPropagation(); panel.hidden = !panel.hidden; btn.setAttribute('aria-expanded', String(!panel.hidden)); if (!panel.hidden) renderProjList(); };
  document.addEventListener('click', ev => { if (!panel.hidden && !ev.target.closest('.projdrop')) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !panel.hidden) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); } });
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
      S.img = {}; S.sel = null; S.openEx = null; S.pickEntronque = false; V.fitted = false; loadForm(); refreshAll(); $('#projPanel').hidden = true; toast('Proyecto abierto.'); }
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
  initCollapsibles(); bindPdf(); bindAnexo(); bindCapas();
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
