/* ==========================================================================
   GeoLimp - Photo Log and Georeferenced Evidences Module
   ========================================================================== */

import { db } from './db.js';
import { showToast, getActiveRole, refreshAllViews } from './utils.js';

/**
 * Initializes listeners and populates files for the Photo Gallery tab.
 */
export function initPhotos() {
  const form = document.getElementById('photo-form');
  if (!form) return;

  // Render photo gallery
  loadPhotoGallery();

  // Setup Form Submission
  form.offscreenSubmit = true;
  form.removeEventListener('submit', handlePhotoSubmit);
  form.addEventListener('submit', handlePhotoSubmit);

  // Setup Filter listeners
  document.getElementById('filter-photo-stretch').removeEventListener('change', loadPhotoGallery);
  document.getElementById('filter-photo-stretch').addEventListener('change', loadPhotoGallery);

  document.getElementById('filter-photo-type').removeEventListener('change', loadPhotoGallery);
  document.getElementById('filter-photo-type').addEventListener('change', loadPhotoGallery);
}

/**
 * Handles photo file upload, base64 conversion, geolocation and database storage
 */
async function handlePhotoSubmit(e) {
  e.preventDefault();

  const role = getActiveRole();
  if (role === 'visualizador') {
    showToast('PermissÃ£o Negada: Visualizadores nÃ£o podem registrar fotos.', 'error');
    return;
  }

  const stretchId = document.getElementById('photo-stretch').value;
  const type = document.getElementById('photo-type').value;
  const desc = document.getElementById('photo-desc').value;
  const fileInput = document.getElementById('photo-file');
  const file = fileInput.files[0];

  if (!file) {
    showToast('Por favor, selecione um arquivo de imagem.', 'error');
    return;
  }

  // Find coordinates from associated stretch
  const stretch = await db.get('trechos', stretchId);
  if (!stretch) {
    showToast('Erro: Trecho invÃ¡lido ou inexistente.', 'error');
    return;
  }

  // Default coordinates to the first node of the channel path
  const lat = stretch.coordinates[0][0];
  const lng = stretch.coordinates[0][1];

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const timeStr = today.toTimeString().split(' ')[0].substring(0, 5); // HH:MM

  // Convert File to Base64 String
  const reader = new FileReader();
  reader.onload = async function(event) {
    const base64Image = event.target.result;

    const photoData = {
      stretchId,
      type,
      desc,
      date: dateStr,
      time: timeStr,
      lat,
      lng,
      image: base64Image
    };

    try {
      await db.put('fotos', photoData);
      showToast('EvidÃªncia fotogrÃ¡fica anexada com sucesso!', 'success');
      
      // Reset form
      document.getElementById('photo-form').reset();
      
      // Refresh
      refreshAllViews();
    } catch (err) {
      console.error(err);
      showToast('Erro ao salvar foto no banco de dados.', 'error');
    }
  };

  reader.readAsDataURL(file);
}

/**
 * Fetch and render all photos in gallery grid
 */
export async function loadPhotoGallery() {
  const container = document.getElementById('gallery-container');
  if (!container) return;

  const photos = await db.getAll('fotos');
  const stretches = await db.getAll('trechos');

  // Filter parameters
  const filterStretch = document.getElementById('filter-photo-stretch').value;
  const filterType = document.getElementById('filter-photo-type').value;

  // Map stretch names
  const stretchNames = {};
  stretches.forEach(s => { stretchNames[s.id] = s.code; });

  const filteredPhotos = photos.filter(p => {
    if (filterStretch && p.stretchId !== filterStretch) return false;
    if (filterType && p.type !== filterType) return false;
    return true;
  }).sort((a,b) => new Date(b.date) - new Date(a.date)); // Newest first

  container.innerHTML = '';

  if (filteredPhotos.length === 0) {
    container.innerHTML = '<div class="text-center text-muted py-5 w-full flex-center" style="grid-column: 1 / -1;">Nenhuma evidÃªncia fotogrÃ¡fica cadastrada para estes filtros.</div>';
    return;
  }

  filteredPhotos.forEach(p => {
    const card = document.createElement('div');
    card.className = 'photo-card';

    const stretchCode = stretchNames[p.stretchId] || 'Trecho';
    const typeLabel = p.type === 'antes' ? 'Antes' : p.type === 'durante' ? 'Durante' : 'Depois';
    
    // Parse date
    const parts = p.date.split('-');
    const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : p.date;

    card.innerHTML = `
      <div class="photo-card-img">
        <img src="${p.image}" alt="EvidÃªncia" />
        <span class="photo-card-tag ${p.type}">${typeLabel}</span>
      </div>
      <div class="photo-card-details">
        <strong class="desc" title="${p.desc || 'Foto Operacional'}">${p.desc || 'Sem descriÃ§Ã£o cadastrada'}</strong>
        <span class="meta">ðŸ“ ${stretchCode} (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})</span>
        <span class="meta">ðŸ“… ${formattedDate} Ã s ${p.time}</span>
      </div>
    `;

    // Click to view full image in a custom light-box modal (simulated by browser open)
    card.addEventListener('click', () => {
      openLightbox(p, stretchCode, typeLabel);
    });

    container.appendChild(card);
  });
}

/**
 * Open lightbox popup for photos
 */
function openLightbox(photo, stretchCode, typeLabel) {
  // Check if lightbox elements already exist, otherwise create
  let lb = document.getElementById('photo-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'photo-lightbox';
    lb.className = 'modal-backdrop';
    lb.innerHTML = `
      <div class="modal-container w-450" style="background:#000; border-color:#222;">
        <div class="modal-header" style="border:none;">
          <h3 id="lb-title" style="color:#fff;">Foto</h3>
          <button class="close-btn" onclick="document.getElementById('photo-lightbox').classList.remove('open')">&times;</button>
        </div>
        <div style="padding:0; overflow:hidden; text-align:center;">
          <img id="lb-img" src="" style="max-width:100%; max-height:400px; object-fit:contain;" />
        </div>
        <div style="padding:1.25rem; color:#fff; font-size:0.85rem;" class="flex-column gap-1">
          <p id="lb-desc" style="font-weight:600;"></p>
          <span id="lb-meta-stretch" class="text-primary"></span>
          <span id="lb-meta-date" class="text-muted"></span>
          <span id="lb-meta-coords" class="text-muted"></span>
        </div>
      </div>
    `;
    document.body.appendChild(lb);
  }

  // Populate lightbox
  document.getElementById('lb-img').src = photo.image;
  document.getElementById('lb-title').innerText = `EvidÃªncia [${typeLabel.toUpperCase()}]`;
  document.getElementById('lb-desc').innerText = photo.desc || 'Foto Operacional';
  document.getElementById('lb-meta-stretch').innerText = `Vinculado ao canal: ${stretchCode}`;
  
  const parts = photo.date.split('-');
  const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : photo.date;
  document.getElementById('lb-meta-date').innerText = `Registrado em: ${formattedDate} Ã s ${photo.time}`;
  document.getElementById('lb-meta-coords').innerText = `Coordenadas: Lat ${photo.lat.toFixed(5)} / Lng ${photo.lng.toFixed(5)}`;

  // Show
  lb.classList.add('open');
}

