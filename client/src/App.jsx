import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Welcome from './pages/Welcome.jsx';
import Faculty from './pages/Faculty.jsx';
import Hod from './pages/Hod.jsx';
import Erp from './pages/Erp.jsx';
import Student from './pages/Student.jsx';

const HOME = { faculty: '/faculty', hod: '/hod', student: '/student' };
const home = (user) => (user.needsProfile ? '/welcome' : HOME[user.role]);

function Protected({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (user.needsProfile || user.role !== role) return <Navigate to={home(user)} replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { user, saved } = useAuth();
  return (
    <Routes>
      {/* returning users on this device skip the home page and go straight to their saved names */}
      <Route path="/" element={user ? <Navigate to={home(user)} replace /> : saved.length ? <Navigate to="/login" replace /> : <Home />} />
      <Route path="/login" element={user ? <Navigate to={home(user)} replace /> : <Login />} />
      <Route path="/welcome" element={!user ? <Navigate to="/" replace /> : user.needsProfile ? <Welcome /> : <Navigate to={home(user)} replace />} />
      <Route path="/faculty" element={<Protected role="faculty"><Faculty /></Protected>} />
      <Route path="/hod" element={<Protected role="hod"><Hod /></Protected>} />
      <Route path="/hod/erp" element={<Protected role="hod"><Erp /></Protected>} />
      <Route path="/student" element={<Protected role="student"><Student /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
