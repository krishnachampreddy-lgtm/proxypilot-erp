import axios from 'axios';

// Backend URL comes from .env (VITE_API_URL).
// Same website on Netlify, so the default is just /api. For local dev set VITE_API_URL=http://localhost:5000
const api = axios.create({ baseURL: `${import.meta.env.VITE_API_URL || ''}/api` });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && localStorage.getItem('pp_token') && !err.config?.url?.startsWith('/auth/')) {
      localStorage.removeItem('pp_token');
      localStorage.removeItem('pp_user');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

export const errorText = (err) => err.response?.data?.error || 'Could not reach the server. Is the backend running?';

export default api;
