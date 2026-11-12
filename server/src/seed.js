// Reload demo data: npm run seed
import 'dotenv/config';
import { ensureSchema, getPool } from './db.js';
import { seedDatabase } from './seedData.js';

await ensureSchema();
await seedDatabase();
await (await getPool()).end();
