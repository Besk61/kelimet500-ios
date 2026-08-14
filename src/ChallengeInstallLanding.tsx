import { useMemo } from 'react';
import { appSchemeUrlForToken } from './deepLinks';
import { BrandIcon } from './BrandIcon';

type Props = {
  token: string;
  onPlayWeb: () => void;
};

function platformFromUserAgent() {
  const ua = navigator.userAgent.toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  return 'desktop';
}

export function ChallengeInstallLanding({ token, onPlayWeb }: Props) {
  const platform = useMemo(platformFromUserAgent, []);

  const goToGame = () => {
    // Masaüstünde native uygulama açmaya çalışmanın anlamı yok; challenge'ı
    // doğrudan web uygulamasında başlatıyoruz.
    if (platform === 'desktop') {
      onPlayWeb();
      return;
    }

    // Telefonda önce Kelimet500 custom scheme'ini deniyoruz. Uygulama kuruluysa
    // sayfa arka plana düşer ve timer iptal edilir. Kurulu değilse sayfa görünür
    // kalır; kısa bir gecikmeden sonra aynı challenge webde açılır.
    let leftPage = false;
    let timer = 0;

    const cleanup = () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        leftPage = true;
        cleanup();
      }
    };

    const onPageHide = () => {
      leftPage = true;
      cleanup();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide, { once: true });

    timer = window.setTimeout(() => {
      cleanup();
      if (!leftPage) onPlayWeb();
    }, 1050);

    window.location.href = appSchemeUrlForToken(token);
  };

  return (
    <main className="challenge-install-page">
      <div className="challenge-install-card">
        <BrandIcon className="challenge-landing-k500" />
        <p className="challenge-kicker">ARKADAŞ MEYDAN OKUMASI</p>
        <h1>Arkadaşın sana bir kelime gönderdi 😁</h1>
        <p>Bakalım gönderilen 5 harfli kelimeyi 8 tahminde bulabilecek misin?</p>
        <button className="challenge-install-primary" onClick={goToGame}>OYUNA GİT</button>
        <small>Kelimet500 yüklüyse uygulama açılır; yüklü değilse oyun burada web sürümünde devam eder.</small>
      </div>
    </main>
  );
}
