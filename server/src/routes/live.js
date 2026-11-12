import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { issueTicket, redeemTicket, subscribe } from '../services/live.js';

const router = Router();

// 1. with the normal login: get a one-minute ticket
router.post('/ticket', requireAuth, (req, res) => res.json({ ticket: issueTicket(req.user) }));

// 2. open the event stream with that ticket (EventSource can't send headers)
router.get('/', (req, res) => {
  const user = redeemTicket(String(req.query.ticket || ''));
  if (!user) return res.status(401).json({ error: 'Ticket expired' });
  subscribe(user, req, res);
});

export default router;
