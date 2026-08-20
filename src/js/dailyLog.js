/* ==========================================================================
   GeoLimp - Daily Operations Log Module (Diário de Obras)
   ========================================================================== */

import { db } from './db.js';
import { showToast, getActiveRole, refreshAllViews } from './utils.js';

/**
 * Initializes listeners and populates tables for the Daily Log tab.
 */
export function initDailyLogs() {
  const form = document.getElementById('daily-log-form');
  if (!form) return;

  // Set default date to today
  document.getElementById('log-date').value = new Date().toISOString().split('T')[0];

  // Load select options
  populateStretchOptions();

  // Load initial logs table
  loadLogsTable();

  // Setup Form Submission
  form.offscreenSubmit = true; // flag to prevent duplicate bindings if called twice
  form.removeEventListener('submit', handleLogSubmit);
  form.addEventListener('submit', handleLogSubmit);

  // Setup Filter listeners
  document.getElementById('filter-log-date').removeEventListener('change', loadLogsTable);
  document.getElementById('filter-log-date').addEventListener('change', loadLogsTable);

  document.getElementById('filter-log-stretch').removeEventListener('change', loadLogsTable);
  document.getElementById('filter-log-stretch').addEventListener('change', loadLogsTable);

  // Form Reset button
  document.getElementById('btn-reset-log-form').addEventListener('click', () => {
    form.reset();
    document.getElementById('log-id').value = '';
    document.getElementById('log-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('daily-log-form-title').innerText = 'Registrar Produção Diária';
  });
}

/**
 * Fetch stretches and populate the dropdown selectors (form and filter)
 */
export async function populateStretchOptions() {
  const stretches = await db.getAll('trechos');
  
  const formSelect = document.getElementById('log-stretch');
  const filterSelect = document.getElementById('filter-log-stretch');
  const photoFormSelect = document.getElementById('photo-stretch');
  const photoFilterSelect = document.getElementById('filter-photo-stretch');
  const timelineFilterSelect = document.getElementById('timeline-filter-stretch');

  const populate = (el, defaultText) => {
    if (!el) return;
    el.innerHTML = `<option value="">${defaultText}</option>`;
    stretches.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.innerText = `${s.code} - ${s.name}`;
      el.appendChild(opt);
    });
  };

  populate(formSelect, 'Selecione um trecho...');
  populate(filterSelect, 'Filtrar trecho...');
  populate(photoFormSelect, 'Selecione um trecho...');
  populate(photoFilterSelect, 'Filtrar por trecho...');
  populate(timelineFilterSelect, 'Todos os trechos');
}

/**
 * Handles insertion or editing of an operational daily log
 */
async function handleLogSubmit(e) {
  e.preventDefault();
  
  const role = getActiveRole();
  if (role === 'visualizador') {
    showToast('Permissão Negada: Visualizadores não podem registrar dados.', 'error');
    return;
  }

  const idStr = document.getElementById('log-id').value;
  const date = document.getElementById('log-date').value;
  const stretchId = document.getElementById('log-stretch').value;
  const team = document.getElementById('log-team').value;
  const workers = parseInt(document.getElementById('log-workers').value);
  const hours = parseFloat(document.getElementById('log-hours').value);
  const start = document.getElementById('log-start-time').value;
  const end = document.getElementById('log-end-time').value;
  const area = parseFloat(document.getElementById('log-area').value);
  const extension = parseFloat(document.getElementById('log-ext').value);
  const bags = parseInt(document.getElementById('log-bags').value) || 0;
  const volume = parseFloat(document.getElementById('log-volume').value) || 0;
  const weather = document.getElementById('log-weather').value;
  const equipments = document.getElementById('log-equipments').value;
  const status = document.getElementById('log-status').value;
  const observations = document.getElementById('log-obs').value;

  const logData = {
    date,
    stretchId,
    team,
    workers,
    hours,
    start,
    end,
    area,
    extension,
    bags,
    volume,
    weather,
    equipments,
    status,
    observations
  };

  if (idStr) {
    logData.id = parseInt(idStr);
  }

  try {
    // 1. Put log in DB
    await db.put('diarios', logData);
    
    // 2. Automatically update the stretch status on map
    const stretch = await db.get('trechos', stretchId);
    if (stretch) {
      stretch.status = status;
      await db.put('trechos', stretch);
    }

    showToast('Registro diário salvo com sucesso!', 'success');
    
    // Reset Form
    document.getElementById('daily-log-form').reset();
    document.getElementById('log-id').value = '';
    document.getElementById('log-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('daily-log-form-title').innerText = 'Registrar Produção Diária';

    // Refresh Map and Views
    refreshAllViews();
  } catch (err) {
    console.error(err);
    showToast('Erro ao salvar registro no banco de dados.', 'error');
  }
}

/**
 * Fetch and load operational logs into the history table
 */
export async function loadLogsTable() {
  const tbody = document.getElementById('logs-table-body');
  if (!tbody) return;

  const logs = await db.getAll('diarios');
  const stretches = await db.getAll('trechos');

  // Filter values
  const filterDate = document.getElementById('filter-log-date').value;
  const filterStretch = document.getElementById('filter-log-stretch').value;

  // Map stretches to code dictionary for fast access
  const stretchDict = {};
  stretches.forEach(s => { stretchDict[s.id] = s.code; });

  // Filter logs list
  const filteredLogs = logs.filter(log => {
    if (filterDate && log.date !== filterDate) return false;
    if (filterStretch && log.stretchId !== filterStretch) return false;
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date)); // Newest first

  tbody.innerHTML = '';

  if (filteredLogs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">Nenhum registro encontrado.</td></tr>';
    return;
  }

  const role = getActiveRole();

  filteredLogs.forEach(log => {
    const row = document.createElement('tr');
    
    // Parse date DD/MM/YYYY
    const parts = log.date.split('-');
    const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : log.date;

    const stretchCode = stretchDict[log.stretchId] || 'Trecho Removido';

    row.innerHTML = `
      <td>${formattedDate}</td>
      <td><strong>${stretchCode}</strong></td>
      <td>${log.team}</td>
      <td>${log.area} m²</td>
      <td>${log.extension} m</td>
      <td>${log.bags}</td>
      <td>${log.volume.toFixed(1)} m³</td>
      <td>${log.hours} h (${log.workers} trab.)</td>
      <td><span class="text-xs">${log.weather}</span></td>
      <td>
        <div class="flex gap-1">
          <button class="btn btn-secondary btn-icon-sm" title="Editar Registro" onclick="editDailyLog(${log.id})">
            <i data-lucide="edit-2"></i>
          </button>
          <button class="btn btn-danger btn-icon-sm" title="Excluir Registro" onclick="deleteDailyLog(${log.id})">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    `;

    // Handle Viewer restriction
    if (role === 'visualizador') {
      row.querySelector('td:last-child').innerHTML = '<span class="text-muted">-</span>';
    }

    tbody.appendChild(row);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// Attach functions to global window for inline onclick accessibility
window.editDailyLog = async function(id) {
  const role = getActiveRole();
  if (role === 'visualizador') {
    showToast('Permissão Negada.', 'error');
    return;
  }

  const log = await db.get('diarios', id);
  if (!log) return;

  // Fill form with values
  document.getElementById('log-id').value = log.id;
  document.getElementById('log-date').value = log.date;
  document.getElementById('log-stretch').value = log.stretchId;
  document.getElementById('log-team').value = log.team;
  document.getElementById('log-workers').value = log.workers;
  document.getElementById('log-hours').value = log.hours;
  document.getElementById('log-start-time').value = log.start || '07:30';
  document.getElementById('log-end-time').value = log.end || '16:30';
  document.getElementById('log-area').value = log.area;
  document.getElementById('log-ext').value = log.extension;
  document.getElementById('log-bags').value = log.bags;
  document.getElementById('log-volume').value = log.volume;
  document.getElementById('log-weather').value = log.weather;
  document.getElementById('log-equipments').value = log.equipments || '';
  document.getElementById('log-status').value = log.status || 'em-andamento';
  document.getElementById('log-obs').value = log.observations || '';

  // Update Title
  document.getElementById('daily-log-form-title').innerText = 'Editar Registro Diário';
  
  // Slide logs panel scroll to top form
  document.getElementById('daily-log-form-container').scrollIntoView({ behavior: 'smooth' });
};

window.deleteDailyLog = async function(id) {
  const role = getActiveRole();
  if (role !== 'admin') {
    showToast('Apenas administradores podem excluir diários de obra.', 'error');
    return;
  }

  if (confirm('Deseja excluir permanentemente este registro diário de obra?')) {
    await db.delete('diarios', id);
    showToast('Registro excluído com sucesso.', 'success');
    refreshAllViews();
  }
};
