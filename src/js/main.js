/* ==========================================================================
   GeoLimp - Main Application Entry Point & Router
   Orchestrates all modules, manages navigation, permissions and global utilities.
   ========================================================================== */

import { db } from './db.js';
import { MOCK_STRETCHES, MOCK_DIARIOS, MOCK_PHOTOS, DEFAULT_GOALS } from './mockData.js';
import { initMap, loadStretchesOnMap } from './map.js';
import { initDashboard } from './dashboard.js';
import { initDailyLogs } from './dailyLog.js';
import { initPhotos } from './photos.js';
import { initTimeline } from './timeline.js';
import { initReports } from './reports.js';
import { showToast as _utilShowToast } from './utils.js';

// ===========================================================================
// GLOBAL STATE
// ===========================================================================

let _activeRole = 'admin'; // 'admin' | 'visualizador'
let _activeTab = 'map';
let _modulesInitialized = new Set();

// Tab metadata: title, subtitle for header display
const TAB_META = {
  map:       { title: 'Mapa Operacional',      subtitle: 'Acompanhamento e edicao georreferenciada de canais' },
  dashboard: { title: 'Dashboard Executivo',   subtitle: 'Indicadores de produtividade, metas e curva de avanco' },
  logs:      { title: 'Diario de Obras',       subtitle: 'Registro diario de producao por equipe e trecho' },
  photos:    { title: 'Galeria de Fotos',      subtitle: 'Evidencias fotograficas georreferenciadas por etapa' },
  timeline:  { title: 'Linha do Tempo',        subtitle: 'Historico cronologico de execucao com filtros avancados' },
  teams:     { title: 'Comparacao de Equipes', subtitle: 'Desempenho, produtividade e metas por equipe' },
  reports:   { title: 'Relatorios PDF',        subtitle: 'Exportacao de relatorios executivos e comparativos' },
  settings:  { title: 'Configuracoes e Metas', subtitle: 'Parametros operacionais, metas diarias e perfil de acesso' },
};

// Permission matrix
const PERMISSIONS = {
  admin:        { canEdit: true,  canDelete: true,  canExport: true, canSettings: true,  canDraw: true  },
  visualizador: { canEdit: false, canDelete: false, canExport: true, canSettings: false, canDraw: false },
};

// ===========================================================================
// PUBLIC EXPORTS
// ===========================================================================

export function getActiveRole() {
  return _activeRole;
}

export function hasPermission(perm) {
  return !!(PERMISSIONS[_activeRole] && PERMISSIONS[_activeRole][perm]);
}

export function showToast(message, type = 'info', duration = 3500) {
  _utilShowToast(message, type, duration);
}

function _dismissToast(toast) {
  toast.classList.remove('toast-visible');
  toast.classList.add('toast-exit');
  toast.addEventListener('transitionend', () => toast.remove(), { once: true });
}

export async function refreshAllViews() {
  if (_modulesInitialized.has('map')) loadStretchesOnMap();
  if (_modulesInitialized.has('dashboard') || _modulesInitialized.has('teams')) initDashboard();
  if (_modulesInitialized.has('photos')) loadPhotoGallery();
  if (window.lucide) window.lucide.createIcons();
}

// ===========================================================================
// NAVIGATION / ROUTER
// ===========================================================================

export function navigateTo(tabName) {
  if (!TAB_META[tabName]) return;

  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const panel = document.getElementById(`${tabName}-tab`);
  if (panel) panel.classList.add('active');

  const navLink = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
  if (navLink) navLink.classList.add('active');

  const meta = TAB_META[tabName];
  const titleEl = document.getElementById('current-tab-title');
  const subtitleEl = document.getElementById('current-tab-subtitle');
  if (titleEl) titleEl.textContent = meta.title;
  if (subtitleEl) subtitleEl.textContent = meta.subtitle;

  _activeTab = tabName;
  _initModuleForTab(tabName);

  if (tabName === 'map') {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
  }

  if (window.innerWidth <= 768) {
    document.querySelector('.sidebar')?.classList.remove('sidebar-open');
  }
}

async function _initModuleForTab(tabName) {
  if (_modulesInitialized.has(tabName)) return;
  _modulesInitialized.add(tabName);

  try {
    switch (tabName) {
      case 'map':       initMap();            break;
      case 'dashboard':
      case 'teams':     await initDashboard(); break;
      case 'logs':      initDailyLogs();      break;
      case 'photos':    initPhotos();         break;
      case 'timeline':  initTimeline();       break;
      case 'reports':   initReports();        break;
      case 'settings':  _initSettings();      break;
    }
  } catch (err) {
    console.error(`[GeoLimp] Failed to init module "${tabName}":`, err);
    showToast(`Erro ao carregar: ${TAB_META[tabName]?.title}`, 'error');
  }
}

// ===========================================================================
// PERMISSIONS
// ===========================================================================

function _applyPermissions() {
  const perms = PERMISSIONS[_activeRole];

  document.querySelectorAll('[data-requires="canEdit"]').forEach(el => {
    el.style.display = perms.canEdit ? '' : 'none';
    el.disabled = !perms.canEdit;
  });

  document.querySelectorAll('[data-requires="canDelete"]').forEach(el => {
    el.style.display = perms.canDelete ? '' : 'none';
  });

  document.querySelectorAll('[data-requires="canDraw"]').forEach(el => {
    el.style.display = perms.canDraw ? '' : 'none';
  });

  document.querySelectorAll('[data-requires="canSettings"]').forEach(el => {
    el.style.display = perms.canSettings ? '' : 'none';
  });

  const settingsNav = document.querySelector('.nav-item[data-tab="settings"]');
  if (settingsNav) settingsNav.style.display = perms.canSettings ? '' : 'none';

  document.body.dataset.role = _activeRole;
}

// ===========================================================================
// SETTINGS MODULE
// ===========================================================================

function _initSettings() {
  const form = document.getElementById('settings-goals-form');
  if (!form) return;

  db.get('metas', 'goals').then(goals => {
    if (!goals) goals = DEFAULT_GOALS;
    const f = (id) => document.getElementById(id);
    if (f('set-goal-area'))      f('set-goal-area').value      = goals.area      ?? '';
    if (f('set-goal-extension')) f('set-goal-extension').value = goals.extension ?? '';
    if (f('set-goal-volume'))    f('set-goal-volume').value    = goals.volume    ?? '';
    if (f('set-goal-bags'))      f('set-goal-bags').value      = goals.bags      ?? '';
  });

  form.removeEventListener('submit', _handleSaveSettings);
  form.addEventListener('submit', _handleSaveSettings);

  const resetBtn = document.getElementById('btn-reset-data');
  if (resetBtn) {
    resetBtn.removeEventListener('click', _handleResetData);
    resetBtn.addEventListener('click', _handleResetData);
  }

  const seedBtn = document.getElementById('btn-seed-data');
  if (seedBtn) {
    seedBtn.removeEventListener('click', _handleSeedData);
    seedBtn.addEventListener('click', _handleSeedData);
  }

  // Backup Export
  const exportBtn = document.getElementById('btn-export-backup');
  if (exportBtn) {
    exportBtn.removeEventListener('click', _handleExportBackup);
    exportBtn.addEventListener('click', _handleExportBackup);
  }

  // Backup Import Trigger
  const importTriggerBtn = document.getElementById('btn-trigger-import-backup');
  const backupInput = document.getElementById('backup-file-input');
  if (importTriggerBtn && backupInput) {
    importTriggerBtn.addEventListener('click', () => backupInput.click());
    backupInput.addEventListener('change', _handleImportBackupFile);
  }
}

async function _handleExportBackup() {
  try {
    const backup = await db.exportFullBackup();
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `geolimp_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Backup completo exportado com sucesso!', 'success');
  } catch (err) {
    console.error('[Backup] Export failed:', err);
    showToast('Erro ao exportar backup.', 'error');
  }
}

async function _handleImportBackupFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  const confirmed = confirm('Atenção: A restauração de backup irá substituir os dados atuais por este arquivo. Deseja continuar?');
  if (!confirmed) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const backupData = JSON.parse(event.target.result);
      await db.importFullBackup(backupData);
      showToast('Dados restaurados do backup com sucesso! Recarregando...', 'success', 3000);
      _modulesInitialized.clear();
      setTimeout(() => location.reload(), 2000);
    } catch (err) {
      console.error('[Backup] Import failed:', err);
      showToast(`Erro ao restaurar backup: ${err.message}`, 'error');
    }
  };
  reader.readAsText(file);
}

async function _handleSaveSettings(e) {
  e.preventDefault();
  if (!hasPermission('canSettings')) {
    showToast('Permissao negada. Apenas administradores podem alterar metas.', 'error');
    return;
  }
  const f = (id) => document.getElementById(id);
  const goals = {
    id:        'goals',
    area:      parseFloat(f('set-goal-area')?.value)      || DEFAULT_GOALS.area,
    extension: parseFloat(f('set-goal-extension')?.value) || DEFAULT_GOALS.extension,
    volume:    parseFloat(f('set-goal-volume')?.value)    || DEFAULT_GOALS.volume,
    bags:      parseFloat(f('set-goal-bags')?.value)      || DEFAULT_GOALS.bags,
  };
  try {
    await db.put('metas', goals);
    showToast('Metas salvas com sucesso!', 'success');
    _modulesInitialized.delete('dashboard');
    _modulesInitialized.delete('teams');
  } catch (err) {
    console.error('[Settings] Failed to save goals:', err);
    showToast('Erro ao salvar metas.', 'error');
  }
}

async function _handleResetData() {
  if (!hasPermission('canSettings')) { showToast('Permissao negada.', 'error'); return; }
  if (!confirm('Isso vai apagar TODOS os dados. Continuar?')) return;
  try {
    await Promise.all(['trechos','diarios','fotos','metas','config'].map(s => db.clear(s)));
    showToast('Dados apagados. Recarregando...', 'warning', 4000);
    setTimeout(() => location.reload(), 2000);
  } catch (err) {
    showToast('Erro ao limpar dados.', 'error');
  }
}

async function _handleSeedData() {
  if (!hasPermission('canSettings')) { showToast('Permissao negada.', 'error'); return; }
  if (!confirm('Reinserir dados de demonstracao? Dados existentes serao mesclados.')) return;
  try {
    await _seedDatabase();
    showToast('Dados reinseridos! Recarregando...', 'success', 3000);
    setTimeout(() => location.reload(), 2000);
  } catch (err) {
    showToast('Erro ao reinserir dados.', 'error');
  }
}

// ===========================================================================
// SIDEBAR TOGGLE
// ===========================================================================

function _initSidebarToggle() {
  const toggleBtn = document.getElementById('toggle-sidebar');
  const sidebar = document.querySelector('.sidebar');
  const mainContent = document.querySelector('.main-content');
  if (!toggleBtn || !sidebar) return;

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    sidebar.classList.toggle('sidebar-open');
    mainContent?.classList.toggle('sidebar-collapsed');
  });

  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && sidebar.classList.contains('sidebar-open')) {
      if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
        sidebar.classList.remove('sidebar-open');
      }
    }
  });
}

// ===========================================================================
// MODAL HELPERS
// ===========================================================================

export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
}

function _initModalCloseListeners() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.classList.remove('active'); document.body.style.overflow = ''; }
    });
  });

  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active').forEach(m => {
        m.classList.remove('active'); document.body.style.overflow = '';
      });
    }
  });
}

// ===========================================================================
// DATABASE SEEDING
// ===========================================================================

async function _seedDatabase() {
  for (const t of MOCK_STRETCHES) await db.put('trechos', t);
  for (const d of MOCK_DIARIOS)  await db.put('diarios', d);
  for (const f of MOCK_PHOTOS)    await db.put('fotos', f);
  const existingGoals = await db.get('metas', 'goals');
  if (!existingGoals) await db.put('metas', DEFAULT_GOALS);
  console.info('[GeoLimp] Database seeded.');
}

async function _ensureDatabaseSeeded() {
  const trechos = await db.getAll('trechos');
  if (trechos.length === 0) await _seedDatabase();
}

// ===========================================================================
// APPLICATION BOOTSTRAP
// ===========================================================================

async function _bootstrap() {
  try {
    await db.init();
    await _ensureDatabaseSeeded();

    if (window.lucide) window.lucide.createIcons();

    document.querySelectorAll('.nav-item[data-tab]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo(link.dataset.tab);
      });
    });

    const roleSelect = document.getElementById('user-role-select');
    if (roleSelect) {
      roleSelect.value = _activeRole;
      roleSelect.addEventListener('change', () => {
        _activeRole = roleSelect.value;
        _applyPermissions();
        const labels = { admin: 'Administrador (Inserção e Edição)', visualizador: 'Visualizador (Apenas Consulta)' };
        showToast(`Perfil alterado para: ${labels[_activeRole] || _activeRole}`, 'info');
      });
    }

    _applyPermissions();
    _initSidebarToggle();
    _initModalCloseListeners();
    _initPwaAndOffline();

    const hash = window.location.hash.replace('#', '') || 'map';
    const initialTab = TAB_META[hash] ? hash : 'map';
    navigateTo(initialTab);

    window.addEventListener('hashchange', () => {
      const newTab = window.location.hash.replace('#', '');
      if (TAB_META[newTab] && newTab !== _activeTab) navigateTo(newTab);
    });

    // Listen to refresh events from child modules
    document.addEventListener('geolim:refresh', () => {
      if (_modulesInitialized.has('map')) loadStretchesOnMap();
      if (_modulesInitialized.has('dashboard') || _modulesInitialized.has('teams')) initDashboard();
    });

    console.info('[GeoLimp] Application ready with PWA & Offline capability.');
  } catch (err) {
    console.error('[GeoLimp] Bootstrap failed:', err);
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#ef4444;color:#fff;padding:1rem;font-family:sans-serif;text-align:center;';
    banner.textContent = `Erro ao inicializar: ${err.message}. Recarregue a pagina.`;
    document.body.prepend(banner);
  }
}

// ===========================================================================
// PWA & OFFLINE MODULE
// ===========================================================================

let deferredPwaPrompt = null;

function _initPwaAndOffline() {
  // 1. Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.info('[PWA] ServiceWorker registered with scope:', reg.scope))
        .catch((err) => console.warn('[PWA] ServiceWorker registration failed:', err));
    });
  }

  // 2. Monitor Online / Offline connection status
  const updateNetworkStatus = () => {
    const badge = document.getElementById('connection-status-badge');
    if (!badge) return;

    if (navigator.onLine) {
      badge.className = 'connection-status-badge online';
      badge.querySelector('.status-text').textContent = 'Online';
      badge.title = 'Conectado à Internet';
    } else {
      badge.className = 'connection-status-badge offline';
      badge.querySelector('.status-text').textContent = 'Offline (Modo de Campo)';
      badge.title = 'Modo 100% Offline Ativado';
      showToast('Modo de Campo 100% Offline ativado.', 'warning', 4000);
    }
  };

  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus(); // initial check

  // 3. Handle PWA Install Prompt
  const installBtn = document.getElementById('btn-install-pwa');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    if (installBtn) {
      installBtn.style.display = 'inline-flex';
      installBtn.addEventListener('click', async () => {
        if (!deferredPwaPrompt) return;
        deferredPwaPrompt.prompt();
        const { outcome } = await deferredPwaPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('GeoLimp instalado com sucesso no seu dispositivo!', 'success');
        }
        deferredPwaPrompt = null;
        installBtn.style.display = 'none';
      });
    }
  });

  window.addEventListener('appinstalled', () => {
    console.info('[PWA] GeoLimp was installed.');
    showToast('GeoLimp instalado!', 'success');
    if (installBtn) installBtn.style.display = 'none';
  });
}

document.addEventListener('DOMContentLoaded', _bootstrap);




