import { useEffect, useState } from 'react';
import { canPrompt, isIOS, isStandalone, onInstallChange, promptInstall } from '../pwa.js';

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
    <path d="M12 7.5v7M9 11.5l3 3 3-3M10.5 18.5h3" />
  </svg>
);

/** "Install app" in the header. Android/desktop Chrome get the real prompt; iPhone gets a short how-to. */
export default function InstallButton({ variant = 'header' }) {
  const [ready, setReady] = useState(canPrompt());
  const [tip, setTip] = useState(false);
  useEffect(() => onInstallChange(() => setReady(canPrompt())), []);

  if (isStandalone()) return null;
  const ios = isIOS();
  if (!ready && !ios) return null;

  const click = () => (ready ? promptInstall() : setTip(true));
  const cls =
    variant === 'hero'
      ? 'glass inline-flex items-center gap-2 rounded-[11px] px-4 py-2.5 text-sm font-semibold text-ink hover:border-brass/60'
      : 'flex h-9 items-center gap-1.5 rounded-[11px] border border-brass/50 bg-brass-soft px-2.5 text-sm font-semibold text-brass hover:border-brass';

  return (
    <>
      <button onClick={click} className={cls} aria-label="Install ProxyPilot as an app">
        <DownloadIcon />
        <span className={variant === 'hero' ? '' : 'hidden sm:inline'}>Install app</span>
      </button>
      {tip && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setTip(false)}>
          <div className="w-full max-w-sm rounded-[14px] border border-line bg-[#0b1511] p-5 text-ink shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-2xl">Add ProxyPilot to your Home Screen</h3>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink/80">
              <li>Tap the <b>Share</b> button at the bottom of Safari.</li>
              <li>Scroll and tap <b>Add to Home Screen</b>.</li>
              <li>Tap <b>Add</b>. ProxyPilot now opens like an app.</li>
            </ol>
            <button onClick={() => setTip(false)} className="mt-4 w-full rounded-[11px] bg-ink py-2 text-sm font-semibold text-paper">Got it</button>
          </div>
        </div>
      )}
    </>
  );
}
