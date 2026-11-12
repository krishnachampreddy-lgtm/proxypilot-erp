import { BLOCKS, STAFF, HOD } from './rooms.js';

/** a camera standing inside a room, looking across it (block frame u, v and height above the floor) */
const inRoom = (r, cu, cv, ch, tu, tv, th) => {
  const { at } = BLOCKS[r.block];
  const [cx, cz] = at(r.rc + cu, cv);
  const [tx, tz] = at(r.rc + tu, tv);
  return { cam: [cx, r.feet + ch, cz], target: [tx, r.feet + th, tz], beacon: [tx, r.feet, tz], inside: true };
};

// Guided tour stops (camera position, what it looks at, the caption, and the school clock in minutes)
export const STOPS = [
  { clock: 460, title: 'Main gate', time: '7:40 am', text: 'A teacher wakes up unwell. One tap on “I’m sick today” — before she even leaves home.', cam: [4, 4.4, 57], target: [0, 4.8, 30], beacon: [0, 0.1, 44] },
  { clock: 461, title: 'Staff room', time: '7:41 am', text: 'Her leave reaches the HOD instantly. No phone calls, no WhatsApp chains.', ...inRoom(STAFF, -3.1, 0.6, 2.2, 1.2, 3.6, 0.8) },
  { clock: 465, title: 'HOD office', time: '7:45 am', text: 'One tap to approve — or decline with a reason the teacher can see.', ...inRoom(HOD, -2.7, 0.9, 1.95, 2.0, 3.5, 0.95) },
  { clock: 466, title: 'Classrooms', time: '7:46 am', text: 'Each missed class goes to the fairest free teacher of the same subject. Other subjects step in as backup.', cam: [17, 8.6, -13], target: [11.4, 8.9, -27.4], beacon: [11.6, 7.65, -26], story: true },
  { clock: 472, title: 'Library', time: '7:52 am', text: 'The substitute gets the request in the app, with a handover note on what to teach.', cam: [-73.6, 2.6, -41.4], target: [-61, 0.9, -46.8], beacon: [-61, 0.5, -46.8], inside: true },
  { clock: 605, title: 'Playground', time: '10:05 am', text: 'Students see who is taking their class before the bell rings.', cam: [56, 22, 28], target: [85, 0, -28], beacon: [85, 0.1, -30] },
  { clock: 897, title: 'Bus bay', time: '2:57 pm', text: 'By home time every class was covered — and the HOD has the full record for the month.', cam: [56, 9, 52], target: [30, 1.5, 30], beacon: [30, 0.1, 30] },
];

