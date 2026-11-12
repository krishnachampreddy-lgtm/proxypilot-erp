// How a leave is described everywhere in the app
export function leaveTypeLabel(type, periods = []) {
  if (type === 'morning') return 'Morning session · P1–P4';
  if (type === 'afternoon') return 'Afternoon session · P5–P6';
  if (type === 'periods') return `Particular periods · P${periods.join(', P')}`;
  return 'Full day';
}
