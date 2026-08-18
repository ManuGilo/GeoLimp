/* ==========================================================================
   GeoLimp - Shared Utilities (no circular dependencies)
   ========================================================================== */

// ===========================================================================
// TOAST NOTIFICATIONS
// ===========================================================================

/**
 * Displays a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} duration ms
 */
export function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: 'OK', error: 'X', info: 'i', warning: '!' };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'i'}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Fechar">x</button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => _dismissToast(toast));
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => _dismissToast(toast), duration);
}

function _dismissToast(toast) {
  toast.classList.remove('toast-visible');
  toast.classList.add('toast-exit');
  toast.addEventListener('transitionend', () => toast.remove(), { once: true });
}

// ===========================================================================
// ROLE ACCESSOR (reads from DOM to avoid circular dep with main.js)
// ===========================================================================

/**
 * Returns the currently selected role from the DOM selector.
 * @returns {'admin'|'visualizador'}
 */
export function getActiveRole() {
  const sel = document.getElementById('user-role-select');
  return sel ? sel.value : 'admin';
}

/**
 * Checks if the active role has a permission.
 * @param {'canEdit'|'canDelete'|'canExport'|'canSettings'|'canDraw'} perm
 * @returns {boolean}
 */
export function hasPermission(perm) {
  const PERMISSIONS = {
    admin:        { canEdit: true,  canDelete: true,  canExport: true, canSettings: true,  canDraw: true  },
    visualizador: { canEdit: false, canDelete: false, canExport: true, canSettings: false, canDraw: false },
  };
  const role = getActiveRole();
  return !!(PERMISSIONS[role] && PERMISSIONS[role][perm]);
}

// ===========================================================================
// REFRESH EVENT (decoupled via CustomEvent)
// ===========================================================================

/**
 * Dispatches a custom event to refresh all data views.
 * Listened by main.js to trigger dashboard/map refresh.
 */
export function refreshAllViews() {
  document.dispatchEvent(new CustomEvent('geolim:refresh'));
}
