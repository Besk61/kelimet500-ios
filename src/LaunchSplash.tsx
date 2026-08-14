import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { useEffect, useState, type ReactNode } from 'react';
import { BrandIcon } from './BrandIcon';

type Props = { children: ReactNode };

const SHOW_MS = 1850;

export function LaunchSplash({ children }: Props) {
  const isNative = Capacitor.isNativePlatform();
  const [visible, setVisible] = useState(isNative);

  useEffect(() => {
    if (!isNative) return;

    // The OS launch screen is intentionally static. Once React is ready, hide it
    // and show the animated K500 mark that is also used in the game header.
    const reveal = window.setTimeout(() => {
      void SplashScreen.hide({ fadeOutDuration: 180 });
    }, 60);
    const finish = window.setTimeout(() => setVisible(false), SHOW_MS);

    return () => {
      window.clearTimeout(reveal);
      window.clearTimeout(finish);
    };
  }, [isNative]);

  return (
    <>
      {children}
      {visible && (
        <div className="launch-splash" aria-label="Kelimet500 açılıyor">
          <div className="launch-splash-glow" />
          <div className="launch-brand-mark">
            <BrandIcon className="launch-k500-mark" />
          </div>
          <div className="launch-title">Kelimet<span>500</span></div>
          <div className="launch-bottom-copy">
            <strong>BESK Entertainment</strong>
            <i />
            <small>Word500’den esinlenen bağımsız bir kelime oyunu.</small>
          </div>
        </div>
      )}
    </>
  );
}
