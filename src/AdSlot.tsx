import { useEffect } from 'react';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type Props = {
  slot?: string;
  className: string;
  format?: 'auto' | 'vertical' | 'horizontal' | 'rectangle';
  label: string;
};

const client = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
const showPlaceholders = import.meta.env.VITE_SHOW_AD_PLACEHOLDERS === 'true';

export const webAdsConfigured = Boolean(client);

export function AdSlot({ slot, className, format = 'auto', label }: Props) {
  useEffect(() => {
    if (!client || !slot) return;

    const scriptId = 'kelimet500-adsense-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
      document.head.appendChild(script);
    }

    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      // AdSense may not be ready yet; its async script will retry on load/navigation.
    }
  }, [slot]);

  if (!client || !slot) {
    if (!showPlaceholders) return null;
    return (
      <aside className={`${className} ad-placeholder`} aria-label={`${label} reklam önizlemesi`}>
        <span>REKLAM</span>
        <small>{label}</small>
      </aside>
    );
  }

  return (
    <aside className={className} aria-label={label}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </aside>
  );
}
