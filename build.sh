set -e
cd /home/claude/apoyos-bt
mkdir -p dist
body() {
  cat ui.html
  echo '<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>'
  echo '<script>'
  echo 'const E = (() => {'
  sed '/^if (typeof module/d' engine.js
  echo 'return { utmFromLatLon, latLonFromUtm, calcular, presupuesto, nodesFromManual, buildGeometry, buildProfile, evaluatePole, hypotheses, cableProps };'
  echo '})();'
  cat app.js
  echo '</script>'
}
body > dist/calculo-apoyos-bt.html
# Versión local: documento completo + bases incluidas
{ echo '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'
  printf '<script>window.LOCAL_SEED = %s;</script>\n' "$(cat seed_ops.json)"
  body | python3 -c "
import sys
h=sys.stdin.read()
js=open('/opt/node-tools/node_modules/jszip/dist/jszip.min.js').read()
tag='<script src=\"https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js\"></script>'
assert tag in h
sys.stdout.write(h.replace(tag,'<script>'+js+'</script>'))"
  echo '</body></html>'
} > dist/CalculoApoyosBT_local.html
node -e "
for (const f of ['dist/calculo-apoyos-bt.html','dist/CalculoApoyosBT_local.html']) {
const h=require('fs').readFileSync(f,'utf8');
const scripts=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
scripts.forEach(js=>new Function(js)); console.log('syntax ok', f, h.length);}"
