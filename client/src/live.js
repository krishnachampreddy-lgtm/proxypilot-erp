import { useEffect, useRef, useState } from 'react';
import api from './api';

/*
  Live updates. After login the app opens one event stream to the server
  (with a one-minute ticket, so the login token never goes in a URL).
  Every screen that shows leaves or cover requests listens with useLive()
  and refreshes the moment something changes. If the stream drops, it
  reconnects by itself; the screens still refresh on a slow timer as a backup.
*/

let es = null;
let retry = null;
let stopped = true;
let connected = false;

const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, { detail }));
const setConnected = (on) => {
  connected = on;
  emit('pp:live-status', on);
};

export function startLive() {
  if (es || !stopped || !localStorage.getItem('pp_token') || typeof EventSource === 'undefined') return;
  stopped = false;
  const open = async () => {
    try {
      const { data } = await api.post('/live/ticket');
      if (stopped) return;
      es = new EventSource(`${import.meta.env.VITE_API_URL || ''}/api/live?ticket=${encodeURIComponent(data.ticket)}`);
      es.onopen = () => setConnected(true);
      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          if (ev.type !== 'hello') emit('pp:live', ev);
        } catch {
          /* ignore a malformed message */
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        setConnected(false);
        if (!stopped) retry = setTimeout(open, 5000); // tickets are single-use, so get a fresh one
      };
    } catch {
      if (!stopped) retry = setTimeout(open, 15000);
    }
  };
  open();
}

export function stopLive() {
  stopped = true;
  clearTimeout(retry);
  es?.close();
  es = null;
  setConnected(false);
}

/** Calls handler(event) for every live event. */
export function useLive(handler) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    const f = (e) => ref.current(e.detail);
    window.addEventListener('pp:live', f);
    return () => window.removeEventListener('pp:live', f);
  }, []);
}

/** true while the live stream is connected */
export function useLiveStatus() {
  const [on, setOn] = useState(connected);
  useEffect(() => {
    const f = (e) => setOn(e.detail);
    window.addEventListener('pp:live-status', f);
    return () => window.removeEventListener('pp:live-status', f);
  }, []);
  return on;
}

/** A short sentence for a live event, written for the person receiving it (or null to stay quiet). */
export function describe(ev, role) {
  const where = ev.className ? `${ev.className}${ev.period ? ` · P${ev.period}` : ''}` : '';
  if (ev.type === 'leave') {
    if (ev.action === 'new') return role === 'hod' ? `New leave request from ${ev.name}${ev.urgent ? ' — urgent, today' : ''}` : null;
    if (ev.action === 'cancelled') return role === 'hod' ? `${ev.name} withdrew a leave request` : null;
    if (ev.action === 'approved') return 'Your leave was approved — substitutes are being arranged';
    if (ev.action === 'declined') return ev.why === 'no-cover' ? (role === 'hod' ? 'A leave was declined: nobody could cover a class' : 'Your leave was declined: nobody could cover one of your classes') : 'Your leave was declined — see the reason';
  }
  if (ev.type === 'proxy') {
    if (ev.action === 'offered') return `New cover request${where ? `: ${where}` : ''}`;
    if (ev.action === 'expired') return `A cover request${where ? ` (${where})` : ''} passed to the next teacher`;
    if (ev.action === 'accepted') return `${ev.name} will cover ${where || 'a class'}`;
    if (ev.action === 'passed') return role === 'hod' ? `${where || 'A class'} moved to the next teacher` : null;
  }
  if (ev.type === 'timetable') return role === 'student' ? 'Your timetable changed — see who is covering' : null;
  return null;
}

/** "in 12 min" / "in 40 s" / "now" for a future time */
export function countdown(to, now = Date.now()) {
  const s = Math.round((new Date(to).getTime() - now) / 1000);
  if (s <= 0) return 'now';
  if (s < 90) return `in ${s} s`;
  const m = Math.round(s / 60);
  return m < 90 ? `in ${m} min` : `in ${Math.round(m / 60)} h`;
}

/** re-renders every `ms` (for countdowns) */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
