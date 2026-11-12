import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { frame, FL, ROOFY } from './school.js';
import { BLOCKS, CLASSROOMS, STAFF, HOD, ALL_ROOMS, DESK_ROWS, DESK_COLS, LIBRARY, FLOOR } from './rooms.js';
import { canvasTexture } from './util.js';
import { drawCrest, crestTexture } from './crest.js';

/*
  Inside the school: every classroom has twin oak desks with a chair for each student, facing a
  smart panel (the day's lesson on it) between two whiteboards; walnut panelling, a teacher's desk
  with a laptop, lockers and a class library at the back, air conditioning and LED panels. The
  staff room has a conference table with mesh chairs and today's cover on a screen; the HOD's
  office an executive desk, bookcases, the school crest and a sofa. Doors are real moving leaves
  that swing open when someone walks through; lights and boards are on while a room is in use.
*/

const AISLE_V = 3.3;
const top = (f) => (f < 2 ? FL[f + 1] : ROOFY);

/** textures for the inside (drawn once) */
export function interiorMaterials() {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const date = new Date().toLocaleDateString('en-GB');
  // each class's lesson: the subject, the topic, the slide's picture and what's on the two whiteboards
  const LESSONS = [
    { subj: 'Mathematics', topic: 'Adding fractions', draw: 'pie', goals: ['Like denominators', 'Unlike denominators', 'Simplest form'], left: '3/4 + 1/8 = 7/8', hw: ['Ex 4.2 — Q 1 to 6', 'Worksheet B'] },
    { subj: 'Science', topic: 'Photosynthesis', draw: 'leaf', goals: ['Chlorophyll', 'Light + CO₂ + water', 'Glucose and oxygen'], left: '6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂', hw: ['Label a leaf diagram', 'Read p. 112-115'] },
    { subj: 'English', topic: 'Present perfect', draw: 'timeline', goals: ['has / have + V3', 'Since and for', 'Questions'], left: 'She has finished her work.', hw: ['Write 10 sentences', 'Unit 6 vocabulary'] },
    { subj: 'Social Science', topic: 'The Mughal Empire', draw: 'map', goals: ['Babur to Aurangzeb', 'Administration', 'Art and architecture'], left: '1526 — First Battle of Panipat', hw: ['Timeline of 6 emperors', 'Read p. 54-57'] },
    { subj: 'हिन्दी', topic: 'व्याकरण — संज्ञा', draw: 'cards', goals: ['व्यक्तिवाचक', 'जातिवाचक', 'भाववाचक'], left: 'राम, दिल्ली, किताब', hw: ['पाठ 5 पढ़ें', '10 उदाहरण लिखें'] },
    { subj: 'Physics', topic: 'Motion — speed and velocity', draw: 'graph', goals: ['Distance vs displacement', 'v = u + at', 'Velocity-time graphs'], left: 's = ut + ½ at²', hw: ['Numericals 1-8', 'Plot the v-t graph'] },
  ];
  // the smart board's slide (shown on the panel while the class is in)
  const slides = LESSONS.map((L) =>
    canvasTexture(1024, 576, (g, w, h) => {
      const bg = g.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#0f2142');
      bg.addColorStop(1, '#1d3f72');
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      g.fillRect(0, 0, w, 92);
      drawCrest(g, 56, 46, 74, { ribbon: false, laurel: false });
      g.fillStyle = '#f3d888';
      g.font = '700 30px Georgia, serif';
      g.fillText(L.subj, 104, 44);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.font = '500 22px Arial, sans-serif';
      g.fillText(date, 104, 74);
      g.fillStyle = '#ffffff';
      g.font = '700 48px Arial, sans-serif';
      g.fillText(L.topic, 52, 168);
      g.fillStyle = '#7fd0ff';
      g.fillRect(52, 186, 120, 6);
      g.font = '500 30px Arial, sans-serif';
      L.goals.forEach((t, i) => {
        g.fillStyle = '#f3d888';
        g.beginPath();
        g.arc(66, 252 + i * 64, 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#e8eef8';
        g.fillText(t, 90, 262 + i * 64);
      });
      // the picture on the right
      const cx = 760;
      const cy = 330;
      g.lineWidth = 6;
      if (L.draw === 'pie') {
        g.fillStyle = '#2b4f86';
        g.beginPath();
        g.arc(cx, cy, 140, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#f2b134';
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, 140, -Math.PI / 2, Math.PI);
        g.fill();
        g.strokeStyle = '#ffffff';
        for (let k = 0; k < 8; k++) {
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos((k * Math.PI) / 4) * 140, cy + Math.sin((k * Math.PI) / 4) * 140);
          g.lineWidth = k % 2 ? 2 : 5;
          g.stroke();
        }
      } else if (L.draw === 'leaf') {
        g.fillStyle = '#f2c94c';
        g.beginPath();
        g.arc(cx + 120, cy - 150, 46, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#4fb06d';
        g.beginPath();
        g.moveTo(cx - 130, cy + 110);
        g.quadraticCurveTo(cx - 120, cy - 120, cx + 90, cy - 60);
        g.quadraticCurveTo(cx + 60, cy + 120, cx - 130, cy + 110);
        g.fill();
        g.strokeStyle = '#2f7a46';
        g.beginPath();
        g.moveTo(cx - 130, cy + 110);
        g.lineTo(cx + 70, cy - 50);
        g.stroke();
        g.fillStyle = '#ffffff';
        g.font = '600 28px Arial, sans-serif';
        g.fillText('CO₂ →', cx - 210, cy - 90);
        g.fillText('→ O₂', cx + 110, cy + 60);
      } else if (L.draw === 'timeline') {
        g.strokeStyle = '#ffffff';
        g.beginPath();
        g.moveTo(cx - 200, cy);
        g.lineTo(cx + 200, cy);
        g.stroke();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.moveTo(cx + 214, cy);
        g.lineTo(cx + 190, cy - 14);
        g.lineTo(cx + 190, cy + 14);
        g.fill();
        [['PAST', -150, '#9fb6d8'], ['NOW', 0, '#f2b134'], ['FUTURE', 150, '#9fb6d8']].forEach(([t, dx, c]) => {
          g.fillStyle = c;
          g.beginPath();
          g.arc(cx + dx, cy, 16, 0, Math.PI * 2);
          g.fill();
          g.font = '700 26px Arial, sans-serif';
          g.fillText(t, cx + dx - g.measureText(t).width / 2, cy + 58);
        });
      } else if (L.draw === 'map') {
        g.fillStyle = '#c9a26a';
        g.beginPath();
        g.moveTo(cx - 60, cy - 170);
        g.lineTo(cx + 40, cy - 150);
        g.lineTo(cx + 120, cy - 60);
        g.lineTo(cx + 70, cy + 20);
        g.lineTo(cx + 10, cy + 160);
        g.lineTo(cx - 40, cy + 60);
        g.lineTo(cx - 130, cy - 10);
        g.lineTo(cx - 110, cy - 110);
        g.closePath();
        g.fill();
        g.fillStyle = '#e2574c';
        g.beginPath();
        g.arc(cx - 40, cy - 90, 12, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.font = '600 24px Arial, sans-serif';
        g.fillText('Panipat', cx - 20, cy - 84);
      } else if (L.draw === 'cards') {
        ['राम', 'दिल्ली', 'किताब'].forEach((t, i) => {
          g.fillStyle = ['#e2574c', '#4fb06d', '#3c8dc5'][i];
          g.fillRect(cx - 190 + i * 130, cy - 70, 110, 140);
          g.fillStyle = '#ffffff';
          g.font = '700 36px Arial, sans-serif';
          g.fillText(t, cx - 175 + i * 130, cy + 12);
        });
      } else {
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(cx - 180, cy - 160);
        g.lineTo(cx - 180, cy + 140);
        g.lineTo(cx + 200, cy + 140);
        g.stroke();
        g.strokeStyle = '#f2b134';
        g.lineWidth = 7;
        g.beginPath();
        g.moveTo(cx - 180, cy + 100);
        g.lineTo(cx + 160, cy - 130);
        g.stroke();
        g.fillStyle = '#ffffff';
        g.font = '600 26px Arial, sans-serif';
        g.fillText('v', cx - 210, cy - 150);
        g.fillText('t', cx + 196, cy + 172);
      }
    })
  );
  // the whiteboards either side, in marker
  const marker = (lines, title, color) =>
    canvasTexture(512, 452, (g, w, h) => {
      g.fillStyle = '#fbfbf8';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(140,150,170,${0.025 + Math.random() * 0.03})`;
        g.beginPath();
        g.ellipse(Math.random() * w, Math.random() * h, 30 + Math.random() * 90, 6 + Math.random() * 14, Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = color;
      g.font = '700 40px "Segoe Print", "Comic Sans MS", cursive';
      g.fillText(title, 26, 62);
      g.fillRect(26, 74, g.measureText(title).width, 3);
      g.fillStyle = '#1d2b4f';
      g.font = '600 31px "Segoe Print", "Comic Sans MS", cursive';
      lines.forEach((t, i) => g.fillText(t, 30, 140 + i * 66));
    });
  const boards = LESSONS.map((L) => ({
    l: std({ map: marker([L.left, ...L.goals.slice(0, 2)], L.topic.split(' — ')[0], '#1f5fbf'), roughness: 0.25 }),
    r: std({ map: marker([...L.hw, `Due: ${date}`], 'Homework', '#b3261e'), roughness: 0.25 }),
  }));
  const poster = canvasTexture(512, 256, (g, w, h) => {
    const cols = ['#e2574c', '#f2b134', '#4fb06d', '#3c8dc5', '#8e6bbf', '#f07fa6'];
    g.fillStyle = '#f6f0de';
    g.fillRect(0, 0, w, h);
    // a periodic table, a world map and a chart of great Indian scientists
    for (let r = 0; r < 7; r++) for (let c = 0; c < 9; c++) {
      if (r === 0 && c > 0 && c < 8) continue;
      g.fillStyle = cols[(r + c) % cols.length];
      g.fillRect(10 + c * 17, 20 + r * 30, 15, 27);
    }
    g.fillStyle = '#9ccbe8';
    g.fillRect(178, 10, 160, 236);
    g.fillStyle = '#7fb069';
    for (const [x, y, rx, ry] of [[220, 70, 30, 22], [290, 90, 28, 40], [235, 170, 20, 34], [310, 190, 18, 14]]) {
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 6; i++) {
      g.fillStyle = '#d9c9a6';
      g.fillRect(352 + (i % 2) * 78, 14 + Math.floor(i / 2) * 80, 70, 72);
      g.fillStyle = '#5a4630';
      g.beginPath();
      g.arc(387 + (i % 2) * 78, 40 + Math.floor(i / 2) * 80, 15, 0, Math.PI * 2);
      g.fill();
      g.fillRect(372 + (i % 2) * 78, 60 + Math.floor(i / 2) * 80, 30, 18);
    }
  });
  // the children's work pinned up on the back wall
  const notice = canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#23365e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c9a24a';
    g.fillRect(0, 0, w, 6);
    g.fillRect(0, h - 6, w, 6);
    const papers = ['#ffffff', '#fff4b8', '#d9f0ff', '#ffe0e6', '#e2ffd9'];
    for (let i = 0; i < 10; i++) {
      g.save();
      g.translate(26 + (i % 5) * 96 + Math.random() * 8, 22 + Math.floor(i / 5) * 116 + Math.random() * 8);
      g.rotate((Math.random() - 0.5) * 0.12);
      g.fillStyle = papers[i % papers.length];
      g.fillRect(0, 0, 80, 100);
      // a drawing on each
      g.fillStyle = ['#e2574c', '#4fb06d', '#3c8dc5', '#f2b134'][i % 4];
      g.beginPath();
      g.arc(40, 44, 18 + (i % 3) * 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(40,40,60,0.55)';
      for (let l = 0; l < 3; l++) g.fillRect(10, 72 + l * 8, 40 + Math.random() * 25, 3);
      g.restore();
    }
  });
  const books = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#5a3a22';
    g.fillRect(0, 0, w, h);
    const cols = ['#7a1f2b', '#1f3f7a', '#2f6a3a', '#b8862b', '#5a2f7a', '#2b6f7a', '#8a4a1f', '#c9c2b0', '#222222', '#a33c2b'];
    const shelfH = h / 5;
    for (let s = 0; s < 5; s++) {
      let x = 6;
      const y0 = s * shelfH;
      g.fillStyle = '#3b2616';
      g.fillRect(0, y0 + shelfH - 8, w, 8);
      while (x < w - 10) {
        const bw = 8 + Math.random() * 12;
        const bh = shelfH * (0.6 + Math.random() * 0.3);
        g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
        g.fillRect(x, y0 + shelfH - 8 - bh, bw - 1.5, bh);
        g.fillStyle = 'rgba(255,230,160,0.5)';
        g.fillRect(x + 2, y0 + shelfH - 8 - bh * 0.7, bw - 5, 2);
        x += bw;
        if (Math.random() < 0.05) x += 14;
      }
    }
  });
  // the staff room's screen: today's cover, as ProxyPilot arranged it
  const cover = canvasTexture(1024, 576, (g, w, h) => {
    g.fillStyle = '#0f1c33';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f3d888';
    g.font = '700 46px Arial, sans-serif';
    g.fillText("Today's cover", 48, 82);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = '500 26px Arial, sans-serif';
    g.fillText(`ProxyPilot · ${date}`, 48, 124);
    const rows = [['P2', '6A', 'English', 'Ms Thomas'], ['P4', '9C', 'Science', 'Mr Khan'], ['P6', '8B', 'Maths', 'Mr Iyer'], ['P7', '7D', 'Hindi', 'Mrs Verma']];
    rows.forEach(([p, c, sub, t], i) => {
      const y = 190 + i * 88;
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(40, y - 52, w - 80, 74);
      g.fillStyle = '#ffffff';
      g.font = '700 34px Arial, sans-serif';
      g.fillText(p, 64, y);
      g.fillText(c, 170, y);
      g.font = '500 32px Arial, sans-serif';
      g.fillText(sub, 290, y);
      g.fillText(t, 560, y);
      g.fillStyle = '#4fb06d';
      g.beginPath();
      g.arc(w - 96, y - 12, 20, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(w - 106, y - 12);
      g.lineTo(w - 98, y - 4);
      g.lineTo(w - 84, y - 22);
      g.stroke();
    });
  });
  const dial = canvasTexture(256, 256, (g) => {
    g.fillStyle = '#fbfaf6';
    g.beginPath();
    g.arc(128, 128, 120, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#2a2d31';
    g.lineWidth = 10;
    g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.lineWidth = i % 3 ? 4 : 8;
      g.beginPath();
      g.moveTo(128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92);
      g.lineTo(128 + Math.sin(a) * 108, 128 - Math.cos(a) * 108);
      g.stroke();
    }
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + 50, 128 - 22);
    g.moveTo(128, 128);
    g.lineTo(128 - 8, 128 - 84);
    g.stroke();
  });
  return {
    floorIn: null, // set from the tile texture by the caller
    deskWood: null,
    deskMetal: std({ color: '#2f3b4c', roughness: 0.5, metalness: 0.5 }),
    boards,
    slides,
    dado: std({ color: '#93b5a5', roughness: 0.85 }),
    almirah: std({ color: '#7f8d86', roughness: 0.42, metalness: 0.55 }),
    poster: std({ map: poster, roughness: 0.8 }),
    notice: std({ map: notice, roughness: 0.9 }),
    books: std({ map: books, roughness: 0.85 }),
    screen: std({ color: '#0a1624', emissive: '#4a8fd8', emissiveIntensity: 0.9, roughness: 0.2 }),
    coverScreen: std({ color: '#000000', emissive: '#ffffff', emissiveMap: cover, emissiveIntensity: 0.85, roughness: 0.3 }),
    clockFace: std({ map: dial, roughness: 0.4 }),
    crest: new THREE.MeshStandardMaterial({ map: crestTexture(), transparent: true, alphaTest: 0.4, roughness: 0.5 }),
    leather: std({ color: '#2a1d17', roughness: 0.55 }),
    fanWhite: std({ color: '#efece4', roughness: 0.4, metalness: 0.2 }),
  };
}

/**
 * The lights (square LED panels in the ceilings) and the smart boards are kept out of the merged
 * furniture so each room's can be switched on and off on its own: an empty room is dark.
 * Light: { x, y (centre), z, ry, room, w, d }; screen: { x, y, z, ry, room, lesson }.
 */
let LIGHTS = [];
let SCREENS = [];
const LIGHTS_LIB = [];
const light = (F, room, u, y, v, w = 0.6, d = 0.6) => {
  const [x, z] = F.at(u, v);
  LIGHTS.push({ x, y, z, ry: F.theta, room, w, d });
};
const SCREEN_W = 1.72;
const SCREEN_H = 1.0;

/** a frame helper for one room: (u, v) in its block, y from its floor */
function roomFrame(B, r) {
  const b = BLOCKS[r.block];
  return frame(B, b.ox, b.oz, b.theta);
}

/**
 * A twin study desk: a light oak top on white steel side frames with a modesty panel and a book tray;
 * the two students sit facing -u, at v - 0.26 and v + 0.26
 */
function twinDesk(F, u, v, y) {
  F.box(0.5, 0.028, 1.1, 'oak', u - 0.27, y + 0.662, v); // top
  F.box(0.016, 0.3, 1.04, 'oak', u - 0.5, y + 0.34, v); // modesty panel
  F.box(0.36, 0.014, 1.0, 'whiteMetal', u - 0.27, y + 0.5, v); // book tray
  for (const s of [-0.53, 0.53]) F.box(0.46, 0.662, 0.03, 'whiteMetal', u - 0.27, y, v + s); // side frames
}

/** a moulded school chair (navy shell on a chrome sled frame); the student sits facing -u */
function studentChair(F, u, v, y) {
  F.box(0.4, 0.03, 0.4, 'chairShell', u + 0.02, y + 0.39, v); // seat
  F.add(new THREE.BoxGeometry(0.03, 0.34, 0.38), 'chairShell', u + 0.22, y + 0.66, v, { rz: -0.12 }); // back
  for (const s of [-0.19, 0.19]) {
    F.box(0.42, 0.02, 0.02, 'chrome', u + 0.03, y, v + s); // runner
    F.box(0.02, 0.39, 0.02, 'chrome', u - 0.16, y, v + s); // front leg
  }
}

/** an office chair: black mesh seat and back on a gas lift and a five-star base */
function officeChair(F, u, v, y, face = 0, tall = 0.55) {
  const c = Math.cos(face);
  const s = Math.sin(face);
  const at = (du, dv) => [u + du * c + dv * s, v - du * s + dv * c];
  let [a, b] = at(0, 0);
  F.box(0.48, 0.07, 0.46, 'mesh', a, y + 0.42, b, face);
  [a, b] = at(0, -0.24);
  F.add(new THREE.BoxGeometry(0.46, tall, 0.05), 'mesh', a, y + 0.52 + tall / 2, b, { ry: face, rx: -0.1 });
  [a, b] = at(0, 0);
  F.add(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 6), 'chrome', a, y + 0.24, b);
  for (let k = 0; k < 5; k++) {
    const t = (k / 5) * Math.PI * 2;
    F.add(new THREE.BoxGeometry(0.3, 0.025, 0.035), 'charcoal', a + Math.cos(t) * 0.14, y + 0.06, b + Math.sin(t) * 0.14, { ry: -t });
  }
}

/** a wall-mounted split air conditioner, on the wall at u, facing +du (dir = +1 or -1) */
function airCon(F, u, y, v, dir) {
  F.box(0.22, 0.3, 0.95, 'whiteMetal', u + dir * 0.11, y, v);
  F.box(0.01, 0.025, 0.86, 'charcoal', u + dir * 0.222, y + 0.035, v); // vent
  F.box(0.01, 0.02, 0.05, 'chrome', u + dir * 0.222, y + 0.24, v + 0.38); // display
}

/** walnut panelling to dado height along a stretch of wall (in u at fixed v, or in v at fixed u) */
function wainscot(F, along, from, to, at, y, h = 0.85) {
  const len = to - from;
  if (len < 0.05) return;
  const mid = (from + to) / 2;
  const flip = along === 'u';
  const box = (l, hh, t, key, a, yy, off = 0) => (flip ? F.box(l, hh, t, key, a, yy, at + off) : F.box(t, hh, l, key, at + off, yy, a));
  const out = at < 3 ? 1 : -1; // (which way is into the room, for the trim; works for the room's own walls)
  box(len, h, 0.018, 'walnut', mid, y);
  box(len, 0.05, 0.04, 'walnut', mid, y + h, out * 0.012); // cap rail
  box(len, 0.1, 0.03, 'walnut', mid, y, out * 0.008); // skirting
  for (let a = from + 0.6; a < to - 0.2; a += 0.6) box(0.035, h - 0.18, 0.026, 'walnut', a, y + 0.1, out * 0.006); // stiles
}

/** the front wall: two whiteboards either side of an interactive smart panel, a clock and speakers */
function smartWall(F, room, r, lesson, y) {
  const uF = r.rc - 3.6 + 0.1; // inside face of the front wall
  const v = AISLE_V;
  // the whiteboards (aluminium-framed)
  for (const [dv, key] of [[1.62, 'wbl' + lesson], [-1.62, 'wbr' + lesson]]) {
    F.box(0.03, 1.16, 1.32, 'aluminium', uF + 0.015, y + 0.88, v + dv);
    F.box(0.012, 1.1, 1.26, key, uF + 0.036, y + 0.91, v + dv);
    F.box(0.07, 0.025, 1.2, 'aluminium', uF + 0.05, y + 0.86, v + dv); // marker tray
  }
  // the panel: a black bezel; the picture itself is lit separately (on while the class is in)
  F.box(0.06, 1.14, 1.86, 'bezel', uF + 0.03, y + 0.92, v);
  F.box(0.02, 0.04, 0.16, 'chrome', uF + 0.062, y + 0.94, v + 0.78); // the panel's logo strip
  const [sx, sz] = F.at(uF + 0.064, v);
  SCREENS.push({ x: sx, y: y + 0.92 + 0.57, z: sz, ry: F.theta + Math.PI / 2, room, lesson });
  // speakers above, and the clock
  for (const dv of [-1.15, 1.15]) F.box(0.08, 0.14, 0.32, 'charcoal', uF + 0.04, y + 2.2, v + dv);
  F.add(new THREE.CylinderGeometry(0.17, 0.17, 0.035, 24), 'charcoal', uF + 0.02, y + 2.5, v, { rz: Math.PI / 2 });
  F.add(new THREE.PlaneGeometry(0.31, 0.31), 'clockFace', uF + 0.04, y + 2.5, v, { ry: Math.PI / 2 });
}

function classroom(F, r, lesson, room) {
  const y = FL[r.floor] + 0.025;
  const { rc } = r;
  const u0 = rc - 3.6;
  const u1 = rc + 3.6;
  // walnut panelling round the room (stopping short of the door)
  wainscot(F, 'u', u0 + 0.1, u1 - 0.1, 0.24, y);
  wainscot(F, 'u', u0 + 0.1, rc - 3.05, 6.36, y);
  wainscot(F, 'u', rc - 1.95, u1 - 0.1, 6.36, y);
  wainscot(F, 'v', 0.25, 6.35, u0 + 0.12, y);
  wainscot(F, 'v', 0.25, 6.35, u1 - 0.12, y);
  smartWall(F, room, r, lesson, y);
  // the teacher's desk in the front corner by the windows: oak top, walnut panels, a laptop; a mesh chair behind
  F.box(0.56, 0.032, 1.12, 'oak', rc - 2.66, y + 0.73, 0.88);
  F.box(0.54, 0.73, 0.03, 'walnut', rc - 2.66, y, 0.34);
  F.box(0.54, 0.73, 0.03, 'walnut', rc - 2.66, y, 1.42);
  F.box(0.02, 0.5, 1.06, 'walnut', rc - 2.4, y + 0.2, 0.88); // modesty panel, facing the class
  F.box(0.42, 0.55, 0.4, 'walnut', rc - 2.68, y + 0.03, 1.15); // drawers
  F.box(0.26, 0.014, 0.34, 'charcoal', rc - 2.72, y + 0.762, 0.72); // laptop
  F.add(new THREE.BoxGeometry(0.012, 0.22, 0.34), 'bezel', rc - 2.86, y + 0.87, 0.72, { rz: 0.32 });
  F.box(0.2, 0.06, 0.28, 'books', rc - 2.6, y + 0.762, 1.18); // register and files
  officeChair(F, rc - 3.15, 0.88, y, -Math.PI / 2, 0.5);
  // twin desks and a chair for every student
  for (const ru of DESK_ROWS) {
    for (const cv of DESK_COLS) {
      twinDesk(F, rc + ru, cv, y);
      for (const dv of [-0.26, 0.26]) studentChair(F, rc + ru + 0.17, cv + dv, y);
    }
  }
  // along the back wall: navy and maroon lockers on one side, the class library on the other
  const uB = u1 - 0.1;
  F.box(0.3, 1.18, 2.7, 'walnut', uB - 0.15, y, 1.65);
  for (let k = 0; k < 6; k++) {
    for (let t = 0; t < 2; t++) {
      F.box(0.012, 0.52, 0.41, (k + t) % 2 ? 'locker' : 'lockerB', uB - 0.306, y + 0.06 + t * 0.57, 0.53 + k * 0.45);
      F.box(0.02, 0.1, 0.02, 'chrome', uB - 0.318, y + 0.3 + t * 0.57, 0.68 + k * 0.45);
    }
  }
  F.box(0.3, 1.0, 2.3, 'books', uB - 0.15, y, 4.85);
  F.box(0.34, 0.03, 2.36, 'walnut', uB - 0.17, y + 1.0, 4.85);
  // the children's work and the charts above them, and two air conditioners up high
  F.box(0.02, 0.8, 2.3, 'notice', uB - 0.01, y + 1.42, 1.65);
  F.box(0.02, 0.8, 1.9, 'poster', uB - 0.01, y + 1.42, 4.85);
  for (const v of [1.65, 4.85]) airCon(F, uB, y + 2.6, v, -1);
  // roller blinds a third of the way down the outer windows, under a walnut pelmet
  for (const wu of [rc - 1.8, rc + 1.8]) {
    F.box(2.05, 0.6, 0.012, 'blind', wu, y + 1.77, 0.245);
    F.box(2.0, 0.03, 0.03, 'aluminium', wu, y + 1.75, 0.26);
    F.box(2.2, 0.12, 0.12, 'walnut', wu, y + 2.37, 0.29);
  }
  // LED panels in the ceiling
  const cy = top(r.floor) - 0.2 - 0.012;
  for (const lu of [rc - 2.2, rc + 0.2, rc + 2.6]) for (const lv of [1.7, 4.9]) light(F, room, lu, cy, lv);
}

function staffRoom(F, r) {
  const y = FL[r.floor] + 0.025;
  const { rc } = r;
  const tu = r.table.u;
  wainscot(F, 'u', rc - 3.5, rc + 3.5, 0.24, y);
  wainscot(F, 'v', 0.25, 6.35, rc - 3.48, y);
  // a long walnut conference table on chrome legs, and black mesh chairs
  F.box(3.9, 0.05, 1.25, 'walnut', tu, y + 0.74, AISLE_V);
  for (const du of [-1.7, 1.7]) F.box(0.08, 0.74, 0.9, 'chrome', tu + du, y, AISLE_V);
  for (const [du, dv] of [[-1.2, -0.3], [-0.1, 0.25], [0.9, -0.2], [1.5, 0.3]]) F.box(0.3, 0.06, 0.22, 'books', tu + du, y + 0.79, AISLE_V + dv); // files and registers
  for (const [du, dv] of [[-0.6, 0.1], [0.4, -0.15]]) F.box(0.32, 0.012, 0.22, 'charcoal', tu + du, y + 0.79, AISLE_V + dv); // laptops
  for (const du of [-1.25, -0.35, 0.55, 1.45]) {
    officeChair(F, tu + du, AISLE_V - 0.92, y, 0);
    officeChair(F, tu + du, AISLE_V + 0.92, y, Math.PI);
  }
  // walnut cabinets along the back wall
  for (const v of [1.0, 2.05, 4.55, 5.6]) {
    F.box(0.52, 1.95, 0.95, 'walnut', rc + 3.2, y, v);
    F.box(0.02, 1.8, 0.012, 'charcoal', rc + 2.93, y + 0.08, v);
    F.box(0.02, 0.18, 0.02, 'chrome', rc + 2.92, y + 0.95, v - 0.06);
    F.box(0.02, 0.18, 0.02, 'chrome', rc + 2.92, y + 0.95, v + 0.06);
  }
  // today's cover on the screen at the front, a notice board beside it
  F.box(0.06, 0.86, 1.5, 'bezel', rc - 3.45, y + 1.3, AISLE_V + 0.6);
  F.box(0.01, 0.8, 1.42, 'coverScreen', rc - 3.415, y + 1.33, AISLE_V + 0.6);
  F.box(0.02, 1.0, 1.4, 'notice', rc - 3.47, y + 1.2, 1.3);
  // a water dispenser by the door, plants in the corners
  F.box(0.36, 1.0, 0.36, 'whiteMetal', rc - 3.0, y, 5.7);
  F.add(new THREE.CylinderGeometry(0.15, 0.15, 0.42, 14), 'blind', rc - 3.0, y + 1.21, 5.7);
  for (const [pu, pv] of [[rc + 3.15, 3.3], [rc - 3.1, 0.55]]) {
    F.add(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 12), 'pot', pu, y + 0.2, pv);
    F.add(new THREE.SphereGeometry(0.32, 10, 8), 'shrub', pu, y + 0.66, pv, { sy: 1.2 });
  }
  airCon(F, rc - 3.5, y + 2.6, 4.9, 1);
  const cy = top(r.floor) - 0.2 - 0.012;
  for (const lu of [rc - 1.5, rc + 1.5]) for (const lv of [1.7, 4.9]) light(F, 'staff', lu, cy, lv);
}

function hodOffice(F, r) {
  const y = FL[r.floor] + 0.025;
  const { rc } = r;
  wainscot(F, 'u', rc - 3.5, rc + 3.5, 0.24, y);
  // a rug under the desk
  F.box(3.0, 0.01, 2.6, 'carpet', rc + 1.2, y, AISLE_V);
  // an executive desk in walnut, a computer, files and a name plate
  F.box(0.9, 0.05, 1.8, 'walnut', rc + 1.35, y + 0.75, AISLE_V);
  F.box(0.04, 0.72, 1.76, 'walnut', rc + 0.94, y + 0.03, AISLE_V);
  for (const dv of [-0.85, 0.85]) F.box(0.85, 0.75, 0.05, 'walnut', rc + 1.35, y, AISLE_V + dv);
  F.box(0.04, 0.34, 0.56, 'screen', rc + 1.5, y + 0.95, AISLE_V + 0.62, -0.5);
  F.box(0.12, 0.16, 0.06, 'charcoal', rc + 1.55, y + 0.8, AISLE_V + 0.62);
  F.box(0.16, 0.02, 0.44, 'charcoal', rc + 1.3, y + 0.8, AISLE_V + 0.45);
  F.box(0.28, 0.12, 0.34, 'books', rc + 1.4, y + 0.8, AISLE_V - 0.5);
  F.box(0.06, 0.08, 0.3, 'board', rc + 1.05, y + 0.8, AISLE_V - 0.1);
  // the HOD's high-backed leather chair and two visitors' chairs
  F.box(0.5, 0.08, 0.5, 'leather', rc + 2.05, y + 0.46, AISLE_V);
  F.box(0.08, 0.8, 0.5, 'leather', rc + 2.3, y + 0.5, AISLE_V);
  F.box(0.06, 0.46, 0.06, 'chrome', rc + 2.05, y, AISLE_V);
  officeChair(F, rc + 0.25, AISLE_V - 0.55, y, Math.PI / 2, 0.42);
  officeChair(F, rc + 0.25, AISLE_V + 0.55, y, Math.PI / 2, 0.42);
  // bookcases behind, the school crest framed on the wall, a sofa for visitors
  for (const v of [0.9, 1.9]) {
    F.box(0.5, 1.95, 0.95, 'walnut', rc + 3.2, y, v);
    F.box(0.012, 1.8, 0.012, 'charcoal', rc + 2.945, y + 0.08, v);
    for (const dv of [-0.06, 0.06]) F.box(0.02, 0.18, 0.02, 'chrome', rc + 2.935, y + 0.95, v + dv);
  }
  F.box(0.4, 2.0, 1.6, 'books', rc + 3.18, y, 4.9);
  F.box(0.44, 0.05, 1.66, 'walnut', rc + 3.18, y + 2.0, 4.9);
  F.box(0.04, 0.9, 0.8, 'walnut', rc + 3.47, y + 1.4, 3.3);
  F.add(new THREE.PlaneGeometry(0.7, 0.7), 'crest', rc + 3.44, y + 1.85, 3.3, { ry: -Math.PI / 2 });
  F.box(0.8, 0.42, 1.6, 'sofa', rc - 2.9, y, 1.5);
  F.box(0.2, 0.42, 1.6, 'sofa', rc - 3.2, y + 0.42, 1.5);
  F.box(0.02, 1.0, 2.0, 'notice', rc - 3.47, y + 1.2, 4.6);
  F.add(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 12), 'pot', rc - 3.1, y + 0.2, 5.8);
  F.add(new THREE.SphereGeometry(0.32, 10, 8), 'shrub', rc - 3.1, y + 0.66, 5.8, { sy: 1.2 });
  airCon(F, rc - 3.5, y + 2.6, 3.3, 1);
  const cy = top(r.floor) - 0.2 - 0.012;
  for (const lu of [rc - 1.4, rc + 1.4]) light(F, 'hod', lu, cy, AISLE_V);
}

/** furniture inside the library building (built in grounds.js) */
export function furnishLibrary(B) {
  LIGHTS_LIB.length = 0;
  const { y, tables } = LIBRARY;
  const fy = y - 0.03;
  // shelves along the back and side walls
  for (let x = -73.2; x <= -54.7; x += 2.3) B.box(2.1, 2.3, 0.45, 'books', x, fy, -49.95);
  for (const x of [-74.45, -53.55]) for (const z of [-48.2, -46.0]) B.box(0.45, 2.3, 2.1, 'books', x, fy, z);
  for (const [tx, tz] of tables) {
    B.box(2.6, 0.05, 1.0, 'walnut', tx, fy + 0.74, tz);
    for (const dx of [-1.2, 1.2]) B.box(0.06, 0.74, 0.9, 'chrome', tx + dx, fy, tz);
    B.box(0.8, 0.03, 0.12, 'aluminium', tx, fy + 0.78, tz); // reading lamps' bar
    for (const side of [-1, 1]) {
      for (const dx of [-0.8, 0, 0.8]) {
        const z = tz + side * 0.72;
        B.box(0.42, 0.04, 0.42, 'oak', tx + dx, fy + 0.44, z);
        B.box(0.42, 0.44, 0.04, 'oak', tx + dx, fy + 0.48, z + side * 0.2);
        B.box(0.36, 0.44, 0.36, 'charcoal', tx + dx, fy, z, { sx: 0.12 });
      }
    }
    B.box(0.3, 0.05, 0.22, 'books', tx - 0.4, fy + 0.79, tz - 0.1);
    B.box(0.22, 0.04, 0.3, 'books', tx + 0.7, fy + 0.79, tz + 0.12);
  }
  // the librarian's counter by the door
  const [dx, dz] = LIBRARY.desk;
  B.box(1.8, 0.95, 0.5, 'walnut', dx, fy, dz);
  B.box(1.9, 0.05, 0.6, 'oak', dx, fy + 0.95, dz);
  B.box(0.04, 0.3, 0.45, 'screen', dx + 0.4, fy + 1.0, dz - 0.05, { ry: Math.PI / 2 });
  B.box(0.46, 0.04, 0.44, 'leather', LIBRARY.librarian.x, fy + 0.46, LIBRARY.librarian.z);
  // air conditioners on the back wall; LED panels
  for (const x of [-69, -59]) {
    B.box(0.95, 0.3, 0.22, 'whiteMetal', x, 3.6, -50.1);
    B.box(0.86, 0.025, 0.01, 'charcoal', x, 3.635, -49.99);
  }
  for (const x of [-71, -66, -61, -56]) for (const z of [-47.5, -43.5]) LIGHTS_LIB.push({ x, y: 4.53, z, ry: 0, room: 'library', w: 0.6, d: 0.6 });
  return [];
}

/** Furniture for all rooms (no moving parts but the doors: the rooms are air-conditioned) */
export function buildInteriors(B) {
  LIGHTS = [];
  SCREENS = [];
  CLASSROOMS.forEach((r, i) => classroom(roomFrame(B, r), r, i % 6, i));
  staffRoom(roomFrame(B, STAFF), STAFF);
  hodOffice(roomFrame(B, HOD), HOD);
  return [];
}

/**
 * The moving parts: a door leaf for every room (swings into the room when someone comes
 * near, closes again behind them) and ceiling fan blades.
 */
export function createMovers(scene, M) {
  // ---- doors ----
  const leafGeo = mergeGeometries([
    new THREE.BoxGeometry(1.0, 2.1, 0.045).translate(0.5, 1.05, 0),
    new THREE.BoxGeometry(0.8, 0.8, 0.012).translate(0.5, 1.55, 0.026), // raised panels
    new THREE.BoxGeometry(0.8, 0.8, 0.012).translate(0.5, 0.55, 0.026),
    new THREE.BoxGeometry(0.8, 0.8, 0.012).translate(0.5, 1.55, -0.026),
    new THREE.BoxGeometry(0.8, 0.8, 0.012).translate(0.5, 0.55, -0.026),
  ]);
  const handleGeo = mergeGeometries([
    new THREE.BoxGeometry(0.04, 0.16, 0.05).translate(0.88, 1.0, 0.05),
    new THREE.BoxGeometry(0.04, 0.16, 0.05).translate(0.88, 1.0, -0.05),
  ]);
  const doorWood = M.doorWood;
  const doors = ALL_ROOMS.map((r) => ({
    x: r.hinge[0],
    y: FL[r.floor],
    z: r.hinge[1],
    theta: r.theta,
    // the two points either side of the door, for "is anyone coming through?"
    px: r.door[0], pz: r.door[1], qx: r.inDoor[0], qz: r.inDoor[1],
    floor: r.floor,
    open: 0,
    want: 0,
    hold: 0,
    dirty: true,
  }));
  const leaves = new THREE.InstancedMesh(leafGeo, doorWood, doors.length);
  const handles = new THREE.InstancedMesh(handleGeo, M.steel, doors.length);
  for (const im of [leaves, handles]) {
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    scene.add(im);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const place = (d, i) => {
    q.setFromAxisAngle(up, d.theta + d.open * 1.75);
    m4.compose(pos.set(d.x, d.y, d.z), q, one);
    leaves.setMatrixAt(i, m4);
    handles.setMatrixAt(i, m4);
  };
  doors.forEach(place);

  // which doors are near a point: a coarse grid per floor
  const cell = (f, x, z) => `${f}:${Math.round(x / 3)}:${Math.round(z / 3)}`;
  const grid = new Map();
  doors.forEach((d, i) => {
    for (const [x, z] of [[d.px, d.pz], [d.qx, d.qz]]) {
      for (const ox of [-1.5, 0, 1.5]) for (const oz of [-1.5, 0, 1.5]) {
        const k = cell(d.floor, x + ox, z + oz);
        if (!grid.has(k)) grid.set(k, new Set());
        grid.get(k).add(i);
      }
    }
  });

  // ---- LED panels: on while the room is in use (they come on a moment apart, the way a bank of lights does) ----
  const lights = [...LIGHTS, ...LIGHTS_LIB].map((t) => ({ ...t, on: -1, delay: 0 }));
  const lightMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  const lightMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.024, 1), lightMat, lights.length);
  lightMesh.frustumCulled = false;
  const LIT = new THREE.Color(1.45, 1.5, 1.56);
  const DARK = new THREE.Color(0.62, 0.63, 0.65);
  const sc = new THREE.Vector3();
  lights.forEach((t, i) => {
    q.setFromAxisAngle(up, t.ry);
    m4.compose(pos.set(t.x, t.y, t.z), q, sc.set(t.w, 1, t.d));
    lightMesh.setMatrixAt(i, m4);
    lightMesh.setColorAt(i, LIT);
  });
  scene.add(lightMesh);

  // ---- the smart boards: the lesson's slide while the class is in, a dark screen when it's empty ----
  const screens = SCREENS.map((s) => ({ ...s, on: -1 }));
  (M.slides || []).forEach((map, k) => {
    const list = screens.filter((s) => s.lesson === k);
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(SCREEN_W, SCREEN_H), new THREE.MeshBasicMaterial({ map, toneMapped: false }), Math.max(1, list.length));
    im.count = list.length;
    im.frustumCulled = false;
    list.forEach((s, i) => {
      s.mesh = im;
      s.index = i;
      q.setFromAxisAngle(up, s.ry);
      m4.compose(pos.set(s.x, s.y, s.z), q, one);
      im.setMatrixAt(i, m4);
      im.setColorAt(i, LIT);
    });
    scene.add(im);
  });
  const SCREEN_ON = new THREE.Color(1.08, 1.08, 1.08);
  const SCREEN_OFF = new THREE.Color(0.012, 0.014, 0.018);

  let lightsOn = 0;
  return {
    doors,
    /** people: lists of agents ({ active, pos }); busy(room) → is a fan's room in use */
    update(dt, lists, busy) {
      for (const d of doors) d.want = 0;
      for (const list of lists) {
        for (const a of list) {
          if (!a.active) continue;
          const y = a.pos.y;
          if (y < 0.3) continue;
          const f = Math.round((y - 0.48) / FLOOR);
          const near = grid.get(cell(f, a.pos.x, a.pos.z));
          if (!near) continue;
          for (const i of near) {
            const d = doors[i];
            const ax = a.pos.x;
            const az = a.pos.z;
            if ((ax - d.px) ** 2 + (az - d.pz) ** 2 < 1.8 || (ax - d.qx) ** 2 + (az - d.qz) ** 2 < 1.8) d.want = 1;
          }
        }
      }
      let changed = false;
      doors.forEach((d, i) => {
        if (d.want) d.hold = 1.4;
        else d.hold -= dt;
        const target = d.hold > 0 ? 1 : 0;
        if (d.open !== target) {
          d.open = target > d.open ? Math.min(1, d.open + dt * 2.2) : Math.max(0, d.open - dt * 1.1);
          place(d, i);
          changed = true;
        }
      });
      if (changed) {
        leaves.instanceMatrix.needsUpdate = true;
        handles.instanceMatrix.needsUpdate = true;
      }
      // the lights and the boards follow the rooms
      let lightsChanged = false;
      const seen = new Map();
      lights.forEach((t, i) => {
        if (!seen.has(t.room)) seen.set(t.room, busy(t.room) ? 1 : 0);
        const want = seen.get(t.room);
        if (want !== t.on) {
          // (the first time round they just take their state; switching on, each panel a beat after the last)
          if (t.on !== -1 && want && t.delay <= 0) t.delay = 0.12 + (i % 6) * 0.07;
          if (t.delay > 0 && (t.delay -= dt) > 0) return;
          t.delay = 0;
          t.on = want;
          lightMesh.setColorAt(i, want ? LIT : DARK);
          lightsChanged = true;
        }
      });
      if (lightsChanged) lightMesh.instanceColor.needsUpdate = true;
      const dirty = new Set();
      for (const s of screens) {
        const want = seen.has(s.room) ? seen.get(s.room) : busy(s.room) ? 1 : 0;
        if (want === s.on) continue;
        s.on = want;
        s.mesh.setColorAt(s.index, want ? SCREEN_ON : SCREEN_OFF);
        dirty.add(s.mesh);
      }
      for (const im of dirty) im.instanceColor.needsUpdate = true;
      lightsOn = 0;
      for (const v of seen.values()) lightsOn += v;
      lightsOn /= Math.max(1, seen.size);
    },
    /** share of the rooms with their lights on (the windows glow by it at dusk) */
    get lightsOn() {
      return lightsOn;
    },
    /** open every door straight away (testing) */
    setAll(v) {
      doors.forEach((d, i) => {
        d.open = v;
        d.hold = v ? 99 : 0;
        place(d, i);
      });
      leaves.instanceMatrix.needsUpdate = true;
      handles.instanceMatrix.needsUpdate = true;
    },
  };
}
