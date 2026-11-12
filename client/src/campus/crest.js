import { canvasTexture } from './util.js';

/*
  The school crest (an original design): a shield split navy and maroon under a gold chief with an
  open book, a lit diya in the middle, laurel either side and a ribbon with the motto
  "Tamaso ma jyotirgamaya" (lead me from darkness to light). Used on the gate, the porch, the
  classroom slides and the HOD's wall.
*/

const GOLD = '#c9a24a';
const GOLD_DARK = '#8a6a22';
const NAVY = '#1d2b4f';
const MAROON = '#7a1f2b';

/** draw the crest centred at (cx, cy), `s` = its height in pixels */
export function drawCrest(g, cx, cy, s, { ribbon = true, laurel = true } = {}) {
  const k = s / 512;
  g.save();
  g.translate(cx, cy);
  g.scale(k, k);
  g.translate(-256, -256);

  // laurel branches
  if (laurel) {
    for (const side of [-1, 1]) {
      g.save();
      g.translate(256, 300);
      g.scale(side, 1);
      for (let i = 0; i < 9; i++) {
        const a = -0.2 + i * 0.27;
        const r = 168;
        const x = Math.sin(a) * r * 0.85 + 4;
        const y = -Math.cos(a) * r * 0.9 + 40;
        g.save();
        g.translate(x + 20, y);
        g.rotate(a + 0.9);
        g.fillStyle = i % 2 ? '#3f6b35' : '#4f7d3f';
        g.beginPath();
        g.ellipse(0, 0, 26, 10, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      g.restore();
    }
  }

  // the shield
  const shield = () => {
    g.beginPath();
    g.moveTo(136, 96);
    g.quadraticCurveTo(256, 80, 376, 96);
    g.lineTo(376, 250);
    g.quadraticCurveTo(372, 352, 256, 420);
    g.quadraticCurveTo(140, 352, 136, 250);
    g.closePath();
  };
  g.save();
  shield();
  g.clip();
  g.fillStyle = NAVY;
  g.fillRect(100, 60, 156, 400);
  g.fillStyle = MAROON;
  g.fillRect(256, 60, 160, 400);
  // gold chief with the open book
  g.fillStyle = GOLD;
  g.fillRect(100, 60, 320, 96);
  g.fillStyle = '#fbf6e6';
  g.beginPath();
  g.moveTo(256, 140);
  g.quadraticCurveTo(222, 120, 188, 128);
  g.lineTo(188, 98);
  g.quadraticCurveTo(222, 92, 256, 110);
  g.quadraticCurveTo(290, 92, 324, 98);
  g.lineTo(324, 128);
  g.quadraticCurveTo(290, 120, 256, 140);
  g.fill();
  g.strokeStyle = GOLD_DARK;
  g.lineWidth = 3;
  g.stroke();
  g.beginPath();
  g.moveTo(256, 110);
  g.lineTo(256, 140);
  g.stroke();
  for (let l = 0; l < 3; l++) {
    g.beginPath();
    g.moveTo(200, 108 + l * 8);
    g.quadraticCurveTo(226, 104 + l * 8, 248, 116 + l * 8);
    g.moveTo(312, 108 + l * 8);
    g.quadraticCurveTo(286, 104 + l * 8, 264, 116 + l * 8);
    g.lineWidth = 1.6;
    g.stroke();
  }
  // the diya and its flame
  const fl = g.createRadialGradient(256, 222, 4, 256, 236, 70);
  fl.addColorStop(0, 'rgba(255,240,170,0.95)');
  fl.addColorStop(1, 'rgba(255,190,60,0)');
  g.fillStyle = fl;
  g.beginPath();
  g.arc(256, 236, 70, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ffb02e';
  g.beginPath();
  g.moveTo(256, 186);
  g.quadraticCurveTo(286, 238, 256, 262);
  g.quadraticCurveTo(226, 238, 256, 186);
  g.fill();
  g.fillStyle = '#fff3b0';
  g.beginPath();
  g.moveTo(256, 214);
  g.quadraticCurveTo(270, 242, 256, 256);
  g.quadraticCurveTo(242, 242, 256, 214);
  g.fill();
  g.fillStyle = GOLD;
  g.beginPath();
  g.moveTo(196, 268);
  g.quadraticCurveTo(256, 250, 316, 268);
  g.quadraticCurveTo(306, 312, 256, 316);
  g.quadraticCurveTo(206, 312, 196, 268);
  g.fill();
  g.fillRect(244, 314, 24, 18);
  g.fillRect(222, 330, 68, 10);
  g.restore();
  // gold rim
  shield();
  g.lineWidth = 14;
  g.strokeStyle = GOLD;
  g.stroke();
  g.lineWidth = 3;
  g.strokeStyle = GOLD_DARK;
  g.stroke();

  // the motto ribbon
  if (ribbon) {
    g.fillStyle = '#f4ead0';
    g.strokeStyle = GOLD_DARK;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(96, 420);
    g.quadraticCurveTo(256, 470, 416, 420);
    g.lineTo(426, 462);
    g.quadraticCurveTo(256, 512, 86, 462);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = MAROON;
    g.font = '700 25px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('TAMASO MA JYOTIRGAMAYA', 256, 459);
  }
  g.restore();
}

let cached = null;
/** the crest on a transparent texture (square) */
export function crestTexture() {
  if (!cached) cached = canvasTexture(512, 512, (g) => drawCrest(g, 256, 256, 512));
  return cached;
}
