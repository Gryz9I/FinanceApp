const DB_NAME = 'FinanceAppDB';
const DB_VERSION = 2;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('days')) {
        db.createObjectStore('days', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = e => reject(e.target.error);
  });
}

// Получить все записи из стора — один запрос, одна транзакция, не await внутри
function getAllFromStore(storeName) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

// Получить одну запись
function getFromStore(storeName, key) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

// Записать несколько объектов за одну транзакцию
function putManyToStore(storeName, items) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

// Записать один объект
function putToStore(storeName, item) {
  return putManyToStore(storeName, [item]);
}

const DEFAULTS = {
  hourly_rate: 256.14,
  tax_rate: 0.25,
  break_rule_hours: 5,
  break_minutes: 30,
  usd_rate: 0.10446,
  overtime_threshold: 9.0,
  ub_tillegg: 22.0,
  ub_start_hour: 13.0,
  salary_display: 'calculated',
  categories: ['дом', 'коммуналка', 'телефон', 'машина', 'еда', 'хотелки', 'отложил']
};

export async function getSettings() {
  const rows = await getAllFromStore('settings');
  const map = {};
  rows.forEach(r => { map[r.key] = r.value; });
  const result = { ...DEFAULTS };
  Object.keys(DEFAULTS).forEach(k => {
    if (map[k] !== undefined) result[k] = map[k];
  });
  return result;
}

export async function saveSettings(settings) {
  const items = Object.entries(settings).map(([key, value]) => ({ key, value }));
  return putManyToStore('settings', items);
}

export async function getDayData(year, month, day) {
  const id = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return getFromStore('days', id);
}

export async function saveDayData(year, month, day, data) {
  const id = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return putToStore('days', { id, year, month, day, ...data });
}

export async function getMonthData(year, month) {
  const all = await getAllFromStore('days');
  return all.filter(d => d.year === year && d.month === month);
}

export async function getAllData() {
  // Два отдельных запроса — каждый своя транзакция, без вложенных await
  const [days, settingsRows] = await Promise.all([
    getAllFromStore('days'),
    getAllFromStore('settings')
  ]);

  const months = {};
  for (const d of days) {
    const key = `${d.year}-${String(d.month).padStart(2,'0')}`;
    if (!months[key]) months[key] = { days: {} };
    months[key].days[String(d.day)] = {
      start: d.start || null,
      end: d.end || null,
      is_off: d.is_off || false,
      is_holiday: d.is_holiday || false,
      expenses: d.expenses || {},
      note: d.note || ''
    };
  }

  const settings = {};
  for (const row of settingsRows) {
    settings[row.key] = row.value;
  }

  return { settings, months };
}

export async function importData(data) {
  if (data.settings) {
    const items = Object.entries(data.settings).map(([key, value]) => ({ key, value }));
    await putManyToStore('settings', items);
  }
  if (data.months) {
    const dayItems = [];
    for (const [monthKey, monthData] of Object.entries(data.months)) {
      const [year, month] = monthKey.split('-').map(Number);
      for (const [dayStr, dayData] of Object.entries(monthData.days || {})) {
        const day = parseInt(dayStr);
        const id = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        dayItems.push({
          id, year, month, day,
          start: dayData.start || null,
          end: dayData.end || null,
          is_off: dayData.is_off || false,
          is_holiday: dayData.is_holiday || false,
          expenses: dayData.expenses || {},
          note: dayData.note || ''
        });
      }
    }
    if (dayItems.length > 0) {
      await putManyToStore('days', dayItems);
    }
  }
}
