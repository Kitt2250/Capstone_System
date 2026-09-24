// ===== Initialize Map =====
export function initMap(containerId = 'map') {
  const L = window.L;
  if (!L) {
    console.error('Leaflet is not available on window.L');
    return null;
  }

  const container = document.getElementById(containerId);
  if (!container) return null;

  // Clear if an existing instance is attached
  if (container._leaflet_id) {
    container._leaflet_id = null;
    container.innerHTML = '';
  }

  const map = L.map(containerId, {
    center: [14.8378234, 120.7600800],
    zoom: 18,
    minZoom: 18,
    maxZoom: 22,
    zoomControl: false,
    attributionControl: false
  });

  L.control.zoom({ position: 'topright' }).addTo(map);

  // ===== Satellite Tile Layer (Fixed) =====
  const activeLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    minZoom: 18,
    maxZoom: 22,
    maxNativeZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
  }).addTo(map);

  window.addEventListener('resize', () => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 200);

  // ===== Shared Map Layers =====
  const drawnItemsLayer = L.featureGroup().addTo(map);
  const labelLayer = L.layerGroup().addTo(map);
  const tempDrawingLayer = L.featureGroup().addTo(map);
  const editHandlesLayer = L.featureGroup().addTo(map);

  // ===== Location Preset Selector =====
  const presetSelect = document.getElementById('map-location-preset-select');
  if (presetSelect) {
    presetSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (!val) return;
      const [lat, lng, zoom] = val.split(',').map(Number);
      if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
        map.setView([lat, lng], zoom);
      }
    });
  }

  return {
    map,
    activeLayer,
    drawnItemsLayer,
    labelLayer,
    tempDrawingLayer,
    editHandlesLayer
  };
}

// ===== Render Plot Data onto Map =====
export function renderPlotsOnMap(instances, plots, shouldFitBounds = true, onRegisterPlot = null) {
  if (!instances || !instances.map || !window.L) return;
  const { map, drawnItemsLayer, labelLayer } = instances;
  const L = window.L;

  drawnItemsLayer.clearLayers();
  labelLayer.clearLayers();

  if (!plots || plots.length === 0) return;

  const getStatusColor = (status = '') => {
    const s = (status || '').toLowerCase().trim();
    if (s === 'occupied' || s === 'taken' || s === 'used') {
      return { stroke: '#ef4444', fill: '#ef4444', label: 'Occupied' };
    }
    if (s === 'reserved' || s === 'pending') {
      return { stroke: '#f59e0b', fill: '#f59e0b', label: 'Reserved' };
    }
    return { stroke: '#22c55e', fill: '#22c55e', label: 'Available' };
  };

  const bounds = L.latLngBounds([]);
  let hasValidCoordinates = false;

  plots.forEach((plot) => {
    const code = plot.plotCode || plot.plotcode || plot.plot_code || plot.lotNumber || plot.plotNumber || plot.name || `Lot ${plot.id}`;
    const type = plot.grave_type_id || plot.grave_type || plot.graveLotTypeID || plot.graveLotType || plot.graveType || plot.type || 'Ground Grave';
    const section = plot.section ? (plot.section.startsWith('Section') ? plot.section : `Section ${plot.section}`) : '';
    const statusInfo = getStatusColor(plot.status);

    const occupied = plot.occupiedCount != null ? plot.occupiedCount : (plot.status === 'occupied' ? 1 : 0);
    const maxCap = plot.maxCapacity != null ? plot.maxCapacity : (plot.capacity || 1);
    const isOccupiedStatus = plot.status && plot.status.toLowerCase() === 'occupied';
    const isFull = isOccupiedStatus && occupied >= maxCap;

    const registerBtnHtml = onRegisterPlot
      ? (isFull
          ? `
            <div style="margin-top: 6px; font-size: 11px; font-weight: 700; color: #dc2626; text-align: center; background: #fee2e2; padding: 4px 6px; border-radius: 4px; border: 1px solid #fecaca;">
              Max Capacity
            </div>
          `
          : `
            <div style="margin-top: 8px;">
              <button 
                type="button" 
                class="map-popup-register-btn" 
                data-plot-id="${plot.id}" 
                style="width: 100%; height: 30px; background: #059669; color: #ffffff; border: none; border-radius: 6px; font-weight: 700; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 5px rgba(5,150,105,0.25);"
              >
                <span>Select Grave Lot</span>
              </button>
            </div>
          `)
      : '';

    const popupContent = `
      <div style="font-family: inherit; min-width: 140px; padding: 4px;">
        <div style="font-weight: 800; font-size: 14px; color: #0f172a; margin-bottom: 2px;">${code}</div>
        <div style="font-size: 12px; color: #64748b; margin-bottom: 6px;">${section ? section + ' • ' : ''}${type}</div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
          <div style="display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 12px; background: ${statusInfo.fill}22; color: ${statusInfo.stroke};">
            ● ${statusInfo.label}
          </div>
          ${isOccupiedStatus ? `
            <div style="font-size: 11px; font-weight: 700; color: #475569; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; border: 1px solid #e2e8f0;">
              ${occupied} / ${maxCap}
            </div>
          ` : ''}
        </div>
        ${registerBtnHtml}
      </div>
    `;

    // 1. Polygon / Polyline coordinates
    const rawCoords = plot.coordinates || plot.polygon || plot.latlngs || plot.points || plot.bounds;
    if (rawCoords && Array.isArray(rawCoords) && rawCoords.length >= 3) {
      const latlngs = rawCoords
        .map((pt) => {
          if (Array.isArray(pt)) return [Number(pt[0]), Number(pt[1])];
          if (pt.lat !== undefined && pt.lng !== undefined) return [Number(pt.lat), Number(pt.lng)];
          if (pt.latitude !== undefined && pt.longitude !== undefined) return [Number(pt.latitude), Number(pt.longitude)];
          return null;
        })
        .filter(Boolean);

      if (latlngs.length >= 3) {
        const polygon = L.polygon(latlngs, {
          color: statusInfo.stroke,
          fillColor: statusInfo.fill,
          fillOpacity: 0.25,
          weight: 2,
          dashArray: '3, 3'
        }).addTo(drawnItemsLayer);

        // Store exact identifiers on layer
        polygon.plotId = plot.id;
        polygon.plotCode = code;

        const centerLat = latlngs.reduce((s, p) => s + p[0], 0) / latlngs.length;
        const centerLng = latlngs.reduce((s, p) => s + p[1], 0) / latlngs.length;
        polygon.centerLatLng = [centerLat, centerLng];

        L.marker([centerLat, centerLng], {
          interactive: false,
          icon: L.divIcon({
            className: 'lot-label saved-plot-label',
            html: `<span style="font-size:10px; font-weight:700;">${code}</span>`,
            iconSize: [52, 18],
            iconAnchor: [26, 9]
          })
        }).addTo(labelLayer);

        polygon.bindPopup(popupContent);

        bounds.extend(polygon.getBounds());
        hasValidCoordinates = true;
        return;
      }
    }

    // 2. Point Coordinates (lat, lng / latitude, longitude)
    const lat = plot.latitude ?? plot.lat ?? plot.location?.latitude ?? plot.center?.[0] ?? plot.position?.lat;
    const lng = plot.longitude ?? plot.lng ?? plot.location?.longitude ?? plot.center?.[1] ?? plot.position?.lng;

    if (lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
      const pt = [Number(lat), Number(lng)];
      const marker = L.circleMarker(pt, {
        radius: 8,
        color: statusInfo.stroke,
        fillColor: statusInfo.fill,
        fillOpacity: 0.85,
        weight: 2,
      }).addTo(drawnItemsLayer);

      marker.plotId = plot.id;
      marker.plotCode = code;
      marker.centerLatLng = pt;

      L.marker(pt, {
        interactive: false,
        icon: L.divIcon({
          className: 'lot-label saved-plot-label',
          html: `<span style="font-size:10px; font-weight:700;">${code}</span>`,
          iconSize: [52, 18],
          iconAnchor: [26, 9]
        })
      }).addTo(labelLayer);

      marker.bindPopup(popupContent);

      bounds.extend(pt);
      hasValidCoordinates = true;
    }
  });

  if (shouldFitBounds && hasValidCoordinates && bounds.isValid()) {
    map.fitBounds(bounds, { maxZoom: 22, padding: [40, 40] });
  }
}

// ===== Focus & Navigate to a specific plot on the Map =====
export function focusOnPlot(instances, plot) {
  if (!instances || !instances.map || !plot || !window.L) return;
  const { map, drawnItemsLayer } = instances;
  const L = window.L;

  const targetId = plot.id;
  const targetCode = (plot.plotCode || plot.plotcode || plot.plot_code || '').toLowerCase().trim();

  let targetLayer = null;
  drawnItemsLayer.eachLayer((layer) => {
    if (targetId && layer.plotId && layer.plotId === targetId) {
      targetLayer = layer;
    } else if (
      !targetLayer &&
      targetCode &&
      layer.plotCode &&
      layer.plotCode.toLowerCase().trim() === targetCode
    ) {
      targetLayer = layer;
    }
  });

  // Calculate center coordinates
  let center = null;
  if (targetLayer && targetLayer.centerLatLng) {
    center = targetLayer.centerLatLng;
  } else if (targetLayer && targetLayer.getBounds) {
    const b = targetLayer.getBounds();
    center = [b.getCenter().lat, b.getCenter().lng];
  } else {
    const rawCoords = plot.coordinates || plot.polygon || plot.latlngs;
    if (rawCoords && Array.isArray(rawCoords) && rawCoords.length > 0) {
      const pts = rawCoords
        .map((p) => {
          if (Array.isArray(p)) return [Number(p[0]), Number(p[1])];
          if (p.lat !== undefined && p.lng !== undefined) return [Number(p.lat), Number(p.lng)];
          if (p.latitude !== undefined && p.longitude !== undefined) return [Number(p.latitude), Number(p.longitude)];
          return null;
        })
        .filter(Boolean);

      if (pts.length > 0) {
        const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const lng = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        center = [lat, lng];
      }
    } else {
      const lat = plot.latitude ?? plot.lat ?? plot.location?.latitude ?? plot.center?.[0];
      const lng = plot.longitude ?? plot.lng ?? plot.location?.longitude ?? plot.center?.[1];
      if (lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
        center = [Number(lat), Number(lng)];
      }
    }
  }

  if (center) {
    map.flyTo(center, 22, { duration: 1.2 });

    // Pulse highlight indicator
    const pulse = L.circleMarker(center, {
      radius: 16,
      color: '#d97706',
      fillColor: '#f59e0b',
      fillOpacity: 0.6,
      weight: 3
    }).addTo(map);

    let opacity = 0.6;
    let radius = 16;
    const interval = setInterval(() => {
      radius += 2;
      opacity -= 0.05;
      if (opacity <= 0) {
        clearInterval(interval);
        map.removeLayer(pulse);
      } else {
        pulse.setRadius(radius);
        pulse.setStyle({ fillOpacity: opacity, opacity: opacity });
      }
    }, 50);

    // Open exact target popup
    setTimeout(() => {
      if (targetLayer && targetLayer.openPopup) {
        targetLayer.openPopup();
      }
    }, 600);
  }
}

// ===== Reset Map View to default Overview =====
export function resetMapView(instances) {
  if (!instances || !instances.map) return;
  instances.map.flyTo([14.8378234, 120.7600800], 18, { duration: 1.2 });
}
