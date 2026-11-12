// Local dev helper: starts a throwaway Postgres (no install needed), then the API on port 5000.
// Usage: node scripts/local-db.mjs
import { NetlifyDB } from '@netlify/database-dev';

const db = new NetlifyDB();
process.env.DATABASE_URL = await db.start();
process.env.JWT_SECRET ||= 'local-dev-secret';
console.log('Local Postgres ready');
await import('../server/src/index.js');
