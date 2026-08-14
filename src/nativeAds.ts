import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import {
  AdMob,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  type AdMobBannerSize,
} from '@capacitor-community/admob';

const ANDROID_TEST_BANNER = 'ca-app-pub-3940256099942544/9214589741';
const IOS_TEST_BANNER = 'ca-app-pub-3940256099942544/2435281174';

let started = false;
let listeners: PluginListenerHandle[] = [];
let bannerHeight = 0;
let bottomSafeInset = 0;

function boolEnv(value: string | undefined, fallback: boolean) {
  if (value == null || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

/**
 * Reads env(safe-area-inset-bottom) as a real CSS-pixel value.
 * On gesture-navigation iPhones/Android devices this lets us keep the native
 * banner above the system/home-indicator area instead of placing UI under it.
 */
function readSafeAreaBottomPx() {
  if (typeof document === 'undefined' || !document.body) return 0;
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = [
    'position:fixed',
    'left:0',
    'bottom:0',
    'width:0',
    'height:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-bottom:env(safe-area-inset-bottom, 0px)',
  ].join(';');
  document.body.appendChild(probe);
  const value = Number.parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return Math.max(0, Math.round(value));
}

function updateNativeAdReservation() {
  const reserved = Math.max(0, Math.round(bannerHeight + bottomSafeInset));
  document.documentElement.style.setProperty('--native-banner-height', `${Math.max(0, Math.round(bannerHeight))}px`);
  document.documentElement.style.setProperty('--native-bottom-safe', `${Math.max(0, Math.round(bottomSafeInset))}px`);
  document.documentElement.style.setProperty('--native-ad-reserved', `${reserved}px`);
  document.documentElement.classList.toggle('native-ad-active', bannerHeight > 0);
}

export function isNativeAdPlatform() {
  return Capacitor.isNativePlatform() && (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios');
}

export async function startNativeBannerAds() {
  if (!isNativeAdPlatform() || started) return;
  started = true;

  const platform = Capacitor.getPlatform();
  const isTesting = boolEnv(import.meta.env.VITE_ADMOB_TEST_MODE, true);
  const configuredId = platform === 'android'
    ? import.meta.env.VITE_ADMOB_ANDROID_BANNER_ID
    : import.meta.env.VITE_ADMOB_IOS_BANNER_ID;
  const testId = platform === 'android' ? ANDROID_TEST_BANNER : IOS_TEST_BANNER;
  const adId = isTesting || !configuredId ? testId : configuredId;

  try {
    // Add the native layout class immediately. The game becomes a fixed,
    // non-scrolling viewport even while consent/banner loading is in progress.
    document.documentElement.classList.add('native-shell');
    bottomSafeInset = readSafeAreaBottomPx();
    bannerHeight = 0;
    updateNativeAdReservation();

    await AdMob.initialize({ initializeForTesting: isTesting });

    try {
      let consent = await AdMob.requestConsentInfo();
      if (!consent.canRequestAds && consent.isConsentFormAvailable) {
        consent = await AdMob.showConsentForm();
      }
      if (!consent.canRequestAds) {
        console.info('[Kelimet500] AdMob: consent does not allow an ad request yet.');
        return;
      }
    } catch (consentError) {
      console.warn('[Kelimet500] AdMob consent flow skipped:', consentError);
    }

    // Re-read after the async consent flow because orientation/system insets
    // can settle a frame later on some devices.
    bottomSafeInset = readSafeAreaBottomPx();
    updateNativeAdReservation();

    listeners.push(await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size: AdMobBannerSize) => {
      bannerHeight = Number.isFinite(size.height) ? Math.max(0, size.height) : 0;
      bottomSafeInset = readSafeAreaBottomPx();
      updateNativeAdReservation();
    }));
    listeners.push(await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, error => {
      console.warn('[Kelimet500] AdMob banner failed:', error);
      bannerHeight = 0;
      updateNativeAdReservation();
    }));

    await AdMob.showBanner({
      adId,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      // Keep the native ad itself clear of the home indicator / gesture bar.
      // The same amount is included in --native-ad-reserved, so game controls
      // can never sit beneath the banner.
      margin: bottomSafeInset,
      isTesting,
    });
  } catch (error) {
    console.warn('[Kelimet500] Native AdMob could not start:', error);
    bannerHeight = 0;
    updateNativeAdReservation();
  }
}

export async function stopNativeBannerAds() {
  if (!isNativeAdPlatform()) return;
  try {
    await AdMob.removeBanner();
  } catch {
    // Ignore teardown errors during hot reload/app shutdown.
  }
  await Promise.all(listeners.map(listener => listener.remove().catch(() => undefined)));
  listeners = [];
  started = false;
  bannerHeight = 0;
  bottomSafeInset = 0;
  updateNativeAdReservation();
}
