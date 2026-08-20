/* ==========================================================================
   GeoLimp - Map Management and GIS Logic (Leaflet.js)
   ========================================================================== */

import { db } from './db.js';
import { showToast, getActiveRole, refreshAllViews } from './utils.js';

let mapInstance = null;
let drawnItems = null;
let currentLayerGroup = null;
let drawControl = null;
let selectedStretch = null;

// Tile Layers
let standardTile = null;
let satelliteTile = null;
let hybridTileGroup = null;

// State management
let activeTheme = 'status'; // 'status' or 'viabilidade'
let paintStatus = 'none'; // 'none' or operational status (nao-iniciado, etc.)

// Helper color selectors
export const STATUS_COLORS = {
  'nao-iniciado': '#64748b', // Slate Gray
  'em-andamento': '#eab308', // Yellow
  'concluido': '#22c55e',    // Green
  'retrabalho': '#ef4444',   // Red
  'bloqueado': '#a855f7'     // Purple
};

export const PRODUCTIVITY_COLORS = {
  'alta': '#15803d',     // Dark Green
  'boa': '#22c55e',      // Light Green
  'media': '#eab308',    // Yellow
  'baixa': '#f97316',    // Orange
  'critica': '#ef4444'   // Red
};

// Initial position (Recife, Brazil)
const INITIAL_LAT = -8.05;
const INITIAL_LNG = -34.90;
const INITIAL_ZOOM = 13;

/**
 * Initializes the main interactive Leaflet map.
 */
export function initMap() {
  if (mapInstance) return;

  // Initialize Map
  mapInstance = L.map('map-container', {
    zoomControl: true,
    attributionControl: true
  }).setView([INITIAL_LAT, INITIAL_LNG], INITIAL_ZOOM);

  // Setup Tile Layers
  standardTile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(mapInstance);

  satelliteTile = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  });

  const hybridRoads = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Labels &copy; Esri'
  });
  
  hybridTileGroup = L.layerGroup([satelliteTile, hybridRoads]);

  // Group for drawn items
  drawnItems = L.featureGroup().addTo(mapInstance);
  currentLayerGroup = L.layerGroup().addTo(mapInstance);

  // Setup Map Info Events
  mapInstance.on('mousemove', (e) => {
    const coordsEl = document.getElementById('map-mouse-coordinates');
    if (coordsEl) {
      coordsEl.innerText = `Coords: ${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
    }
  });

  // Scale Graphic
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapInstance);

  // Initialize Drawing tool
  setupDrawControl();

  // Load Stretches on Map
  loadStretchesOnMap();

  // Setup overlay listener events
  setupOverlayListeners();
}

/**
 * Set up the Leaflet.draw control tools
 */
function setupDrawControl() {
  const role = getActiveRole();
  if (role === 'visualizador') {
    if (drawControl) {
      mapInstance.removeControl(drawControl);
      drawControl = null;
    }
    return;
  }

  if (drawControl) {
    mapInstance.removeControl(drawControl);
  }

  drawControl = new L.Control.Draw({
    edit: false, // handled through custom detail panels to avoid conflicts
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: true,
        drawError: { color: '#ef4444', message: '<strong>Erro:</strong> Polígonos não podem se cruzar!' },
        shapeOptions: { color: '#38bdf8', weight: 4 }
      },
      polyline: {
        shapeOptions: { color: '#38bdf8', weight: 5 }
      },
      rect: false,
      circle: false,
      marker: false,
      circlemarker: false
    }
  });

  mapInstance.addControl(drawControl);

  // Drawing event handler
  mapInstance.off(L.Draw.Event.CREATED);
  mapInstance.on(L.Draw.Event.CREATED, (e) => {
    const layer = e.layer;
    const type = e.layerType;

    // Calculate dimensions
    let latlngs = [];
    let extension = 0;
    let area = 0;

    if (type === 'polyline') {
      latlngs = layer.getLatLngs();
      extension = calculateLineLength(latlngs);
      area = extension * 5; // Assumed average width of 5m
    } else if (type === 'polygon') {
      latlngs = layer.getLatLngs()[0];
      area = calculatePolygonArea(latlngs);
      extension = calculateLineLength(latlngs); // Perimeter of polygon
    }

    // Open Register modal with parameters
    openStretchModal({
      id: 'CN-NEW-' + Date.now(),
      name: '',
      code: '',
      extension: Math.round(extension),
      area: Math.round(area),
      responsible: '',
      observations: '',
      status: 'nao-iniciado',
      coordinates: latlngs.map(ll => [ll.lat, ll.lng]),
      type: type // polyline or polygon
    });
  });
}

/**
 * Calculates length of polyline coordinates in meters
 */
function calculateLineLength(latlngs) {
  let totalLength = 0;
  for (let i = 0; i < latlngs.length - 1; i++) {
    totalLength += latlngs[i].distanceTo(latlngs[i + 1]);
  }
  return totalLength;
}

/**
 * Calculates Area of polygon using spherical excess formula (standard GIS approximation)
 */
function calculatePolygonArea(latlngs) {
  let area = 0;
  const R = 6378137; // Earth's mean radius in meters
  if (latlngs.length > 2) {
    for (let i = 0; i < latlngs.length; i++) {
      const p1 = latlngs[i];
      const p2 = latlngs[(i + 1) % latlngs.length];
      const lambda1 = p1.lng * Math.PI / 180;
      const lambda2 = p2.lng * Math.PI / 180;
      const phi1 = p1.lat * Math.PI / 180;
      const phi2 = p2.lat * Math.PI / 180;
      area += (lambda2 - lambda1) * (2 + Math.sin(phi1) + Math.sin(phi2));
    }
    area = Math.abs(area * R * R / 2);
  }
  return area;
}

/**
 * Fetch stretches from database and display them on map
 */
export async function loadStretchesOnMap() {
  if (!mapInstance) return;

  currentLayerGroup.clearLayers();
  const stretches = await db.getAll('trechos');
  const diaries = await db.getAll('diarios');

  stretches.forEach((stretch) => {
    // Hide layer if user turned off visibility in Layer Manager
    if (stretch.visible === false) return;

    const latlngs = stretch.coordinates.map(coord => L.latLng(coord[0], coord[1]));
    let mapLayer = null;
    const color = getStyleColor(stretch, diaries);

    const options = {
      color: color,
      weight: selectedStretch && selectedStretch.id === stretch.id ? 7 : 5,
      opacity: 0.85,
      fillColor: color,
      fillOpacity: 0.4
    };

    if (stretch.coordinates.length > 2 && stretch.type !== 'polyline') {
      mapLayer = L.polygon(latlngs, options);
    } else {
      mapLayer = L.polyline(latlngs, options);
    }

    // Attach custom reference to Leaflet layer
    mapLayer.stretchData = stretch;

    // Direct Click handlers
    mapLayer.on('click', (e) => {
      // Prevent event bubbling
      L.DomEvent.stopPropagation(e);
      
      const role = getActiveRole();

      if (paintStatus !== 'none') {
        // Direct Paint Tool is active
        if (role === 'visualizador') {
          showToast('Permissão Negada: Visualizadores não podem alterar status.', 'error');
          return;
        }

        // Apply new status directly
        stretch.status = paintStatus;
        db.put('trechos', stretch).then(() => {
          showToast(`Trecho ${stretch.code} atualizado para '${paintStatus}'`, 'success');
          
          // Add operational log record for status update if needed
          const today = new Date().toISOString().split('T')[0];
          
          db.getAll('diarios').then(logs => {
            const lastLog = logs.filter(l => l.stretchId === stretch.id).sort((a,b) => new Date(b.date) - new Date(a.date))[0];
            const activeTeam = lastLog ? lastLog.team : 'Equipe A';
            const logRecord = {
              date: today,
              stretchId: stretch.id,
              team: activeTeam,
              workers: 5,
              hours: 8,
              start: '08:00',
              end: '17:00',
              area: 0,
              extension: 0,
              bags: 0,
              volume: 0,
              weather: 'Ensolarado',
              equipments: 'Equipamentos Manuais',
              status: paintStatus,
              observations: `Status operacional pintado diretamente pelo mapa.`
            };
            db.put('diarios', logRecord).then(() => {
              loadStretchesOnMap();
              refreshAllViews();
              // Keep panel updated if open
              if (selectedStretch && selectedStretch.id === stretch.id) {
                openStretchDetailsPanel(stretch);
              }
            });
          });
        });
      } else {
        // Standard Detail view & Auto Zoom Fit
        openStretchDetailsPanel(stretch);
      }
    });

    mapLayer.addTo(currentLayerGroup);
  });

  // Render photo markers on map
  await renderPhotoMarkersOnMap();

  // Render layer manager list overlay
  renderLayerManagerList(stretches);
}

/**
 * Renders interactive camera markers on map for all georeferenced photos in IndexedDB
 */
async function renderPhotoMarkersOnMap() {
  if (!currentLayerGroup) return;

  const photos = await db.getAll('fotos');
  const stretches = await db.getAll('trechos');
  const stretchMap = {};
  stretches.forEach(s => stretchMap[s.id] = s.code);

  photos.forEach(photo => {
    if (photo.lat && photo.lng) {
      const typeLabel = photo.type === 'antes' ? 'Antes' : photo.type === 'durante' ? 'Durante' : 'Depois';
      const stretchCode = stretchMap[photo.stretchId] || 'Vínculo GPS';

      const photoIcon = L.divIcon({
        className: 'custom-gphotos-pin-marker',
        html: `
          <div class="gphotos-map-pin" title="${photo.desc || 'Foto Georreferenciada'}">
            <img src="${photo.image}" alt="Foto" />
          </div>
        `,
        iconSize: [42, 42],
        iconAnchor: [21, 21]
      });

      const marker = L.marker([photo.lat, photo.lng], { icon: photoIcon });
      const imgContent = photo.image ? `<img src="${photo.image}" style="width:100%; max-height:160px; object-fit:cover; border-radius:10px; margin-bottom:6px;" />` : '';

      marker.bindPopup(`
        <div style="max-width: 230px; font-family: 'Outfit', sans-serif; padding:4px;">
          ${imgContent}
          <div style="font-weight:600; font-size:13px; color:#ffffff; margin-bottom:2px;">${photo.desc || 'Evidência Fotográfica'}</div>
          <div style="font-size:11px; color:#38bdf8; font-weight:600;">📍 Trecho: ${stretchCode}</div>
          <div style="font-size:10px; color:#9ca3af; margin-top:2px;">Etapa: <strong>${typeLabel}</strong> • ${photo.date || ''} ${photo.time ? 'às ' + photo.time : ''}</div>
          <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
            <a href="https://maps.google.com/?q=${photo.lat},${photo.lng}" target="_blank" style="font-size:10px; color:#38bdf8; font-weight:600;">🗺️ Google Maps ↗</a>
            ${photo.url ? `<a href="${photo.url}" target="_blank" style="font-size:10px; color:#a855f7; font-weight:600;">🔗 Google Fotos ↗</a>` : ''}
          </div>
        </div>
      `);

      marker.addTo(currentLayerGroup);
    }
  });
}

/**
 * Fits map view and zoom bounds smoothly to frame a given stretch/channel geometry.
 * @param {Object} stretch 
 */
export function zoomToStretch(stretch) {
  if (!mapInstance || !stretch || !stretch.coordinates || stretch.coordinates.length === 0) return;

  const latlngs = stretch.coordinates.map(c => [c[0], c[1]]);
  
  if (latlngs.length === 1) {
    mapInstance.setView(latlngs[0], 17, { animate: true });
    return;
  }

  const bounds = L.latLngBounds(latlngs);
  if (bounds.isValid()) {
    mapInstance.fitBounds(bounds, {
      paddingTopLeft: [50, 50],
      paddingBottomRight: [360, 50], // Account for detail side panel on the right
      maxZoom: 18,
      animate: true,
      duration: 0.8
    });
  }
}

/**
 * Renders the interactive Layer Manager list (stretches toggle & color pickers)
 */
function renderLayerManagerList(stretches) {
  const container = document.getElementById('stretches-list-container');
  if (!container) return;

  const searchInput = document.getElementById('layer-search-input');
  const filterQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';

  const filtered = stretches.filter(s => {
    if (!filterQuery) return true;
    return (s.name && s.name.toLowerCase().includes(filterQuery)) ||
           (s.code && s.code.toLowerCase().includes(filterQuery));
  });

  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = '<span class="text-xs text-muted py-2 text-center block">Nenhuma área/trecho encontrado.</span>';
    return;
  }

  filtered.forEach((stretch) => {
    const item = document.createElement('div');
    item.className = 'stretch-layer-item';

    const isVisible = stretch.visible !== false;
    const currentColor = stretch.color || STATUS_COLORS[stretch.status] || '#0ea5e9';

    item.innerHTML = `
      <input type="checkbox" class="stretch-toggle-checkbox" data-id="${stretch.id}" ${isVisible ? 'checked' : ''} title="Ativar/Desativar no Mapa" />
      <input type="color" class="stretch-color-picker" data-id="${stretch.id}" value="${currentColor}" title="Alterar Cor" />
      <button class="stretch-title-btn" data-id="${stretch.id}" title="Centralizar no mapa e ver detalhes">${stretch.code} - ${stretch.name}</button>
    `;

    // Checkbox visibility toggle listener
    const checkbox = item.querySelector('.stretch-toggle-checkbox');
    checkbox.addEventListener('change', async (e) => {
      stretch.visible = e.target.checked;
      await db.put('trechos', stretch);
      loadStretchesOnMap();
    });

    // Color picker listener
    const colorPicker = item.querySelector('.stretch-color-picker');
    colorPicker.addEventListener('change', async (e) => {
      stretch.color = e.target.value;
      await db.put('trechos', stretch);
      loadStretchesOnMap();
      if (selectedStretch && selectedStretch.id === stretch.id) {
        selectedStretch.color = stretch.color;
      }
    });

    // Title click -> center map & open detail panel
    const titleBtn = item.querySelector('.stretch-title-btn');
    titleBtn.addEventListener('click', () => {
      if (stretch.coordinates && stretch.coordinates.length > 0) {
        mapInstance.panTo([stretch.coordinates[0][0], stretch.coordinates[0][1]]);
      }
      openStretchDetailsPanel(stretch);
    });

    container.appendChild(item);
  });
}

/**
 * Determines styling color of stretch based on active Theme (Status Obra vs Viabilidade)
 */
function getStyleColor(stretch, diaries) {
  if (activeTheme === 'status') {
    // Status Obra: Returns color corresponding to operational status painted by the user
    return STATUS_COLORS[stretch.status] || stretch.color || '#64748b';
  } else {
    // Viabilidade: Returns original color coming from imported KMZ/KML/GeoJSON file
    return stretch.originalColor || stretch.color || '#0ea5e9';
  }
}

/**
 * Setup layout UI action listeners
 */
function setupOverlayListeners() {
  // Tile layer toggles
  document.querySelectorAll('[data-map-layer]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('[data-map-layer]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const layerName = btn.dataset.mapLayer;
      mapInstance.removeLayer(standardTile);
      mapInstance.removeLayer(satelliteTile);
      mapInstance.removeLayer(hybridTileGroup);

      if (layerName === 'standard') standardTile.addTo(mapInstance);
      else if (layerName === 'satellite') satelliteTile.addTo(mapInstance);
      else if (layerName === 'hybrid') hybridTileGroup.addTo(mapInstance);
    });
  });

  // Theme selector toggle (Status Obra vs Viabilidade)
  const themeStatusBtn = document.getElementById('theme-status');
  const themeViabilidadeBtn = document.getElementById('theme-viabilidade');

  if (themeStatusBtn && themeViabilidadeBtn) {
    themeStatusBtn.addEventListener('click', () => {
      themeStatusBtn.classList.add('active');
      themeViabilidadeBtn.classList.remove('active');
      activeTheme = 'status';
      loadStretchesOnMap();
      showToast('Visualizando Tema: Status da Obra', 'info');
    });

    themeViabilidadeBtn.addEventListener('click', () => {
      themeViabilidadeBtn.classList.add('active');
      themeStatusBtn.classList.remove('active');
      activeTheme = 'viabilidade';
      loadStretchesOnMap();
      showToast('Visualizando Tema: Viabilidade (Cores do Arquivo Importado)', 'info');
    });
  }

  // Paint status direct colors tool
  document.querySelectorAll('.paint-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.paint-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      paintStatus = opt.dataset.paintStatus;

      if (paintStatus !== 'none') {
        mapInstance.getContainer().style.cursor = 'cell';
        showToast(`Ferramenta Pintar ativa. Clique em um trecho para aplicar status.`, 'warning');
      } else {
        mapInstance.getContainer().style.cursor = '';
      }
    });
  });

  // Collapsible overlay card panels
  document.querySelectorAll('.panel-collapse-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.map-overlay-panel');
      if (card) {
        card.classList.toggle('collapsed');
      }
    });
  });

  // Detail panel close btn
  document.getElementById('close-detail-btn').addEventListener('click', closeStretchDetailsPanel);

  // KML import hook
  document.getElementById('btn-import-kml').addEventListener('click', () => {
    const role = getActiveRole();
    if (role === 'visualizador') {
      showToast('Permissão Negada: Apenas Fiscais/Admins podem importar arquivos.', 'error');
      return;
    }
    document.getElementById('kml-file-input').click();
  });

  document.getElementById('kml-file-input').addEventListener('change', handleKmlImport);

  // Export dropdown
  document.getElementById('export-geojson').addEventListener('click', (e) => {
    e.preventDefault();
    exportGisData('geojson');
  });

  document.getElementById('export-kml').addEventListener('click', (e) => {
    e.preventDefault();
    exportGisData('kml');
  });

  // Split, Merge, Edit, Delete details panel hooks
  document.getElementById('btn-edit-stretch').addEventListener('click', () => {
    const role = getActiveRole();
    if (role === 'visualizador') {
      showToast('Permissão Negada.', 'error');
      return;
    }
    if (selectedStretch) openStretchModal(selectedStretch);
  });

  document.getElementById('btn-delete-stretch').addEventListener('click', () => {
    const role = getActiveRole();
    if (role !== 'admin') {
      showToast('Apenas administradores podem excluir trechos.', 'error');
      return;
    }
    if (selectedStretch && confirm(`Deseja excluir o trecho ${selectedStretch.code}? Esta ação não pode ser desfeita.`)) {
      db.delete('trechos', selectedStretch.id).then(() => {
        showToast('Trecho excluído com sucesso.', 'success');
        closeStretchDetailsPanel();
        loadStretchesOnMap();
        refreshAllViews();
      });
    }
  });

  document.getElementById('btn-split-stretch').addEventListener('click', handleSplitAction);
  document.getElementById('btn-merge-stretch').addEventListener('click', handleMergeAction);

  // Layer Manager Search & Toggle All listeners
  const toggleAllBtn = document.getElementById('btn-toggle-all-stretches');
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener('click', async () => {
      const stretches = await db.getAll('trechos');
      if (stretches.length === 0) return;
      
      const hasVisible = stretches.some(s => s.visible !== false);
      const newVisibleState = !hasVisible;
      
      for (const s of stretches) {
        s.visible = newVisibleState;
        await db.put('trechos', s);
      }
      
      loadStretchesOnMap();
      showToast(newVisibleState ? 'Todas as áreas ativadas no mapa.' : 'Todas as áreas desativadas no mapa.', 'info');
    });
  }

  const layerSearch = document.getElementById('layer-search-input');
  if (layerSearch) {
    layerSearch.addEventListener('input', async () => {
      const stretches = await db.getAll('trechos');
      renderLayerManagerList(stretches);
    });
  }

  // Modal actions
  document.getElementById('close-stretch-modal-btn').addEventListener('click', closeStretchModal);
  document.getElementById('btn-cancel-stretch').addEventListener('click', closeStretchModal);
  document.getElementById('stretch-form').addEventListener('submit', saveStretchFromModal);
}

/**
 * Converts KML color (AABBGGRR / BBGGRR hex) to standard CSS #RRGGBB format
 */
function kmlColorToHex(kmlColor) {
  if (!kmlColor) return null;
  let str = kmlColor.trim().replace('#', '');
  if (str.length === 8) {
    // KML format: AABBGGRR -> RRGGBB
    const r = str.substring(6, 8);
    const g = str.substring(4, 6);
    const b = str.substring(2, 4);
    return `#${r}${g}${b}`;
  } else if (str.length === 6) {
    // BBGGRR -> RRGGBB
    const r = str.substring(4, 6);
    const g = str.substring(2, 4);
    const b = str.substring(0, 2);
    return `#${r}${g}${b}`;
  }
  return `#${str}`;
}

/**
 * Extracts Style and StyleMap definitions from KML xmlDoc
 */
function extractKmlStyles(xmlDoc) {
  const styles = {};

  // Parse all <Style id="..."> elements
  const styleNodes = xmlDoc.getElementsByTagName('Style');
  for (let i = 0; i < styleNodes.length; i++) {
    const style = styleNodes[i];
    const id = style.getAttribute('id');
    if (id) {
      const lineStyle = style.getElementsByTagName('LineStyle')[0];
      const polyStyle = style.getElementsByTagName('PolyStyle')[0];
      const iconStyle = style.getElementsByTagName('IconStyle')[0];
      
      const colorNode = (lineStyle && lineStyle.getElementsByTagName('color')[0]) ||
                        (polyStyle && polyStyle.getElementsByTagName('color')[0]) ||
                        (iconStyle && iconStyle.getElementsByTagName('color')[0]) ||
                        style.getElementsByTagName('color')[0];
      
      if (colorNode) {
        const hex = kmlColorToHex(colorNode.textContent);
        if (hex) {
          styles['#' + id] = hex;
          styles[id] = hex;
        }
      }
    }
  }

  // Parse <StyleMap> elements
  const styleMapNodes = xmlDoc.getElementsByTagName('StyleMap');
  for (let i = 0; i < styleMapNodes.length; i++) {
    const map = styleMapNodes[i];
    const mapId = map.getAttribute('id');
    if (mapId) {
      const pair = map.getElementsByTagName('Pair')[0];
      if (pair) {
        const styleUrlNode = pair.getElementsByTagName('styleUrl')[0];
        if (styleUrlNode) {
          const url = styleUrlNode.textContent.trim();
          if (styles[url]) {
            styles['#' + mapId] = styles[url];
            styles[mapId] = styles[url];
          }
        }
      }
    }
  }

  return styles;
}

/**
 * Handle KML / KMZ file parsing and adding to Map/DB
 */
async function handleKmlImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    let kmlText = '';
    const isKmz = file.name.toLowerCase().endsWith('.kmz');

    if (isKmz) {
      if (!window.JSZip) {
        showToast('Biblioteca JSZip não carregada para processar arquivo KMZ.', 'error');
        return;
      }
      showToast('Descompactando arquivo KMZ...', 'info');
      const zip = await window.JSZip.loadAsync(file);
      const kmlFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.kml'));
      if (!kmlFile) {
        showToast('Nenhum arquivo KML encontrado dentro do KMZ.', 'error');
        return;
      }
      kmlText = await kmlFile.async('text');
    } else {
      kmlText = await file.text();
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(kmlText, 'text/xml');
    
    const placemarks = xmlDoc.getElementsByTagName('Placemark');
    if (placemarks.length === 0) {
      showToast('Nenhum Placemark encontrado no arquivo KML/KMZ.', 'error');
      return;
    }

    // Extract document styles table
    const docStyles = extractKmlStyles(xmlDoc);

    let importCount = 0;
    let allImportedCoords = [];
    
    for (let i = 0; i < placemarks.length; i++) {
      const placemark = placemarks[i];
      const nameNode = placemark.getElementsByTagName('name')[0];
      const name = nameNode ? nameNode.textContent : `Canal Importado ${i + 1}`;
      const code = `CN-IMP-${Math.floor(100 + Math.random() * 900)}`;

      // Extract color from styleUrl or inline Style
      let extractedColor = null;
      const styleUrlNode = placemark.getElementsByTagName('styleUrl')[0];
      if (styleUrlNode) {
        const url = styleUrlNode.textContent.trim();
        if (docStyles[url]) {
          extractedColor = docStyles[url];
        }
      }

      if (!extractedColor) {
        const inlineStyle = placemark.getElementsByTagName('Style')[0];
        if (inlineStyle) {
          const lineStyle = inlineStyle.getElementsByTagName('LineStyle')[0];
          const polyStyle = inlineStyle.getElementsByTagName('PolyStyle')[0];
          const colorNode = (lineStyle && lineStyle.getElementsByTagName('color')[0]) ||
                            (polyStyle && polyStyle.getElementsByTagName('color')[0]) ||
                            inlineStyle.getElementsByTagName('color')[0];
          if (colorNode) {
            extractedColor = kmlColorToHex(colorNode.textContent);
          }
        }
      }

      // Generate dynamic distinct color if none extracted
      const defaultPalette = ['#0ea5e9', '#06b6d4', '#10b981', '#a855f7', '#f97316', '#eab308'];
      const finalColor = extractedColor || defaultPalette[i % defaultPalette.length];

      // Extract Coordinates
      let coordinates = [];
      let geometryType = 'polyline';

      // Check LineString coordinates
      const lineNode = placemark.getElementsByTagName('LineString')[0] || placemark.getElementsByTagName('Polygon')[0];
      if (lineNode) {
        const coordTextNode = lineNode.getElementsByTagName('coordinates')[0];
        if (coordTextNode) {
          const coordText = coordTextNode.textContent.trim();
          const points = coordText.split(/\s+/);
          
          points.forEach(point => {
            const parts = point.split(',');
            if (parts.length >= 2) {
              const lng = parseFloat(parts[0]);
              const lat = parseFloat(parts[1]);
              if (!isNaN(lat) && !isNaN(lng)) {
                coordinates.push([lat, lng]);
                allImportedCoords.push([lat, lng]);
              }
            }
          });
        }
        
        if (placemark.getElementsByTagName('Polygon')[0]) {
          geometryType = 'polygon';
        }
      }

      if (coordinates.length > 1) {
        // Calculate length
        let extension = 0;
        let area = 0;
        
        const leafletLatLngs = coordinates.map(c => L.latLng(c[0], c[1]));
        
        if (geometryType === 'polyline') {
          extension = calculateLineLength(leafletLatLngs);
          area = extension * 5;
        } else {
          area = calculatePolygonArea(leafletLatLngs);
          extension = calculateLineLength(leafletLatLngs);
        }

        const newStretch = {
          id: 'CN-IMP-' + Date.now() + '-' + i,
          name: name,
          code: code,
          extension: Math.round(extension),
          area: Math.round(area),
          responsible: 'Responsável Técnico',
          created: new Date().toISOString().split('T')[0],
          status: 'nao-iniciado',
          observations: `Importado via arquivo ${isKmz ? 'KMZ' : 'KML'}.`,
          coordinates: coordinates,
          type: geometryType,
          color: finalColor,
          originalColor: finalColor,
          visible: true
        };

        await db.put('trechos', newStretch);
        importCount++;
      }
    }

    showToast(`${importCount} trechos importados com cores e geometrias!`, 'success');
    loadStretchesOnMap();
    refreshAllViews();
    
    // Auto fit map zoom to frame all imported KML/KMZ geometries perfectly
    if (allImportedCoords.length > 0 && mapInstance) {
      const bounds = L.latLngBounds(allImportedCoords);
      if (bounds.isValid()) {
        mapInstance.fitBounds(bounds, {
          padding: [60, 60],
          maxZoom: 17,
          animate: true,
          duration: 0.8
        });
      }
    }
  } catch (err) {
    console.error(err);
    showToast('Erro ao processar arquivo KML/KMZ. Verifique o formato.', 'error');
  }

  // Reset input
  e.target.value = '';
}

/**
 * Export channel database to GeoJSON or KML file
 */
async function exportGisData(format) {
  const stretches = await db.getAll('trechos');
  if (stretches.length === 0) {
    showToast('NÃ£o hÃ¡ trechos cadastrados para exportar.', 'error');
    return;
  }

  let fileContent = '';
  let filename = '';
  let mimeType = '';

  if (format === 'geojson') {
    const geojson = {
      type: 'FeatureCollection',
      features: stretches.map(stretch => {
        const type = (stretch.coordinates.length > 2 && stretch.type !== 'polyline') ? 'Polygon' : 'LineString';
        const coords = type === 'Polygon' 
          ? [stretch.coordinates.map(c => [c[1], c[0]])] 
          : stretch.coordinates.map(c => [c[1], c[0]]);

        return {
          type: 'Feature',
          properties: {
            id: stretch.id,
            name: stretch.name,
            code: stretch.code,
            extension: stretch.extension,
            area: stretch.area,
            status: stretch.status,
            responsible: stretch.responsible,
            created: stretch.created,
            observations: stretch.observations
          },
          geometry: {
            type: type,
            coordinates: coords
          }
        };
      })
    };

    fileContent = JSON.stringify(geojson, null, 2);
    filename = 'geocampo_canais.geojson';
    mimeType = 'application/json';
  } else if (format === 'kml') {
    let placemarksKml = '';
    
    stretches.forEach(stretch => {
      const type = (stretch.coordinates.length > 2 && stretch.type !== 'polyline') ? 'Polygon' : 'LineString';
      let coordsKml = '';
      
      stretch.coordinates.forEach(c => {
        coordsKml += `${c[1]},${c[0]},0 `;
      });

      let geomTag = '';
      if (type === 'Polygon') {
        geomTag = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordsKml.trim()}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
      } else {
        geomTag = `<LineString><coordinates>${coordsKml.trim()}</coordinates></LineString>`;
      }

      const colorHex = (stretch.color || STATUS_COLORS[stretch.status] || '#0ea5e9').replace('#', '');
      let kmlColor = 'ff00aaff';
      if (colorHex.length === 6) {
        const r = colorHex.substring(0, 2);
        const g = colorHex.substring(2, 4);
        const b = colorHex.substring(4, 6);
        kmlColor = `ff${b}${g}${r}`;
      }

      placemarksKml += `
    <Placemark>
      <name>${stretch.name}</name>
      <description>Código: ${stretch.code} | Responsável: ${stretch.responsible} | Status: ${stretch.status}</description>
      <Style>
        <LineStyle><color>${kmlColor}</color><width>4</width></LineStyle>
        <PolyStyle><color>7f${kmlColor.substring(2)}</color></PolyStyle>
      </Style>
      ${geomTag}
    </Placemark>`;
    });

    fileContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Canais GeoCampo</name>
    ${placemarksKml}
  </Document>
</kml>`;

    filename = 'geocampo_canais.kml';
    mimeType = 'application/vnd.google-earth.kml+xml';
  }

  // Trigger file download
  const blob = new Blob([fileContent], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`Dados exportados com sucesso em formato ${format.toUpperCase()}`, 'success');
}

/**
 * Render selected stretch parameters in the side overlay detail panel
 */
export async function openStretchDetailsPanel(stretch) {
  selectedStretch = stretch;
  
  // Fit map zoom to frame the selected stretch geometry
  zoomToStretch(stretch);

  // Highlight active layer on map
  loadStretchesOnMap();

  // Populate HTML elements
  document.getElementById('detail-title').innerText = stretch.name;
  document.getElementById('detail-code').innerText = stretch.code;
  document.getElementById('detail-responsible').innerText = stretch.responsible;
  document.getElementById('detail-extension').innerText = `${stretch.extension} m`;
  document.getElementById('detail-area').innerText = `${stretch.area} mÂ²`;
  document.getElementById('detail-created').innerText = stretch.created;
  document.getElementById('detail-observations').innerText = stretch.observations || 'Nenhuma observaÃ§Ã£o registrada.';

  // Style status badge
  const pill = document.getElementById('detail-status-pill');
  pill.innerText = stretch.status.replace('-', ' ');
  pill.style.background = STATUS_COLORS[stretch.status] || stretch.color || '#0ea5e9';
  pill.style.color = '#ffffff';

  // Detail color picker
  const detailColorPicker = document.getElementById('detail-color-picker');
  if (detailColorPicker) {
    detailColorPicker.value = stretch.color || STATUS_COLORS[stretch.status] || '#0ea5e9';
    detailColorPicker.onchange = async (e) => {
      stretch.color = e.target.value;
      await db.put('trechos', stretch);
      loadStretchesOnMap();
      showToast(`Cor do trecho ${stretch.code} atualizada!`, 'success');
    };
  }

  // Calculate Cumulative Production for this stretch
  const diaries = await db.getAll('diarios');
  const stretchDiaries = diaries.filter(d => d.stretchId === stretch.id);
  
  let totArea = 0;
  let totExt = 0;
  let totResid = 0;
  
  stretchDiaries.forEach(d => {
    totArea += d.area;
    totExt += d.extension;
    totResid += d.volume;
  });

  document.getElementById('detail-prod-area').innerText = `${totArea} mÂ²`;
  document.getElementById('detail-prod-ext').innerText = `${totExt} m`;
  document.getElementById('detail-prod-resid').innerText = `${totResid.toFixed(1)} mÂ³`;

  // Fetch photos for this stretch
  const photos = await db.getAll('fotos');
  const stretchPhotos = photos.filter(p => p.stretchId === stretch.id);
  
  const grid = document.getElementById('detail-photos-grid');
  grid.innerHTML = '';
  
  if (stretchPhotos.length === 0) {
    grid.innerHTML = '<span class="text-xs text-muted block py-2">Nenhuma foto anexada.</span>';
  } else {
    stretchPhotos.slice(-3).forEach(photo => {
      const thumb = document.createElement('div');
      thumb.className = 'photo-thumb';
      thumb.title = photo.desc || 'Foto operacional';
      thumb.innerHTML = `<img src="${photo.image}" alt="Preview" />`;
      thumb.addEventListener('click', () => {
        // Switch to photo tab and filter by this stretch
        document.querySelector('[data-tab="photos"]').click();
        const select = document.getElementById('filter-photo-stretch');
        if (select) {
          select.value = stretch.id;
          select.dispatchEvent(new Event('change'));
        }
      });
      grid.appendChild(thumb);
    });
  }

  // Slide panel open
  document.getElementById('stretch-detail-panel').classList.add('open');
}

/**
 * Closes the selected stretch side detail panel
 */
export function closeStretchDetailsPanel() {
  selectedStretch = null;
  document.getElementById('stretch-detail-panel').classList.remove('open');
  loadStretchesOnMap(); // Clear highlight weight
}

/**
 * Open Modal to register or edit a stretch details
 */
export function openStretchModal(stretchData) {
  const modal = document.getElementById('stretch-modal');
  
  // Prefill Form Fields
  document.getElementById('stretch-id').value = stretchData.id;
  document.getElementById('stretch-name').value = stretchData.name;
  document.getElementById('stretch-code').value = stretchData.code;
  document.getElementById('stretch-extension').value = stretchData.extension;
  document.getElementById('stretch-area').value = stretchData.area;
  document.getElementById('stretch-responsible').value = stretchData.responsible || 'Eng. Gabriel Santos';
  document.getElementById('stretch-observations-input').value = stretchData.observations || '';
  
  // Store coordinates & type on form dataset
  modal.dataset.coordinates = JSON.stringify(stretchData.coordinates);
  modal.dataset.type = stretchData.type || 'polyline';
  modal.dataset.status = stretchData.status || 'nao-iniciado';
  modal.dataset.created = stretchData.created || new Date().toISOString().split('T')[0];

  // Set header
  const isEdit = stretchData.name !== '';
  document.getElementById('stretch-modal-title').innerText = isEdit ? 'Editar Trecho' : 'Cadastrar Novo Trecho';

  modal.classList.add('open');
}

/**
 * Close Register Stretch Modal
 */
function closeStretchModal() {
  document.getElementById('stretch-modal').classList.remove('open');
  document.getElementById('stretch-form').reset();
}

/**
 * Save Stretch Details (triggered on form submit inside Modal)
 */
function saveStretchFromModal(e) {
  e.preventDefault();
  
  const modal = document.getElementById('stretch-modal');
  const id = document.getElementById('stretch-id').value;
  const name = document.getElementById('stretch-name').value;
  const code = document.getElementById('stretch-code').value;
  const extension = parseFloat(document.getElementById('stretch-extension').value);
  const area = parseFloat(document.getElementById('stretch-area').value);
  const responsible = document.getElementById('stretch-responsible').value;
  const observations = document.getElementById('stretch-observations-input').value;
  
  const coordinates = JSON.parse(modal.dataset.coordinates);
  const type = modal.dataset.type;
  const status = modal.dataset.status;
  const created = modal.dataset.created;

  const stretchData = {
    id,
    name,
    code,
    extension,
    area,
    responsible,
    observations,
    coordinates,
    type,
    status,
    created
  };

  db.put('trechos', stretchData).then(() => {
    showToast('Trecho georreferenciado salvo com sucesso!', 'success');
    closeStretchModal();
    loadStretchesOnMap();
    refreshAllViews();
    
    // If details panel was open, refresh it
    if (selectedStretch && selectedStretch.id === id) {
      openStretchDetailsPanel(stretchData);
    }
  }).catch((err) => {
    console.error(err);
    showToast('Erro ao salvar trecho no banco de dados.', 'error');
  });
}

/**
 * Split a Polyline or Polygon at the closest index to a clicked map point
 */
function handleSplitAction() {
  const role = getActiveRole();
  if (role === 'visualizador') {
    showToast('Permissão Negada.', 'error');
    return;
  }
  if (!selectedStretch) return;

  showToast('Clique no local do mapa onde deseja dividir o trecho.', 'warning');
  closeStretchDetailsPanel();

  mapInstance.once('click', async (e) => {
    const clickLatLng = e.latlng;
    
    // Find closest segment in coordinates array
    const coords = selectedStretch.coordinates;
    let minDistance = Infinity;
    let splitIndex = 1;

    for (let i = 0; i < coords.length - 1; i++) {
      const p1 = L.latLng(coords[i][0], coords[i][1]);
      const p2 = L.latLng(coords[i+1][0], coords[i+1][1]);
      
      // Calculate distance to line segment p1-p2
      const dist = L.LineUtil.pointToSegmentDistance(
        mapInstance.latLngToLayerPoint(clickLatLng),
        mapInstance.latLngToLayerPoint(p1),
        mapInstance.latLngToLayerPoint(p2)
      );

      if (dist < minDistance) {
        minDistance = dist;
        splitIndex = i + 1; // split after coordinate index i
      }
    }

    if (splitIndex > 0 && splitIndex < coords.length) {
      // Split coordinates array into two segments
      const splitPoint = [clickLatLng.lat, clickLatLng.lng];
      
      const newCoordsA = [...coords.slice(0, splitIndex), splitPoint];
      const newCoordsB = [splitPoint, ...coords.slice(splitIndex)];

      // Calculate sizes
      const extA = calculateLineLength(newCoordsA.map(c => L.latLng(c[0], c[1])));
      const extB = calculateLineLength(newCoordsB.map(c => L.latLng(c[0], c[1])));
      const areaA = Math.round(extA * 5);
      const areaB = Math.round(extB * 5);

      const stretchA = {
        ...selectedStretch,
        id: selectedStretch.id + '-A',
        name: selectedStretch.name + ' (Parte A)',
        code: selectedStretch.code + '-A',
        extension: Math.round(extA),
        area: areaA,
        coordinates: newCoordsA
      };

      const stretchB = {
        ...selectedStretch,
        id: selectedStretch.id + '-B',
        name: selectedStretch.name + ' (Parte B)',
        code: selectedStretch.code + '-B',
        extension: Math.round(extB),
        area: areaB,
        coordinates: newCoordsB
      };

      // Transactionally save A and B, delete original
      await db.delete('trechos', selectedStretch.id);
      await db.put('trechos', stretchA);
      await db.put('trechos', stretchB);

      showToast(`Trecho ${selectedStretch.code} dividido com sucesso!`, 'success');
      loadStretchesOnMap();
      refreshAllViews();
    }
  });
}

/**
 * Merges the selected stretch with another chosen stretch
 */
function handleMergeAction() {
  const role = getActiveRole();
  if (role === 'visualizador') {
    showToast('Permissão Negada.', 'error');
    return;
  }
  if (!selectedStretch) return;

  const originalStretch = selectedStretch;
  showToast('Clique no outro trecho que deseja unir a este.', 'warning');
  closeStretchDetailsPanel();

  // Highlight the current one we are merging
  const flashLayer = L.polyline(originalStretch.coordinates, { color: '#38bdf8', weight: 8, dashArray: '10, 10' }).addTo(mapInstance);

  mapInstance.once('click', async (e) => {
    mapInstance.removeLayer(flashLayer);
    
    // Find clicked layer by checking intersections
    const stretches = await db.getAll('trechos');
    let targetStretch = null;
    let minDistance = Infinity;

    stretches.forEach(str => {
      if (str.id === originalStretch.id) return;

      str.coordinates.forEach(coord => {
        const pt = L.latLng(coord[0], coord[1]);
        const dist = pt.distanceTo(e.latlng);
        if (dist < minDistance && dist < 100) { // must be close enough (100m)
          minDistance = dist;
          targetStretch = str;
        }
      });
    });

    if (!targetStretch) {
      showToast('Nenhum trecho válido clicado para fusão.', 'error');
      loadStretchesOnMap();
      return;
    }

    // Merge coordinates
    const mergedCoords = [...originalStretch.coordinates, ...targetStretch.coordinates];
    const totalExt = originalStretch.extension + targetStretch.extension;
    const totalArea = originalStretch.area + targetStretch.area;

    const mergedStretch = {
      ...originalStretch,
      id: originalStretch.id + '-UN',
      name: `${originalStretch.name} (Unido)`,
      code: `${originalStretch.code}-U`,
      extension: totalExt,
      area: totalArea,
      coordinates: mergedCoords
    };

    // Remove both parents, save merged
    await db.delete('trechos', originalStretch.id);
    await db.delete('trechos', targetStretch.id);
    await db.put('trechos', mergedStretch);

    showToast(`Trechos ${originalStretch.code} e ${targetStretch.code} unidos com sucesso!`, 'success');
    loadStretchesOnMap();
    refreshAllViews();
  });
}

