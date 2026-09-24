import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../../../../firebase/config';
import { getNextPlotNumber } from '../../../../services/plotServices';
import { logAuditEvent } from '../../../../utils/auditLogger';

// ===== Prefix mapping for plotCode =====
const GRAVE_TYPE_PREFIX = {
  'single niche': 'SN',
  'singleniche': 'SN',
  'apartment': 'AP',
  'mausoleum': 'MA',
  'columbarium': 'CO',
  'bonevault': 'BV',
  'bone vault': 'BV',
  'garden type': 'GT',
  'gardentype': 'GT',
  'garden': 'GT',
  'ground grave': 'GG',
  'groundgrave': 'GG',
  'heroes buried': 'HB',
  'heroesburied': 'HB',
  'heroes': 'HB',
  'lawn lot': 'LL',
  'lawnlot': 'LL',
  'family estate': 'FE',
  'familyestate': 'FE'
};

export function getPlotCodePrefix(graveType = '') {
  const raw = String(graveType || '').trim();
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');

  for (const [typeKey, prefix] of Object.entries(GRAVE_TYPE_PREFIX)) {
    if (key === typeKey.replace(/[^a-z]/g, '')) return prefix;
  }

  // If multi-word (e.g. "Community Vault" -> "CV")
  const words = raw.split(/[\s-_]+/).filter(Boolean);
  if (words.length >= 2) {
    const acronym = words.map((w) => w[0]).join('').toUpperCase().substring(0, 3);
    if (acronym.length >= 2) return acronym;
  }

  return raw.replace(/[^A-Za-z]/g, '').substring(0, 2).toUpperCase() || 'PL';
}

export function formatSectionCode(section = '') {
  let clean = String(section || '').trim();
  // Strip out "Section", "Sec", whitespace, dashes, colons from the beginning
  clean = clean.replace(/^(section|sec)[\s-_:]*/i, '').trim();
  if (!clean) clean = String(section || '').trim();
  clean = clean.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return clean || 'A';
}

export async function resolveGraveTypePrefix(graveTypeId = '') {
  const direct = getPlotCodePrefix(graveTypeId);
  const key = String(graveTypeId || '').toLowerCase().replace(/[^a-z]/g, '');
  if (GRAVE_TYPE_PREFIX[key]) return GRAVE_TYPE_PREFIX[key];

  try {
    const snap = await getDocs(collection(db, 'grave_type'));
    for (const d of snap.docs) {
      const data = d.data();
      if (d.id === graveTypeId || data.grave_type_id === graveTypeId) {
        const typeName = data.grave_type || data.name || data.graveType || '';
        if (typeName) {
          return getPlotCodePrefix(typeName);
        }
      }
    }
  } catch (err) {
    console.error('Error resolving grave type prefix from db:', err);
  }

  return direct;
}

// ===== Geometry & Collision Detection Helpers =====
export function getFlatLatLngs(layer) {
  let latlngs = layer.getLatLngs();
  while (Array.isArray(latlngs) && latlngs.length > 0 && Array.isArray(latlngs[0])) {
    latlngs = latlngs[0];
  }
  return latlngs;
}

export function isPointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > point.lng) !== (yj > point.lng))
      && (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function ccw(A, B, C) {
  return (C.lat - A.lat) * (B.lng - A.lng) > (B.lat - A.lat) * (C.lng - A.lng);
}

export function doSegmentsIntersect(p1, p2, p3, p4) {
  return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}

export function doPolygonsOverlap(polyA, polyB) {
  if (!polyA || !polyB || polyA.length < 3 || polyB.length < 3) return false;

  for (let i = 0; i < polyA.length; i++) {
    if (isPointInPolygon(polyA[i], polyB)) return true;
  }

  for (let i = 0; i < polyB.length; i++) {
    if (isPointInPolygon(polyB[i], polyA)) return true;
  }

  const lenA = polyA.length;
  const lenB = polyB.length;
  for (let i = 0; i < lenA; i++) {
    const a1 = polyA[i], a2 = polyA[(i + 1) % lenA];
    for (let j = 0; j < lenB; j++) {
      const b1 = polyB[j], b2 = polyB[(j + 1) % lenB];
      if (doSegmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }

  return false;
}

export function findRenderedPlotContainingPoint(point, loadedPlotsData = []) {
  if (Array.isArray(loadedPlotsData)) {
    for (const plot of loadedPlotsData) {
      if (plot.coordinates && plot.coordinates.length >= 3) {
        if (isPointInPolygon(point, plot.coordinates)) {
          return plot;
        }
      }
    }
  }
  return null;
}

export function doesSegmentIntersectAnyRenderedPlot(p1, p2, loadedPlotsData = []) {
  if (Array.isArray(loadedPlotsData)) {
    for (const plot of loadedPlotsData) {
      const coords = plot.coordinates;
      if (coords && coords.length >= 3) {
        const len = coords.length;
        for (let j = 0; j < len; j++) {
          const b1 = coords[j], b2 = coords[(j + 1) % len];
          if (doSegmentsIntersect(p1, p2, b1, b2)) {
            return plot;
          }
        }
      }
    }
  }
  return null;
}

export function findCollidingRenderedPlot(polygonPoints, loadedPlotsData = []) {
  if (Array.isArray(loadedPlotsData)) {
    for (const plot of loadedPlotsData) {
      if (plot.coordinates && plot.coordinates.length >= 3) {
        if (doPolygonsOverlap(polygonPoints, plot.coordinates)) {
          return plot;
        }
      }
    }
  }
  return null;
}

export function calculatePolygonArea(latlngs) {
  if (!latlngs || latlngs.length < 3) return 0;
  const radius = 6378137;
  let area = 0;
  const len = latlngs.length;
  for (let i = 0; i < len; i++) {
    const p1 = latlngs[i];
    const p2 = latlngs[(i + 1) % len];
    const lat1 = (p1.lat * Math.PI) / 180;
    const lat2 = (p2.lat * Math.PI) / 180;
    const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;
    area += dLng * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((area * radius * radius) / 2);
}

export function formatArea(areaM2) {
  if (!areaM2) return '0.0 m²';
  if (areaM2 >= 1000000) return `${(areaM2 / 1000000).toFixed(2)} km²`;
  if (areaM2 >= 10000) return `${(areaM2 / 10000).toFixed(2)} ha (${areaM2.toFixed(0)} m²)`;
  return `${areaM2.toFixed(1)} m²`;
}

// ===== Bilinear Interpolation Grid Engine =====
export function bilinear(s, t, tl, tr, br, bl) {
  return {
    lng: (1 - s) * (1 - t) * tl.lng + s * (1 - t) * tr.lng + s * t * br.lng + (1 - s) * t * bl.lng,
    lat: (1 - s) * (1 - t) * tl.lat + s * (1 - t) * tr.lat + s * t * br.lat + (1 - s) * t * bl.lat
  };
}

export function getCorners(latlngs) {
  const L = window.L;
  let pts = latlngs.map(p => ({ lng: p.lng, lat: p.lat }));

  if (pts.length > 4 && pts[0].lng === pts[pts.length - 1].lng && pts[0].lat === pts[pts.length - 1].lat) {
    pts.pop();
  }

  if (pts.length === 4) {
    const cx = pts.reduce((s, p) => s + p.lng, 0) / 4;
    const cy = pts.reduce((s, p) => s + p.lat, 0) / 4;
    pts.sort((a, b) => Math.atan2(a.lat - cy, a.lng - cx) - Math.atan2(b.lat - cy, b.lng - cx));

    let start = 0, bestScore = -Infinity;
    pts.forEach((p, i) => { const score = p.lat - p.lng; if (score > bestScore) { bestScore = score; start = i; } });
    pts = [pts[start], pts[(start + 1) % 4], pts[(start + 2) % 4], pts[(start + 3) % 4]];
    return { tl: pts[0], tr: pts[1], br: pts[2], bl: pts[3] };
  }

  if (L) {
    const bounds = L.latLngBounds(latlngs);
    return {
      tl: { lat: bounds.getNorth(), lng: bounds.getWest() },
      tr: { lat: bounds.getNorth(), lng: bounds.getEast() },
      br: { lat: bounds.getSouth(), lng: bounds.getEast() },
      bl: { lat: bounds.getSouth(), lng: bounds.getWest() }
    };
  }

  return null;
}

export function generateGridBoxesInsidePolygon(polygonLayer, rows, cols) {
  const pts = getFlatLatLngs(polygonLayer);
  const corners = getCorners(pts);
  if (!corners) return [];
  const { tl, tr, br, bl } = corners;
  const boxes = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s0 = c / cols, s1 = (c + 1) / cols;
      const t0 = r / rows, t1 = (r + 1) / rows;
      boxes.push({
        row: r + 1, col: c + 1,
        points: [
          { lat: bilinear(s0, t0, tl, tr, br, bl).lat, lng: bilinear(s0, t0, tl, tr, br, bl).lng },
          { lat: bilinear(s1, t0, tl, tr, br, bl).lat, lng: bilinear(s1, t0, tl, tr, br, bl).lng },
          { lat: bilinear(s1, t1, tl, tr, br, bl).lat, lng: bilinear(s1, t1, tl, tr, br, bl).lng },
          { lat: bilinear(s0, t1, tl, tr, br, bl).lat, lng: bilinear(s0, t1, tl, tr, br, bl).lng }
        ]
      });
    }
  }
  return boxes;
}

// Re-export from plotServices for backwards compatibility
export { getNextPlotNumber };

// Fetch grave type capacity helper
export async function getGraveTypeCapacity(graveLotTypeID) {
  try {
    const snap = await getDocs(collection(db, 'grave_type'));
    for (const doc of snap.docs) {
      const data = doc.data();
      const typeName = data.grave_type || data.graveType || data.name || doc.id;
      const typeId = data.grave_type_id || doc.id;
      if (
        typeName.toLowerCase() === (graveLotTypeID || '').toLowerCase() ||
        doc.id.toLowerCase() === (graveLotTypeID || '').toLowerCase() ||
        typeId.toLowerCase() === (graveLotTypeID || '').toLowerCase()
      ) {
        if (data.capacity != null && !isNaN(Number(data.capacity))) {
          return Number(data.capacity);
        }
      }
    }
  } catch (err) {
    console.error('Error fetching grave type capacity:', err);
  }
  return 1;
}

export async function saveBoxesToFirestore({ boxes, polyId, grave_type_id, graveLotTypeID, section, maxCapacity }) {
  const resolvedGraveTypeId = grave_type_id || graveLotTypeID;
  if (!boxes || boxes.length === 0) throw new Error('No boxes to save.');
  if (!resolvedGraveTypeId) throw new Error('Please select a grave lot type.');
  if (!section) throw new Error('Please enter a section name.');

  // GRAVETYPE-SECTION-NUMBER, e.g. SN-A-001
  const typePrefix = await resolveGraveTypePrefix(resolvedGraveTypeId);
  const sectionCode = formatSectionCode(section);
  const fullPrefix = `${typePrefix}-${sectionCode}`;

  let nextNum = await getNextPlotNumber(fullPrefix);
  let savedCount = 0;
  const errors = [];

  // Determine max capacity according to grave type
  const resolvedCapacity = maxCapacity != null && !isNaN(Number(maxCapacity))
    ? Number(maxCapacity)
    : await getGraveTypeCapacity(resolvedGraveTypeId);

  for (const box of boxes) {
    const plotCode = `${fullPrefix}-${String(nextNum).padStart(3, '0')}`;
    const pts = getFlatLatLngs(box.layer);
    const coordinates = pts.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) }));

    const plotDoc = {
      plotCode,
      grave_type_id: resolvedGraveTypeId,
      section: section.trim(),
      coordinates,
      status: 'available',
      occupiedCount: 0,
      maxCapacity: Number(resolvedCapacity || 1),
      createdAt: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'plots'), plotDoc);
      savedCount++;
      nextNum++;
    } catch (err) {
      console.error(`Failed to save box ${box.name}:`, err);
      errors.push(box.name);
    }
  }

  if (savedCount > 0) {
    const rangeStr = `${fullPrefix}-${String(nextNum - savedCount).padStart(3, '0')} to ${fullPrefix}-${String(nextNum - 1).padStart(3, '0')}`;
    await logAuditEvent({
      module: 'Map Management',
      actionType: 'Create Plot',
      description: `Admin created ${savedCount} new plot(s) (${rangeStr}) in Section "${section.trim()}"`,
      targetItem: `${savedCount} Plots (${section.trim()})`,
      details: {
        count: savedCount,
        section: section.trim(),
        grave_type_id: resolvedGraveTypeId,
        range: rangeStr,
        prefix: fullPrefix
      }
    });
  }

  return {
    savedCount,
    total: boxes.length,
    errors,
    prefix: fullPrefix,
    startNum: nextNum - savedCount,
    endNum: nextNum - 1
  };
}
