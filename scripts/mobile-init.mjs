import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const requested = process.argv[2] || 'all';
if (!['android', 'ios', 'all'].includes(requested)) {
  console.error('Usage: node scripts/mobile-init.mjs android|ios|all');
  process.exit(1);
}

const platforms = requested === 'all' ? ['android', 'ios'] : [requested];
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const node = process.execPath;

function run(command, args, options = {}) {
  console.log(`\n> ${command} ${args.join(' ')}`);

  // .cmd/.bat files cannot be executed reliably with shell:false on Windows
  // (Node 22 may return EINVAL/status=null). Route only those commands through cmd.exe.
  const isWindowsScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(command);
  const executable = isWindowsScript ? (process.env.ComSpec || 'cmd.exe') : command;
  const executableArgs = isWindowsScript
    ? ['/d', '/s', '/c', [command, ...args].join(' ')]
    : args;

  const result = spawnSync(executable, executableArgs, {
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  if (result.error) {
    console.error(`\nKomut başlatılamadı: ${command}`);
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\nKomut başarısız oldu (${result.status ?? 'unknown'}): ${command} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

run(npm, ['run', 'build']);

for (const platform of platforms) {
  if (!existsSync(platform)) {
    run(npx, ['cap', 'add', platform]);
  }

  // v0.6.6: assets/logo.png is an app-icon source. Regenerate native icon
  // resources automatically so simply replacing the PNG actually reaches the app.
  if (existsSync('assets/logo.png')) {
    run(node, ['scripts/apply-branding.mjs', platform]);
  } else {
    console.warn('assets/logo.png yok; mevcut native app icon korunuyor.');
  }

  run(npx, ['cap', 'sync', platform]);
  run(node, ['scripts/patch-native.mjs', platform]);
}

console.log('\nKelimet500 native platform setup complete.');
