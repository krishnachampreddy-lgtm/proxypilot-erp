import crypto from 'node:crypto';

/*
  Live updates over Server-Sent Events.
  The browser asks for a one-minute ticket (with its normal login), then opens
  /api/live?ticket=… — so the login token never travels in a URL.
  Everything that changes a leave or a cover request calls publish(), and the
  right screens refresh at once instead of waiting for their next poll.
*/

const tickets = new Map(); // ticket -> { user, exp }
const clients = new Set(); // { user, res }

export function issueTicket(user) {
  const now = Date.now();
  for (const [k, t] of tickets) if (t.exp < now) tickets.delete(k);
  const ticket = crypto.randomBytes(18).toString('base64url');
  tickets.set(ticket, { user: { id: user.id, role: user.role, name: user.name }, exp: now + 60_000 });
  return ticket;
}

export function redeemTicket(ticket) {
  const t = tickets.get(ticket);
  tickets.delete(ticket);
  return t && t.exp > Date.now() ? t.user : null;
}

export function subscribe(user, req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 5000\n\n');
  res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
  const client = { user, res };
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(client);
  });
}

/**
 * Sends an event to some users.
 * to: an array of user ids, and/or roles like 'hod' / 'student' / 'faculty', or 'all'
 */
export function publish(to, event) {
  const list = Array.isArray(to) ? to : [to];
  const ids = new Set(list.filter((x) => typeof x === 'number'));
  const roles = new Set(list.filter((x) => typeof x === 'string'));
  const msg = `data: ${JSON.stringify({ ...event, at: new Date().toISOString() })}\n\n`;
  for (const c of clients) {
    if (roles.has('all') || roles.has(c.user.role) || ids.has(c.user.id)) {
      try {
        c.res.write(msg);
      } catch {
        clients.delete(c);
      }
    }
  }
}

export const liveCount = () => clients.size;
