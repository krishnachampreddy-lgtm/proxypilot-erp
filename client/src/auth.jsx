import { createContext, useContext, useState } from 'react';
import api from './api';

const AuthContext = createContext(null);

// Accounts remembered on this device: tap a name to go straight in.
const SAVED_KEY = 'pp_saved_accounts';
const readSaved = () => {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY)) || [];
  } catch {
    return [];
  }
};
const writeSaved = (list) => {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    /* storage blocked — remembering is just a convenience */
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pp_user'));
    } catch {
      return null;
    }
  });
  const [saved, setSaved] = useState(readSaved);

  const remember = (u, token) => {
    if (u.email.endsWith('@college.edu')) return; // don't remember demo accounts
    const list = [{ email: u.email, name: u.name, avatar: u.avatar, role: u.role, token }, ...readSaved().filter((a) => a.email !== u.email)].slice(0, 5);
    writeSaved(list);
    setSaved(list);
  };

  // Save the session returned by any sign-in route
  const setSession = (data) => {
    localStorage.setItem('pp_token', data.token);
    localStorage.setItem('pp_user', JSON.stringify(data.user));
    remember(data.user, data.token);
    setUser(data.user);
    return data.user;
  };

  const login = async (email, password) => setSession((await api.post('/auth/login', { email, password })).data);

  // Tap a saved name: reuse its stored session if it is still valid
  const quickLogin = async (account) => {
    localStorage.setItem('pp_token', account.token);
    try {
      const { data } = await api.get('/auth/me');
      return setSession({ token: account.token, user: data.user });
    } catch (err) {
      localStorage.removeItem('pp_token');
      throw err;
    }
  };

  const forget = (email) => {
    const list = readSaved().filter((a) => a.email !== email);
    writeSaved(list);
    setSaved(list);
  };

  const logout = () => {
    localStorage.removeItem('pp_token');
    localStorage.removeItem('pp_user');
    window.google?.accounts?.id?.disableAutoSelect?.();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, saved, login, logout, setSession, quickLogin, forget }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
