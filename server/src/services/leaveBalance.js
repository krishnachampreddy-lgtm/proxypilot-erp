// Each teacher gets 12 leaves a year. A full day counts 1, a session or a few periods count half.
export const YEARLY_LEAVES = 12;

export const leaveCost = (type) => (type === 'full' ? 1 : 0.5);

/** leaves: rows from the leaves table for one teacher */
export function leaveBalance(leaves, year) {
  const used = leaves
    .filter((l) => l.status !== 'declined' && String(l.date).startsWith(String(year)))
    .reduce((s, l) => s + leaveCost(l.leave_type), 0);
  return { total: YEARLY_LEAVES, used, left: Math.max(0, YEARLY_LEAVES - used) };
}
