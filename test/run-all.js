// Draait elk *.test.js-bestand in deze map na elkaar; faalt zodra er één rood staat.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort();
if (!files.length){ console.log('Geen tests gevonden.'); process.exit(0); }

let failed = 0;
for (const f of files){
  console.log(`\n=== ${f} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} testbestand(en) gefaald.` : '\nAlle testbestanden groen.');
process.exit(failed ? 1 : 0);
