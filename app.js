import { getSettings, saveSettings, getDayData, saveDayData, getMonthData } from './db.js';
import { calcNetHours, calcGross, calcNetSalary, calcMonthStats, fmt, fmtH } from './calculator.js';
import { renderPieChart, renderBarChart } from './charts.js';
import { exportJSON, importJSON } from './sync.js';

const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                   'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const WD_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const WD_FULL = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];

let state = {
  page: 'home',
  year: new Date().getFullYear(),
  month: null,
  day: null,
  settings: null
};

export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

function weekday(y, m, d) {
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

async function navigate(page, params = {}) {
  state = { ...state, page, ...params };
  await render();
}

async function render() {
  const main = document.getElementById('main-content');
  const header = document.getElementById('page-header');
  const navBtns = document.querySelectorAll('.bottom-nav button');

  navBtns.forEach(b => b.classList.toggle('active',
    (state.page === 'home' && b.dataset.page === 'home') ||
    (state.page === 'stats' && b.dataset.page === 'stats') ||
    (state.page === 'settings' && b.dataset.page === 'settings')
  ));

  switch (state.page) {
    case 'home': await renderHome(main, header); break;
    case 'month': await renderMonth(main, header); break;
    case 'day': await renderDay(main, header); break;
    case 'stats': await renderStats(main, header); break;
    case 'settings': await renderSettings(main, header); break;
  }
}

async function renderHome(main, header) {
  header.innerHTML = `<h1>FinanceApp</h1>`;
  state.settings = await getSettings();
  const now = new Date();

  let html = `<div class="page">
    <div class="year-row">
      <button class="year-nav" id="prevYear">‹</button>
      <h2>${state.year}</h2>
      <button class="year-nav" id="nextYear">›</button>
    </div>
    <div class="month-grid">`;

  for (let m = 1; m <= 12; m++) {
    const days = await getMonthData(state.year, m);
    const stats = calcMonthStats(days, state.settings);
    const isCurrent = now.getFullYear() === state.year && now.getMonth() + 1 === m;
    const hasData = days.length > 0;
    const cls = isCurrent ? 'current' : hasData ? 'has-data' : '';
    const subInfo = hasData
      ? `<span class="mhours">${fmtH(stats.totalHours)} ч</span><span class="msalary">${fmt(stats.netNok)} kr</span>`
      : `<span class="mhours" style="color:var(--muted)">Нет данных</span>`;
    html += `<button class="month-btn ${cls}" data-m="${m}">
      <span class="mname">${MONTHS_RU[m-1]}</span>${subInfo}
    </button>`;
  }

  html += `</div></div>`;
  main.innerHTML = html;

  main.querySelectorAll('.month-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate('month', { month: parseInt(btn.dataset.m) }));
  });
  document.getElementById('prevYear').addEventListener('click', () => navigate('home', { year: state.year - 1 }));
  document.getElementById('nextYear').addEventListener('click', () => navigate('home', { year: state.year + 1 }));
}

async function renderMonth(main, header) {
  state.settings = await getSettings();
  const mName = MONTHS_RU[state.month - 1];
  header.innerHTML = `
    <button class="back-btn" id="backBtn">← Назад</button>
    <h1>${mName} ${state.year}</h1>`;

  const days = await getMonthData(state.year, state.month);
  const stats = calcMonthStats(days, state.settings);
  const dayMap = {};
  days.forEach(d => dayMap[d.day] = d);

  const total = daysInMonth(state.year, state.month);

  let summaryHtml = `<div class="month-summary">
    <div class="sum-item"><span class="slabel">Часов</span><span class="sval" style="color:var(--yellow)">${fmtH(stats.totalHours)}</span></div>
    <div class="sum-item"><span class="slabel">Нетто</span><span class="sval" style="color:var(--green)">${fmt(stats.netNok)} kr</span></div>
    <div class="sum-item"><span class="slabel">Нетто $</span><span class="sval" style="color:var(--teal)">$${fmt(stats.netUsd)}</span></div>
    <div class="sum-item"><span class="slabel">Расходы</span><span class="sval" style="color:var(--orange)">${fmt(stats.totalSpent)} kr</span></div>
    <div class="sum-item"><span class="slabel">Отложено</span><span class="sval" style="color:var(--blue)">${fmt(stats.invested)} kr</span></div>
    <div class="sum-item"><span class="slabel">Инвест.%</span><span class="sval" style="color:var(--accent)">${stats.investedPct.toFixed(1)}%</span></div>
  </div>`;

  let listHtml = '<div class="page">' + summaryHtml;
  for (let d = 1; d <= total; d++) {
    const wd = weekday(state.year, state.month, d);
    const isWknd = wd >= 5;
    const entry = dayMap[d];
    let cls = isWknd ? 'weekend' : '';
    let statusHtml = `<span class="dstatus" style="color:var(--muted)">Не заполнен</span>`;
    let expHtml = '';

    if (entry) {
      if (entry.is_off) {
        cls = 'is-off';
        statusHtml = `<span class="dstatus" style="color:var(--muted)">Выходной</span>`;
      } else if (entry.start) {
        cls = 'has-work';
        const nh = calcNetHours(entry.start, entry.end, state.settings);
        statusHtml = `<span class="dstatus">${entry.start}–${entry.end}</span><span class="dhours">${fmtH(nh)} ч</span>`;
        const totalExp = Object.values(entry.expenses || {}).reduce((a, b) => a + b, 0);
        if (totalExp > 0) expHtml = `<span class="day-exp">${fmt(totalExp)} kr</span>`;
      }
    }

    listHtml += `<div class="day-item ${cls}" data-d="${d}">
      <span class="day-num">${d}</span>
      <span class="day-wd">${WD_SHORT[wd]}</span>
      <div class="day-info">${statusHtml}</div>
      ${expHtml}
    </div>`;
  }
  listHtml += '</div>';

  main.innerHTML = listHtml;

  document.getElementById('backBtn').addEventListener('click', () => navigate('home'));
  main.querySelectorAll('.day-item').forEach(item => {
    item.addEventListener('click', () => navigate('day', { day: parseInt(item.dataset.d) }));
  });
}

async function renderDay(main, header) {
  state.settings = await getSettings();
  const wd = weekday(state.year, state.month, state.day);
  header.innerHTML = `
    <button class="back-btn" id="backBtn">← Назад</button>
    <h1>${state.day} ${MONTHS_RU[state.month-1]}</h1>`;

  const existing = await getDayData(state.year, state.month, state.day) || {};

  // Генерация опций для часов (00-23)
  const hourOptions = Array.from({ length: 24 }, (_, i) => {
    const val = i.toString().padStart(2, '0');
    return `<option value="${val}">${val}</option>`;
  }).join('');

  // Генерация опций для минут (00-59)
  const minuteOptions = Array.from({ length: 60 }, (_, i) => {
    const val = i.toString().padStart(2, '0');
    return `<option value="${val}">${val}</option>`;
  }).join('');

  // Разбор сохранённого времени для предустановки
  let startHour = '', startMin = '', endHour = '', endMin = '';
  if (existing.start) {
    [startHour, startMin] = existing.start.split(':');
  }
  if (existing.end) {
    [endHour, endMin] = existing.end.split(':');
  }

  const cats = state.settings.categories || [];
  let expInputs = cats.map(cat => {
    const val = existing.expenses ? (existing.expenses[cat] || '') : '';
    return `<div class="form-row">
      <label>${cat}</label>
      <input type="number" class="exp-input" data-cat="${cat}" placeholder="0" value="${val}" min="0" step="1">
    </div>`;
  }).join('');

  main.innerHTML = `<div class="page">
    <p style="color:var(--subtext);font-size:13px;margin-bottom:16px">${WD_FULL[wd]}, ${state.day} ${MONTHS_RU[state.month-1]} ${state.year}</p>

    <div class="toggle-row">
      <label class="toggle"><input type="checkbox" id="isOff" ${existing.is_off ? 'checked' : ''}><span class="slider"></span></label>
      <span class="toggle-label">Выходной день</span>
    </div>

    <div id="workSection" class="form-section card" style="${existing.is_off ? 'opacity:0.4;pointer-events:none' : ''}">
      <h3>Рабочее время</h3>
      
      <!-- Начало: селекты часов и минут -->
      <div class="form-row time-selector">
        <label>Начало</label>
        <select id="startHour" class="time-hour">${hourOptions}</select>
        <span>:</span>
        <select id="startMinute" class="time-minute">${minuteOptions}</select>
      </div>

      <!-- Конец: селекты часов и минут -->
      <div class="form-row time-selector">
        <label>Конец</label>
        <select id="endHour" class="time-hour">${hourOptions}</select>
        <span>:</span>
        <select id="endMinute" class="time-minute">${minuteOptions}</select>
      </div>

      <div class="calc-preview" id="calcPreview"></div>
    </div>

    <div class="form-section card">
      <h3>Расходы (NOK)</h3>
      ${expInputs}
    </div>

    <div class="form-section card">
      <h3>Примечание</h3>
      <input type="text" id="noteInput" placeholder="Доп. информация..." value="${existing.note || ''}">
    </div>

    <div class="btn-row">
      <button class="btn btn-primary btn-full" id="saveBtn">Сохранить</button>
    </div>
  </div>`;

  // Установка предварительно выбранных значений
  if (startHour) document.getElementById('startHour').value = startHour;
  if (startMin) document.getElementById('startMinute').value = startMin;
  if (endHour) document.getElementById('endHour').value = endHour;
  if (endMin) document.getElementById('endMinute').value = endMin;

  const isOffChk = document.getElementById('isOff');
  const workSection = document.getElementById('workSection');
  const startHourEl = document.getElementById('startHour');
  const startMinEl = document.getElementById('startMinute');
  const endHourEl = document.getElementById('endHour');
  const endMinEl = document.getElementById('endMinute');
  const preview = document.getElementById('calcPreview');

  function updatePreview() {
    const start = `${startHourEl.value}:${startMinEl.value}`;
    const end = `${endHourEl.value}:${endMinEl.value}`;
    if (startHourEl.value && startMinEl.value && endHourEl.value && endMinEl.value) {
      const nh = calcNetHours(start, end, state.settings);
      const gross = calcGross(nh, state.settings);
      const net = calcNetSalary(gross, state.settings);
      // Простая проверка на перерыв (упрощённо)
      const rawHours = parseFloat(endHourEl.value) + parseFloat(endMinEl.value)/60 - (parseFloat(startHourEl.value) + parseFloat(startMinEl.value)/60);
      const brk = nh < rawHours ? ' (−30 мин перерыв)' : '';
      preview.textContent = `${fmtH(nh)} ч${brk}  |  Брутто: ${fmt(gross)} kr  |  Нетто: ${fmt(net)} kr`;
    } else {
      preview.textContent = '';
    }
  }

  isOffChk.addEventListener('change', () => {
    workSection.style.opacity = isOffChk.checked ? '0.4' : '1';
    workSection.style.pointerEvents = isOffChk.checked ? 'none' : '';
  });

  [startHourEl, startMinEl, endHourEl, endMinEl].forEach(el => {
    el.addEventListener('change', updatePreview);
  });
  updatePreview();

  document.getElementById('backBtn').addEventListener('click', () => navigate('month'));
  document.getElementById('saveBtn').addEventListener('click', async () => {
    const expenses = {};
    document.querySelectorAll('.exp-input').forEach(inp => {
      const v = parseFloat(inp.value);
      if (v > 0) expenses[inp.dataset.cat] = v;
    });

    // Собираем время из селектов
    const start = `${startHourEl.value}:${startMinEl.value}`;
    const end = `${endHourEl.value}:${endMinEl.value}`;

    await saveDayData(state.year, state.month, state.day, {
      start: (startHourEl.value && startMinEl.value) ? start : null,
      end: (endHourEl.value && endMinEl.value) ? end : null,
      is_off: isOffChk.checked,
      expenses,
      note: document.getElementById('noteInput').value.trim()
    });
    showToast('Сохранено');
    navigate('month');
  });
}

async function renderStats(main, header) {
  state.settings = await getSettings();
  header.innerHTML = `<h1>Статистика ${state.year}</h1>`;

  const allStats = [];
  for (let m = 1; m <= 12; m++) {
    const days = await getMonthData(state.year, m);
    const s = calcMonthStats(days, state.settings);
    allStats.push({ ...s, month: m });
  }

  const yearNet = allStats.reduce((a, s) => a + s.netNok, 0);
  const yearHours = allStats.reduce((a, s) => a + s.totalHours, 0);
  const yearInvested = allStats.reduce((a, s) => a + s.invested, 0);

  let tableRows = allStats.map(s => {
    const hasData = s.totalHours > 0 || s.totalSpent > 0;
    return `<tr style="${!hasData ? 'opacity:0.4' : ''}">
      <td>${MONTHS_RU[s.month-1].slice(0,3)}</td>
      <td class="val-yellow">${fmtH(s.totalHours)}</td>
      <td class="val-green">${fmt(s.netNok)}</td>
      <td class="val-blue">$${fmt(s.netUsd)}</td>
      <td class="val-orange">${fmt(s.totalSpent)}</td>
      <td class="val-blue">${fmt(s.invested)}</td>
      <td style="color:var(--accent)">${s.investedPct.toFixed(0)}%</td>
    </tr>`;
  }).join('');

  const allExpenses = {};
  for (const s of allStats) {
    for (const [k, v] of Object.entries(s.expenses)) {
      allExpenses[k] = (allExpenses[k] || 0) + v;
    }
  }

  main.innerHTML = `<div class="page">
    <div class="card" style="margin-bottom:16px">
      <div class="month-summary" style="padding:0">
        <div class="sum-item"><span class="slabel">Часов / год</span><span class="sval" style="color:var(--yellow)">${fmtH(yearHours)}</span></div>
        <div class="sum-item"><span class="slabel">Нетто / год</span><span class="sval" style="color:var(--green)">${fmt(yearNet)} kr</span></div>
        <div class="sum-item"><span class="slabel">Инвест. / год</span><span class="sval" style="color:var(--blue)">${fmt(yearInvested)} kr</span></div>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;gap:12px;margin-bottom:10px">
        <button class="btn btn-secondary" id="tabTable" style="flex:1">Таблица</button>
        <button class="btn btn-secondary" id="tabPie" style="flex:1">Расходы</button>
        <button class="btn btn-secondary" id="tabBar" style="flex:1">Месяцы</button>
      </div>
      <div id="statsContent"></div>
    </div>
  </div>`;

  const content = document.getElementById('statsContent');

  function showTable() {
    content.innerHTML = `<div style="overflow-x:auto">
      <table class="stat-table">
        <thead><tr>
          <th>Мес.</th><th>Часов</th><th>Нетто</th><th>USD</th><th>Расх.</th><th>Инвест.</th><th>%</th>
        </tr></thead>
        <tbody>
          ${tableRows}
          <tr class="total-row">
            <td>Итого</td><td>${fmtH(yearHours)}</td><td>${fmt(yearNet)} kr</td>
            <td>—</td><td>—</td><td>${fmt(yearInvested)} kr</td><td>—</td>
          </tr>
        </tbody>
      </table>
    </div>`;
  }

  function showPie() {
    content.innerHTML = `<div class="chart-container"><canvas id="pieCanvas"></canvas></div>`;
    requestAnimationFrame(() => renderPieChart('pieCanvas', allExpenses));
  }

  function showBar() {
    content.innerHTML = `<div class="chart-container"><canvas id="barCanvas"></canvas></div>`;
    requestAnimationFrame(() => renderBarChart('barCanvas', allStats, state.year));
  }

  document.getElementById('tabTable').addEventListener('click', showTable);
  document.getElementById('tabPie').addEventListener('click', showPie);
  document.getElementById('tabBar').addEventListener('click', showBar);
  showTable();
}

async function renderSettings(main, header) {
  state.settings = await getSettings();
  header.innerHTML = `<h1>Настройки</h1>`;

  const cats = state.settings.categories || [];
  const catItems = cats.map((c, i) => `
    <div class="cat-item" data-i="${i}">
      <input type="text" class="cat-name" value="${c}">
      <button class="del-btn" data-i="${i}">✕</button>
    </div>`).join('');

  main.innerHTML = `<div class="page">
    <div class="card">
      <div class="section-title" style="font-size:15px;margin-bottom:12px">Финансовые параметры</div>
      <div class="form-row"><label>Ставка (NOK)</label><input type="number" id="rateInput" value="${state.settings.hourly_rate}" step="0.01"></div>
      <div class="form-row"><label>Налог (%)</label><input type="number" id="taxInput" value="${(state.settings.tax_rate * 100).toFixed(0)}" step="1"></div>
      <div class="form-row"><label>NOK → USD</label><input type="number" id="usdInput" value="${state.settings.usd_rate}" step="0.00001"></div>
    </div>

    <div class="card">
      <div class="section-title" style="font-size:15px;margin-bottom:12px">Категории расходов</div>
      <div class="cat-list" id="catList">${catItems}</div>
      <div class="form-row" style="margin-top:8px">
        <input type="text" id="newCat" placeholder="Новая категория...">
        <button class="btn btn-primary" id="addCatBtn" style="margin-left:8px;white-space:nowrap">+</button>
      </div>
    </div>

    <div class="card">
      <div class="section-title" style="font-size:15px;margin-bottom:12px">Синхронизация</div>
      <div class="btn-row">
        <button class="btn btn-primary" id="exportBtn" style="flex:1">Экспорт JSON</button>
        <button class="btn btn-success" id="importBtn" style="flex:1">Импорт JSON</button>
      </div>
    </div>

    <button class="btn btn-primary btn-full" id="saveSettBtn" style="margin-top:8px">Сохранить настройки</button>
  </div>`;

  document.getElementById('addCatBtn').addEventListener('click', () => {
    const v = document.getElementById('newCat').value.trim();
    if (!v) return;
    const list = document.getElementById('catList');
    const i = list.children.length;
    const div = document.createElement('div');
    div.className = 'cat-item';
    div.dataset.i = i;
    div.innerHTML = `<input type="text" class="cat-name" value="${v}"><button class="del-btn" data-i="${i}">✕</button>`;
    div.querySelector('.del-btn').addEventListener('click', () => div.remove());
    list.appendChild(div);
    document.getElementById('newCat').value = '';
  });

  document.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.closest('.cat-item').remove());
  });

  document.getElementById('exportBtn').addEventListener('click', () => exportJSON());
  document.getElementById('importBtn').addEventListener('click', () => importJSON(async () => {
    state.settings = await getSettings();
    await navigate('settings');
  }));

  document.getElementById('saveSettBtn').addEventListener('click', async () => {
    const rate = parseFloat(document.getElementById('rateInput').value) || 256.14;
    const tax = parseFloat(document.getElementById('taxInput').value) / 100 || 0.25;
    const usd = parseFloat(document.getElementById('usdInput').value) || 0.10446;
    const categories = [...document.querySelectorAll('.cat-name')].map(i => i.value.trim()).filter(Boolean);
    await saveSettings({ ...state.settings, hourly_rate: rate, tax_rate: tax, usd_rate: usd, categories });
    showToast('Настройки сохранены');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  document.querySelectorAll('.bottom-nav button').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  await navigate('home');
});