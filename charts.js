let pieChart = null;
let barChart = null;

export function renderPieChart(canvasId, expenses) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (pieChart) { pieChart.destroy(); pieChart = null; }

  const labels = Object.keys(expenses).filter(k => expenses[k] > 0);
  const values = labels.map(k => expenses[k]);

  if (!values.length) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#585b70';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Нет данных', canvas.width / 2, canvas.height / 2);
    return;
  }

  const colors = ['#4e9af1','#f1c44e','#f17b4e','#4ef18a','#f14e9a','#9a4ef1','#4ef1f1','#f1f14e','#f19a4e'];

  pieChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderColor: '#1e1e2e', borderWidth: 2 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: '#a6adc8', font: { size: 11 }, padding: 10, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${Math.round(ctx.parsed).toLocaleString('ru-RU')} kr`
          }
        }
      }
    }
  });
}

export function renderBarChart(canvasId, monthsData, year) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (barChart) { barChart.destroy(); barChart = null; }

  const shortMonths = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
  const labels = monthsData.map(m => shortMonths[m.month - 1]);
  const nets = monthsData.map(m => Math.round(m.netNok));
  const spents = monthsData.map(m => Math.round(m.totalSpent));
  const invested = monthsData.map(m => Math.round(m.invested));

  barChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'ЗП нетто', data: nets, backgroundColor: '#4e9af1aa', borderColor: '#4e9af1', borderWidth: 1 },
        { label: 'Расходы', data: spents, backgroundColor: '#f17b4eaa', borderColor: '#f17b4e', borderWidth: 1 },
        { label: 'Инвестиции', data: invested, backgroundColor: '#4ef18aaa', borderColor: '#4ef18a', borderWidth: 1 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#a6adc8', font: { size: 10 }, boxWidth: 10 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('ru-RU')} kr`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#a6adc8', font: { size: 10 } }, grid: { color: '#313244' } },
        y: { ticks: { color: '#a6adc8', font: { size: 10 }, callback: v => (v/1000).toFixed(0)+'k' }, grid: { color: '#313244' } }
      }
    }
  });
}
