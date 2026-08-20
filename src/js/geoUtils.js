/* ==========================================================================
   GeoLimp - Geospatial & EXIF Utilities
   ========================================================================== */

/**
 * Calculates Haversine distance in meters between two lat/lng points
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates minimum distance in meters from a point (pLat, pLng) 
 * to a line segment defined by (aLat, aLng) and (bLat, bLng).
 */
export function pointToSegmentDistance(pLat, pLng, aLat, aLng, bLat, bLng) {
  const l2 = haversineDistance(aLat, aLng, bLat, bLng);
  if (l2 === 0) return haversineDistance(pLat, pLng, aLat, aLng);

  // Convert to flat Cartesian approximation locally around point A
  const cosLat = Math.cos(aLat * Math.PI / 180);
  const R = 6371000;
  
  const ax = 0, ay = 0;
  const bx = (bLng - aLng) * Math.PI / 180 * R * cosLat;
  const by = (bLat - aLat) * Math.PI / 180 * R;
  
  const px = (pLng - aLng) * Math.PI / 180 * R * cosLat;
  const py = (pLat - aLat) * Math.PI / 180 * R;

  const segLengthSq = bx * bx + by * by;
  if (segLengthSq === 0) return Math.sqrt(px * px + py * py);

  let t = (px * bx + py * by) / segLengthSq;
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * bx;
  const projY = ay + t * by;

  const dx = px - projX;
  const dy = py - projY;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates minimum distance in meters between a photo coordinate and a canal geometry (polyline or polygon)
 */
export function pointToStretchDistance(pLat, pLng, coordinates) {
  if (!coordinates || coordinates.length === 0) return Infinity;
  if (coordinates.length === 1) {
    return haversineDistance(pLat, pLng, coordinates[0][0], coordinates[0][1]);
  }

  let minDistance = Infinity;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const aLat = coordinates[i][0];
    const aLng = coordinates[i][1];
    const bLat = coordinates[i + 1][0];
    const bLng = coordinates[i + 1][1];

    const dist = pointToSegmentDistance(pLat, pLng, aLat, aLng, bLat, bLng);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  return minDistance;
}

/**
 * Finds the nearest canal stretch for a given GPS point within a maximum radius (in meters)
 * @param {number} pLat Latitude of photo
 * @param {number} pLng Longitude of photo
 * @param {Array} stretches List of stretch objects from DB
 * @param {number} radiusMeters Maximum proximity radius in meters
 * @returns {Object|null} { stretch, distance }
 */
export function findNearestStretch(pLat, pLng, stretches, radiusMeters = 100) {
  if (!stretches || stretches.length === 0) return null;

  let nearest = null;
  let minDistance = Infinity;

  stretches.forEach(stretch => {
    if (!stretch.coordinates || stretch.coordinates.length === 0) return;

    const dist = pointToStretchDistance(pLat, pLng, stretch.coordinates);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = stretch;
    }
  });

  if (nearest && minDistance <= radiusMeters) {
    return { stretch: nearest, distance: Math.round(minDistance) };
  } else if (nearest) {
    return { stretch: nearest, distance: Math.round(minDistance), outOfRadius: true };
  }

  return null;
}

/**
 * Extracts GPS and DateTime from photo file EXIF data or Google Takeout JSON
 */
export async function parsePhotoFileMetadata(file, jsonFilesMap = {}) {
  let lat = null;
  let lng = null;
  let dateStr = new Date().toISOString().split('T')[0];
  let timeStr = new Date().toTimeString().split(' ')[0].substring(0, 5);

  // Check if exifr window object is available
  if (window.exifr) {
    try {
      const exifData = await window.exifr.parse(file, ['latitude', 'longitude', 'DateTimeOriginal', 'CreateDate']);
      if (exifData) {
        if (exifData.latitude !== undefined && exifData.longitude !== undefined) {
          lat = parseFloat(exifData.latitude);
          lng = parseFloat(exifData.longitude);
        }
        const photoDate = exifData.DateTimeOriginal || exifData.CreateDate;
        if (photoDate instanceof Date && !isNaN(photoDate)) {
          dateStr = photoDate.toISOString().split('T')[0];
          timeStr = photoDate.toTimeString().split(' ')[0].substring(0, 5);
        }
      }
    } catch (err) {
      console.warn('Could not parse EXIF metadata from photo:', err);
    }
  }

  // Check Google Takeout JSON companion file (e.g., photo.jpg -> photo.jpg.json or photo.json)
  const jsonFileName = file.name + '.json';
  const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
  const altJsonFileName = baseName + '.json';

  const jsonFile = jsonFilesMap[jsonFileName] || jsonFilesMap[altJsonFileName];

  if (jsonFile) {
    try {
      const jsonText = await jsonFile.text();
      const metadata = JSON.parse(jsonText);

      if (metadata.geoData && (metadata.geoData.latitude || metadata.geoData.longitude)) {
        lat = parseFloat(metadata.geoData.latitude);
        lng = parseFloat(metadata.geoData.longitude);
      } else if (metadata.photoTakenTime && metadata.photoTakenTime.timestamp) {
        const timestamp = parseInt(metadata.photoTakenTime.timestamp) * 1000;
        const d = new Date(timestamp);
        dateStr = d.toISOString().split('T')[0];
        timeStr = d.toTimeString().split(' ')[0].substring(0, 5);
      }
    } catch (err) {
      console.warn('Error reading Google Takeout JSON metadata:', err);
    }
  }

  return { lat, lng, dateStr, timeStr };
}
