/* ==========================================================================
   GeoLimp - Executive Reports and PDF Compilation Module
   ========================================================================== */

import { db } from './db.js';
import { STATUS_COLORS } from './map.js';
import { showToast } from './utils.js';

let miniMapA = null;
let miniMapB = null;

/**
 * Initializes listeners and sets up default parameters for PDF generation.
 */
export function initReports() {
  // Set default comparison dates
  const today = new Date();
  const dateB = today.toISOString().split('T')[0];
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(today.getDate() - 7);
  const dateA = sevenDaysAgo.toISOString().split('T')[0];

  document.getElementById('rep-compare-start').value = dateA;
  document.getElementById('rep-compare-end').value = dateB;

  // Initial preview update
  updateReportPreview();

  // Listeners
  document.getElementById('rep-title').addEventListener('input', () => {
    document.getElementById('rep-preview-title').innerText = document.getElementById('rep-title').value;
  });

  document.getElementById('rep-obra-id').addEventListener('input', () => {
    document.getElementById('rep-preview-obra').innerText = document.getElementById('rep-obra-id').value;
  });

  document.getElementById('rep-responsible').addEventListener('input', () => {
    document.getElementById('rep-preview-footer-resp').innerText = `Resp. TÃ©cnico: ${document.getElementById('rep-responsible').value}`;
  });

  document.getElementById('rep-compare-start').addEventListener('change', updateReportPreview);
  document.getElementById('rep-compare-end').addEventListener('change', updateReportPreview);

  // PDF Export Trigger
  document.getElementById('btn-generate-pdf').addEventListener('click', generatePdfReport);
  
  // Image Map Export Trigger
  document.getElementById('btn-export-evolution-map').addEventListener('click', exportEvolutionMapImage);
}

/**
 * Recalculate KPIs, draw comparison grids, query evidence photos, and draw dual mini-maps
 */
export async function updateReportPreview() {
  const dateA = document.getElementById('rep-compare-start').value;
  const dateB = document.getElementById('rep-compare-end').value;

  if (!dateA || !dateB) return;

  const stretches = await db.getAll('trechos');
  const diaries = await db.getAll('diarios');
  const photos = await db.getAll('fotos');

  // Format date display
  const formatDate = (dStr) => {
    const p = dStr.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : dStr;
  };

  document.getElementById('lbl-comp-date-a').innerText = formatDate(dateA);
  document.getElementById('lbl-comp-date-b').innerText = formatDate(dateB);

  // 1. GENERAL SYSTEM KPIs
  const totalPlannedArea = stretches.reduce((sum, s) => sum + s.area, 0);
  const totalPlannedExt = stretches.reduce((sum, s) => sum + s.extension, 0);

  const totalAreaDone = diaries.reduce((sum, d) => sum + d.area, 0);
  const totalExtDone = diaries.reduce((sum, d) => sum + d.extension, 0);
  const totalVol = diaries.reduce((sum, d) => sum + d.volume, 0);
  const totalBags = diaries.reduce((sum, d) => sum + d.bags, 0);
  const totalHours = diaries.reduce((sum, d) => sum + (d.workers * d.hours), 0);

  const areaPct = totalPlannedArea > 0 ? Math.round((totalAreaDone / totalPlannedArea) * 100) : 0;
  const extPct = totalPlannedExt > 0 ? Math.round((totalExtDone / totalPlannedExt) * 100) : 0;
  const avgEfficiency = totalHours > 0 ? (totalAreaDone / totalHours).toFixed(2) : '0.00';

  document.getElementById('rep-preview-kpi-area').innerText = `${totalAreaDone.toLocaleString()} mÂ²`;
  document.getElementById('rep-preview-kpi-area-pct').innerText = `(${areaPct}% do previsto)`;

  document.getElementById('rep-preview-kpi-ext').innerText = `${totalExtDone.toLocaleString()} m`;
  document.getElementById('rep-preview-kpi-ext-pct').innerText = `(${extPct}% do previsto)`;

  document.getElementById('rep-preview-kpi-resid').innerText = `${totalVol.toFixed(1)} mÂ³`;
  document.getElementById('rep-preview-kpi-resid-bags').innerText = `(${totalBags.toLocaleString()} sacos)`;

  document.getElementById('rep-preview-kpi-prod').innerText = `${avgEfficiency} mÂ²/h-h`;

  // 2. COMPARISON METRICS (Date A vs Date B)
  // Cumulative values up to date A
  const diariesA = diaries.filter(d => d.date <= dateA);
  const areaA = diariesA.reduce((sum, d) => sum + d.area, 0);
  const extA = diariesA.reduce((sum, d) => sum + d.extension, 0);
  const volA = diariesA.reduce((sum, d) => sum + d.volume, 0);

  // Cumulative values up to date B
  const diariesB = diaries.filter(d => d.date <= dateB);
  const areaB = diariesB.reduce((sum, d) => sum + d.area, 0);
  const extB = diariesB.reduce((sum, d) => sum + d.extension, 0);
  const volB = diariesB.reduce((sum, d) => sum + d.volume, 0);

  // Deltas
  const deltaArea = areaB - areaA;
  const deltaExt = extB - extA;
  const deltaVol = volB - volA;

  document.getElementById('comp-area-a').innerText = `${areaA.toLocaleString()} mÂ²`;
  document.getElementById('comp-area-b').innerText = `${areaB.toLocaleString()} mÂ²`;
  document.getElementById('comp-area-delta').innerText = `${deltaArea >= 0 ? '+' : ''}${deltaArea.toLocaleString()} mÂ²`;
  document.getElementById('comp-area-delta').className = deltaArea >= 0 ? 'text-success' : 'text-danger';

  document.getElementById('comp-ext-a').innerText = `${extA.toLocaleString()} m`;
  document.getElementById('comp-ext-b').innerText = `${extB.toLocaleString()} m`;
  document.getElementById('comp-ext-delta').innerText = `${deltaExt >= 0 ? '+' : ''}${deltaExt.toLocaleString()} m`;
  document.getElementById('comp-ext-delta').className = deltaExt >= 0 ? 'text-success' : 'text-danger';

  document.getElementById('comp-vol-a').innerText = `${volA.toFixed(1)} mÂ³`;
  document.getElementById('comp-vol-b').innerText = `${volB.toFixed(1)} mÂ³`;
  document.getElementById('comp-vol-delta').innerText = `${deltaVol >= 0 ? '+' : ''}${deltaVol.toFixed(1)} mÂ³`;
  document.getElementById('comp-vol-delta').className = deltaVol >= 0 ? 'text-danger' : 'text-success'; // waste delta is technically Red for positive, but let's make it standard red color representing removed amount

  // 3. EVIDENCE PICTURES FOR THE CURRENT PERIOD (Between A and B)
  const periodPhotos = photos.filter(p => p.date >= dateA && p.date <= dateB);
  const photoGrid = document.getElementById('rep-preview-photos');
  photoGrid.innerHTML = '';

  if (periodPhotos.length === 0) {
    photoGrid.innerHTML = '<span class="text-xs text-muted block py-2" style="grid-column: 1 / -1; text-align:center;">Nenhuma evidÃªncia registrada no perÃ­odo selecionado.</span>';
  } else {
    periodPhotos.slice(0, 3).forEach(p => {
      const typeLabel = p.type === 'antes' ? 'Antes' : p.type === 'durante' ? 'Durante' : 'Depois';
      const box = document.createElement('div');
      box.className = 'report-photo-box';
      box.innerHTML = `
        <img src="${p.image}" alt="EvidÃªncia" />
        <span>[${typeLabel.toUpperCase()}] ${p.desc || 'Foto Operacional'}</span>
      `;
      photoGrid.appendChild(box);
    });
  }

  // 4. RENDER DUAL HISTORICAL MINI MAPS
  setupMiniMap('mini-map-a', dateA, stretches, diaries);
  setupMiniMap('mini-map-b', dateB, stretches, diaries);
}

/**
 * Instantiates and draws a static mini representation of channels at a past date.
 */
function setupMiniMap(elementId, dateLimit, stretches, diaries) {
  // Clear any existing Leaflet instances
  const container = document.getElementById(elementId);
  if (!container) return;

  // Leaflet requires clean elements
  if (elementId === 'mini-map-a' && miniMapA) {
    miniMapA.remove();
    miniMapA = null;
  }
  if (elementId === 'mini-map-b' && miniMapB) {
    miniMapB.remove();
    miniMapB = null;
  }

  const mapInstance = L.map(elementId, {
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false
  }).setView([-8.05, -34.90], 12);

  // Background style
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);

  // Filter logs up to this date to find status of each channel
  const historicalStatus = {};
  
  // Initialize all to not-started
  stretches.forEach(s => { historicalStatus[s.id] = 'nao-iniciado'; });

  // Find latest status up to dateLimit
  const logsUpToDate = diaries.filter(d => d.date <= dateLimit).sort((a,b) => new Date(a.date) - new Date(b.date));
  logsUpToDate.forEach(log => {
    historicalStatus[log.stretchId] = log.status;
  });

  // Render stretches with historical colors
  stretches.forEach(s => {
    const latlngs = s.coordinates.map(c => L.latLng(c[0], c[1]));
    const status = historicalStatus[s.id] || 'nao-iniciado';
    const color = STATUS_COLORS[status] || '#64748b';

    const options = {
      color: color,
      weight: 4,
      opacity: 0.85,
      fillColor: color,
      fillOpacity: 0.35
    };

    if (s.coordinates.length > 2 && s.type !== 'polyline') {
      L.polygon(latlngs, options).addTo(mapInstance);
    } else {
      L.polyline(latlngs, options).addTo(mapInstance);
    }
  });

  // Fit bounds to stretches
  if (stretches.length > 0) {
    const allCoords = [];
    stretches.forEach(s => s.coordinates.forEach(c => allCoords.push(c)));
    mapInstance.fitBounds(L.latLngBounds(allCoords));
  }

  // Save reference
  if (elementId === 'mini-map-a') miniMapA = mapInstance;
  else miniMapB = mapInstance;
}

/**
 * Generate PDF compilation using jsPDF + html2canvas
 */
function generatePdfReport() {
  const btn = document.getElementById('btn-generate-pdf');
  btn.disabled = true;
  btn.innerHTML = 'Gerando PDF...';

  const printable = document.getElementById('report-printable-area');

  // Set white styling overrides during screenshot
  printable.style.borderRadius = '0';
  printable.style.boxShadow = 'none';

  html2canvas(printable, {
    scale: 2, // High resolution scale
    useCORS: true
  }).then(canvas => {
    // Restore styling
    printable.style.borderRadius = '';
    printable.style.boxShadow = '';

    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    
    // A4 size: 595 x 842 pt
    const pdf = new jsPDF('p', 'pt', 'a4');
    const imgWidth = 595.28;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Add image fit to A4 page
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
    pdf.save('relatorio_evolucao_geolimp.pdf');

    btn.disabled = false;
    btn.innerHTML = '<i class="nav-icon"></i> Gerar RelatÃ³rio Executivo';
    showToast('RelatÃ³rio PDF compilado e baixado!', 'success');
  }).catch(err => {
    console.error(err);
    btn.disabled = false;
    btn.innerHTML = 'Gerar RelatÃ³rio Executivo';
    showToast('Erro ao compilar PDF.', 'error');
  });
}

/**
 * Capture map instance and export layout with scale, compass, legend and title
 */
function exportEvolutionMapImage() {
  const btn = document.getElementById('btn-export-evolution-map');
  btn.disabled = true;
  btn.innerHTML = 'Capturando...';

  // We capture the #map-container and overlays inside the map-wrapper
  const mapWrapper = document.querySelector('.map-wrapper');

  // Temporarily append a north-arrow and project stamp visual overlay if not there
  let compass = mapWrapper.querySelector('.gis-compass-stamp');
  if (!compass) {
    compass = document.createElement('div');
    compass.className = 'gis-compass-stamp';
    compass.style.position = 'absolute';
    compass.style.top = '150px';
    compass.style.left = '20px';
    compass.style.zIndex = '30';
    compass.style.background = 'rgba(17, 24, 39, 0.8)';
    compass.style.border = '1px solid rgba(255,255,255,0.1)';
    compass.style.padding = '0.5rem';
    compass.style.borderRadius = '8px';
    compass.style.color = '#fff';
    compass.style.textAlign = 'center';
    compass.style.fontSize = '12px';
    compass.style.fontWeight = 'bold';
    compass.innerHTML = `
      <div style="font-size:24px; line-height:1;">â¬†ï¸</div>
      <div>N</div>
    `;
    mapWrapper.appendChild(compass);
  }

  // Stamp details title overlay
  let stamp = mapWrapper.querySelector('.gis-title-stamp');
  if (!stamp) {
    stamp = document.createElement('div');
    stamp.className = 'gis-title-stamp';
    stamp.style.position = 'absolute';
    stamp.style.top = '20px';
    stamp.style.left = '50%';
    stamp.style.transform = 'translateX(-50%)';
    stamp.style.zIndex = '30';
    stamp.style.background = 'rgba(17, 24, 39, 0.9)';
    stamp.style.border = '1px solid rgba(255,255,255,0.15)';
    stamp.style.padding = '0.5rem 1.5rem';
    stamp.style.borderRadius = '20px';
    stamp.style.color = '#fff';
    stamp.style.textAlign = 'center';
    
    db.getAll('trechos').then(stretches => {
      db.getAll('diarios').then(diaries => {
        const total = stretches.reduce((sum,s)=>sum+s.area,0);
        const done = diaries.reduce((sum,d)=>sum+d.area,0);
        const pct = total > 0 ? Math.round((done/total)*100) : 0;
        
        stamp.innerHTML = `
          <h4 style="margin:0; font-size:14px; font-weight:700;">MAPA DE EVOLUÃ‡ÃƒO OPERACIONAL</h4>
          <span style="font-size:10px; color:#38bdf8;">AvanÃ§o FÃ­sico: ${pct}% concluÃ­do | EmissÃ£o: ${new Date().toLocaleDateString('pt-BR')}</span>
        `;
      });
    });
    mapWrapper.appendChild(stamp);
  }

  // Use html2canvas to capture map area
  html2canvas(mapWrapper, {
    useCORS: true,
    excludeComponents: ['.map-file-card', '.map-layers-card', '.map-paint-card', '.map-timelapse-card', '.leaflet-control-zoom', '.map-detail-panel']
  }).then(canvas => {
    // Remove temporary GIS elements
    if (compass) compass.remove();
    if (stamp) stamp.remove();

    const imgUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = imgUrl;
    a.download = 'mapa_avanco_geolimp.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    btn.disabled = false;
    btn.innerHTML = '<i class="nav-icon"></i> Exportar Imagem de AvanÃ§o';
    showToast('Imagem do mapa de avanÃ§o exportada com sucesso!', 'success');
  }).catch(err => {
    console.error(err);
    if (compass) compass.remove();
    if (stamp) stamp.remove();
    btn.disabled = false;
    btn.innerHTML = 'Exportar Imagem de AvanÃ§o';
    showToast('Erro ao exportar imagem do mapa.', 'error');
  });
}

