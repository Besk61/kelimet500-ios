import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';

try {
  if (existsSync('.env.local') && typeof process.loadEnvFile === 'function') process.loadEnvFile('.env.local');
} catch (error) {
  console.warn('Could not load .env.local for app-link association files:', error);
}

const outDir = 'public/.well-known';
mkdirSync(outDir, { recursive: true });

const packageName = 'com.beskentertainment.kelimet500';
const fingerprints = (process.env.ANDROID_APP_LINK_SHA256 || '')
  .split(',')
  .map(value => value.trim().toUpperCase())
  .filter(Boolean);
const teamId = (process.env.APPLE_TEAM_ID || '').trim();

const assetlinks = fingerprints.length ? [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: packageName,
    sha256_cert_fingerprints: fingerprints,
  },
}] : [];

const aasa = {
  applinks: {
    apps: [],
    details: teamId ? [{
      appID: `${teamId}.${packageName}`,
      paths: ['/challenge/*'],
    }] : [],
  },
};

writeFileSync(`${outDir}/assetlinks.json`, `${JSON.stringify(assetlinks, null, 2)}\n`);
writeFileSync(`${outDir}/apple-app-site-association`, `${JSON.stringify(aasa, null, 2)}\n`);

if (!fingerprints.length) console.warn('ANDROID_APP_LINK_SHA256 is empty: Android App Links will not verify until it is set and the site is rebuilt.');
if (!teamId) console.warn('APPLE_TEAM_ID is empty: iOS Universal Links will not verify until it is set and the site is rebuilt.');
