import { useEffect, useState } from 'react';
import { api } from '../../api';
import type { Settings } from '../../types';

export default function SyncTab() {
  const [st, setSt] = useState<any>(null);
  const [agent, setAgent] = useState<any>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState('');
  const [saved, setSaved] = useState('');

  const load = () => {
    api.syncStatus().then(setSt).catch(() => {});
    api.agentInfo().then(setAgent).catch(() => {});
    api.getSettings().then((r) => setS(r.settings)).catch(() => {});
  };
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  if (!s) return <p className="muted">Загрузка…</p>;
  const set = (k: string, v: any) => setS({ ...s, [k]: v });
  const lr = st?.lastResult;

  async function save() {
    const r = await api.saveSettings({
      'sync.enabled': !!s!['sync.enabled'],
      'sync.everyHours': Number(s!['sync.everyHours']) || 6,
      'sync.nutritionBasis': s!['sync.nutritionBasis'] || 'portion',
      'sync.allowNewDishes': !!s!['sync.allowNewDishes'],
      'sync.excludeIngredients': String(s!['sync.excludeIngredients'] || [])
        ? (Array.isArray(s!['sync.excludeIngredients'])
            ? s!['sync.excludeIngredients']
            : String(s!['sync.excludeIngredients']).split(',').map((x) => x.trim()).filter(Boolean))
        : [],
    });
    if ((r as any)._status >= 400) {
      setSaved('Ошибка: нужен пароль администратора (вкладка «Настройки»)');
      return;
    }
    setSaved('Сохранено ✓');
    setTimeout(() => setSaved(''), 2500);
  }

  async function runNow() {
    setMsg('Ставлю задание синхронизации…');
    try {
      const r: any = await api.syncRun();
      setMsg(
        r.ok
          ? `Задание #${r.jobId} создано. Агент на моноблоке выполнит синхронизацию (обычно 10–60 c).`
          : 'Ошибка: ' + (r.error || 'нужен пароль администратора')
      );
    } catch (e: any) {
      setMsg('Ошибка: ' + String(e?.message || e));
    }
  }

  const excludeText = Array.isArray(s['sync.excludeIngredients'])
    ? s['sync.excludeIngredients'].join(', ')
    : String(s['sync.excludeIngredients'] || '');

  return (
    <div>
      <div className="card">
        <h2>Синхронизация с iiko</h2>
        <p className="muted">
          Состав блюд (техкарты) и КБЖУ (автоподсчёт из ингредиентов) берутся из iiko автоматически.
          Выполняет <b>Print Agent на моноблоке</b> — логин и пароль iiko хранятся там, в{' '}
          <span className="mono">agent-config.json</span>, в облако и GitHub не попадают.
          <br />
          Ручные правки состава/КБЖУ в разделе «Блюда» синхронизация <b>не затирает</b>.
        </p>

        <div
          className="banner"
          style={{
            background: agent?.online ? '#eef8f0' : '#fdeeee',
            border: '1px solid ' + (agent?.online ? '#bfe3c6' : '#f0c4c4'),
          }}
        >
          Агент: {agent?.online ? '🟢 на связи' : '🔴 не отвечает'}
          {agent?.agent && (
            <>
              {' '}· iiko {agent.agent.iikoConfigured ? 'настроен' : '❗ не настроен в agent-config.json'}
              {agent.agent.lastSyncAt && ` · последняя синхр.: ${new Date(agent.agent.lastSyncAt).toLocaleString('ru-RU')}`}
            </>
          )}
        </div>

        <div className="row wrap" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={runNow}>
            🔄 Синхронизировать сейчас
          </button>
          {msg && <span className="muted">{msg}</span>}
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Последняя синхронизация</h2>
        {!lr ? (
          <p className="muted">Синхронизаций ещё не было.</p>
        ) : (
          <table>
            <tbody>
              <tr><td>Время</td><td>{new Date(st.lastRunAt).toLocaleString('ru-RU')}</td></tr>
              <tr><td>Получено позиций из iiko</td><td>{lr.received}</td></tr>
              <tr><td>Сопоставлено с блюдами</td><td>{lr.matched}</td></tr>
              <tr><td>Обновлён состав</td><td>{lr.compositionSet}</td></tr>
              <tr><td>Обновлено КБЖУ (полное)</td><td>{lr.nutritionSet}</td></tr>
              <tr><td>КБЖУ частичное (не у всех ингредиентов задана ценность)</td><td>{lr.nutritionPartial}</td></tr>
              <tr><td>Добавлено новых блюд</td><td>{lr.added}</td></tr>
              {lr.agentStats && (
                <tr><td>Из iiko: номенклатура / техкарты / блюда</td>
                  <td>{lr.agentStats.products} / {lr.agentStats.charts} / {lr.agentStats.dishes}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2>Параметры</h2>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={!!s['sync.enabled']} onChange={(e) => set('sync.enabled', e.target.checked)} />
          Автоматическая синхронизация включена
        </label>

        <div className="row wrap" style={{ marginTop: 12 }}>
          <div>
            <label className="fld">Периодичность, часов</label>
            <input
              type="number"
              min={1}
              value={s['sync.everyHours']}
              onChange={(e) => set('sync.everyHours', e.target.value)}
              style={{ width: 110 }}
            />
          </div>
          <div>
            <label className="fld">КБЖУ показывать</label>
            <select value={s['sync.nutritionBasis']} onChange={(e) => set('sync.nutritionBasis', e.target.value)}>
              <option value="portion">на порцию</option>
              <option value="per100g">на 100 г</option>
            </select>
          </div>
        </div>

        <label className="fld">Не включать в состав ингредиенты (через запятую)</label>
        <input
          type="text"
          value={excludeText}
          onChange={(e) => set('sync.excludeIngredients', e.target.value)}
          placeholder="соль, вода, перец, масло растительное"
        />

        <label className="row" style={{ gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={!!s['sync.allowNewDishes']}
            onChange={(e) => set('sync.allowNewDishes', e.target.checked)}
          />
          Разрешить добавлять блюда из iiko, которых нет в импорте Excel
        </label>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={save}>Сохранить параметры</button>
          {saved && <span className={'tag ' + (saved.startsWith('Ошибка') ? 'err' : 'ok')}>{saved}</span>}
        </div>
      </div>
    </div>
  );
}
