// Piepklein testrapport — geen testframework, in de geest van de rest van de repo.
let pass = 0, fail = 0;

function section(title){ console.log('\n' + title); }

function check(name, actual, expected){
  const ok = actual === expected;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${ok ? '' : ` — verwacht ${expected}, kreeg ${actual}`}`);
  ok ? pass++ : fail++;
}

// Sluit af met de juiste exitcode, zodat `npm test` faalt als er iets rood staat.
function done(){
  console.log(`\n${fail === 0 ? '✅ ALLES GROEN' : '❌ FALEND'} — ${pass} geslaagd, ${fail} gefaald\n`);
  process.exit(fail === 0 ? 0 : 1);
}

module.exports = { section, check, done };
