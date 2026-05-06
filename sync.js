import { getAllData, importData } from './db.js';
import { showToast } from './app.js';

export async function exportJSON() {
  try {
    const data = await getAllData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'finance_data.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Данные экспортированы');
  } catch (e) {
    showToast('Ошибка экспорта: ' + e.message);
  }
}

export function importJSON(callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importData(data);
      showToast('Данные импортированы');
      if (callback) callback();
    } catch (err) {
      showToast('Ошибка импорта: ' + err.message);
    }
  };
  input.click();
}
