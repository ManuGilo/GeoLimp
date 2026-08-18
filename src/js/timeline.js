/* ==========================================================================
   GeoLimp - Chronological Execution Timeline Module
   ========================================================================== */

import { db } from './db.js';

/**
 * Initializes and draws the vertical chronological timeline.
 */
export function initTimeline() {
  // Load timeline items
  loadTimeline();

  // Setup filters
  const filters = [
    'timeline-filter-team',
    'timeline-filter-stretch',
    'timeline-filter-status',
    'timeline-filter-date-start',
    'timeline-filter-date-end'
  ];

  filters.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.removeEventListener('change', loadTimeline);
      el.addEventListener('change', loadTimeline);
    }
  });
}

/**
 * Fetch logs and photos, filter them, and render cards dynamically
 */
export async function loadTimeline() {
  const container = document.getElementById('timeline-container');
  if (!container) return;

  const diaries = await db.getAll('diarios');
  const stretches = await db.getAll('trechos');
  const photos = await db.getAll('fotos');

  // Filter parameters
  const filterTeam = document.getElementById('timeline-filter-team').value;
  const filterStretch = document.getElementById('timeline-filter-stretch').value;
  const filterStatus = document.getElementById('timeline-filter-status').value;
  const filterStart = document.getElementById('timeline-filter-date-start').value;
  const filterEnd = document.getElementById('timeline-filter-date-end').value;

  // Stretches dictionary
  const stretchNames = {};
  stretches.forEach(s => { stretchNames[s.id] = s.code; });

  // Filter diaries list
  const filteredDiaries = diaries.filter(log => {
    if (filterTeam && log.team !== filterTeam) return false;
    if (filterStretch && log.stretchId !== filterStretch) return false;
    if (filterStatus && log.status !== filterStatus) return false;
    if (filterStart && log.date < filterStart) return false;
    if (filterEnd && log.date > filterEnd) return false;
    return true;
  }).sort((a,b) => new Date(b.date) - new Date(a.date)); // Sort descending (newest first)

  container.innerHTML = '';

  if (filteredDiaries.length === 0) {
    container.innerHTML = '<div class="text-center text-muted py-5">Nenhum evento registrado com estas configurações de filtro.</div>';
    return;
  }

  filteredDiaries.forEach(log => {
    const item = document.createElement('div');
    item.className = `timeline-item ${log.status}`;

    const stretchCode = stretchNames[log.stretchId] || 'Trecho';
    
    // Parse Date DD/MM/YYYY
    const parts = log.date.split('-');
    const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : log.date;

    // Filter photos taken on the same date for the same stretch
    const logPhotos = photos.filter(p => p.stretchId === log.stretchId && p.date === log.date);

    // Build photos section
    let photosHtml = '';
    if (logPhotos.length > 0) {
      photosHtml = '<div class="timeline-photos mt-3 flex gap-2">';
      logPhotos.forEach(p => {
        photosHtml += `
          <div class="timeline-photo-thumb" style="width: 70px; height: 70px; border-radius: 4px; overflow: hidden; border:1px solid rgba(255,255,255,0.1); cursor:pointer;">
            <img src="${p.image}" alt="Photo" style="width:100%; height:100%; object-fit:cover;" onclick="window.openTimelinePhoto('${p.image}')" />
          </div>`;
      });
      photosHtml += '</div>';
    }

    // Build operational values and clima/equipments descriptions
    item.innerHTML = `
      <div class="timeline-marker"></div>
      <div class="timeline-content">
        <div class="timeline-header-row">
          <span class="timeline-title">${stretchCode} &bull; ${log.team}</span>
          <span class="timeline-date-tag">${formattedDate}</span>
        </div>
        <div class="timeline-body">
          <div class="grid grid-4 gap-2 text-center" style="background: rgba(0,0,0,0.15); padding: 0.5rem; border-radius:6px;">
            <div>
              <span class="label" style="font-size:9px;">Área Limpa</span>
              <strong style="font-size:0.9rem;">${log.area} m²</strong>
            </div>
            <div>
              <span class="label" style="font-size:9px;">Extensão</span>
              <strong style="font-size:0.9rem;">${log.extension} m</strong>
            </div>
            <div>
              <span class="label" style="font-size:9px;">Resíduos</span>
              <strong style="font-size:0.9rem; color:#ef4444;">${log.volume.toFixed(1)} m³</strong>
            </div>
            <div>
              <span class="label" style="font-size:9px;">Trabalho</span>
              <strong style="font-size:0.9rem; color:#eab308;">${log.hours} h</strong>
            </div>
          </div>
          
          <div class="mt-2 text-xs">
            <p><strong>Clima:</strong> ${log.weather} | <strong>Equipamentos:</strong> ${log.equipments || 'Manuais'}</p>
            ${log.observations ? `<p class="mt-1 text-muted" style="border-left: 2px solid rgba(255,255,255,0.1); padding-left: 4px; font-style:italic;">"${log.observations}"</p>` : ''}
          </div>
          
          ${photosHtml}
        </div>
      </div>
    `;

    container.appendChild(item);
  });
}

// Global window listener to view timeline image full size
window.openTimelinePhoto = function(imgSrc) {
  let lb = document.getElementById('photo-lightbox');
  if (!lb) {
    // Rely on lightbox generated in photos.js, if not exist make a simple one
    lb = document.createElement('div');
    lb.id = 'photo-lightbox';
    lb.className = 'modal-backdrop';
    lb.innerHTML = `
      <div class="modal-container w-450" style="background:#000; border-color:#222;">
        <div class="modal-header" style="border:none;">
          <h3 id="lb-title" style="color:#fff;">Visualizar Imagem</h3>
          <button class="close-btn" onclick="document.getElementById('photo-lightbox').classList.remove('open')">&times;</button>
        </div>
        <div style="padding:0; overflow:hidden; text-align:center;">
          <img id="lb-img" src="" style="max-width:100%; max-height:400px; object-fit:contain;" />
        </div>
        <div style="padding:1.25rem; color:#fff; font-size:0.85rem;" class="flex-column gap-1">
          <p id="lb-desc"></p>
        </div>
      </div>
    `;
    document.body.appendChild(lb);
  }
  document.getElementById('lb-img').src = imgSrc;
  document.getElementById('lb-title').innerText = 'Evidência de Campo';
  document.getElementById('lb-desc').innerText = 'Foto anexada no registro diário de obras.';
  document.getElementById('lb-meta-stretch').innerText = '';
  document.getElementById('lb-meta-date').innerText = '';
  document.getElementById('lb-meta-coords').innerText = '';
  lb.classList.add('open');
};
