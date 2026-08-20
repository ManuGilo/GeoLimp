/* ==========================================================================
   GeoLimp - Dashboard and Chart.js Reporting Module
   ========================================================================== */

import { db } from './db.js';
import { DEFAULT_GOALS } from './mockData.js';

let chartCurvaS = null;
let chartProdPeriodo = null;
let chartTeamsComparison = null;
let chartTeamsEfficiency = null;

/**
 * Initializes and updates all dashboard metrics and Chart.js graphs.
 */
export async function initDashboard() {
  const stretches = await db.getAll('trechos');
  const diaries = await db.getAll('diarios');
  
  // Fetch metas (operational goals)
  let goals = await db.get('metas', 'goals');
  if (!goals) {
    goals = DEFAULT_GOALS;
    await db.put('metas', goals);
  }

  // Update configuration fields in settings if available
  const setArea = document.getElementById('set-goal-area');
  if (setArea && !setArea.dataset.loaded) {
    setArea.value = goals.area;
    document.getElementById('set-goal-ext').value = goals.extension;
    document.getElementById('set-goal-bags').value = goals.bags;
    document.getElementById('set-goal-vol').value = goals.volume;
    setArea.dataset.loaded = 'true';
  }

  // 1. PHYSICAL PROGRESS CALCULATIONS
  const totalAreaPlanned = stretches.reduce((sum, s) => sum + s.area, 0);
  const totalExtPlanned = stretches.reduce((sum, s) => sum + s.extension, 0);

  // Executed is sum of logs
  const totalAreaDone = diaries.reduce((sum, d) => sum + d.area, 0);
  const totalExtDone = diaries.reduce((sum, d) => sum + d.extension, 0);

  const areaRemaining = Math.max(0, totalAreaPlanned - totalAreaDone);
  const extRemaining = Math.max(0, totalExtPlanned - totalExtDone);

  const areaPct = totalAreaPlanned > 0 ? Math.round((totalAreaDone / totalAreaPlanned) * 100) : 0;
  const extPct = totalExtPlanned > 0 ? Math.round((totalExtDone / totalExtPlanned) * 100) : 0;

  // Update Physical Progress UI
  document.getElementById('dash-area-pct').innerText = `${areaPct}%`;
  document.getElementById('dash-area-bar').style.width = `${Math.min(100, areaPct)}%`;
  document.getElementById('dash-area-total').innerText = `${totalAreaPlanned.toLocaleString()} m²`;
  document.getElementById('dash-area-done').innerText = `${totalAreaDone.toLocaleString()} m²`;
  document.getElementById('dash-area-remaining').innerText = `${areaRemaining.toLocaleString()} m²`;

  document.getElementById('dash-ext-pct').innerText = `${extPct}%`;
  document.getElementById('dash-ext-bar').style.width = `${Math.min(100, extPct)}%`;
  document.getElementById('dash-ext-total').innerText = `${totalExtPlanned.toLocaleString()} m`;
  document.getElementById('dash-ext-done').innerText = `${totalExtDone.toLocaleString()} m`;
  document.getElementById('dash-ext-remaining').innerText = `${extRemaining.toLocaleString()} m`;

  // 2. WASTE CALCULATIONS
  const totalBags = diaries.reduce((sum, d) => sum + d.bags, 0);
  const totalVol = diaries.reduce((sum, d) => sum + d.volume, 0);
  
  // Calculate unique days worked
  const uniqueDates = [...new Set(diaries.map(d => d.date))];
  const daysWorked = uniqueDates.length || 1;
  const avgBagsDaily = Math.round(totalBags / daysWorked);

  document.getElementById('dash-resid-bags').innerText = totalBags.toLocaleString();
  document.getElementById('dash-resid-vol').innerText = totalVol.toFixed(1);
  document.getElementById('dash-resid-avg-daily').innerText = `${avgBagsDaily} sacos/dia`;

  // 3. DEADLINE CALCULATIONS
  const totalProjectDays = 30; // Mock fixed timeline parameter
  const daysRemaining = Math.max(0, totalProjectDays - daysWorked);

  document.getElementById('dash-days-worked').innerText = daysWorked;
  document.getElementById('dash-days-left').innerText = daysRemaining;

  // 4. GOALS METRICS DISPLAY (IF PRESENT)
  const goalAreaVal = document.getElementById('dash-goal-area-val');
  if (goalAreaVal) {
    goalAreaVal.innerText = `${goals.area} m²`;
    document.getElementById('dash-goal-ext-val').innerText = `${goals.extension} m`;
    document.getElementById('dash-goal-bags-val').innerText = `${goals.bags} sacos`;
    document.getElementById('dash-goal-vol-val').innerText = `${goals.volume} m³`;

    const dailyAvgArea = totalAreaDone / daysWorked;
    const dailyAvgExt = totalExtDone / daysWorked;
    const dailyAvgBags = totalBags / daysWorked;
    const dailyAvgVol = totalVol / daysWorked;

    const ratio = (
      (dailyAvgArea / goals.area) + 
      (dailyAvgExt / goals.extension) + 
      (dailyAvgBags / goals.bags) + 
      (dailyAvgVol / goals.volume)
    ) / 4;

    const goalBadge = document.getElementById('dash-goal-status-badge');
    if (goalBadge) {
      goalBadge.className = 'goal-indicator-badge';
      if (ratio >= 1.0) {
        goalBadge.classList.add('above-meta');
        goalBadge.querySelector('.text').innerText = 'Acima da Meta';
      } else if (ratio >= 0.8) {
        goalBadge.classList.add('within-meta');
        goalBadge.querySelector('.text').innerText = 'Dentro da Faixa';
      } else {
        goalBadge.classList.add('below-meta');
        goalBadge.querySelector('.text').innerText = 'Abaixo da Meta';
      }
    }
  }

  // 5. RECORDS CALCULATIONS (IF PRESENT)
  const bestDayValEl = document.getElementById('dash-best-day-val');
  if (bestDayValEl) {
    const productionByDate = {};
    diaries.forEach(d => {
      if (!productionByDate[d.date]) productionByDate[d.date] = 0;
      productionByDate[d.date] += d.area;
    });

    let bestDayDate = '-';
    let bestDayVal = 0;
    let worstDayDate = '-';
    let worstDayVal = Infinity;

    Object.entries(productionByDate).forEach(([date, val]) => {
      if (val > bestDayVal) {
        bestDayVal = val;
        bestDayDate = date;
      }
      if (val < worstDayVal && val > 0) {
        worstDayVal = val;
        worstDayDate = date;
      }
    });

    if (worstDayVal === Infinity) worstDayVal = 0;

    const formatDateLabel = (dStr) => {
      if (dStr === '-') return '-';
      const p = dStr.split('-');
      return p.length === 3 ? `${p[2]}/${p[1]}` : dStr;
    };

    bestDayValEl.innerText = `${bestDayVal} m²`;
    document.getElementById('dash-best-day-date').innerText = formatDateLabel(bestDayDate);
    document.getElementById('dash-worst-day-val').innerText = `${worstDayVal} m²`;
    document.getElementById('dash-worst-day-date').innerText = formatDateLabel(worstDayDate);
  }

  // 6. RENDER CHARTS
  renderCurvaS(diaries, totalAreaPlanned);
  renderProductivityPeriod(diaries);
  renderTeamPerformance(diaries);
}

/**
 * Renders the physical progress curve S (Cumulative planned vs realized)
 */
function renderCurvaS(diaries, totalPlannedArea) {
  const ctx = document.getElementById('chart-curva-s').getContext('2d');
  
  if (chartCurvaS) {
    chartCurvaS.destroy();
  }

  // Generate date series from sorted logs
  const sortedDates = [...new Set(diaries.map(d => d.date))].sort();
  if (sortedDates.length === 0) return;

  // Calculate cumulative real production
  let cumulativeReal = 0;
  const realizedData = [];
  const plannedData = [];

  // Assuming linear distribution for target planned progress
  const stepTarget = totalPlannedArea / Math.max(1, sortedDates.length);

  sortedDates.forEach((date, index) => {
    const dayLogs = diaries.filter(d => d.date === date);
    const dayArea = dayLogs.reduce((sum, d) => sum + d.area, 0);
    cumulativeReal += dayArea;

    realizedData.push(cumulativeReal);
    plannedData.push(Math.round(stepTarget * (index + 1)));
  });

  const formattedLabels = sortedDates.map(d => {
    const parts = d.split('-');
    return `${parts[2]}/${parts[1]}`;
  });

  chartCurvaS = new Chart(ctx, {
    type: 'line',
    data: {
      labels: formattedLabels,
      datasets: [
        {
          label: 'Progresso Realizado (m²)',
          data: realizedData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.25,
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: '#10b981'
        },
        {
          label: 'Planejado Linear (m²)',
          data: plannedData,
          borderColor: '#0ea5e9',
          borderDash: [5, 5],
          fill: false,
          tension: 0.1,
          borderWidth: 2,
          pointRadius: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#f3f4f6', font: { family: 'Outfit' } }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
        }
      }
    }
  });
}

/**
 * Renders Productivity by Period (Bar for area, Line for bags)
 */
function renderProductivityPeriod(diaries) {
  const ctx = document.getElementById('chart-produtividade-periodo').getContext('2d');
  
  if (chartProdPeriodo) {
    chartProdPeriodo.destroy();
  }

  // Get last 7 active dates
  const sortedDates = [...new Set(diaries.map(d => d.date))].sort().slice(-7);
  if (sortedDates.length === 0) return;

  const areaData = [];
  const bagsData = [];

  sortedDates.forEach(date => {
    const dayLogs = diaries.filter(d => d.date === date);
    const dayArea = dayLogs.reduce((sum, d) => sum + d.area, 0);
    const dayBags = dayLogs.reduce((sum, d) => sum + d.bags, 0);

    areaData.push(dayArea);
    bagsData.push(dayBags);
  });

  const formattedLabels = sortedDates.map(d => {
    const parts = d.split('-');
    return `${parts[2]}/${parts[1]}`;
  });

  chartProdPeriodo = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: formattedLabels,
      datasets: [
        {
          label: 'Área Limpa (m²)',
          data: areaData,
          backgroundColor: '#38bdf8',
          borderRadius: 4,
          order: 2
        },
        {
          label: 'Sacos Coletados',
          data: bagsData,
          borderColor: '#f43f5e',
          borderWidth: 3,
          type: 'line',
          fill: false,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#f43f5e',
          order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#f3f4f6', font: { family: 'Outfit' } }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
        }
      }
    }
  });
}

/**
 * Renders Team performance metrics (Grouped Bars + Efficiency Charts)
 */
function renderTeamPerformance(diaries) {
  const teamsList = ['Equipe A', 'Equipe B', 'Equipe C', 'Equipe D'];
  
  // Calculate Totals per team
  const teamArea = {};
  const teamExt = {};
  const teamHours = {};
  const teamResid = {};

  teamsList.forEach(t => {
    teamArea[t] = 0;
    teamExt[t] = 0;
    teamHours[t] = 0;
    teamResid[t] = 0;
  });

  diaries.forEach(d => {
    if (teamArea[d.team] !== undefined) {
      teamArea[d.team] += d.area;
      teamExt[d.team] += d.extension;
      teamHours[d.team] += (d.workers * d.hours);
      teamResid[d.team] += d.volume;
    }
  });

  // 1. Teams Comparison Chart (Area vs Extension)
  const ctxComp = document.getElementById('chart-teams-comparison').getContext('2d');
  if (chartTeamsComparison) chartTeamsComparison.destroy();

  chartTeamsComparison = new Chart(ctxComp, {
    type: 'bar',
    data: {
      labels: ['Eq. Alfa', 'Eq. Beta', 'Eq. Gama', 'Eq. Delta'],
      datasets: [
        {
          label: 'Área Total (m²)',
          data: teamsList.map(t => teamArea[t]),
          backgroundColor: '#0ea5e9',
          borderRadius: 4
        },
        {
          label: 'Extensão Total (m)',
          data: teamsList.map(t => teamExt[t]),
          backgroundColor: '#06b6d4',
          borderRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#f3f4f6', font: { family: 'Outfit' } }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
        }
      }
    }
  });

  // 2. Teams Efficiency Chart (m²/Man-Hour)
  const ctxEff = document.getElementById('chart-teams-efficiency').getContext('2d');
  if (chartTeamsEfficiency) chartTeamsEfficiency.destroy();

  const efficiencyData = teamsList.map(t => {
    const mh = teamHours[t];
    return mh > 0 ? parseFloat((teamArea[t] / mh).toFixed(2)) : 0;
  });

  chartTeamsEfficiency = new Chart(ctxEff, {
    type: 'bar',
    data: {
      labels: ['Eq. Alfa', 'Eq. Beta', 'Eq. Gama', 'Eq. Delta'],
      datasets: [
        {
          label: 'm²/Homem-Hora',
          data: efficiencyData,
          backgroundColor: '#10b981',
          borderRadius: 4
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#f3f4f6', font: { family: 'Outfit' } }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
        }
      }
    }
  });

  // 3. Populate Team Summary Table
  const tbody = document.getElementById('teams-summary-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    
    teamsList.forEach(t => {
      const mh = teamHours[t];
      const areaVal = teamArea[t];
      const extVal = teamExt[t];
      const resVal = teamResid[t];
      const yieldAvg = mh > 0 ? (areaVal / (mh / 5)).toFixed(1) : '0'; // standard 5 worker yield
      
      // Determine badge status
      let badge = '<span class="badge text-danger" style="background: rgba(239,68,68,0.15)">🔴 Baixo</span>';
      if (mh > 0) {
        const eff = areaVal / mh;
        if (eff >= 4.5) badge = '<span class="badge text-success" style="background: rgba(16,185,129,0.15)">🟢 Excelente</span>';
        else if (eff >= 3.0) badge = '<span class="badge text-warning" style="background: rgba(234,179,8,0.15)">🟡 Médio</span>';
      }

      const row = document.createElement('tr');
      row.innerHTML = `
        <td><strong>${t.replace('Equipe ', 'Equipe ')}</strong></td>
        <td>${areaVal.toLocaleString()} m²</td>
        <td>${extVal.toLocaleString()} m</td>
        <td>${resVal.toFixed(1)} m³</td>
        <td>${mh} H-H</td>
        <td>${yieldAvg} m²/dia-eq</td>
        <td>${badge}</td>
      `;
      tbody.appendChild(row);
    });
  }
}
