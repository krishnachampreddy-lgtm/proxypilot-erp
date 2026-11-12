// Local development server: node server/src/index.js
// Needs DATABASE_URL (any PostgreSQL) in a .env file at the project root.
import 'dotenv/config';
import { createApp } from './app.js';
import { aiEnabled } from './services/ai.js';
import { startEscalationTimer, replyMinutes } from './services/escalate.js';

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env — see .env.example');
  process.exit(1);
}

const PORT = process.env.PORT || 5000;
createApp().listen(PORT, () => {
  console.log(`ProxyPilot API on port ${PORT} — AI: ${aiEnabled() ? 'Gemini' : 'rules fallback (no GEMINI_API_KEY)'}`);
  console.log(`Unanswered cover requests pass on after ${replyMinutes()} min`);
  startEscalationTimer();
});
