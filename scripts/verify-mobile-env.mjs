import { existsSync } from 'node:fs';
import process from 'node:process';

try {
  if (existsSync('.env.local') && typeof process.loadEnvFile === 'function') process.loadEnvFile('.env.local');
} catch (error) {
  console.warn('[Kelimet500] .env.local okunamadı:', error);
}

const platform = process.argv[2] || 'ios';
if (!['ios', 'android'].includes(platform)) {
  console.error('Usage: node scripts/verify-mobile-env.mjs ios|android');
  process.exit(1);
}

const isTest = String(process.env.VITE_ADMOB_TEST_MODE ?? 'true').toLowerCase() === 'true';
const appIdName = platform === 'ios' ? 'ADMOB_IOS_APP_ID' : 'ADMOB_ANDROID_APP_ID';
const bannerIdName = platform === 'ios' ? 'VITE_ADMOB_IOS_BANNER_ID' : 'VITE_ADMOB_ANDROID_BANNER_ID';
const appId = process.env[appIdName] || '';
const bannerId = process.env[bannerIdName] || '';
const appIdRe = /^ca-app-pub-\d+~\d+$/;
const bannerIdRe = /^ca-app-pub-\d+\/\d+$/;

function fail(message) {
  console.error(`\n[Kelimet500] ${message}`);
  process.exit(1);
}

if (appId && !appIdRe.test(appId)) fail(`${appIdName} App ID olmalı ve ~ içermeli. Örn: ca-app-pub-123~456`);
if (bannerId && !bannerIdRe.test(bannerId)) fail(`${bannerIdName} Banner Ad Unit ID olmalı ve / içermeli. Örn: ca-app-pub-123/456`);

if (!isTest) {
  if (!appId) fail(`Production reklam için ${appIdName} gerekli.`);
  if (!bannerId) fail(`Production reklam için ${bannerIdName} gerekli.`);
}

const publicUrl = process.env.VITE_PUBLIC_APP_URL || 'https://kelimet500.boraeskicioglu.com/';
try {
  const url = new URL(publicUrl);
  if (url.protocol !== 'https:') fail('VITE_PUBLIC_APP_URL production için https olmalı.');
} catch {
  fail('VITE_PUBLIC_APP_URL geçerli bir URL değil.');
}

console.log(`[Kelimet500] ${platform.toUpperCase()} environment OK`);
console.log(`[Kelimet500] AdMob mode: ${isTest ? 'TEST (Google test ads)' : 'PRODUCTION'}`);
console.log(`[Kelimet500] ${appIdName}: ${appId ? 'configured' : 'sample fallback'}`);
console.log(`[Kelimet500] ${bannerIdName}: ${bannerId ? 'configured' : 'test banner fallback'}`);
