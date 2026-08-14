import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const requested = process.argv[2] || 'all';
if (!['android','ios','all'].includes(requested)) {
  console.error('Usage: node scripts/apply-branding.mjs android|ios|all');
  process.exit(1);
}
if (!existsSync('assets/logo.png')) {
  console.error('assets/logo.png bulunamadı. Kare, tercihen 1024x1024+ PNG ekle.');
  process.exit(1);
}

const node = process.execPath;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const isWinScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  const executable = isWinScript ? (process.env.ComSpec || 'cmd.exe') : command;
  const executableArgs = isWinScript ? ['/d','/s','/c',[command,...args].join(' ')] : args;
  const result = spawnSync(executable, executableArgs, { stdio:'inherit', shell:false });
  if (result.error) { console.error(result.error); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(node, ['scripts/sync-branding.mjs']);
const candidates = requested === 'all' ? ['android','ios'] : [requested];
const platforms = candidates.filter(p => existsSync(p));
if (!platforms.length) {
  console.error('Native platform henüz yok. Önce npm run mobile:android veya npm run mobile:ios çalıştır.');
  process.exit(1);
}
for (const platform of platforms) {
  run(npx, ['@capacitor/assets','generate', `--${platform}`, '--iconBackgroundColor','#0b1113','--iconBackgroundColorDark','#0b1113','--splashBackgroundColor','#0b1113','--splashBackgroundColorDark','#0b1113']);
}
console.log('\nNative app icon resources regenerated.');
