import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import ImportTab from './ImportTab';
import DishesTab from './DishesTab';
import SettingsTab from './SettingsTab';
import HistoryTab from './HistoryTab';
import ErrorsTab from './ErrorsTab';
import SyncTab from './SyncTab';
import { getToken } from '../../config';

const TABS = [
  { to: 'settings', label: 'Настройки и печать' },
  { to: 'import', label: 'Импорт Excel' },
  { to: 'sync', label: 'Синхронизация iiko' },
  { to: 'dishes', label: 'Блюда' },
  { to: 'history', label: 'История печати' },
  { to: 'errors', label: 'Логи ошибок' },
];

export default function AdminLayout() {
  const hasToken = !!getToken();
  return (
    <div>
      <h1>Администратор</h1>
      {!hasToken && (
        <div className="banner warn">
          Для импорта и правки данных укажите <b>токен администратора</b> во вкладке «Настройки и
          печать» → «Подключение». Просмотр доступен без токена.
        </div>
      )}
      <div className="tabs">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
            {t.label}
          </NavLink>
        ))}
      </div>
      <Routes>
        <Route index element={<Navigate to="settings" replace />} />
        <Route path="settings" element={<SettingsTab />} />
        <Route path="import" element={<ImportTab />} />
        <Route path="sync" element={<SyncTab />} />
        <Route path="dishes" element={<DishesTab />} />
        <Route path="history" element={<HistoryTab />} />
        <Route path="errors" element={<ErrorsTab />} />
      </Routes>
    </div>
  );
}
