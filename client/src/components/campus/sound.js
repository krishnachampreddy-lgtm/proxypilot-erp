// Campus soundscape made in the browser (no audio files): soft wind, a murmur of
// students that rises at arrival, lunch and home time, birds by day, crickets after
// sunset, and the brass school bell struck for each bell of the day.
export function createSoundscape() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  master.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 1.2);

  // brown-ish noise, shared by the wind and the crowd
  const len = ctx.sampleRate * 3;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const loop = () => {
    const n = ctx.createBufferSource();
    n.buffer = buf;
    n.loop = true;
    n.start(0, Math.random() * 2);
    return n;
  };

  // wind
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.18;
  loop().connect(lp).connect(windGain).connect(master);

  // crowd murmur: a few band-passed voices whose loudness wanders
  const crowd = ctx.createGain();
  crowd.gain.value = 0;
  crowd.connect(master);
  const voices = [380, 620, 900, 1300].map((f) => {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    loop().connect(bp).connect(g).connect(crowd);
    return g;
  });

  let evening = 0;
  let chatter = 0;

  const chirp = () => {
    const t = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2400 + Math.random() * 1800;
    for (let n = 0; n < notes; n++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const s = t + n * (0.09 + Math.random() * 0.05);
      o.type = 'sine';
      o.frequency.setValueAtTime(base, s);
      o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.4), s + 0.07);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.06 * (1 - evening), s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
      o.connect(g).connect(master);
      o.start(s);
      o.stop(s + 0.12);
    }
  };

  const cricket = () => {
    const t = ctx.currentTime;
    for (let n = 0; n < 3; n++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const s = t + n * 0.06;
      o.type = 'triangle';
      o.frequency.value = 4300 + Math.random() * 300;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.025 * evening, s + 0.008);
      g.gain.linearRampToValueAtTime(0, s + 0.04);
      o.connect(g).connect(master);
      o.start(s);
      o.stop(s + 0.05);
    }
  };

  const timer = setInterval(() => {
    if (Math.random() < 0.55 * (1 - evening)) chirp();
    if (Math.random() < 0.9 * evening) cricket();
    // voices come and go
    const t = ctx.currentTime;
    for (const v of voices) v.gain.linearRampToValueAtTime(0.25 + Math.random() * 0.75, t + 0.4);
    crowd.gain.linearRampToValueAtTime(chatter * (0.75 + Math.random() * 0.25), t + 0.45);
  }, 450);

  // one strike of a brass bell: a few inharmonic partials that ring and fade
  const strike = (at, loud = 1) => {
    for (const [r, a, d] of [[1, 0.16, 2.6], [2.76, 0.07, 1.6], [5.4, 0.035, 0.9], [8.93, 0.015, 0.5]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 520 * r;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(a * loud, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      o.connect(g).connect(master);
      o.start(at);
      o.stop(at + d + 0.05);
    }
  };

  return {
    /** follow the school day: phase id from the campus clock, minutes after midnight */
    setPhase(id, minutes = 8 * 60) {
      evening = minutes >= 17 * 60 + 40 ? 1 : minutes >= 17 * 60 ? (minutes - 17 * 60) / 40 : 0;
      chatter = { arrival: 0.5, gather: 0.5, assembly: 0.1, toclass: 0.45, classes: 0.06, break: 0.6, classesB: 0.06, lunch: 0.6, classes2: 0.06, home: 0.6, after: 0.3, evening: 0.1 }[id] ?? 0.1;
      windGain.gain.linearRampToValueAtTime(evening ? 0.1 : 0.18, ctx.currentTime + 1.5);
    },
    /** kept for older callers */
    setTime(name) {
      this.setPhase(name === 'evening' ? 'evening' : 'arrival', name === 'evening' ? 17 * 60 + 45 : 7 * 60 + 40);
    },
    /** the peon strikes the bell: long for assembly and home time, short between periods */
    bell(times = 3) {
      const t = ctx.currentTime + 0.05;
      for (let i = 0; i < times; i++) strike(t + i * 0.42, i === times - 1 ? 1 : 0.85);
    },
    stop() {
      clearInterval(timer);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      setTimeout(() => ctx.close(), 500);
    },
  };
}
