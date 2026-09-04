# Переезд на Cloudflare Pages (вместо Netlify)

Хостинг: **Cloudflare Pages** (статика + Functions) + **Cloudflare D1** (база данных).
Бесплатно: сборки без жёсткого лимита, Functions 100 000 запросов/день, D1 100 000 записей/день.

## Первая настройка (один раз, из папки проекта)

```powershell
cd "D:\Green_city\Этикеткий\gofood-labels"
npm install                       # поставит wrangler

npx wrangler login                # откроется браузер — войти в Cloudflare (если аккаунта нет — создать, бесплатно)

npx wrangler d1 create gofood     # создаст базу; в ответе будет "database_id = ..."
```

Скопировать `database_id` из вывода и вставить в **`wrangler.toml`** вместо `PASTE_DATABASE_ID_HERE`.

```powershell
npx wrangler d1 execute gofood --remote --file=schema.sql   # создаст таблицу kv

npm run deploy                    # соберёт web + зальёт на Pages (создаст проект "gofood-labels")
```

После первого деплоя адрес будет: **`https://gofood-labels.pages.dev`**

## Переменные окружения и привязка базы

Cloudflare Dashboard → **Workers & Pages → gofood-labels → Settings**:

1. **Bindings → D1 database bindings** → Add:
   - Variable name: `GOFOOD_DB`
   - D1 database: `gofood`
   (если уже подхватилось из `wrangler.toml` — пропустить)

2. **Environment variables** (Production) → Add:
   - `GOFOOD_TOKEN` = длинная строка (пароль администратора)
   - `GOFOOD_AGENT_TOKEN` = другая строка (пароль Print Agent)

3. Пересобрать после добавления переменных:
   ```powershell
   npm run deploy
   ```

## Наполнение данными

База пустая — заполнить через сайт `https://gofood-labels.pages.dev`:
1. Администратор → Настройки → вставить `GOFOOD_TOKEN`
2. Импорт → загрузить `Блюда*.xlsx`
3. Импорт → «Импортировать КБЖУ» (файл из iikoOffice)
4. Настройки → выбрать бренд (gofood / GreenCity) → Сохранить

## Print Agent

В `print-agent/agent-config.json` поменять адрес:
```json
"apiBase": "https://gofood-labels.pages.dev",
"agentToken": "<GOFOOD_AGENT_TOKEN>"
```
Перезапустить агент.

## Последующие обновления

```powershell
git pull            # если код обновился
npm run deploy      # собрать + выложить
```

Либо подключить авто-деплой из GitHub: Cloudflare → Workers & Pages → Create → Pages →
Connect to Git → выбрать репозиторий. Build command: `npm run build`, Build output: `web/dist`.
Тогда деплой идёт сам при `git push` (как было на Netlify, но лимиты больше).
