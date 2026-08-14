/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IOS_STORE_URL?: string;
  readonly VITE_ANDROID_STORE_URL?: string;
  readonly VITE_ADSENSE_CLIENT?: string;
  readonly VITE_ADSENSE_LEFT_SLOT?: string;
  readonly VITE_ADSENSE_RIGHT_SLOT?: string;
  readonly VITE_ADSENSE_MOBILE_SLOT?: string;
  readonly VITE_SHOW_AD_PLACEHOLDERS?: string;
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly VITE_ADMOB_ANDROID_BANNER_ID?: string;
  readonly VITE_ADMOB_IOS_BANNER_ID?: string;
  readonly VITE_ADMOB_TEST_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
