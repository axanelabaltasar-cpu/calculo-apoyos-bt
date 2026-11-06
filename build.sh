set -e
cd /home/claude/apoyos-bt
mkdir -p dist
{ cat ui.html
  echo '<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>'
  echo '<script>'
  echo 'const E = (() => {'
  sed '/^if (typeof module/d' engine.js
  echo 'return { utmFromLatLon, latLonFromUtm, calcular, presupuesto, nodesFromManual, buildGeometry };'
  echo '})();'
  cat app.js
  echo '</script>'
} > dist/calculo-apoyos-bt.html
node -e "
const h=require('fs').readFileSync('dist/calculo-apoyos-bt.html','utf8');
const js=h.split('<script>')[1].split('</script>')[0];
new Function(js); console.log('syntax ok', h.length);"
