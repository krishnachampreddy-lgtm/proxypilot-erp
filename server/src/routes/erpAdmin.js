import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireAuth, requireRole, validate } from '../middleware/auth.js';
import {
  getConnection, saveConnection, publicConnection, recentEvents, logEvent, checkUrl, seal, sha256,
  newApiKey, newWebhookSecret, syncFromErp, emit, ERP_EVENTS,
} from '../services/erp.js';
import { setupDemoErp, clearDemoErp } from '../demoErp/router.js';

/*
  The HOD's "School ERP" page: connect, create keys, sync, and see every message in and out.
*/

const router = Router();
router.use(requireAuth, requireRole('hod'));

const origin = (req) => `${req.protocol}://${req.get('host')}`;

const fail = (res, e) => res.status(e.status || 400).json({ error: e.message });

router.get('/', async (req, res) => {
  const c = await getConnection();
  res.json({
    connection: publicConnection(c),
    apiBase: `${origin(req)}/api/v1`,
    events: await recentEvents(40),
    eventTypes: ERP_EVENTS,
  });
});

const Settings = z.object({
  erpName: z.string().trim().max(80).optional(),
  pullUrl: z.string().trim().max(300).optional(),
  pullKey: z.string().trim().max(300).optional(), // empty = keep the saved one
  webhookUrl: z.string().trim().max(300).optional(),
});

router.post('/settings', validate(Settings), async (req, res) => {
  try {
    const fields = {};
    if (req.body.erpName !== undefined) fields.erp_name = req.body.erpName || null;
    if (req.body.pullUrl !== undefined) fields.pull_url = checkUrl(req.body.pullUrl, origin(req));
    if (req.body.pullKey) fields.pull_key_enc = seal(req.body.pullKey);
    if (req.body.webhookUrl !== undefined) fields.webhook_url = checkUrl(req.body.webhookUrl, origin(req));
    fields.is_demo = false;
    const c = await saveConnection(fields);
    await logEvent('in', 'settings', 'ok', 'Connection settings saved');
    res.json({ connection: publicConnection(c) });
  } catch (e) {
    fail(res, e);
  }
});

// a new API key for the ERP; shown once, only its fingerprint is stored
router.post('/api-key', async (req, res) => {
  const key = newApiKey();
  const c = await saveConnection({ api_key_hash: sha256(key), api_key_hint: key.slice(-4) });
  await logEvent('in', 'api-key', 'ok', `New API key created (…${key.slice(-4)}); the old one stops working`);
  res.json({ apiKey: key, connection: publicConnection(c) });
});

// a new secret for signing webhooks; shown once
router.post('/webhook-secret', async (req, res) => {
  const secret = newWebhookSecret();
  const c = await saveConnection({ webhook_secret_enc: seal(secret) });
  await logEvent('in', 'webhook-secret', 'ok', 'New webhook signing secret created');
  res.json({ webhookSecret: secret, connection: publicConnection(c) });
});

router.post('/sync', async (req, res) => {
  try {
    const summary = await syncFromErp();
    res.json({ summary, connection: publicConnection(await getConnection()) });
  } catch (e) {
    fail(res, e);
  }
});

// sends a harmless test event, so the school can check its webhook receiver
router.post('/test-webhook', async (req, res) => {
  const c = await getConnection();
  if (!c?.webhook_url) return res.status(400).json({ error: 'Add the ERP’s webhook address first.' });
  await emit('ping', { message: 'Test from ProxyPilot — your webhook works.', at: new Date().toISOString() });
  res.json({ ok: true });
});

// one click: connect the demo ERP that ships with ProxyPilot (both sides set up, then a first sync)
router.post('/connect-demo', async (req, res) => {
  try {
    const own = origin(req);
    const apiKey = newApiKey();
    const webhookSecret = newWebhookSecret();
    const erpKey = `erp_${crypto.randomBytes(18).toString('base64url')}`;
    await setupDemoErp({ proxypilotUrl: own, apiKey, webhookSecret, erpKey });
    await saveConnection({
      erp_name: 'Demo School ERP',
      is_demo: true,
      pull_url: `${own}/demo-erp/api`,
      pull_key_enc: seal(erpKey),
      api_key_hash: sha256(apiKey),
      api_key_hint: apiKey.slice(-4),
      webhook_url: `${own}/demo-erp/api/webhook`,
      webhook_secret_enc: seal(webhookSecret),
    });
    await logEvent('in', 'connect', 'ok', 'Connected to the Demo School ERP');
    const summary = await syncFromErp();
    res.json({ summary, connection: publicConnection(await getConnection()) });
  } catch (e) {
    fail(res, e);
  }
});

router.post('/disconnect', async (req, res) => {
  await saveConnection({
    erp_name: null, pull_url: null, pull_key_enc: null, api_key_hash: null, api_key_hint: null,
    webhook_url: null, webhook_secret_enc: null, is_demo: false, last_sync_at: null, last_sync: null,
  });
  await clearDemoErp();
  await logEvent('in', 'disconnect', 'ok', 'Disconnected from the ERP; its keys no longer work');
  res.json({ connection: publicConnection(await getConnection()) });
});

export default router;
