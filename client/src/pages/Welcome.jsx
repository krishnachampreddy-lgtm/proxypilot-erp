import { useState } from 'react';
import { useAuth } from '../auth.jsx';
import api, { errorText } from '../api';
import { Logo } from '../components/Layout.jsx';
import { Button, ErrorBox } from '../components/ui.jsx';

const input = 'w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-brass';
const SUBJECTS = ['English', 'DBMS', 'Python', 'DSA', 'Aptitude'];

// First sign-in with Google / Gmail: choose faculty or student
export default function Welcome() {
  const { user, setSession, logout } = useAuth();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState('faculty');
  const [subjects, setSubjects] = useState([]);
  const [className, setClassName] = useState('CSE-2A');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/complete-profile', {
        name,
        role,
        className: role === 'student' ? className : undefined,
        subjects: role === 'faculty' ? subjects : undefined,
      });
      setSession(data);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={save} className="w-full max-w-md space-y-4 rounded-lg border border-line bg-white p-6 shadow-sm">
        <Logo />
        <div className="flex items-center gap-3">
          {user.avatar && <img src={user.avatar} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" />}
          <div>
            <h2 className="font-display text-xl font-medium text-ink">Welcome — one last step</h2>
            <p className="text-sm text-muted">{user.email}</p>
          </div>
        </div>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        <div className="grid grid-cols-2 gap-2">
          {['faculty', 'student'].map((r) => (
            <button type="button" key={r} onClick={() => setRole(r)} className={`rounded-lg border px-3 py-2 text-sm font-medium ${role === r ? 'border-brass bg-brass-soft/60 text-brass-2' : 'border-line text-ink/80'}`}>
              I'm {r === 'faculty' ? 'faculty' : 'a student'}
            </button>
          ))}
        </div>
        {role === 'faculty' ? (
          <div>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted">Subjects you teach (pick one or more)</p>
            <div className="flex flex-wrap gap-2">
              {SUBJECTS.map((sub) => {
                const on = subjects.includes(sub);
                return (
                  <button
                    type="button"
                    key={sub}
                    onClick={() => setSubjects((s) => (on ? s.filter((x) => x !== sub) : [...s, sub]))}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${on ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-ink/80 hover:border-ink/40'}`}
                  >
                    {sub}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <select className={input} value={className} onChange={(e) => setClassName(e.target.value)}>
            {['CSE-2A', 'CSE-2B', 'CSE-3A', 'CSE-3B'].map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        <ErrorBox text={error} />
        <Button type="submit" disabled={busy || (role === 'faculty' && subjects.length === 0)} className="w-full">{busy ? 'Saving…' : 'Continue'}</Button>
        <button type="button" onClick={logout} className="w-full text-sm text-muted hover:underline">Use a different account</button>
      </form>
    </div>
  );
}
