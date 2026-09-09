import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import PrintPage from './pages/PrintPage';
import AdminLayout from './pages/admin/AdminLayout';
import { api } from './api';

function initTheme(): 'light' | 'dark' {
  try {
    const t = localStorage.getItem('theme');
    return t === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export default function App() {
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(initTheme);

  useEffect(() => {
    api
      .health()
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* no-op */
    }
  }, [theme]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">gofood</span>
          <span className="sub">Печать этикеток</span>
        </div>
        <div className="spacer" />
        <NavLink to="/" end className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>
          Печать
        </NavLink>
        <NavLink to="/admin" className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>
          Администратор
        </NavLink>
        <button
          className="navlink"
          title="Светлая / тёмная тема"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>

      <main className="content">
        {apiOk === false && (
          <div className="banner err">
            Нет связи с API. Если открыт локальный агент — проверьте, что он запущен и указан верный
            API-адрес в «Настройки → Подключение».
          </div>
        )}
        <Routes>
          <Route path="/" element={<PrintPage />} />
          <Route path="/admin/*" element={<AdminLayout />} />
        </Routes>
      </main>

      <AdminFooter />
    </div>
  );
}

function AdminFooter() {
  const nav = useNavigate();
  return (
    <footer className="footer">
      <button onClick={() => nav('/admin')}>Режим администратора</button>
      <span> · GOFOOD · печать этикеток</span>
    </footer>
  );
}
