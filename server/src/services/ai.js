import { z } from 'zod';
import { addDays, weekday, prettyDate } from './dates.js';

// ---------------------------------------------------------------
// Gemini helper. The API key lives ONLY in the backend .env file.
// If the key is missing or the call fails, every function below
// falls back to simple rules, so the demo never breaks.
// ---------------------------------------------------------------

const MODEL = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// On Netlify, the AI Gateway injects GEMINI_API_KEY + GOOGLE_GEMINI_BASE_URL automatically.
// Elsewhere, put your own GEMINI_API_KEY in the backend .env.
export function aiEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

let client;
async function askGeminiJSON(prompt) {
  if (!aiEnabled()) throw new Error('No GEMINI_API_KEY available');
  if (!client) {
    const { GoogleGenAI } = await import('@google/genai');
    client = new GoogleGenAI({});
  }
  const call = (model) =>
    Promise.race([
      client.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini timeout')), 15000)),
    ]);
  let result;
  try {
    result = await call(MODEL());
  } catch (err) {
    console.warn(`[AI] ${MODEL()} failed (${err.message}), trying gemini-flash-latest`);
    result = await call('gemini-flash-latest');
  }
  return JSON.parse(result.text);
}

// ---------------------------------------------------------------
// 1. Read a free-text leave message
// ---------------------------------------------------------------

const LeaveParse = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periods: z.array(z.number().int().min(1).max(6)), // empty = whole day
  reason: z.string().max(120),
});

export async function parseLeave(text, today, mySchedule) {
  const prompt = `You read leave messages written by college teachers in India.
Today is ${today} (${weekday(today)}). Tomorrow is ${addDays(today, 1)} (${weekday(addDays(today, 1))}).
Periods run 1 to 6 each day. Lab or "5-6" means periods 5 and 6.
The teacher's weekly classes are: ${mySchedule}

Message: """${text}"""

Reply with JSON only:
{"date": "YYYY-MM-DD", "periods": [numbers 1-6, or [] if the whole day], "reason": "short reason, max 6 words"}`;

  try {
    const raw = await askGeminiJSON(prompt);
    const parsed = LeaveParse.parse(raw); // Zod check: AI output is validated, never trusted blindly
    if (parsed.date < today) parsed.date = today;
    return { ...parsed, aiUsed: true };
  } catch (err) {
    console.warn('[AI] parseLeave fallback:', err.message);
    return { ...ruleBasedLeave(text, today), aiUsed: false };
  }
}

function ruleBasedLeave(text, today) {
  const t = text.toLowerCase();
  let date = today;
  if (t.includes('day after tomorrow')) date = addDays(today, 2);
  else if (t.includes('tomorrow') || t.includes('tmrw') || t.includes('kal')) date = addDays(today, 1);

  const periods = new Set();
  const range = t.match(/(\d)\s*[-–to]+\s*(\d)/);
  if (range) for (let p = +range[1]; p <= +range[2]; p++) periods.add(p);
  if (/period|pd|lecture|hour|class|lab/.test(t)) {
    // "2nd and 3rd period", "period 4", "P2"
    for (const m of t.matchAll(/\b([1-6])(?:st|nd|rd|th)\b/g)) periods.add(+m[1]);
    for (const m of t.matchAll(/(?:period|pd|p)\s*([1-6])\b/g)) periods.add(+m[1]);
  }

  let reason = 'Leave';
  if (/fever|sick|ill|unwell|cold|doctor|hospital/.test(t)) reason = 'Medical leave';
  else if (/family|wedding|marriage|function/.test(t)) reason = 'Family function';
  else if (/conference|seminar|workshop|meeting|exam duty/.test(t)) reason = 'Official duty';

  return { date, periods: [...periods].filter((p) => p >= 1 && p <= 6).sort(), reason };
}

// ---------------------------------------------------------------
// 2. Explain the top pick + write a handover note for each class
// ---------------------------------------------------------------

const Notes = z.object({
  items: z.array(z.object({ id: z.string(), reason: z.string(), handover: z.string() })),
});

export async function explainAndHandover(items) {
  // items: [{ id, className, subject, period, topic, absentName, top: {name, factors[]} | null }]
  const withTop = items.filter((i) => i.top);
  if (withTop.length === 0) return {};

  const prompt = `You help a college HOD assign substitute ("proxy") lectures.
For each class below, write:
- "reason": ONE short sentence (max 20 words) on why the suggested teacher is the best pick, using only the given facts.
- "handover": 2-3 short lines for the substitute: what to cover today based on the topic, plus one simple activity. Plain words.

Classes:
${JSON.stringify(withTop, null, 1)}

Reply with JSON only: {"items":[{"id":"...","reason":"...","handover":"..."}]}`;

  try {
    const raw = await askGeminiJSON(prompt);
    const parsed = Notes.parse(raw);
    return Object.fromEntries(parsed.items.map((i) => [i.id, { reason: i.reason, handover: i.handover }]));
  } catch (err) {
    console.warn('[AI] explainAndHandover fallback:', err.message);
    return Object.fromEntries(withTop.map((i) => [i.id, templateNote(i)]));
  }
}

export function templateNote(i) {
  if (!i.top) return { reason: 'No free teacher found for this period.', handover: '' };
  return {
    reason: (() => { const t = i.top.factors.join(', '); return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`; })(),
    handover: `Class ${i.className}, ${i.subject} (period ${i.period}).\nContinue from: ${i.topic || 'last topic covered'}.\nStart with a 10-minute recap quiz, then solve 2 examples on the board.`,
  };
}

// ---------------------------------------------------------------
// 3. Two-line insight for the HOD dashboard
// ---------------------------------------------------------------

export async function hodSummary(stats) {
  const prompt = `You are an assistant to a college HOD. Using ONLY these facts, write a 2-sentence summary of proxy-lecture coverage and one fairness suggestion. Plain words, no greetings.
Facts: ${JSON.stringify(stats)}
Reply with JSON only: {"summary":"..."}`;
  try {
    const raw = await askGeminiJSON(prompt);
    return z.object({ summary: z.string() }).parse(raw).summary;
  } catch (err) {
    console.warn('[AI] hodSummary fallback:', err.message);
    const top = stats.loadThisMonth[0];
    return `${stats.covered} of ${stats.total} upcoming proxy periods are covered (${stats.pending} pending, ${stats.uncovered} uncovered). ${
      top ? `${top.name} has taken the most proxies this month (${top.count}); give the next ones to others.` : ''
    }`;
  }
}

export { prettyDate };
