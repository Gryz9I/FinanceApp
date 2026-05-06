export function parseTime(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h + m / 60;
}

export function calcNetHours(start, end, settings) {
  if (!start || !end) return 0;
  let raw = parseTime(end) - parseTime(start);
  if (raw < 0) raw += 24;
  if (raw >= settings.break_rule_hours) raw -= settings.break_minutes / 60;
  return Math.max(0, raw);
}

export function calcOvertimeBreakdown(netHours, settings) {
  const threshold = settings.overtime_threshold ?? 9.0;
  if (netHours <= threshold) return { normalHours: netHours, overtime50: 0 };
  return { normalHours: threshold, overtime50: netHours - threshold };
}

export function calcUbHours(start, end, isWeekend, settings) {
  if (!isWeekend || !start || !end) return 0;
  const ubStart = settings.ub_start_hour ?? 13.0;
  let startH = parseTime(start);
  let endH = parseTime(end);
  if (endH < startH) endH += 24;
  return Math.max(0, endH - Math.max(startH, ubStart));
}

export function calcDayGross(netHours, isHoliday, isWeekend, start, end, settings) {
  const rate = settings.hourly_rate;
  const ubTillegg = settings.ub_tillegg ?? 22.0;

  let basePay, overtime50Pay = 0, normalHours, overtime50Hours = 0;

  if (isHoliday) {
    // Красный день — все часы ×200%
    basePay = netHours * rate * 2.0;
    normalHours = netHours;
  } else {
    const bd = calcOvertimeBreakdown(netHours, settings);
    normalHours = bd.normalHours;
    overtime50Hours = bd.overtime50;
    basePay = normalHours * rate;
    overtime50Pay = overtime50Hours * rate * 0.5; // надбавка 50% к ставке
  }

  const ubHours = calcUbHours(start, end, isWeekend, settings);
  const ubPay = ubHours * ubTillegg;

  return {
    normalHours,
    overtime50Hours,
    ubHours,
    basePay,
    overtime50Pay,
    ubPay,
    totalGross: basePay + overtime50Pay + ubPay,
    isHoliday
  };
}

export function calcGross(netHours, settings) {
  return netHours * settings.hourly_rate;
}

export function calcNetSalary(gross, settings) {
  return gross * (1 - settings.tax_rate);
}

export function calcMonthStats(days, settings) {
  let totalHours = 0;
  let workingDays = 0;
  let offDays = 0;
  let totalGross = 0;
  let totalOvertime50 = 0;
  let totalUbHours = 0;
  const totalExpenses = {};

  for (const entry of days) {
    if (entry.is_off) {
        offDays++;
        for (const [cat, amt] of Object.entries(entry.expenses || {})) {
          totalExpenses[cat] = (totalExpenses[cat] || 0) + amt;
        }
        continue;
      }
    if (entry.start && entry.end) {
      const nh = calcNetHours(entry.start, entry.end, settings);
      totalHours += nh;
      workingDays++;

      // weekday: 0=Mon … 6=Sun
      const wd = entry.weekday ?? 0;
      const isWeekend = wd >= 5;
      const isHoliday = !!entry.is_holiday;

      const dc = calcDayGross(nh, isHoliday, isWeekend, entry.start, entry.end, settings);
      totalGross += dc.totalGross;
      totalOvertime50 += dc.overtime50Hours;
      totalUbHours += dc.ubHours;
    }
    for (const [cat, amt] of Object.entries(entry.expenses || {})) {
      totalExpenses[cat] = (totalExpenses[cat] || 0) + amt;
    }
  }

  const net = calcNetSalary(totalGross, settings);
  const invested = totalExpenses['отложил'] || 0;
  const totalSpent = Object.entries(totalExpenses)
    .filter(([k]) => k !== 'отложил')
    .reduce((s, [, v]) => s + v, 0);

  return {
    totalHours,
    workingDays,
    offDays,
    totalOvertime50,
    totalUbHours,
    grossNok: totalGross,
    netNok: net,
    grossUsd: totalGross * settings.usd_rate,
    netUsd: net * settings.usd_rate,
    expenses: totalExpenses,
    totalSpent,
    invested,
    investedPct: net > 0 ? (invested / net * 100) : 0,
    spentPct: net > 0 ? (totalSpent / net * 100) : 0,
    balance: net - totalSpent
  };
}

export function fmt(n) {
  return Math.round(n).toLocaleString('ru-RU');
}

export function fmtH(n) {
  return n.toFixed(2).replace('.', ',');
}
