/* ===== ANEXO I (Galicia): información de liñas, sobre la plantilla del usuario ===== */
const PROV_GAL = [['A CORUÑA', 43.362, -8.411], ['LUGO', 43.012, -7.556], ['OURENSE', 42.336, -7.864], ['PONTEVEDRA', 42.431, -8.645]];
function enGalicia() { const g = getGeo(); if (!g?.pts?.length) return false; const p = g.pts[0]; return p.lat > 41.8 && p.lat < 43.82 && p.lon > -9.35 && p.lon < -6.7; }
function anexo() {
  const A = S.proj.anexo = { galicia: null, provincia: '', concello: '', ct: '', modelo: '', idBase: '', tramos: {}, ...(S.proj.anexo || {}) };
  if (!A.provincia) { const g = getGeo(); if (g?.pts?.length) { const p = g.pts[0]; A.provincia = PROV_GAL.map(([n, la, lo]) => [n, Math.hypot(la - p.lat, (lo - p.lon) * 0.73)]).sort((a, b) => a[1] - b[1])[0][0]; A.provSugerida = true; } }
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
    else if (t.id && t.id.startsWith('ax_')) { A[t.id.slice(3)] = t.value.trim().toUpperCase() === t.value.trim() || t.id !== 'ax_concello' ? t.value.trim() : t.value.trim().toUpperCase(); if (t.id === 'ax_provincia') A.provSugerida = false; }
    if (t.dataset.axt) { const i = Number(t.dataset.i); A.tramos[i] = { ...(A.tramos[i] || {}), [t.dataset.axt]: t.value.trim() }; }
    t.blur(); renderAnexo();
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
