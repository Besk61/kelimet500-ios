/// <reference types="@capacitor-community/safe-area" />
/// <reference types="@capacitor/splash-screen" />
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.beskentertainment.kelimet500',
  appName: 'Kelimet500',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      showSpinner: false,
      backgroundColor: '#0b1113',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    // SafeArea owns native edge-to-edge inset handling. This prevents the
    // Capacitor SystemBars injector and the SafeArea polyfill fighting over
    // the same Android 15/16 insets.
    SystemBars: {
      insetsHandling: 'disable',
    },
  },
};

export default config;
