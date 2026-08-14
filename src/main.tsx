import { Capacitor } from '@capacitor/core';
import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ChallengeInstallLanding } from './ChallengeInstallLanding';
import { challengeTokenFromWindow } from './deepLinks';
import { LaunchSplash } from './LaunchSplash';
import './styles.css';

function Root() {
  const [playChallengeOnWeb, setPlayChallengeOnWeb] = useState(false);
  const isNative = Capacitor.isNativePlatform();
  const challengeToken = challengeTokenFromWindow();

  // HTTPS challenge bağlantıları webde önce hoş bir karşılama ekranına gelir.
  // Android App Links / iOS Universal Links doğrulandıysa işletim sistemi bu
  // sayfaya gelmeden native uygulamayı açabilir. Doğrulama yoksa veya uygulama
  // kurulu değilse OYUNA GİT önce custom scheme'i dener, sonra web fallback'ine geçer.
  if (!isNative && challengeToken && !playChallengeOnWeb) {
    return <ChallengeInstallLanding token={challengeToken} onPlayWeb={() => setPlayChallengeOnWeb(true)} />;
  }

  return <LaunchSplash><App /></LaunchSplash>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
