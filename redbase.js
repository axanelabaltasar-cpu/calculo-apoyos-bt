/* =====================================================================
   BASE DE RED EXISTENTE POR DISTRIBUIDORA
   Apoyos, tramos de baja y puntos D-C exportados del GIS (JSON). Se guardan una vez por distribuidora
   y cada proyecto carga solo la red de su zona (alrededor de la red nueva o de un elemento buscado).
   Web: en la base de datos (Firestore, en partes). Versión local y de Claude: en este navegador (IndexedDB).
   ===================================================================== */
const DISTRIBUIDORAS = [['cantona', 'Eléctrica de Cantoña'], ['noroeste', 'Eléctrica del Noroeste']];
const distNombre = id => (DISTRIBUIDORAS.find(d => d[0] === id) || [id, id])[1];
const RB_PARTE = 700000, RB_RADIO = 300;
S.redBase = {};          // id -> datos cargados (caché de la sesión)
S.redMeta = {};          // id -> resumen (número de elementos, fecha)

/* ---- Almacenamiento ---- */
const rbIdb = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('calculoApoyosBT.redes', 1); r.onupgradeneeded = () => r.result.createObjectStore('redes'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('redes', mode), st = t.objectStore('redes'); const q = fn(st); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); }); };
  return { get: id => tx('readonly', st => st.get(id)), set: (id, v) => tx('readwrite', st => st.put(v, id)), del: id => tx('readwrite', st => st.delete(id)), keys: () => tx('readonly', st => st.getAllKeys()) };
})();
async function rbGuardar(id, data, cols) {
  const txt = JSON.stringify(data);
  const meta = { nombre: distNombre(id), fecha: new Date().toISOString(), nApoyos: data.apoyos.length, nTramos: data.tramos.length, nDC: data.dc.length, tamano: txt.length, cols: cols || S.redMeta[id]?.cols || null };
  if (WEB) {
    const partes = Math.ceil(txt.length / RB_PARTE), prev = S.redMeta[id]?.partes || 0;
    for (let k = 0; k < partes; k++) await S.db.doc(`redes/${id}/partes/${k}`).set({ k, txt: txt.slice(k * RB_PARTE, (k + 1) * RB_PARTE) });
    for (let k = partes; k < prev; k++) await S.db.doc(`redes/${id}/partes/${k}`).delete();
    meta.partes = partes; await S.db.doc('redes/' + id).set(meta);
  } else { await rbIdb.set(id, { meta, data }); }
  S.redMeta[id] = meta; S.redBase[id] = data; if (S.rbFalta) delete S.rbFalta[id];
}
async function rbMeta(id) {
  if (S.redMeta[id] !== undefined) return S.redMeta[id];
  if (WEB && !S.db) return undefined;
  try {
    if (WEB) { const d = await S.db.doc('redes/' + id).get(); S.redMeta[id] = d.exists ? d.data() : null; }
    else { const v = await rbIdb.get(id); S.redMeta[id] = v?.meta || null; if (v) S.redBase[id] = v.data; }
  } catch (e) { S.redMeta[id] = null; }
  return S.redMeta[id];
}
async function rbCargar(id) {
  if (S.redBase[id]) return S.redBase[id];
  const m = await rbMeta(id); if (!m) return null;
  if (WEB) {
    const qs = await S.db.collection(`redes/${id}/partes`).get();
    const ps = qs.docs.map(d => d.data()).sort((a, b) => a.k - b.k);
    if (ps.length < m.partes) throw new Error('la base está incompleta; vuelve a importarla');
    S.redBase[id] = JSON.parse(ps.map(p => p.txt).join(''));
  }
  return S.redBase[id] || null;
}
async function rbBorrar(id) {
  if (WEB) { const m = await rbMeta(id); for (let k = 0; k < (m?.partes || 0); k++) await S.db.doc(`redes/${id}/partes/${k}`).delete(); await S.db.doc('redes/' + id).delete(); }
  else await rbIdb.del(id);
  S.redMeta[id] = null; delete S.redBase[id];
}

/* ---- Lectura de los JSON del GIS (apoyos, tramos de baja y puntos D-C) ---- */
const rbNum = v => { const n = Number(String(v ?? '').trim().replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : NaN; };
const RB_SIN = /^Coordenada [XY]( inicio| fin)?( Z\d+)?$/;
const rbAttrs = r => Object.fromEntries(Object.entries(r).filter(([k, v]) => !RB_SIN.test(k) && v !== '' && v != null).map(([k, v]) => [k, String(v)]));
const r2 = v => Math.round(v * 100) / 100;
function rbTipo(r) {
  if ('CUPS' in r) return 'dc';
  if ('Coordenada X inicio Z29' in r || 'Arqueta/apoyo Inicio' in r || 'Nudo inicio' in r) return 'tramos';
  if ('Número apoyo' in r || /\.APO\./.test(r.Identificador || '')) return 'apoyos';
  return '';
}
function rbLeer(arr) {
  const out = { apoyos: [], tramos: [], dc: [] }; let sinCoord = 0;
  (Array.isArray(arr) ? arr : arr?.features || []).forEach(r0 => {
    const r = r0.properties || r0, t = rbTipo(r); if (!t) return;
    if (t === 'tramos') {
      const x1 = rbNum(r['Coordenada X inicio Z29']), y1 = rbNum(r['Coordenada Y inicio Z29']), x2 = rbNum(r['Coordenada X fin Z29']), y2 = rbNum(r['Coordenada Y fin Z29']);
      if (![x1, y1, x2, y2].every(isFinite)) { sinCoord++; return; }
      out.tramos.push([r2(x1), r2(y1), r2(x2), r2(y2), rbAttrs(r)]);
    } else {
      const x = rbNum(r['Coordenada X Z29']), y = rbNum(r['Coordenada Y Z29']);
      if (!isFinite(x) || !isFinite(y)) { sinCoord++; return; }
      out[t].push([r2(x), r2(y), rbAttrs(r)]);
    }
  });
  return { ...out, sinCoord };
}

/* ---- Cargar en el proyecto la red de la zona ---- */
function rbPt(x, y) { // del huso 29 al del proyecto
  const z = S.proj.zone || 29; const ll = E.latLonFromUtm(x, y, 29);
  return z === 29 ? { x, y, lat: ll.lat, lon: ll.lon } : { ...E.utmFromLatLon(ll.lat, ll.lon, z), lat: ll.lat, lon: ll.lon };
}
function redNuevaPts() { // red nueva del proyecto: trazado, tramos nuevos, red subterránea y CGP
  const sinGeo = S.proj.modo !== 'kml' && !(S.proj.entronque && exNodes()[S.proj.entronque.k]);
  const n = sinGeo ? [] : (S.calc?.nodes || []);
  return [...n, ...(S.proj.geo?.ruta || []), ...tramosAerVis().flatMap(t => t.pts), ...subAllPts()];
}
function rbCaja(pts, R) { if (!pts.length) return null; const xs = pts.map(p => p.x), ys = pts.map(p => p.y); return { x0: Math.min(...xs) - R, y0: Math.min(...ys) - R, x1: Math.max(...xs) + R, y1: Math.max(...ys) + R }; }
const dentro = (c, x, y) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1;
const cajaContiene = (a, b) => a && b && b.x0 >= a.x0 && b.y0 >= a.y0 && b.x1 <= a.x1 && b.y1 <= a.y1;
/* Añade al proyecto los elementos de la base dentro de la caja (no quita ni cambia los que ya hay: se conservan las ediciones y el entronque) */
async function rbAplicar(id, caja, { silencio = false } = {}) {
  let base; try { base = await rbCargar(id); } catch (e) { toast('No se pudo leer la red existente: ' + (e.message || e.code)); return 0; }
  if (!base) { S.rbFalta = S.rbFalta || {}; S.rbFalta[id] = true; if (!silencio) toast(`No hay red existente de ${distNombre(id)} en la base. Impórtala en la pestaña «Base de red existente».`); return 0; }
  if (!S.proj.zone) S.proj.zone = 29;
  const z = S.proj.zone, cz = z === 29 ? caja : (() => { const a = E.latLonFromUtm(caja.x0, caja.y0, z), b = E.latLonFromUtm(caja.x1, caja.y1, z); const A = E.utmFromLatLon(a.lat, a.lon, 29), B = E.utmFromLatLon(b.lat, b.lon, 29); return { x0: Math.min(A.x, B.x), y0: Math.min(A.y, B.y), x1: Math.max(A.x, B.x), y1: Math.max(A.y, B.y) }; })();
  const R = redEx() || (S.proj.redEx = { lineas: [], apoyos: [] }); R.apoyos = R.apoyos || []; R.puntosDC = R.puntosDC || [];
  const fuente = 'Base ' + distNombre(id);
  const tiene = new Set([...R.apoyos.map(a => a.attrs?.Identificador), ...R.lineas.map(l => l.attrs?.Identificador), ...R.puntosDC.map(d => d.attrs?.CUPS)].filter(Boolean));
  let n = 0; const prevEn = S.proj.entronque?.k != null ? exNodes()[S.proj.entronque.k] : null;
  const yaApoyos = R.apoyos.length;
  base.apoyos.forEach(([x, y, a]) => { if (!dentro(cz, x, y) || tiene.has(a.Identificador)) return; R.apoyos.push({ id: uid('e'), nombre: a['Número apoyo'] || a.Identificador || '', attrs: { ...a }, fuente, ...rbPt(x, y) }); n++; });
  base.tramos.forEach(([x1, y1, x2, y2, a]) => {
    const toca = dentro(cz, x1, y1) || dentro(cz, x2, y2) || dentro(cz, (x1 + x2) / 2, (y1 + y2) / 2);
    if (!toca || tiene.has(a.Identificador)) return; R.lineas.push({ id: uid('l'), nombre: a.Identificador || '', fuente, attrs: { ...a }, pts: [rbPt(x1, y1), rbPt(x2, y2)] }); n++; });
  base.dc.forEach(([x, y, a]) => { if (!dentro(cz, x, y) || tiene.has(a.CUPS)) return; R.puntosDC.push({ id: uid('d'), nombre: '', cups: String(a.CUPS || '').replace(/\s/g, '').toUpperCase(), attrs: { ...a }, fuente, ...rbPt(x, y) }); n++; });
  // sin apoyos existentes antes, los vértices hacían de apoyos: se recoloca el entronque sobre el apoyo real
  if (prevEn && !yaApoyos && R.apoyos.length) { const k = exNodes().findIndex(a => Math.hypot(a.x - prevEn.x, a.y - prevEn.y) < 1); S.proj.entronque.k = k >= 0 ? k : null; }
  S.proj.distribuidora = id;
  const zc = S.proj.redZona?.dist === id ? S.proj.redZona : null;
  S.proj.redZona = zc ? { dist: id, x0: Math.min(zc.x0, caja.x0), y0: Math.min(zc.y0, caja.y0), x1: Math.max(zc.x1, caja.x1), y1: Math.max(zc.y1, caja.y1) } : { dist: id, ...caja };
  invalidateVert(); ensureEntronque();
  if (!silencio || n) toast(n ? `Red existente de ${distNombre(id)}: ${n} elemento(s) de la zona añadidos al proyecto.` : `No hay más red existente de ${distNombre(id)} en esta zona.`);
  return n;
}
/* Red nueva importada o dibujada fuera de la zona ya cargada: se trae la red existente que falta (automático) */
let rbAutoT = null, rbAutoBusy = false;
function rbAuto() {
  const id = S.proj.distribuidora; if (!id || S.proj.redAuto === false || rbAutoBusy || S.rbFalta?.[id]) return;
  const caja = rbCaja(redNuevaPts(), Number(S.proj.redRadio) || RB_RADIO); if (!caja) return;
  if (cajaContiene(S.proj.redZona?.dist === id ? S.proj.redZona : null, caja)) return;
  clearTimeout(rbAutoT); rbAutoT = setTimeout(async () => {
    rbAutoBusy = true; try { snapshot(); const n = await rbAplicar(id, caja, { silencio: true }); if (!n) S.hist.pop(); V.fitted = false; refreshAll(); } finally { rbAutoBusy = false; }
  }, 400);
}
{ const _ra = refreshAll; refreshAll = function () { _ra(); renderRedSel(); rbAuto(); }; }
/* El plano se ajusta a la red nueva (aérea o subterránea) cuando la hay; si no, a la red existente cargada */
allPts = function () {
  const base = redNuevaPts().concat(S.proj.sum?.cgp?.x != null ? [S.proj.sum.cgp] : []);
  if (base.length) return base;
  return [...exNodes(), ...exLineas().flatMap(l => l.pts), ...exDC()];
};

/* ---- Buscar en la base (CUPS, apoyo, tramo, dirección o titular) ---- */
function rbBuscar(base, q) {
  const s = String(q || '').trim().toUpperCase(); if (s.length < 3) return [];
  const sc = s.replace(/[\s.-]/g, ''), res = [];
  const has = (v, compact) => { v = String(v || '').toUpperCase(); return compact ? v.replace(/[\s.-]/g, '').includes(sc) : v.includes(s); };
  base.dc.forEach(([x, y, a]) => { if (has(a.CUPS, true) || has(a['Dirección suministro']) || has(a.Titular)) res.push({ x, y, tipo: 'Punto D-C', txt: [a.CUPS, a['Dirección suministro'], a.Municipio].filter(Boolean).join(' · ') }); });
  base.apoyos.forEach(([x, y, a]) => { if (has(a.Identificador, true) || has(a['Número apoyo'])) res.push({ x, y, tipo: 'Apoyo', txt: [a.Identificador, a['Número apoyo'], a.Municipio].filter(Boolean).join(' · ') }); });
  base.tramos.forEach(([x1, y1, x2, y2, a]) => { if (has(a.Identificador, true) || has(a['Denominación tramo']) || has(a.Padre, true)) res.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, tipo: 'Tramo', txt: [a.Identificador, a['Denominación tramo'], a.Conductor].filter(Boolean).join(' · ') }); });
  return res.slice(0, 12);
}

/* ---- Selector en «Red existente y entronque» ---- */
function renderRedSel() {
  const box = $('#redSel'); if (!box || box.contains(document.activeElement) && document.activeElement.matches('input')) return;
  const id = S.proj.distribuidora || '', m = id ? S.redMeta[id] : null;
  if (id && S.redMeta[id] === undefined) rbMeta(id).then(() => renderRedSel());
  box.innerHTML = `<div class="fields hfields">
    <label class="f">Distribuidora<select id="rs_dist"><option value="">Sin base (importar archivos)</option>${DISTRIBUIDORAS.map(([k, n]) => `<option value="${k}" ${k === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
    <label class="f">Radio alrededor (m)<input id="rs_radio" class="num" type="number" min="50" step="50" value="${Number(S.proj.redRadio) || RB_RADIO}"></label>
    <label class="chk" style="align-self:end"><input id="rs_auto" type="checkbox" ${S.proj.redAuto !== false ? 'checked' : ''}> Traer la red al importar o dibujar la red nueva</label>
    <div class="f" style="justify-content:flex-end"><button class="btn small" id="rs_zona" ${id ? '' : 'disabled'}>Cargar red de la zona</button></div>
    <label class="f w2">Buscar en la red de la distribuidora<input id="rs_q" type="search" placeholder="CUPS, apoyo, tramo, dirección o titular" ${id ? '' : 'disabled'}></label>
  </div>
  <p class="note" style="margin:4px 0 0">${!id ? 'Elige la distribuidora para usar su red existente guardada, o importa los archivos KMZ abajo.' : m ? `Base de ${esc(distNombre(id))}: ${m.nApoyos} apoyos, ${m.nTramos} tramos y ${m.nDC} puntos D-C (actualizada el ${new Date(m.fecha).toLocaleDateString('es-ES')}). Se cargan solo los elementos de la zona del proyecto.` : m === null ? `No hay red de ${esc(distNombre(id))} en la base: impórtala en la pestaña «Base de red existente».` : 'Leyendo la base…'}</p>
  <div id="rs_res"></div>`;
}
function bindRedSel() {
  const card = $('#redSel'); if (!card) return;
  card.addEventListener('change', ev => {
    const t = ev.target;
    if (t.id === 'rs_dist') { S.proj.distribuidora = t.value || null; S.proj.redZona = null; try { if (t.value) localStorage.setItem('calculoApoyosBT.dist', t.value); } catch (e) { } renderRedSel(); rbAuto(); }
    if (t.id === 'rs_radio') { S.proj.redRadio = Math.max(50, Number(t.value) || RB_RADIO); }
    if (t.id === 'rs_auto') { S.proj.redAuto = t.checked; rbAuto(); }
  });
  card.addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'rs_zona') {
      const id = S.proj.distribuidora, R = Number(S.proj.redRadio) || RB_RADIO;
      let pts = redNuevaPts(); if (!pts.length && V.sc && S.proj.zone) pts = [{ x: V.cx, y: V.cy }];
      const caja = rbCaja(pts, R); if (!caja) return toast('Busca primero un CUPS, apoyo o tramo, o importa o dibuja la red nueva.');
      b.disabled = true; b.textContent = 'Cargando…'; snapshot(); await rbAplicar(id, caja); V.fitted = false; refreshAll();
    }
    if (b.dataset.rsx) {
      const id = S.proj.distribuidora, R = Number(S.proj.redRadio) || RB_RADIO, x = Number(b.dataset.rsx), y = Number(b.dataset.rsy);
      const z = S.proj.zone || 29; const P = z === 29 ? { x, y } : rbPt(x, y);
      snapshot(); await rbAplicar(id, { x0: P.x - R, y0: P.y - R, x1: P.x + R, y1: P.y + R });
      $('#rs_res').innerHTML = ''; refreshAll(); if (!redNuevaPts().length) { fitView(); } else { V.cx = P.x; V.cy = P.y; V.sc = Math.max(V.sc || 0, 1); } drawMap();
    }
  });
  card.addEventListener('keydown', async ev => {
    if (ev.target.id !== 'rs_q' || ev.key !== 'Enter') return; ev.preventDefault();
    const id = S.proj.distribuidora; const out = $('#rs_res'); out.innerHTML = '<p class="note">Buscando…</p>';
    let base; try { base = await rbCargar(id); } catch (e) { out.innerHTML = `<p class="note">${esc(e.message)}</p>`; return; }
    if (!base) { out.innerHTML = '<p class="note">No hay base de esta distribuidora.</p>'; return; }
    const res = rbBuscar(base, ev.target.value);
    out.innerHTML = res.length ? `<div class="tablewrap" style="margin-top:6px"><table><tbody>${res.map(r => `<tr><td class="note">${r.tipo}</td><td>${esc(r.txt)}</td><td><button class="btn small" data-rsx="${r.x}" data-rsy="${r.y}">Cargar zona</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="note">Sin resultados (mínimo 3 caracteres).</p>';
  });
}

/* ---- Pestaña «Base de red existente» ---- */
async function renderRedBases() {
  const box = $('#redBases'); if (!box) return;
  for (const [k] of DISTRIBUIDORAS) await rbMeta(k);
  box.innerHTML = DISTRIBUIDORAS.map(([k, n]) => { const m = S.redMeta[k];
    return `<section class="card" style="margin-top:16px"><h2>${esc(n)}</h2>
      ${m ? `<p>${m.nApoyos} apoyos · ${m.nTramos} tramos de baja · ${m.nDC} puntos D-C <span class="note">· actualizada el ${new Date(m.fecha).toLocaleString('es-ES')}</span></p>` : '<p class="note">Sin red existente guardada.</p>'}
      <div class="row" style="margin-top:8px"><label class="btn small primary" for="rb_f_${k}">Importar archivos del GIS (JSON)</label><input id="rb_f_${k}" data-rb="${k}" type="file" accept=".json,.geojson" multiple hidden>
      ${m ? `<button class="btn small ghost" data-rbdel="${k}">Borrar la red guardada</button>` : ''}</div>
      <p class="note" style="margin-top:6px">Puedes elegir a la vez los tres archivos (apoyos, tramos de baja y puntos D-C) o solo alguno. Antes de guardar se muestran sus columnas para elegir qué datos se suben; cada tipo que subas sustituye al guardado y los demás se conservan. Coordenadas ETRS89 UTM huso 29 («Coordenada X/Y Z29»).</p>
      <p class="note" id="rb_msg_${k}" role="status"></p></section>`; }).join('');
}
/* ---- Revisión antes de subir: cabeceras de cada archivo y selección de los datos definitivos ---- */
const RB_TIPOS = { apoyos: 'Apoyos', tramos: 'Tramos de baja', dc: 'Puntos D-C' }, RB_TIPOS_L = { apoyos: 'apoyos', tramos: 'tramos de baja', dc: 'puntos D-C' };
const RB_FIJOS = { apoyos: ['Identificador', 'Número apoyo', 'Esfuerzo máximo (daN)'], tramos: ['Identificador', 'Denominación tramo', 'Situación', 'Conductor'], dc: ['CUPS'] };
const RB_BAJA = { apoyos: r => !!(r['Fecha baja'] || '').trim(), tramos: r => !!(r['Fecha baja'] || '').trim() || /^(s|si|sí|1|true)$/i.test(String(r['Borrado'] || '').trim()), dc: r => !!(r['Fecha baja contrato'] || '').trim() };
async function rbPreparar(id, files) {
  const P = { id, tipos: {}, nada: [] };
  for (const f of files) {
    let j; try { j = JSON.parse((await f.text()).replace(/^﻿/, '')); } catch (e) { P.nada.push(f.name); continue; }
    const rows = (Array.isArray(j) ? j : j?.features || []).map(r => r.properties || r); let algo = false;
    rows.forEach(r => { const t = rbTipo(r); if (!t) return; algo = true; const T = P.tipos[t] || (P.tipos[t] = { rows: [], files: new Set() }); T.rows.push(r); T.files.add(f.name); });
    if (!algo) P.nada.push(f.name);
  }
  const prevCols = (await rbMeta(id))?.cols || {};
  for (const [t, T] of Object.entries(P.tipos)) {
    const cnt = new Map(), ej = {};
    T.rows.forEach(r => Object.entries(r).forEach(([k, v]) => { if (RB_SIN.test(k)) return; if (!cnt.has(k)) cnt.set(k, 0); if (v !== '' && v != null) { cnt.set(k, cnt.get(k) + 1); if (!(k in ej)) ej[k] = String(v); } }));
    T.cols = [...cnt.keys()].map(k => ({ k, n: cnt.get(k), ej: ej[k] || '' }));
    const prev = prevCols[t]; T.sel = new Set(T.cols.filter(c => RB_FIJOS[t].includes(c.k) || (prev ? prev.includes(c.k) : c.n > 0)).map(c => c.k));
    T.on = true; T.sinBaja = true; T.files = [...T.files];
  }
  return P;
}
function rbFilas(t, T) { return T.rows.filter(r => !(T.sinBaja && RB_BAJA[t](r))); }
function renderRbPrev() {
  const box = $('#rbPrev'), P = S.rbPrev; if (!box) return;
  if (!P) { box.innerHTML = ''; box.hidden = true; return; }
  box.hidden = false;
  const tipos = Object.entries(P.tipos);
  const total = tipos.filter(([, T]) => T.on).reduce((a, [t, T]) => a + rbFilas(t, T).length, 0);
  box.innerHTML = `<section class="card" style="margin-top:16px"><h2>Revisar antes de subir · ${esc(distNombre(P.id))}</h2>
    <p class="note">Marca las columnas que quieres guardar de cada archivo. Las coordenadas (huso 29) se guardan siempre, y las columnas con 🔒 las usa la aplicación (identificador, conductor, situación, CUPS…). Cada tipo que subas sustituye al guardado; los que no marques se conservan como están.</p>
    ${P.nada.length ? `<p class="banner warn">Archivos no reconocidos (no son apoyos, tramos ni puntos D-C): ${esc(P.nada.join(', '))}</p>` : ''}
    ${!tipos.length ? '<p class="note">No hay nada que subir.</p>' : ''}
    ${tipos.map(([t, T]) => { const filas = rbFilas(t, T), bajas = T.rows.length - filas.length, sel = T.cols.filter(c => T.sel.has(c.k));
      return `<div class="dsec" style="margin-top:12px">
        <h3 class="sub" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label class="chk"><input type="checkbox" data-rpon="${t}" ${T.on ? 'checked' : ''}> ${RB_TIPOS[t]}</label>
          <span class="note" style="font-weight:400;text-transform:none;letter-spacing:0">${esc(T.files.join(', '))} · ${T.rows.length} filas · ${T.cols.length} columnas · ${T.sel.size} marcadas</span></h3>
        <div ${T.on ? '' : 'hidden'}>
        <div class="row" style="margin:6px 0;gap:6px;flex-wrap:wrap">
          <button class="btn small" data-rpall="${t}">Todas</button><button class="btn small" data-rpnone="${t}">Solo las 🔒</button><button class="btn small" data-rpfull="${t}">Solo las que tienen datos</button>
          <label class="chk" style="margin-left:8px"><input type="checkbox" data-rpbaja="${t}" ${T.sinBaja ? 'checked' : ''}> Quitar los dados de baja (${bajas})</label>
          <span class="note">Se subirán <b>${filas.length}</b> ${RB_TIPOS_L[t]}.</span></div>
        <div class="tablewrap" style="max-height:320px;overflow:auto"><table class="vt rbcols"><thead><tr><th></th><th>Columna</th><th class="n">Con datos</th><th>Ejemplo</th></tr></thead><tbody>
          ${T.cols.map(c => { const fijo = RB_FIJOS[t].includes(c.k); return `<tr class="${T.sel.has(c.k) ? '' : 'off'}"><td><input type="checkbox" data-rpc="${t}" data-k="${esc(c.k)}" ${T.sel.has(c.k) ? 'checked' : ''} ${fijo ? 'disabled' : ''} aria-label="Guardar ${esc(c.k)}"></td><td>${fijo ? '🔒 ' : ''}${esc(c.k)}</td><td class="n">${c.n} <span class="note">(${Math.round(100 * c.n / Math.max(T.rows.length, 1))} %)</span></td><td class="note">${esc(c.ej.slice(0, 60))}</td></tr>`; }).join('')}
        </tbody></table></div>
        <details style="margin-top:6px"><summary class="note">Vista previa de las 5 primeras filas con las columnas marcadas</summary>
          <div class="tablewrap" style="margin-top:4px;overflow:auto"><table class="vt"><thead><tr>${sel.map(c => `<th>${esc(c.k)}</th>`).join('')}</tr></thead><tbody>${filas.slice(0, 5).map(r => `<tr>${sel.map(c => `<td>${esc(String(r[c.k] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>
        </div></div>`; }).join('')}
    <div class="row" style="margin-top:14px;gap:8px">${total ? `<button class="btn primary" id="rp_subir">Subir ${total} elementos a la base de ${esc(distNombre(P.id))}</button>` : ''}<button class="btn ghost" id="rp_cancel">Cancelar</button><span class="note" id="rp_msg" role="status"></span></div></section>`;
}
async function rbSubir() {
  const P = S.rbPrev; if (!P) return;
  const prev = (await rbCargar(P.id).catch(() => null)) || { v: 1, zone: 29, apoyos: [], tramos: [], dc: [] };
  const data = { v: 1, zone: 29, apoyos: prev.apoyos, tramos: prev.tramos, dc: prev.dc }, cols = { ...((await rbMeta(P.id))?.cols || {}) }; let sinCoord = 0; const hecho = [];
  for (const [t, T] of Object.entries(P.tipos)) {
    if (!T.on) continue;
    const r = rbLeer(rbFilas(t, T)); sinCoord += r.sinCoord;
    data[t] = r[t].map(e => { const a = e[e.length - 1]; e[e.length - 1] = Object.fromEntries(Object.entries(a).filter(([k]) => T.sel.has(k))); return e; });
    cols[t] = [...T.sel]; hecho.push(`${data[t].length} ${RB_TIPOS_L[t]}`);
  }
  await rbGuardar(P.id, data, cols);
  return { hecho, sinCoord };
}
function bindRedBases() {
  const box = $('#redBases'), pv = $('#rbPrev'); if (!box) return;
  box.addEventListener('change', async ev => {
    const inp = ev.target.closest('input[data-rb]'); if (!inp || !inp.files.length) return;
    const id = inp.dataset.rb, msg = $('#rb_msg_' + id), files = [...inp.files]; inp.value = '';
    if (!S.db && WEB) return toast('Sin conexión con la base de datos.');
    msg.textContent = 'Leyendo los archivos…';
    try { S.rbPrev = await rbPreparar(id, files); msg.textContent = 'Revisa las columnas abajo y pulsa «Subir».'; renderRbPrev(); pv.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    catch (e) { msg.textContent = 'No se pudieron leer: ' + (e.message || e); }
  });
  box.addEventListener('click', async ev => {
    const b = ev.target.closest('button[data-rbdel]'); if (!b) return;
    if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Pulsa otra vez para borrar'; b.classList.add('danger'); return; }
    await rbBorrar(b.dataset.rbdel); await renderRedBases(); renderRedSel(); toast('Red existente borrada de la base. Los proyectos ya guardados conservan la suya.');
  });
  pv.addEventListener('change', ev => {
    const t = ev.target, P = S.rbPrev; if (!P) return; const d = t.dataset;
    if (d.rpon) P.tipos[d.rpon].on = t.checked;
    if (d.rpbaja) P.tipos[d.rpbaja].sinBaja = t.checked;
    if (d.rpc) { const S2 = P.tipos[d.rpc].sel; t.checked ? S2.add(d.k) : S2.delete(d.k); }
    const y = window.scrollY; renderRbPrev(); window.scrollTo(0, y);
  });
  pv.addEventListener('click', async ev => {
    const b = ev.target.closest('button'); if (!b) return; const P = S.rbPrev; if (!P) return; const d = b.dataset;
    const T = P.tipos[d.rpall || d.rpnone || d.rpfull];
    if (T) { const t = d.rpall || d.rpnone || d.rpfull; T.sel = new Set(T.cols.filter(c => RB_FIJOS[t].includes(c.k) || (d.rpall ? true : d.rpfull ? c.n > 0 : false)).map(c => c.k)); const y = window.scrollY; renderRbPrev(); window.scrollTo(0, y); return; }
    if (b.id === 'rp_cancel') { S.rbPrev = null; renderRbPrev(); $('#rb_msg_' + P.id).textContent = 'Importación cancelada: no se ha guardado nada.'; return; }
    if (b.id === 'rp_subir') {
      b.disabled = true; b.textContent = 'Subiendo…';
      try { const r = await rbSubir(); S.rbPrev = null; renderRbPrev(); await renderRedBases();
        $('#rb_msg_' + P.id).textContent = `Guardado en la base: ${r.hecho.join(', ')}.` + (r.sinCoord ? ` ${r.sinCoord} sin coordenadas, omitidos.` : '');
        toast(`Red existente de ${distNombre(P.id)} guardada.`); renderRedSel(); $('#redBases').scrollIntoView({ block: 'start' }); }
      catch (e) { b.disabled = false; b.textContent = 'Subir'; $('#rp_msg').textContent = 'No se pudo guardar: ' + (e.message || e.code); }
    }
  });
}
/* Proyectos nuevos: la última distribuidora usada */
{ const _np = nuevoProyecto; nuevoProyecto = function () { _np(); let d = null; try { d = localStorage.getItem('calculoApoyosBT.dist'); } catch (e) { } S.proj.distribuidora = d || 'cantona'; refreshAll(); }; }
{ const _st = start; start = async function () { await _st(); bindRedSel(); bindRedBases(); renderRedSel(); if (!S.proj.distribuidora && !redEx()) { try { S.proj.distribuidora = localStorage.getItem('calculoApoyosBT.dist') || 'cantona'; } catch (e) { S.proj.distribuidora = 'cantona'; } renderRedSel(); } }; }
document.addEventListener('click', ev => { const b = ev.target.closest('[role=tab][data-tab="redbase"]'); if (b) renderRedBases(); });
