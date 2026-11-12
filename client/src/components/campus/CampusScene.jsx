import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/**
 * The live 3D school campus. The 3D code is loaded only when this component mounts,
 * and a photo of the same campus shows until the live scene is ready.
 * The school day runs on its own; onClock reports the campus time and part of the day.
 */
const CampusScene = forwardRef(function CampusScene({ time = 'morning', startMinutes, className = '', onProgress, onClock, onBell, onStory, onReady, onInside, frameShift, quality = 'auto' }, ref) {
  const mount = useRef(null);
  const api = useRef(null);
  const [ready, setReady] = useState(false);
  // keep the latest callbacks without rebuilding the scene
  const cb = useRef({});
  cb.current = { onProgress, onClock, onBell, onStory, onReady, onInside };

  useEffect(() => {
    let disposed = false;
    import('../../campus/index.js').then(async ({ createCampus, prepared }) => {
      await prepared.catch(() => {});
      if (disposed || !mount.current) return;
      api.current = createCampus(mount.current, {
        mode: 'hero',
        time,
        startMinutes,
        quality,
        onProgress: (p) => cb.current.onProgress?.(p),
        onClock: (m, phase) => cb.current.onClock?.(m, phase),
        onBell: (name) => cb.current.onBell?.(name),
        onStory: (st) => cb.current.onStory?.(st),
        onInside: (on) => cb.current.onInside?.(on),
        onReady: (ok) => {
          if (disposed) return;
          setReady(ok);
          cb.current.onReady?.(ok, api.current);
        },
      });
      if (!api.current) setReady(false);
    });
    return () => {
      disposed = true;
      api.current?.dispose();
      api.current = null;
    };
    // built once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready && frameShift) api.current?.setFrameShift(frameShift.x, frameShift.y);
  }, [ready, frameShift?.x, frameShift?.y]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    goTo: (i) => api.current?.goTo(i),
    endTour: () => api.current?.endTour(),
    jumpTo: (m) => api.current?.jumpTo(m),
    lookInside: (name) => api.current?.lookInside(name),
    lookOutside: () => api.current?.lookOutside(),
    overview: () => api.current?.overview(),
    get fps() {
      return api.current?.fps;
    },
    get profile() {
      return api.current?.profile;
    },
  }));

  return (
    <div className={className || 'relative'} aria-hidden="true">
      <CampusBackdrop time={time} className={`absolute inset-0 transition-opacity duration-1000 ${ready ? 'opacity-0' : 'opacity-100'}`} />
      <div ref={mount} className="absolute inset-0" />
    </div>
  );
});

export default CampusScene;

/** A rendered photo of the campus, used behind the app screens (light on phones and batteries). */
export function CampusBackdrop({ time = 'morning', className = '', drift = false }) {
  return (
    <div
      className={`campus-fallback bg-cover bg-center ${drift ? 'campus-drift' : ''} ${className}`}
      style={{ backgroundImage: `url(/campus/stills/campus-${time}.jpg)` }}
    />
  );
}

/** Morning before 3 pm, evening after — so the campus matches the real day. */
export function timeOfDayNow() {
  const h = new Date().getHours();
  return h >= 15 || h < 5 ? 'evening' : 'morning';
}

/**
 * Where the live school day should start: the real time if school is on right now,
 * otherwise the morning arrival (so a visitor at night still sees the day begin).
 */
export function campusMinutesNow() {
  const d = new Date();
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= 7 * 60 + 15 && m < 17 * 60 + 30 ? m : 7 * 60 + 15;
}
