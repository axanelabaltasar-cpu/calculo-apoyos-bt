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
  R.lineas = R.lineas.filter(l => l.fuente !== fname).concat(lines.map(l => ({ id: uid('l'), nombre: l.nombre, fuente: fname, pts: l.pts.map(p => ({ lat: p.lat, lon: p.lon, ...E.utmFromLatLon(p.lat, p.lon, zone) })) })));
  invalidateVert(); ensureEntronque(); V.fitted = false; refreshAll();
  toast(`${lines.length} línea(s) existente(s) importada(s) de ${fname}. Elige el apoyo de entronque y verifica sus datos.`);
}
function applyExApoyos(points, fname) {
  if (!points.length) return toast('El archivo no contiene marcadores de apoyos (Point).');
  const zone = setZoneFrom(points[0]);
  const R = redEx() || (S.proj.redEx = { lineas: [], apoyos: [] });
  snapshot();
  const prevEn = S.proj.entronque?.k != null ? exNodes()[S.proj.entronque.k] : null;
  R.apoyos = (R.apoyos || []).filter(a => a.fuente !== fname).concat(points.map(p => ({ id: uid('e'), lat: p.lat, lon: p.lon, nombre: p.nombre || '', fuente: fname, ...E.utmFromLatLon(p.lat, p.lon, zone) })));
  invalidateVert(); ensureEntronque();
  if (prevEn) { const k = exNodes().findIndex(a => Math.hypot(a.x - prevEn.x, a.y - prevEn.y) < 1); S.proj.entronque.k = k >= 0 ? k : null; }
  V.fitted = false; refreshAll();
  toast(`${points.length} apoyo(s) existente(s) importado(s) de ${fname}.`);
}

/* ===== Panel de red existente, entronque y verificación ===== */
function renderEntronque() {
  const box = $('#exBody'), R = redEx(), en = S.proj.entronque;
  if (!R || (!R.lineas.length && !R.apoyos?.length)) { box.innerHTML = '<p class="note">Importa por separado las líneas existentes y los apoyos existentes (KMZ/KML; puedes importar varios archivos). Después eliges el apoyo de entronque y verificas sus datos, los de los apoyos contiguos y los de las líneas que pasan por él.</p>'; return; }
  ensureEntronque();
  if (!S.proj.rows.length) { S.proj.rows.push(Object.assign(newRow(), { vano: 0 })); S.proj.rows.push(newRow()); }
  const ex = exNodes();
  const fuentes = (arr, tipo) => [...new Set(arr.map(x => x.fuente))].map(f => `<span class="chip info">${esc(f)} · ${arr.filter(x => x.fuente === f).length} ${tipo}</span> <button class="btn small ghost" data-delsrc="${esc(f)}" data-tipo="${tipo}" aria-label="Quitar ${esc(f)}">✕</button>`).join(' ');
  const poleOpts = sel => `<option value="">Elegir modelo…</option>` + S.poles.map(p => `<option value="${esc(p.id)}" ${sel === p.id ? 'selected' : ''}>${poleLabel(p)}</option>`).join('');
  const cabOpts = sel => `<option value="">Elegir cable…</option>` + S.cables.map(c => `<option value="${esc(c.id)}" ${sel === c.id ? 'selected' : ''}>${esc(c.designacion)}</option>`).join('');
  const est = verifEstado(), it = est.it;
  let html = `<div class="row" style="gap:6px">${fuentes(R.lineas, 'líneas')} ${fuentes(R.apoyos || [], 'apoyos')}</div>
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
      ${it.lineas.map(L => { const d = lineData(L.lineId); return `<tr><td>${esc(L.nombre)}</td><td class="n">${L.vanos.map(v => fmt(v, 1)).join(' / ')}</td>
        <td><select data-vl="cableId" data-id="${esc(L.lineId)}">${cabOpts(d.v.cableId)}</select></td>
        <td class="n"><input class="num" type="number" step="10" data-vl="tense" data-id="${esc(L.lineId)}" value="${d.v.tense ?? ''}" placeholder="daN"></td>
        <td><label class="chk"><input type="checkbox" data-vl="ok" data-id="${esc(L.lineId)}" ${d.ok ? 'checked' : ''} ${d.v.cableId && d.tense > 0 ? '' : 'disabled'}> ${d.ok ? '<span class="chip ok">sí</span>' : '<span class="chip bad">no</span>'}</label></td></tr>`; }).join('') || '<tr><td colspan="5" class="empty">Ninguna línea existente pasa por este apoyo (tolerancia 3 m). Revisa el apoyo de entronque o mueve el apoyo en el plano.</td></tr>'}
      </tbody></table></div>
      <div class="tablewrap" style="margin-top:8px"><table class="vt"><thead><tr><th>Apoyo existente</th><th>Modelo</th><th class="n">Eje principal (°)</th><th>Comprobación</th><th>Verificado</th></tr></thead><tbody>
      ${it.apoyos.map(a => {
        const v = apoyoVerif(a.k), P = ex[a.k], isEn = a.k === en.k;
        let comp = '—';
        if (isEn) { const r = S.calc?.results?.[0]; const c = r?.existenteCheck; comp = c?.r ? `${fmt(c.r.u * 100)} % · ${c.ok ? '<span class="chip ok">válido</span>' : '<span class="chip bad">sustituir</span>'}` : (v.modeloId ? 'pendiente de cálculo' : '—'); }
        else { const c = v.modeloId ? calcApoyoExistente(a.k) : null; comp = c?.r ? `${FUNCS[c.func]} · ${fmt(c.r.u * 100)} % · ${c.r.u <= 1 ? '<span class="chip ok">válido</span>' : '<span class="chip bad">no cumple</span>'}` : (v.modeloId ? 'sin conductores' : '—'); }
        return `<tr data-k="${a.k}"><td><b>E${a.k + 1}</b>${P.nombre ? ' · ' + esc(P.nombre) : ''}<br><span class="note">${isEn ? 'Entronque (A1)' : esc(a.rol)}</span></td>
          <td><select data-va="modeloId" data-k="${a.k}">${poleOpts(v.modeloId)}</select></td>
          <td class="n"><input class="num" type="number" data-va="azPrincipal" data-k="${a.k}" value="${esc(v.azPrincipal ?? '')}" placeholder="Desconocido"></td>
          <td>${comp}</td>
          <td><label class="chk"><input type="checkbox" data-va="ok" data-k="${a.k}" ${v.ok ? 'checked' : ''} ${v.modeloId ? '' : 'disabled'}> ${v.ok ? '<span class="chip ok">sí</span>' : '<span class="chip bad">no</span>'}</label></td></tr>`; }).join('')}
      </tbody></table></div>
      ${!done ? `<div class="banner bad" style="margin-top:8px">Falta verificar: ${est.faltan.map(esc).join(', ')}.</div>` : ''}`;
  } else html += `<div class="banner warn" style="margin-top:8px">Elige el apoyo de entronque para verificar la red existente.</div>`;
  html += `<div class="row" style="margin-top:8px"><button class="btn small ghost" id="en_del">Quitar toda la red existente</button></div>`;
  box.innerHTML = html;
}
function bindEntronque() {
  $('#exLinFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f, 'exLineas'); e.target.value = ''; });
  $('#exApoFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f, 'exApoyos'); e.target.value = ''; });
  const box = $('#exBody');
  box.addEventListener('change', ev => {
    const t = ev.target, en = S.proj.entronque; if (!en) return;
    if (t.id === 'en_k') return setEntronque(t.value === '' ? null : Number(t.value));
    if (t.id === 'en_depth') en.depth = Number(t.value);
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
      if (b.dataset.tipo === 'líneas') R.lineas = R.lineas.filter(l => l.fuente !== f); else { R.apoyos = R.apoyos.filter(a => a.fuente !== f); if (S.proj.entronque) S.proj.entronque.k = null; }
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
