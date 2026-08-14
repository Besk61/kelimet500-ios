import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';

const source = 'assets/logo.png';
const targetDir = 'public/branding';
const target = `${targetDir}/app-icon.png`;

if (!existsSync(source)) {
  console.error('assets/logo.png bulunamadı. App icon olarak kullanacağın kare PNG dosyasını bu adla koy.');
  process.exit(1);
}

// Read PNG IHDR without another dependency so mistakes are obvious before capacitor-assets runs.
try {
  const png = readFileSync(source);
  const isPng = png.length > 24 && png.subarray(1, 4).toString('ascii') === 'PNG';
  if (isPng) {
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    if (width !== height) console.warn(`UYARI: assets/logo.png kare değil (${width}x${height}). App icon için kare kullan.`);
    if (width < 1024 || height < 1024) console.warn(`UYARI: assets/logo.png ${width}x${height}. En az 1024x1024 öneriliyor.`);
  }
} catch {}

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
console.log(`app icon source ready: ${source}`);
console.log('Not: animasyonlu splash ayrı K500 oyun logosunu kullanır; assets/logo.png splash logosunu değiştirmez.');
