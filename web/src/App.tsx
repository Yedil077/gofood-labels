import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import PrintPage from './pages/PrintPage';
import QueuePage from './pages/QueuePage';
import HistoryTab from './pages/admin/HistoryTab';
import AdminLayout from './pages/admin/AdminLayout';
import { api } from './api';
import { useQueue } from './useQueue';

function initTheme(): 'light' | 'dark' {
  try {
    const t = localStorage.getItem('theme');
    return t === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Акцент интерфейса по бренду из настроек. Для светлого зелёного GreenCity — тёмный оттенок (контраст с белым текстом). */
const ACCENT: Record<string, { c: string; soft: string; name: string }> = {
  gofood: { c: '#f2661f', soft: '#fff1e9', name: 'gofood' },
  greencity: { c: '#3d8b17', soft: '#eef7e6', name: 'GreenCity' },
};

export default function App() {
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(initTheme);
  const [brand, setBrand] = useState('gofood');
  const [queueMode, setQueueMode] = useState(false);
  const { info } = useQueue(8000, true);

  useEffect(() => {
    api
      .health()
      .then(() => setApiOk(true))
      .catch(() => setApiOk(false));
    api
      .getSettings()
      .then((r) => {
        setBrand(r.settings?.['brand.preset'] === 'greencity' ? 'greencity' : 'gofood');
        setQueueMode(r.settings?.['print.mode'] === 'queue');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* no-op */
    }
  }, [theme]);

  useEffect(() => {
    const a = ACCENT[brand] || ACCENT.gofood;
    const st = document.documentElement.style;
    st.setProperty('--orange', a.c);
    if (theme !== 'dark') st.setProperty('--orange-soft', a.soft);
    else st.removeProperty('--orange-soft');
  }, [brand, theme]);

  const nav = ({ isActive }: { isActive: boolean }) => 'navlink' + (isActive ? ' active' : '');
  const pending = info?.pending || 0;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">{(ACCENT[brand] || ACCENT.gofood).name}</span>
          <span className="sub">Этикетки</span>
        </div>
        <nav className="mainnav">
          <NavLink to="/" end className={nav}>Печать</NavLink>
          {(queueMode || pending > 0) && (
            <NavLink to="/queue" className={nav}>
              Очередь
              {pending > 0 && <span className="nav-badge">{pending}</span>}
            </NavLink>
          )}
          <NavLink to="/history" className={nav}>История</NavLink>
          <NavLink to="/admin" className={nav}>Админ</NavLink>
        </nav>
        {queueMode && (
          <span
            className={'agent-dot ' + (info ? (info.online ? 'on' : 'off') : '')}
            title={info ? (info.online ? 'Print Agent на связи' : 'Print Agent не на связи') : ''}
          />
        )}
        <button
          className="navlink theme-btn"
          title="Светлая / тёмная тема"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>

      <main className="content">
        {apiOk === false && (
          <div className="banner err">
            Нет связи с сайтом (API). Проверьте интернет и обновите страницу.
          </div>
        )}
        <Routes>
          <Route path="/" element={<PrintPage />} />
          <Route path="/queue" element={<QueuePage />} />
          <Route path="/history" element={<HistoryTab />} />
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
      <span> · печать этикеток</span>
    </footer>
  );
}
