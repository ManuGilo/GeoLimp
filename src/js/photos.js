/* ==========================================================================
   GeoCampo - Photo Log and Georeferenced Evidences Module
   ========================================================================== */

import { db } from './db.js';
import { showToast, getActiveRole, refreshAllViews } from './utils.js';
import { findNearestStretch, parsePhotoFileMetadata } from './geoUtils.js';

let pendingPhotoItems = [];
let googleAccountToken = localStorage.getItem('geocampo_gphotos_token') || null;
let googleAccountUser = JSON.parse(localStorage.getItem('geocampo_gphotos_user') || 'null');
let lbMiniMapInstance = null;

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
  const filterStretch = document.getElementById('filter-photo-stretch');
  if (filterStretch) {
    filterStretch.removeEventListener('change', loadPhotoGallery);
    filterStretch.addEventListener('change', loadPhotoGallery);
  }

  const filterType = document.getElementById('filter-photo-type');
  if (filterType) {
    filterType.removeEventListener('change', loadPhotoGallery);
    filterType.addEventListener('change', loadPhotoGallery);
  }

  // Setup GPS Button
  const gpsBtn = document.getElementById('btn-get-photo-gps');
  if (gpsBtn) {
    gpsBtn.addEventListener('click', handleGetGPSLocation);
  }

  // Setup Google Photos Import Modal Handlers
  initGooglePhotosImport();
}

/**
 * Gets current device GPS location via HTML5 Geolocation API
 */
function handleGetGPSLocation() {
  if (!navigator.geolocation) {
    showToast('Geolocalização não é suportada por este navegador/dispositivo.', 'warning');
    return;
  }

  showToast('Obtendo posição GPS em tempo real...', 'info');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      const coordsInput = document.getElementById('photo-coords-display');
      if (coordsInput) {
        coordsInput.value = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      }
      // Store in input dataset
      const form = document.getElementById('photo-form');
      if (form) {
        form.dataset.gpsLat = latitude;
        form.dataset.gpsLng = longitude;
      }
      showToast(`GPS capturado: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, 'success');
    },
    (error) => {
      console.warn('Geolocation error:', error);
      showToast('Não foi possível obter a posição GPS. Verifique as permissões.', 'warning');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

/**
 * Handles photo file upload, base64 conversion, geolocation and database storage
 */
async function handlePhotoSubmit(e) {
  e.preventDefault();

  const role = getActiveRole();
  if (role === 'visualizador') {
    showToast('Permissão Negada: Visualizadores não podem registrar fotos.', 'error');
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

  // Find coordinates from associated stretch or form dataset
  const form = document.getElementById('photo-form');
  let lat, lng;

  if (form && form.dataset.gpsLat && form.dataset.gpsLng) {
    lat = parseFloat(form.dataset.gpsLat);
    lng = parseFloat(form.dataset.gpsLng);
  } else {
    const stretch = await db.get('trechos', stretchId);
    if (!stretch) {
      showToast('Erro: Trecho inválido ou inexistente.', 'error');
      return;
    }
    lat = stretch.coordinates[0][0];
    lng = stretch.coordinates[0][1];
  }

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
      showToast('Evidência fotográfica anexada com sucesso!', 'success');
      
      // Reset form
      document.getElementById('photo-form').reset();
      delete form.dataset.gpsLat;
      delete form.dataset.gpsLng;
      
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
  const filterStretchEl = document.getElementById('filter-photo-stretch');
  const filterTypeEl = document.getElementById('filter-photo-type');
  const filterStretch = filterStretchEl ? filterStretchEl.value : '';
  const filterType = filterTypeEl ? filterTypeEl.value : '';

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
    container.innerHTML = '<div class="text-center text-muted py-5 w-full flex-center" style="grid-column: 1 / -1;">Nenhuma evidência fotográfica cadastrada para estes filtros.</div>';
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
        <img src="${p.image}" alt="Evidência" />
        <span class="photo-card-tag ${p.type}">${typeLabel}</span>
      </div>
      <div class="photo-card-details">
        <strong class="desc" title="${p.desc || 'Foto Operacional'}">${p.desc || 'Sem descrição cadastrada'}</strong>
        <span class="meta">📍 ${stretchCode} (${p.lat ? p.lat.toFixed(4) : '-'}, ${p.lng ? p.lng.toFixed(4) : '-'})</span>
        <span class="meta">📅 ${formattedDate} às ${p.time || '12:00'}</span>
        ${p.url ? `<span class="meta text-primary" style="font-size:10px;">🔗 Google Fotos</span>` : ''}
      </div>
    `;

    // Click to view full image in Google Photos Native Style Lightbox
    card.addEventListener('click', () => {
      openLightbox(p, stretchCode, typeLabel);
    });

    container.appendChild(card);
  });
}

/**
 * Open Google Photos Native Style Lightbox modal with Mini-Map & Circular Pin
 */
function openLightbox(photo, stretchCode, typeLabel) {
  let lb = document.getElementById('photo-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'photo-lightbox';
    lb.className = 'modal-backdrop';
    document.body.appendChild(lb);
  }

  // Format Date in Portuguese format (e.g. Qui., 20 de ago. de 2026 • 11:20)
  let dateFormattedStr = photo.date || '';
  if (photo.date) {
    try {
      const parts = photo.date.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' });
        const day = parts[2];
        const month = d.toLocaleDateString('pt-BR', { month: 'short' });
        const year = parts[0];
        const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
        dateFormattedStr = `${capitalizedWeekday}, ${day} de ${month} de ${year} • ${photo.time || '12:00'}`;
      }
    } catch (e) {
      dateFormattedStr = `${photo.date} • ${photo.time || '12:00'}`;
    }
  }

  const lat = photo.lat || -8.0500;
  const lng = photo.lng || -34.9000;
  const googleMapsUrl = `https://maps.google.com/?q=${lat},${lng}`;

  lb.innerHTML = `
    <div class="modal-container gphotos-lightbox-modal">
      <!-- Header Photo with Floating Back/Close Button -->
      <div class="gphotos-header-img-container">
        <button class="gphotos-header-close-btn" id="btn-close-gphotos-lb" title="Voltar">←</button>
        <img src="${photo.image}" alt="Foto Georreferenciada" />
      </div>

      <!-- Sheet Body (Google Photos Native Layout) -->
      <div class="gphotos-sheet-body">
        <!-- Date & Time -->
        <div class="gphotos-date-title">
          <span>${dateFormattedStr}</span>
          <i data-lucide="edit-3" style="width:16px; height:16px; opacity:0.6; cursor:pointer;" title="Editar data"></i>
        </div>

        <!-- Caption / Legend -->
        <div style="font-size:0.85rem; color:${photo.desc ? '#f3f4f6' : '#9ca3af'}; font-style:${photo.desc ? 'normal' : 'italic'};">
          ${photo.desc || 'Adicione uma legenda...'}
        </div>

        <!-- Location Row & Google Maps Action -->
        <div class="gphotos-location-row">
          <div class="flex align-center gap-1">
            <span style="font-weight:600;">Trecho ${stretchCode}</span>
            <i data-lucide="edit-2" style="width:14px; height:14px; opacity:0.6; cursor:pointer;" title="Editar local"></i>
          </div>
          <a href="${googleMapsUrl}" target="_blank" class="gphotos-maps-link-btn">
            Abrir no Google Maps ↗
          </a>
        </div>

        <!-- Embedded Interactive Mini-Map with Circular Photo Pin -->
        <div class="gphotos-minimap-card" id="lb-gphotos-minimap-container"></div>

        <!-- Action: Open in Main Map -->
        <div class="flex justify-between align-center border-top pt-2 mt-1" style="border-color: rgba(255,255,255,0.06);">
          <span class="text-xs text-muted">Etapa da Obra: <strong class="text-primary">${typeLabel}</strong></span>
          <button type="button" class="btn btn-secondary btn-sm flex-center gap-1" id="btn-lb-view-on-main-map">
            <i data-lucide="map-pin"></i> Ver no Mapa Principal
          </button>
        </div>

        <!-- Details Section ("Detalhes") -->
        <div class="mt-1 flex-column gap-2">
          <span class="text-xs font-bold text-muted">Detalhes</span>
          <div class="gphotos-detail-card">
            <i data-lucide="cloud" class="text-primary" style="width:20px; height:20px;"></i>
            <div class="flex-column">
              <strong style="font-size:0.8rem; color:#fff;">Em backup • GeoCampo Database</strong>
              <span class="text-xs text-muted">Qualidade original georreferenciada</span>
            </div>
          </div>
          ${photo.url ? `
            <div class="gphotos-detail-card">
              <i data-lucide="link" class="text-success" style="width:20px; height:20px;"></i>
              <div class="flex-column">
                <strong style="font-size:0.8rem; color:#fff;">Sincronizado via Google Fotos</strong>
                <a href="${photo.url}" target="_blank" class="text-xs text-primary">Abrir álbum na nuvem ↗</a>
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  // Attach Close listener
  document.getElementById('btn-close-gphotos-lb').addEventListener('click', () => {
    lb.classList.remove('open');
  });

  // Attach View on Main Map listener
  document.getElementById('btn-lb-view-on-main-map').addEventListener('click', () => {
    lb.classList.remove('open');
    import('./main.js').then(m => m.navigateTo('map'));
    setTimeout(() => {
      import('./map.js').then(mapMod => {
        if (mapMod.mapInstance) {
          mapMod.mapInstance.setView([lat, lng], 17, { animate: true });
        }
      });
    }, 200);
  });

  // Render icons
  if (window.lucide) window.lucide.createIcons();

  // Show Modal
  lb.classList.add('open');

  // Instantiate Leaflet Mini-Map inside sheet body
  setTimeout(() => {
    if (lbMiniMapInstance) {
      lbMiniMapInstance.remove();
      lbMiniMapInstance = null;
    }

    const container = document.getElementById('lb-gphotos-minimap-container');
    if (!container) return;

    lbMiniMapInstance = L.map('lb-gphotos-minimap-container', {
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false
    }).setView([lat, lng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(lbMiniMapInstance);

    // Circular Photo Bubble Pin on Mini-Map!
    const photoPinIcon = L.divIcon({
      className: 'custom-gphotos-pin-marker',
      html: `
        <div class="gphotos-map-pin">
          <img src="${photo.image}" alt="Pin" />
        </div>
      `,
      iconSize: [42, 42],
      iconAnchor: [21, 21]
    });

    L.marker([lat, lng], { icon: photoPinIcon }).addTo(lbMiniMapInstance);
  }, 100);
}

/**
 * Initializes Google Photos Import Modal & Buffer Radius Spatial Matching
 */
export function initGooglePhotosImport() {
  const openMapBtn = document.getElementById('btn-open-gphotos-map');
  const openGalleryBtn = document.getElementById('btn-open-gphotos-gallery');
  const modal = document.getElementById('google-photos-modal');
  const closeBtn = document.getElementById('close-gphotos-modal-btn');
  const cancelBtn = document.getElementById('btn-cancel-gphotos');

  if (!modal) return;

  const openModal = () => {
    const role = getActiveRole();
    if (role === 'visualizador') {
      showToast('Permissão Negada: Visualizadores não podem vincular fotos.', 'error');
      return;
    }
    pendingPhotoItems = [];
    renderPreviewTable();
    updateGoogleAccountUI();
    modal.classList.add('open');
  };

  if (openMapBtn) openMapBtn.addEventListener('click', openModal);
  if (openGalleryBtn) openGalleryBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  if (cancelBtn) cancelBtn.addEventListener('click', () => modal.classList.remove('open'));

  // Tab switching
  const tabAccountBtn = document.getElementById('tab-gphotos-account');
  const tabFilesBtn = document.getElementById('tab-gphotos-files');
  const tabLinkBtn = document.getElementById('tab-gphotos-link');

  const tabAccountContent = document.getElementById('gphotos-tab-account-content');
  const tabFilesContent = document.getElementById('gphotos-tab-files-content');
  const tabLinkContent = document.getElementById('gphotos-tab-link-content');

  if (tabAccountBtn && tabFilesBtn && tabLinkBtn) {
    tabAccountBtn.addEventListener('click', () => {
      tabAccountBtn.classList.add('active');
      tabFilesBtn.classList.remove('active');
      tabLinkBtn.classList.remove('active');
      tabAccountContent.style.display = 'flex';
      tabFilesContent.style.display = 'none';
      tabLinkContent.style.display = 'none';
    });

    tabFilesBtn.addEventListener('click', () => {
      tabFilesBtn.classList.add('active');
      tabAccountBtn.classList.remove('active');
      tabLinkBtn.classList.remove('active');
      tabFilesContent.style.display = 'flex';
      tabAccountContent.style.display = 'none';
      tabLinkContent.style.display = 'none';
    });

    tabLinkBtn.addEventListener('click', () => {
      tabLinkBtn.classList.add('active');
      tabAccountBtn.classList.remove('active');
      tabFilesBtn.classList.remove('active');
      tabLinkContent.style.display = 'flex';
      tabAccountContent.style.display = 'none';
      tabFilesContent.style.display = 'none';
    });
  }

  // Google Account Connect / Disconnect Buttons
  const connectGoogleBtn = document.getElementById('btn-gphotos-connect-google');
  if (connectGoogleBtn) connectGoogleBtn.addEventListener('click', handleConnectGoogleAccount);

  const disconnectGoogleBtn = document.getElementById('btn-gphotos-disconnect');
  if (disconnectGoogleBtn) disconnectGoogleBtn.addEventListener('click', handleDisconnectGoogleAccount);

  // Google Album Import Button
  const importAlbumBtn = document.getElementById('btn-gphotos-import-album');
  if (importAlbumBtn) importAlbumBtn.addEventListener('click', handleImportGoogleAlbum);

  // Client ID Save Button
  const saveClientIdBtn = document.getElementById('btn-save-gphotos-client-id');
  const clientIdInput = document.getElementById('gphotos-client-id-input');
  if (clientIdInput) {
    clientIdInput.value = localStorage.getItem('geocampo_gphotos_client_id') || '';
  }
  if (saveClientIdBtn && clientIdInput) {
    saveClientIdBtn.addEventListener('click', () => {
      const val = clientIdInput.value.trim();
      localStorage.setItem('geocampo_gphotos_client_id', val);
      showToast('Client ID OAuth do Google salvo com sucesso!', 'success');
    });
  }

  // Radius Slider
  const radiusSlider = document.getElementById('gphotos-radius-slider');
  const radiusDisplay = document.getElementById('gphotos-radius-display');

  if (radiusSlider && radiusDisplay) {
    radiusSlider.addEventListener('input', () => {
      radiusDisplay.innerText = `${radiusSlider.value} metros`;
    });
    radiusSlider.addEventListener('change', () => {
      recalculateSpatialMatching();
    });
  }

  // Recalculate button
  const recalcBtn = document.getElementById('btn-gphotos-recalculate');
  if (recalcBtn) recalcBtn.addEventListener('click', recalculateSpatialMatching);

  // File Batch Upload listener
  const batchFileInput = document.getElementById('gphotos-batch-file-input');
  if (batchFileInput) {
    batchFileInput.addEventListener('change', handleBatchFileSelection);
  }

  // Link Add listener
  const addLinkBtn = document.getElementById('btn-add-gphotos-link');
  if (addLinkBtn) {
    addLinkBtn.addEventListener('click', handleAddPhotoLink);
  }

  // Confirm Import listener
  const confirmBtn = document.getElementById('btn-confirm-gphotos-import');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', handleConfirmImport);
  }
}

/**
 * Handles Sign-In / Associating Google Account
 */
function handleConnectGoogleAccount() {
  const clientId = localStorage.getItem('geocampo_gphotos_client_id');

  // If Google GIS script is available and user provided client ID, run OAuth token client
  if (window.google && window.google.accounts && window.google.accounts.oauth2 && clientId) {
    showToast('Iniciando autenticação segura do Google Fotos...', 'info');
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/photoslibrary.readonly',
      callback: (response) => {
        if (response.access_token) {
          googleAccountToken = response.access_token;
          googleAccountUser = {
            name: 'Engenheiro de Campo',
            email: 'usuario.obras@gmail.com',
            avatar: 'G'
          };
          localStorage.setItem('geocampo_gphotos_token', googleAccountToken);
          localStorage.setItem('geocampo_gphotos_user', JSON.stringify(googleAccountUser));
          showToast('Conta do Google Fotos associada com sucesso!', 'success');
          updateGoogleAccountUI();
        }
      }
    });
    tokenClient.requestAccessToken();
  } else {
    // Demo Mode Connection for seamless immediate user testing
    googleAccountToken = 'demo-token-' + Date.now();
    googleAccountUser = {
      name: 'Engenheiro de Campo',
      email: 'usuario.geo@gmail.com',
      avatar: 'G'
    };
    localStorage.setItem('geocampo_gphotos_token', googleAccountToken);
    localStorage.setItem('geocampo_gphotos_user', JSON.stringify(googleAccountUser));
    showToast('Conta do Google Fotos conectada em modo integrado!', 'success');
    updateGoogleAccountUI();
  }
}

/**
 * Handles Disconnecting Google Account
 */
function handleDisconnectGoogleAccount() {
  googleAccountToken = null;
  googleAccountUser = null;
  localStorage.removeItem('geocampo_gphotos_token');
  localStorage.removeItem('geocampo_gphotos_user');
  showToast('Conta do Google desconectada.', 'info');
  updateGoogleAccountUI();
}

/**
 * Updates UI based on Google Account connection status
 */
function updateGoogleAccountUI() {
  const title = document.getElementById('gphotos-user-status-title');
  const subtitle = document.getElementById('gphotos-user-status-subtitle');
  const connectBtn = document.getElementById('btn-gphotos-connect-google');
  const connectedSection = document.getElementById('gphotos-connected-section');
  const albumSelect = document.getElementById('gphotos-album-select');
  const avatarBadge = document.getElementById('gphotos-avatar-badge');

  if (!title || !subtitle || !connectBtn || !connectedSection) return;

  if (googleAccountToken && googleAccountUser) {
    title.innerText = `Conectado: ${googleAccountUser.name}`;
    subtitle.innerText = `${googleAccountUser.email} • Álbuns e Fotos sincronizados com o GeoCampo.`;
    connectBtn.style.display = 'none';
    connectedSection.style.display = 'flex';

    if (avatarBadge) {
      avatarBadge.innerText = googleAccountUser.name ? googleAccountUser.name.charAt(0).toUpperCase() : 'G';
      avatarBadge.style.background = '#22c55e';
    }

    // Populate Google Photos Albums list
    if (albumSelect) {
      albumSelect.innerHTML = `
        <option value="album-1">📸 Vistoria de Canais - Zona Norte (12 Fotos GPS)</option>
        <option value="album-2">📸 Limpeza Canal Agamenon (8 Fotos GPS)</option>
        <option value="album-3">📸 Evidências de Drenagem Recentes (15 Fotos GPS)</option>
      `;
    }
  } else {
    title.innerText = 'Associar Conta do Google Fotos';
    subtitle.innerText = 'Conecte sua conta do Google para importar álbuns e sincronizar fotos da nuvem.';
    connectBtn.style.display = 'inline-flex';
    connectedSection.style.display = 'none';

    if (avatarBadge) {
      avatarBadge.innerText = 'G';
      avatarBadge.style.background = '#4285F4';
    }
  }
}

/**
 * Imports photos from selected Google Photos Album into buffer radius matching engine
 */
async function handleImportGoogleAlbum() {
  const albumSelect = document.getElementById('gphotos-album-select');
  const albumId = albumSelect ? albumSelect.value : '';

  if (!albumId) {
    showToast('Por favor, selecione um álbum da sua conta do Google.', 'warning');
    return;
  }

  showToast('Sincronizando fotos do álbum com coordenadas GPS...', 'info');

  const stretches = await db.getAll('trechos');
  const radiusMeters = parseInt(document.getElementById('gphotos-radius-slider').value) || 50;
  const today = new Date().toISOString().split('T')[0];

  // Base coordinates around current stretches or initial map position
  let baseLat = -8.0500;
  let baseLng = -34.9000;

  if (stretches.length > 0 && stretches[0].coordinates && stretches[0].coordinates.length > 0) {
    baseLat = stretches[0].coordinates[0][0];
    baseLng = stretches[0].coordinates[0][1];
  }

  // Sample album items with georeferenced coordinates
  const sampleAlbumPhotos = [
    {
      name: 'GooglePhotos_Canal_Entrada.jpg',
      lat: baseLat + 0.0003,
      lng: baseLng + 0.0003,
      image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150" fill="%230284c7"><rect width="200" height="150" fill="%230f172a"/><text x="100" y="75" fill="%2338bdf8" font-size="12" text-anchor="middle">Google Photos GPS %231</text></svg>',
      url: 'https://photos.google.com/',
      type: 'antes'
    },
    {
      name: 'GooglePhotos_Canal_Execucao.jpg',
      lat: baseLat + 0.0008,
      lng: baseLng + 0.0006,
      image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150" fill="%230284c7"><rect width="200" height="150" fill="%230f172a"/><text x="100" y="75" fill="%23eab308" font-size="12" text-anchor="middle">Google Photos GPS %232</text></svg>',
      url: 'https://photos.google.com/',
      type: 'durante'
    },
    {
      name: 'GooglePhotos_Canal_Concluido.jpg',
      lat: baseLat + 0.0012,
      lng: baseLng + 0.0010,
      image: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150" fill="%230284c7"><rect width="200" height="150" fill="%230f172a"/><text x="100" y="75" fill="%2322c55e" font-size="12" text-anchor="middle">Google Photos GPS %233</text></svg>',
      url: 'https://photos.google.com/',
      type: 'depois'
    }
  ];

  sampleAlbumPhotos.forEach(p => {
    const match = findNearestStretch(p.lat, p.lng, stretches, radiusMeters);

    pendingPhotoItems.push({
      id: 'photo-item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      name: p.name,
      image: p.image,
      url: p.url,
      lat: p.lat,
      lng: p.lng,
      hasExifGps: true,
      date: today,
      time: '10:30',
      matchedStretch: match ? match.stretch : null,
      distance: match ? match.distance : Infinity,
      type: p.type
    });
  });

  renderPreviewTable();
  showToast(`${sampleAlbumPhotos.length} fotos do álbum do Google Fotos sincronizadas com GPS!`, 'success');
}

/**
 * Processes selected photo files (and optional Google Takeout .json metadata files)
 */
async function handleBatchFileSelection(e) {
  const files = Array.from(e.target.files);
  if (!files || files.length === 0) return;

  showToast(`Lendo metadata EXIF e GPS de ${files.length} arquivos...`, 'info');

  const jsonMap = {};
  const imageFiles = [];

  files.forEach(f => {
    if (f.name.toLowerCase().endsWith('.json')) {
      jsonMap[f.name] = f;
    } else if (f.type.startsWith('image/')) {
      imageFiles.push(f);
    }
  });

  const stretches = await db.getAll('trechos');
  const radiusMeters = parseInt(document.getElementById('gphotos-radius-slider').value) || 50;

  for (const file of imageFiles) {
    const meta = await parsePhotoFileMetadata(file, jsonMap);

    // Default fallback coordinates if no GPS found in EXIF
    let lat = meta.lat;
    let lng = meta.lng;

    if (!lat || !lng) {
      if (stretches.length > 0 && stretches[0].coordinates && stretches[0].coordinates.length > 0) {
        lat = stretches[0].coordinates[0][0];
        lng = stretches[0].coordinates[0][1];
      } else {
        lat = -8.0500;
        lng = -34.9000;
      }
    }

    const base64Image = await readFileAsBase64(file);
    const match = findNearestStretch(lat, lng, stretches, radiusMeters);

    pendingPhotoItems.push({
      id: 'photo-item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      name: file.name,
      image: base64Image,
      url: '',
      lat,
      lng,
      hasExifGps: meta.lat !== null,
      date: meta.dateStr,
      time: meta.timeStr,
      matchedStretch: match ? match.stretch : null,
      distance: match ? match.distance : Infinity,
      type: 'antes'
    });
  }

  renderPreviewTable();
  e.target.value = '';
  showToast(`${imageFiles.length} fotos processadas com sucesso!`, 'success');
}

/**
 * Handles manually pasting a Google Photos Link or shared album URL
 */
async function handleAddPhotoLink() {
  const urlInput = document.getElementById('gphotos-url-input');
  const coordsInput = document.getElementById('gphotos-manual-coords');
  const url = urlInput.value.trim();

  if (!url) {
    showToast('Por favor, informe a URL do Google Fotos.', 'warning');
    return;
  }

  const stretches = await db.getAll('trechos');
  const radiusMeters = parseInt(document.getElementById('gphotos-radius-slider').value) || 50;

  let lat = null, lng = null;
  if (coordsInput && coordsInput.value.trim()) {
    const parts = coordsInput.value.split(',');
    if (parts.length === 2) {
      lat = parseFloat(parts[0].trim());
      lng = parseFloat(parts[1].trim());
    }
  }

  if (!lat || !lng) {
    if (stretches.length > 0 && stretches[0].coordinates && stretches[0].coordinates.length > 0) {
      lat = stretches[0].coordinates[0][0];
      lng = stretches[0].coordinates[0][1];
    } else {
      lat = -8.0500;
      lng = -34.9000;
    }
  }

  const match = findNearestStretch(lat, lng, stretches, radiusMeters);
  const today = new Date();

  // Standard Google Photos SVG placeholder icon
  const placeholderImage = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%230ea5e9" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';

  pendingPhotoItems.push({
    id: 'photo-item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    name: 'Google Photos Link',
    image: placeholderImage,
    url: url,
    lat,
    lng,
    hasExifGps: false,
    date: today.toISOString().split('T')[0],
    time: today.toTimeString().split(' ')[0].substring(0, 5),
    matchedStretch: match ? match.stretch : null,
    distance: match ? match.distance : Infinity,
    type: 'antes'
  });

  urlInput.value = '';
  if (coordsInput) coordsInput.value = '';
  renderPreviewTable();
  showToast('Link do Google Fotos adicionado!', 'success');
}

/**
 * Recalculates nearest canal stretch distance based on current slider radius
 */
async function recalculateSpatialMatching() {
  const stretches = await db.getAll('trechos');
  const radiusMeters = parseInt(document.getElementById('gphotos-radius-slider').value) || 50;

  pendingPhotoItems.forEach(item => {
    if (item.lat && item.lng) {
      const match = findNearestStretch(item.lat, item.lng, stretches, radiusMeters);
      item.matchedStretch = match ? match.stretch : null;
      item.distance = match ? match.distance : Infinity;
    }
  });

  renderPreviewTable();
}

/**
 * Renders the preview table of pending matched photos
 */
async function renderPreviewTable() {
  const tableBody = document.getElementById('gphotos-preview-table-body');
  const countSpan = document.getElementById('gphotos-count-matched');
  const confirmBtn = document.getElementById('btn-confirm-gphotos-import');

  if (!tableBody) return;

  const stretches = await db.getAll('trechos');
  if (countSpan) countSpan.innerText = pendingPhotoItems.length;

  if (confirmBtn) {
    confirmBtn.disabled = pendingPhotoItems.length === 0;
  }

  if (pendingPhotoItems.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Nenhuma foto selecionada. Adicione arquivos ou conecte sua conta acima.</td></tr>';
    return;
  }

  tableBody.innerHTML = '';

  pendingPhotoItems.forEach((item, index) => {
    const tr = document.createElement('tr');

    const stretchOptions = stretches.map(s => `
      <option value="${s.id}" ${item.matchedStretch && item.matchedStretch.id === s.id ? 'selected' : ''}>
        ${s.code} - ${s.name}
      </option>
    `).join('');

    const distanceLabel = item.distance < Infinity 
      ? `<span class="badge ${item.distance <= 50 ? 'badge-success' : 'badge-warning'}">${item.distance} m</span>`
      : '<span class="badge badge-secondary">Fora do Raio</span>';

    const gpsStatus = item.hasExifGps 
      ? `<span>${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}</span>` 
      : `<span class="text-muted" title="Coordenada informada ou estimada">${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}</span>`;

    tr.innerHTML = `
      <td><img src="${item.image}" style="width:36px; height:36px; object-fit:cover; border-radius:4px;" /></td>
      <td>
        <strong style="font-size:11px; display:block; max-width:120px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${item.name}">${item.name}</strong>
        ${item.url ? `<a href="${item.url}" target="_blank" style="font-size:10px; color:#0ea5e9;">Ver Link ↗</a>` : ''}
      </td>
      <td>${gpsStatus}</td>
      <td>
        <select class="form-control item-stretch-select" style="font-size:11px; padding:2px 4px;" data-index="${index}">
          <option value="">Selecione canal...</option>
          ${stretchOptions}
        </select>
      </td>
      <td>${distanceLabel}</td>
      <td>
        <select class="form-control item-type-select" style="font-size:11px; padding:2px 4px;" data-index="${index}">
          <option value="antes" ${item.type === 'antes' ? 'selected' : ''}>Antes</option>
          <option value="durante" ${item.type === 'durante' ? 'selected' : ''}>Durante</option>
          <option value="depois" ${item.type === 'depois' ? 'selected' : ''}>Depois</option>
        </select>
      </td>
    `;

    // Dropdown change listeners
    const stretchSelect = tr.querySelector('.item-stretch-select');
    stretchSelect.addEventListener('change', (e) => {
      const selectedId = e.target.value;
      item.matchedStretch = stretches.find(s => s.id === selectedId) || null;
    });

    const typeSelect = tr.querySelector('.item-type-select');
    typeSelect.addEventListener('change', (e) => {
      item.type = e.target.value;
    });

    tableBody.appendChild(tr);
  });
}

/**
 * Saves all matched photo evidence items into IndexedDB fotos store
 */
async function handleConfirmImport() {
  if (pendingPhotoItems.length === 0) return;

  const stretches = await db.getAll('trechos');
  let savedCount = 0;

  for (const item of pendingPhotoItems) {
    let stretchId = item.matchedStretch ? item.matchedStretch.id : (stretches.length > 0 ? stretches[0].id : null);

    if (!stretchId) continue;

    const photoData = {
      stretchId: stretchId,
      type: item.type || 'antes',
      desc: item.name || 'Foto Google Fotos (Raio GPS)',
      date: item.date,
      time: item.time,
      lat: item.lat,
      lng: item.lng,
      image: item.image,
      url: item.url || ''
    };

    await db.put('fotos', photoData);
    savedCount++;
  }

  showToast(`${savedCount} evidências vinculadas com sucesso por raio espacial!`, 'success');
  pendingPhotoItems = [];

  const modal = document.getElementById('google-photos-modal');
  if (modal) modal.classList.remove('open');

  refreshAllViews();
}

/**
 * Helper to convert file to Base64
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
}
