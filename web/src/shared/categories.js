/**
 * Группировка категорий блюд для удобного выбора на кухне.
 * Категория из Excel (напр. «Горячее из курицы») раскладывается на
 *   group — крупная группа («Горячие блюда»)
 *   sub   — уточнение («из курицы»); пусто, если категория цельная («Салаты»).
 * Это только для отображения — данные блюда не меняются.
 */

const GROUPS = [
  { test: /^горяч/i, name: 'Горячие блюда', icon: '🍲', order: 1 },
  { test: /^салат/i, name: 'Салаты', icon: '🥗', order: 2 },
  { test: /^суп/i, name: 'Супы', icon: '🍜', order: 3 },
  { test: /^гарнир/i, name: 'Гарниры', icon: '🍚', order: 4 },
  { test: /^завтрак/i, name: 'Завтраки', icon: '🍳', order: 5 },
  { test: /^выпечк|^пирог/i, name: 'Выпечка', icon: '🥐', order: 6 },
  { test: /^перекус|^сэндвич|^бутерброд/i, name: 'Перекусы', icon: '🥪', order: 7 },
  { test: /^десерт|^сладк/i, name: 'Десерты', icon: '🍰', order: 8 },
  { test: /^напит|^сок|^чай|^кофе|^компот|^морс/i, name: 'Напитки', icon: '🥤', order: 9 },
];

export function groupOf(category) {
  const c = String(category || '').trim();
  if (!c) return { group: 'Без категории', sub: '', icon: '🍽️', order: 98 };
  for (const g of GROUPS) {
    if (g.test.test(c)) {
      const rest = c.replace(/^\S+\s*/, '').trim(); // отбрасываем первое слово
      const sub = !rest || rest.toLowerCase() === c.toLowerCase() ? '' : rest;
      return { group: g.name, sub, icon: g.icon, order: g.order };
    }
  }
  return { group: c, sub: '', icon: '🍽️', order: 50 };
}

/**
 * Строит дерево групп по списку блюд.
 * @returns [{ group, icon, order, count, subs: [{ sub, count }] }]
 */
export function buildTree(dishes) {
  const map = new Map();
  for (const d of dishes) {
    const { group, sub, icon, order } = groupOf(d.category);
    if (!map.has(group)) map.set(group, { group, icon, order, count: 0, subMap: new Map() });
    const node = map.get(group);
    node.count++;
    if (sub) node.subMap.set(sub, (node.subMap.get(sub) || 0) + 1);
  }
  return [...map.values()]
    .map((n) => ({
      group: n.group,
      icon: n.icon,
      order: n.order,
      count: n.count,
      subs: [...n.subMap.entries()]
        .map(([sub, count]) => ({ sub, count }))
        .sort((a, b) => a.sub.localeCompare(b.sub, 'ru')),
    }))
    .sort((a, b) => a.order - b.order || a.group.localeCompare(b.group, 'ru'));
}
