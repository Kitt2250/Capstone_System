import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../firebase/config';
import {
  getFlatLatLngs,
  calculatePolygonArea,
  formatArea,
  generateGridBoxesInsidePolygon,
  findCollidingRenderedPlot,
  findRenderedPlotContainingPoint,
  doesSegmentIntersectAnyRenderedPlot,
  saveBoxesToFirestore,
  getPlotCodePrefix,
  formatSectionCode
} from './buildPlotEngine';
import './BuildPlotStudio.css';

const FIXED_COLOR = '#6c63ff';

function BuildPlotStudio({ onPlotSaved }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  // Studio UI State
  const [drawingMode, setDrawingMode] = useState(null); // null | 'polygon'
  const [currentEditingShapeId, setCurrentEditingShapeId] = useState(null);
  const [selectedPolygonId, setSelectedPolygonId] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [gridRows, setGridRows] = useState(2);
  const [gridCols, setGridCols] = useState(3);
  const [graveTypes, setGraveTypes] = useState([]);
  const [graveLotDataMap, setGraveLotDataMap] = useState({});
  const [selectedGraveType, setSelectedGraveType] = useState('');
  const [sectionInput, setSectionInput] = useState('');
  const [drawnShapes, setDrawnShapes] = useState([]);
  const [hiddenLabels, setHiddenLabels] = useState(new Set());
  const [noFillPolys, setNoFillPolys] = useState(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Modals State
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', body: '', onConfirm: null });
  const [saveSuccessModal, setSaveSuccessModal] = useState({ isOpen: false, count: 0, prefix: '', startNum: 0, endNum: 0 });
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [showQuickGuide, setShowQuickGuide] = useState(true);

  // References for Drawing & Layer Management
  const currentPointsRef = useRef([]);
  const loadedPlotsDataRef = useRef([]);
  const layersRef = useRef({
    drawnItemsLayer: null,
    labelLayer: null,
    tempDrawingLayer: null,
    editHandlesLayer: null,
    savedPlotsLayer: null,
    savedLabelsLayer: null
  });

  const showError = (msg) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(''), 5000);
  };

  // 1. Fetch Grave Types from Firestore 'grave_type' collection (only active ones)
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'grave_type'),
      (snap) => {
        const types = [];
        const dataMap = {};

        snap.docs.forEach((d) => {
          const data = d.data();

          // Only include active grave types in the dropdown filter
          const statusStr = (data.status != null && data.status !== '') 
            ? String(data.status).toLowerCase().trim() 
            : null;
          let isActive = true;
          if (statusStr) {
            isActive = statusStr === 'active' || statusStr === 'enabled';
          } else if (data.isActive !== undefined && data.isActive !== null) {
            isActive = Boolean(data.isActive);
          }

          if (!isActive) return;

          const typeName = data.grave_type || data.name || data.graveType || d.id;
          if (typeName && !types.includes(typeName)) {
            types.push(typeName);
            dataMap[typeName] = {
              id: d.id,
              grave_type_id: data.grave_type_id || d.id,
              capacity: data.capacity != null && !isNaN(Number(data.capacity)) ? Number(data.capacity) : 1
            };
          }
        });

        if (types.length > 0) {
          setGraveTypes(types);
          setGraveLotDataMap(dataMap);
        } else if (snap.empty) {
          const defaultTypes = ['Ground Grave', 'Single Niche', 'Mausoleum', 'Bone Vault', 'Apartment', 'Columbarium'];
          setGraveTypes(defaultTypes);
        } else {
          setGraveTypes([]);
          setGraveLotDataMap({});
        }

        // Reset selected grave type if it's no longer in the active list
        setSelectedGraveType((prev) => (types.includes(prev) ? prev : ''));
      },
      (e) => {
        console.error('Error fetching grave_type:', e);
        const defaultTypes = ['Ground Grave', 'Single Niche', 'Mausoleum', 'Bone Vault', 'Apartment', 'Columbarium'];
        setGraveTypes(defaultTypes);
      }
    );

    return () => unsubscribe();
  }, []);

  // 2. Initialize Leaflet Map
  useEffect(() => {
    let active = true;
    let timer = null;
    let unsubscribePlots = () => {};

    const checkAndInit = (retries = 0) => {
      if (!active) return;
      const L = window.L;
      if (!L) {
        if (retries < 30) {
          timer = setTimeout(() => checkAndInit(retries + 1), 100);
        }
        return;
      }

      const container = document.getElementById('build-plot-map');
      if (!container) return;

      if (container._leaflet_id) {
        container._leaflet_id = null;
        container.innerHTML = '';
      }

      const map = L.map('build-plot-map', {
        center: [14.8378234, 120.7600800],
        zoom: 18,
        minZoom: 18,
        maxZoom: 22,
        zoomControl: false,
        attributionControl: false
      });

      L.control.zoom({ position: 'topright' }).addTo(map);

      // Google Satellite Tile Layer
      L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        minZoom: 18,
        maxZoom: 22,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
      }).addTo(map);

      // Initialize layers
      const drawnItemsLayer = L.featureGroup().addTo(map);
      const labelLayer = L.layerGroup().addTo(map);
      const tempDrawingLayer = L.featureGroup().addTo(map);
      const editHandlesLayer = L.featureGroup().addTo(map);
      const savedPlotsLayer = L.featureGroup().addTo(map);
      const savedLabelsLayer = L.layerGroup().addTo(map);

      layersRef.current = {
        drawnItemsLayer,
        labelLayer,
        tempDrawingLayer,
        editHandlesLayer,
        savedPlotsLayer,
        savedLabelsLayer
      };

      mapInstanceRef.current = map;

      // Handle map resize
      setTimeout(() => map.invalidateSize(), 200);

      // Listen to saved plots from Firestore in real-time
      const unsubscribePlots = onSnapshot(collection(db, 'plots'), (snapshot) => {
        const plotList = [];
        savedPlotsLayer.clearLayers();
        savedLabelsLayer.clearLayers();

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          const plotCode = data.plotCode || data.plotcode || `Lot-${doc.id.substring(0, 4)}`;
          const status = (data.status || 'available').toLowerCase();
          const color = status === 'occupied' ? '#ef4444' : status === 'reserved' ? '#f59e0b' : '#10b981';

          let coords = data.coordinates;
          if (coords && Array.isArray(coords) && coords.length >= 3) {
            const latlngs = coords.map((c) => ({
              lat: Number(c.lat ?? c.latitude),
              lng: Number(c.lng ?? c.longitude)
            })).filter((c) => !isNaN(c.lat) && !isNaN(c.lng));

            if (latlngs.length >= 3) {
              const poly = L.polygon(latlngs, {
                color,
                weight: 2,
                fillColor: color,
                fillOpacity: 0.2,
                dashArray: '3, 3'
              }).addTo(savedPlotsLayer);

              const centerLat = latlngs.reduce((s, p) => s + p.lat, 0) / latlngs.length;
              const centerLng = latlngs.reduce((s, p) => s + p.lng, 0) / latlngs.length;

              L.marker([centerLat, centerLng], {
                interactive: false,
                icon: L.divIcon({
                  className: 'lot-label saved-plot-label',
                  html: `<span style="font-size:10px; font-weight:700;">${plotCode}</span>`,
                  iconSize: [52, 18],
                  iconAnchor: [26, 9]
                })
              }).addTo(savedLabelsLayer);

              poly.bindPopup(`
                <div style="font-family:inherit;min-width:140px;padding:4px;">
                  <strong style="font-size:14px;color:#0f172a;">${plotCode}</strong>
                  <div style="font-size:12px;color:#64748b;margin:3px 0;">${data.section || 'N/A'} • ${data.grave_type_id || data.graveLotTypeID || 'Plot'}</div>
                  <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;background:${color}22;color:${color};text-transform:uppercase;">
                    ● ${status}
                  </span>
                </div>
              `);

              plotList.push({ id: doc.id, plotCode, status, coordinates: latlngs });
            }
          }
        });

        loadedPlotsDataRef.current = plotList;
      });

    };

    timer = setTimeout(() => checkAndInit(0), 100);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      unsubscribePlots();
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (e) {
          console.warn('Build plot map remove error:', e);
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Preset Location Selector Handler
  const handlePresetChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    const [lat, lng, zoom] = val.split(',').map(Number);
    if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
      mapInstanceRef.current?.setView([lat, lng], zoom);
    }
  };

  // 3. Map Click Event for Drawing Nodes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapClick = (e) => {
      if (drawingMode !== 'polygon') return;
      const L = window.L;
      const latlng = e.latlng;
      const { tempDrawingLayer } = layersRef.current;

      // 1. Check if clicked point is inside existing database plots
      const insidePlot = findRenderedPlotContainingPoint(latlng, loadedPlotsDataRef.current);
      if (insidePlot) {
        showError(`⚠️ Cannot plot here: Point falls inside existing plot "${insidePlot.plotCode}".`);
        const flash = L.circleMarker(latlng, { radius: 8, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.9, weight: 2 }).addTo(tempDrawingLayer);
        setTimeout(() => tempDrawingLayer.removeLayer(flash), 1000);
        return;
      }

      // 2. Check if line intersects any database plot
      if (currentPointsRef.current.length > 0) {
        const lastPt = currentPointsRef.current[currentPointsRef.current.length - 1];
        const crossingPlot = doesSegmentIntersectAnyRenderedPlot(lastPt, latlng, loadedPlotsDataRef.current);
        if (crossingPlot) {
          showError(`⚠️ Cannot connect line: Crosses existing plot "${crossingPlot.plotCode}".`);
          const flash = L.polyline([lastPt, latlng], { color: '#ef4444', weight: 3, dashArray: '4, 4' }).addTo(tempDrawingLayer);
          setTimeout(() => tempDrawingLayer.removeLayer(flash), 1000);
          return;
        }
      }

      setErrorMessage('');
      currentPointsRef.current.push(latlng);

      L.circleMarker(latlng, { radius: 5, color: '#ffffff', weight: 2, fillColor: FIXED_COLOR, fillOpacity: 1 }).addTo(tempDrawingLayer);

      if (currentPointsRef.current.length > 1) {
        tempDrawingLayer.eachLayer((layer) => {
          if (layer instanceof L.Polyline && !(layer instanceof L.CircleMarker)) {
            tempDrawingLayer.removeLayer(layer);
          }
        });
        L.polyline(currentPointsRef.current, { color: FIXED_COLOR, weight: 2, dashArray: '5, 5' }).addTo(tempDrawingLayer);
      }

      setStatusMessage(`Drawing Plot: ${currentPointsRef.current.length}/4 nodes placed`);

      // Finish automatically when 4 points are placed
      if (currentPointsRef.current.length === 4) {
        finishPolygon(currentPointsRef.current);
      }
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [drawingMode]);

  // 4. Finish Polygon
  const finishPolygon = (points = currentPointsRef.current) => {
    const L = window.L;
    if (!points || points.length < 3) {
      showError('Please plot at least 3 nodes to create a boundary.');
      return;
    }

    const colliding = findCollidingRenderedPlot(points, loadedPlotsDataRef.current);
    if (colliding) {
      showError(`⚠️ Cannot create plot: Overlaps with existing plot "${colliding.plotCode}".`);
      return;
    }

    const { drawnItemsLayer, tempDrawingLayer } = layersRef.current;
    tempDrawingLayer.clearLayers();

    const polyNum = drawnShapes.filter((s) => s.type === 'Polygon').length + 1;
    const name = `Polygon #${polyNum}`;
    const areaM2 = calculatePolygonArea(points);

    const polygonLayer = L.polygon(points, {
      color: FIXED_COLOR,
      weight: 2,
      fillColor: FIXED_COLOR,
      fillOpacity: 0.35
    }).addTo(drawnItemsLayer);

    const newShape = {
      id: Date.now(),
      name,
      type: 'Polygon',
      color: FIXED_COLOR,
      layer: polygonLayer,
      areaM2
    };

    polygonLayer.on('click', () => {
      setSelectedPolygonId(newShape.id);
    });

    setDrawnShapes((prev) => [...prev, newShape]);
    setSelectedPolygonId(newShape.id);
    setDrawingMode(null);
    setStatusMessage('');
    currentPointsRef.current = [];
  };

  // 5. Generate Grid Boxes Inside Selected Polygon
  const handleGenerateBoxes = () => {
    setErrorMessage('');
    if (!selectedPolygonId) {
      showError('Select a polygon from the list first, then click Generate Plot.');
      return;
    }

    const targetPoly = drawnShapes.find((s) => s.id === selectedPolygonId && s.type === 'Polygon');
    if (!targetPoly) {
      showError('Selected polygon not found.');
      return;
    }

    const polyPts = getFlatLatLngs(targetPoly.layer);
    if (polyPts.length !== 4) {
      showError(`Polygon has ${polyPts.length} vertices — exactly 4 required. Reshape it first.`);
      return;
    }

    const existingBoxes = drawnShapes.filter((s) => s.type === 'Box' && s.parentId === targetPoly.id);
    if (existingBoxes.length > 0) {
      showError(`"${targetPoly.name}" already has ${existingBoxes.length} boxes. Click Reset boxes first.`);
      return;
    }

    const rows = parseInt(gridRows, 10);
    const cols = parseInt(gridCols, 10);
    if (!rows || !cols || rows <= 0 || cols <= 0) {
      showError('Rows and Columns must be greater than 0.');
      return;
    }

    const boxes = generateGridBoxesInsidePolygon(targetPoly.layer, rows, cols);
    if (boxes.length === 0) {
      showError('Could not generate plot boxes. Try different rows/cols values.');
      return;
    }

    const L = window.L;
    const { drawnItemsLayer, labelLayer } = layersRef.current;
    const newBoxShapes = [];

    boxes.forEach((item, i) => {
      const boxId = i + 1;
      const typePfx = getPlotCodePrefix(selectedGraveType);
      const secCode = formatSectionCode(sectionInput);
      const boxName = `${typePfx}-${secCode}-${String(boxId).padStart(3, '0')}`;
      const areaM2 = calculatePolygonArea(item.points);

      const boxLayer = L.polygon(item.points, {
        color: FIXED_COLOR,
        weight: 1.5,
        fillColor: FIXED_COLOR,
        fillOpacity: 0.25,
        dashArray: '3, 3'
      }).addTo(drawnItemsLayer);

      const centerLat = item.points.reduce((s, p) => s + p.lat, 0) / item.points.length;
      const centerLng = item.points.reduce((s, p) => s + p.lng, 0) / item.points.length;

      const labelMarker = L.marker([centerLat, centerLng], {
        interactive: false,
        icon: L.divIcon({
          className: 'lot-label',
          html: `<span>${boxId}</span>`,
          iconSize: [36, 18],
          iconAnchor: [18, 9]
        })
      }).addTo(labelLayer);

      newBoxShapes.push({
        id: Date.now() + i + Math.random(),
        name: boxName,
        type: 'Box',
        parentId: targetPoly.id,
        color: FIXED_COLOR,
        layer: boxLayer,
        labelMarker,
        areaM2,
        row: item.row,
        col: item.col
      });
    });

    setDrawnShapes((prev) => [...prev, ...newBoxShapes]);
    setSelectedPolygonId(null);
    mapInstanceRef.current?.fitBounds(targetPoly.layer.getBounds(), { padding: [30, 30] });
  };

  // 6. Reshape / Vertex Edit Handles
  const startEditingShape = (shapeId) => {
    const shape = drawnShapes.find((s) => s.id === shapeId);
    if (!shape || !shape.layer) return;

    setCurrentEditingShapeId(shapeId);
    setDrawingMode(null);
    setStatusMessage(`Reshaping: ${shape.name} • Drag dots to resize/reshape`);

    renderReshapeHandles(shape);
  };

  const stopEditingShape = () => {
    setCurrentEditingShapeId(null);
    setStatusMessage('');
    layersRef.current.editHandlesLayer.clearLayers();
  };

  const renderReshapeHandles = (shape) => {
    const L = window.L;
    const { editHandlesLayer } = layersRef.current;
    editHandlesLayer.clearLayers();
    const latlngs = getFlatLatLngs(shape.layer);

    latlngs.forEach((latlng, index) => {
      const vertexMarker = L.marker(latlng, {
        draggable: true,
        icon: L.divIcon({ className: 'edit-handle-vertex', iconSize: [14, 14], iconAnchor: [7, 7] }),
        zIndexOffset: 1000
      }).addTo(editHandlesLayer);

      vertexMarker.on('drag', (e) => {
        latlngs[index] = e.target.getLatLng();
        shape.layer.setLatLngs(latlngs);
        shape.areaM2 = calculatePolygonArea(latlngs);
      });

      vertexMarker.on('dragend', () => renderReshapeHandles(shape));
    });

    const len = latlngs.length;
    for (let i = 0; i < len; i++) {
      const p1 = latlngs[i];
      const p2 = latlngs[(i + 1) % len];
      const midMarker = L.marker(L.latLng((p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2), {
        draggable: true,
        icon: L.divIcon({ className: 'edit-handle-midpoint', iconSize: [10, 10], iconAnchor: [5, 5] }),
        zIndexOffset: 500
      }).addTo(editHandlesLayer);

      let insertedIndex = null;
      midMarker.on('dragstart', () => {
        insertedIndex = i + 1;
        latlngs.splice(insertedIndex, 0, midMarker.getLatLng());
        shape.layer.setLatLngs(latlngs);
      });

      midMarker.on('drag', (e) => {
        if (insertedIndex !== null) {
          latlngs[insertedIndex] = e.target.getLatLng();
          shape.layer.setLatLngs(latlngs);
        }
      });

      midMarker.on('dragend', () => renderReshapeHandles(shape));
    }
  };

  // 7. Save Boxes of Polygon to Firestore
  const handleSavePlots = async (polyId) => {
    const poly = drawnShapes.find((s) => s.id === polyId);
    if (!poly) return;

    const children = drawnShapes.filter((s) => s.type === 'Box' && s.parentId === polyId);
    if (children.length === 0) {
      showError('No boxes generated inside this polygon to save.');
      return;
    }

    setIsSaving(true);
    try {
      const targetGraveTypeId = graveLotDataMap[selectedGraveType]?.grave_type_id || selectedGraveType;
      const cap = selectedGraveType && graveLotDataMap[selectedGraveType]?.capacity != null
        ? Number(graveLotDataMap[selectedGraveType].capacity)
        : 1;
      const res = await saveBoxesToFirestore({
        boxes: children,
        polyId,
        grave_type_id: targetGraveTypeId,
        section: sectionInput,
        maxCapacity: cap
      });

      setSaveSuccessModal({
        isOpen: true,
        count: res.savedCount,
        prefix: res.prefix,
        startNum: res.startNum,
        endNum: res.endNum
      });

      // Clean up drawn items for this polygon
      handleResetChildren(polyId);
      handleDeleteShape(polyId);

      if (onPlotSaved) onPlotSaved();
    } catch (err) {
      showError(err.message || 'Failed to save plots.');
    }
    setIsSaving(false);
  };

  // 8. Reset Children Boxes of Polygon
  const handleResetChildren = (polyId) => {
    const { drawnItemsLayer, labelLayer } = layersRef.current;
    const children = drawnShapes.filter((s) => s.type === 'Box' && s.parentId === polyId);

    children.forEach((c) => {
      if (c.layer) drawnItemsLayer.removeLayer(c.layer);
      if (c.labelMarker) labelLayer.removeLayer(c.labelMarker);
    });

    setDrawnShapes((prev) => prev.filter((s) => !(s.type === 'Box' && s.parentId === polyId)));
  };

  // 9. Delete Shape
  const handleDeleteShape = (shapeId) => {
    const { drawnItemsLayer, labelLayer, editHandlesLayer } = layersRef.current;
    const shape = drawnShapes.find((s) => s.id === shapeId);
    if (!shape) return;

    if (shape.layer) drawnItemsLayer.removeLayer(shape.layer);
    if (shape.labelMarker) labelLayer.removeLayer(shape.labelMarker);

    if (shape.type === 'Polygon') {
      const children = drawnShapes.filter((s) => s.type === 'Box' && s.parentId === shapeId);
      children.forEach((c) => {
        if (c.layer) drawnItemsLayer.removeLayer(c.layer);
        if (c.labelMarker) labelLayer.removeLayer(c.labelMarker);
      });
    }

    if (currentEditingShapeId === shapeId) {
      editHandlesLayer.clearLayers();
      setCurrentEditingShapeId(null);
    }

    setDrawnShapes((prev) => prev.filter((s) => s.id !== shapeId && s.parentId !== shapeId));
    if (selectedPolygonId === shapeId) setSelectedPolygonId(null);
  };

  // 10. Toggle Labels Visibility
  const handleToggleLabels = (polyId) => {
    const { labelLayer } = layersRef.current;
    const isHidden = hiddenLabels.has(polyId);
    const children = drawnShapes.filter((s) => s.type === 'Box' && s.parentId === polyId);

    children.forEach((c) => {
      if (c.labelMarker) {
        if (isHidden) labelLayer.addLayer(c.labelMarker);
        else labelLayer.removeLayer(c.labelMarker);
      }
    });

    setHiddenLabels((prev) => {
      const next = new Set(prev);
      if (isHidden) next.delete(polyId);
      else next.add(polyId);
      return next;
    });
  };

  // 11. Toggle Fill Opacity
  const handleToggleFill = (polyId) => {
    const isNoFill = noFillPolys.has(polyId);
    const children = drawnShapes.filter((s) => s.type === 'Box' && s.parentId === polyId);

    children.forEach((c) => {
      if (c.layer) {
        c.layer.setStyle({ fillOpacity: isNoFill ? 0.25 : 0 });
      }
    });

    setNoFillPolys((prev) => {
      const next = new Set(prev);
      if (isNoFill) next.delete(polyId);
      else next.add(polyId);
      return next;
    });
  };

  // 12. Focus / Zoom on Shape
  const handleZoomShape = (shapeId) => {
    const shape = drawnShapes.find((s) => s.id === shapeId);
    if (shape && shape.layer && mapInstanceRef.current) {
      mapInstanceRef.current.fitBounds(shape.layer.getBounds(), { padding: [40, 40] });
    }
  };

  const polygons = drawnShapes.filter((s) => s.type === 'Polygon');
  const boxes = drawnShapes.filter((s) => s.type === 'Box');

  return (
    <div className="build-plot-studio">
      {/* Studio Header */}
      <div className="studio-header">
        <div className="studio-title-group">
          <div className="studio-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2z" />
              <path d="M12 12l8-4.5M12 12v8M12 12L4 7.5" />
            </svg>
          </div>
          <h3 className="studio-title">Plot Settings</h3>
        </div>

        <div className="studio-header-actions">
          {statusMessage && <div className="drawing-status-badge">{statusMessage}</div>}
          <button
            type="button"
            className="studio-instructions-btn"
            onClick={() => setShowInstructionsModal(true)}
            title="View Step-by-Step Instructions on Building Plots"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>Instructions</span>
          </button>
        </div>
      </div>

      {/* Two-Column Studio Layout */}
      <div className="studio-layout">
        {/* Left Side: Controls & Shape Groups */}
        <div className="studio-control-panel">
          <div className="studio-panel-content">
            {errorMessage && (
              <div className="studio-inline-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Quick Step-by-Step Guide Panel */}
            <div className={`studio-quick-guide-card ${showQuickGuide ? 'expanded' : 'collapsed'}`}>
              <div className="quick-guide-header" onClick={() => setShowQuickGuide(!showQuickGuide)}>
                <div className="quick-guide-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>Build Plot Instructions</span>
                </div>
                <div className="quick-guide-actions">
                  <button 
                    type="button" 
                    className="quick-guide-details-btn" 
                    onClick={(e) => { e.stopPropagation(); setShowInstructionsModal(true); }}
                  >
                    Full Guide
                  </button>
                  <span className="quick-guide-toggle-icon">{showQuickGuide ? '▲' : '▼'}</span>
                </div>
              </div>

              {showQuickGuide && (
                <div className="quick-guide-body">
                  <ol className="quick-guide-steps">
                    <li>
                      <span className="step-num">1</span>
                      <div>
                        <strong>Draw boundary:</strong> Click <em>Draw Plot (4 nodes)</em> and click 4 corners on the map.
                      </div>
                    </li>
                    <li>
                      <span className="step-num">2</span>
                      <div>
                        <strong>Set grid:</strong> Specify <em>Rows</em> and <em>Columns</em> (e.g. 2 rows × 3 columns).
                      </div>
                    </li>
                    <li>
                      <span className="step-num">3</span>
                      <div>
                        <strong>Assign type &amp; section:</strong> Select <em>Grave Type</em> and enter <em>Section</em> name.
                      </div>
                    </li>
                    <li>
                      <span className="step-num">4</span>
                      <div>
                        <strong>Generate &amp; Save:</strong> Click <em>Generate Plot</em>, then click <em>Save</em> on the polygon card.
                      </div>
                    </li>
                  </ol>
                </div>
              )}
            </div>

            {/* Drawing Controls */}
            <div className="studio-controls-toolbar">
              {drawingMode === 'polygon' ? (
                <div className="controls-row">
                  <button className="studio-btn success" onClick={() => finishPolygon()}>
                    Finish Plot
                  </button>
                  <button
                    className="studio-btn danger"
                    onClick={() => {
                      setDrawingMode(null);
                      setStatusMessage('');
                      currentPointsRef.current = [];
                      layersRef.current.tempDrawingLayer.clearLayers();
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : currentEditingShapeId ? (
                <button className="studio-btn success" onClick={stopEditingShape}>
                  Done Reshaping
                </button>
              ) : (
                <button className="studio-btn primary" onClick={() => setDrawingMode('polygon')}>
                  Draw Plot (4 nodes)
                </button>
              )}

              {/* Rows & Columns Grid Builder */}
              <div className="controls-row">
                <div className="input-group">
                  <label>Rows</label>
                  <input
                    type="number"
                    className="studio-input"
                    min="1"
                    max="50"
                    value={gridRows}
                    onChange={(e) => setGridRows(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label>Columns</label>
                  <input
                    type="number"
                    className="studio-input"
                    min="1"
                    max="50"
                    value={gridCols}
                    onChange={(e) => setGridCols(e.target.value)}
                  />
                </div>
                <div className="input-group">
                  <label>&nbsp;</label>
                  <button className="studio-btn secondary" onClick={handleGenerateBoxes} title="Generate plot grid">
                    Generate Plot
                  </button>
                </div>
              </div>

              {/* Grave Type & Section Selectors */}
              <div className="controls-row">
                <div className="input-group" style={{ flex: 1.2 }}>
                  <label>Grave Type</label>
                  <select
                    className="studio-select"
                    value={selectedGraveType}
                    onChange={(e) => setSelectedGraveType(e.target.value)}
                  >
                    <option value="">GraveType</option>
                    {graveTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="input-group">
                  <label>Section</label>
                  <input
                    type="text"
                    className="studio-input"
                    placeholder="e.g. A"
                    value={sectionInput}
                    onChange={(e) => setSectionInput(e.target.value)}
                  />
                </div>
              </div>

              {selectedGraveType && sectionInput && (
                <div style={{ fontSize: '11px', color: '#004d8c', marginTop: '6px', fontWeight: 600 }}>
                  Plot Code Preview: {getPlotCodePrefix(selectedGraveType)}-{formatSectionCode(sectionInput)}-001
                </div>
              )}
            </div>

            {/* Shape Groups Manager */}
            <div className="shapes-manager-section">
              <div className="shapes-manager-header">
                <span className="shapes-manager-title">Polygons & Plots</span>
                <span className="shapes-count-tag">{polygons.length} Polygons • {boxes.length} Plots</span>
              </div>

              <div className="shapes-list-scroll">
                {polygons.length === 0 ? (
                  <div className="empty-shapes-placeholder">
                    No polygons drawn yet. Click <strong>Draw Plot</strong> to begin mapping.
                  </div>
                ) : (
                  polygons.map((poly) => {
                    const isSelected = selectedPolygonId === poly.id;
                    const isEditing = currentEditingShapeId === poly.id;
                    const children = boxes.filter((b) => b.parentId === poly.id);
                    const collapsed = collapsedGroups.has(poly.id);
                    const labelsHidden = hiddenLabels.has(poly.id);
                    const isNoFill = noFillPolys.has(poly.id);

                    return (
                      <div key={poly.id} className={`shape-group-card ${isSelected ? 'is-selected' : ''}`}>
                        <div
                          className="shape-group-header"
                          onClick={() => setSelectedPolygonId(poly.id)}
                          title="Click to select polygon for box generation"
                        >
                          <div className="shape-group-title-row">
                            <span className="shape-color-indicator" style={{ backgroundColor: poly.color }}></span>
                            <div>
                              <div className="shape-group-name">
                                {poly.name} {isSelected && <span style={{ color: '#d97706', fontSize: '11px' }}>(Selected)</span>}
                              </div>
                              <div className="shape-group-meta">
                                {formatArea(poly.areaM2)} • {children.length} box{children.length !== 1 ? 'es' : ''}
                              </div>
                            </div>
                          </div>

                          <div className="shape-group-actions" onClick={(e) => e.stopPropagation()}>
                            {children.length > 0 && (
                              <>
                                <button
                                  className="save-plots-btn"
                                  onClick={() => handleSavePlots(poly.id)}
                                  disabled={isSaving}
                                  title="Save boxes to database"
                                >
                                  {isSaving ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  className="icon-action-btn"
                                  onClick={() =>
                                    setCollapsedGroups((prev) => {
                                      const n = new Set(prev);
                                      if (collapsed) n.delete(poly.id);
                                      else n.add(poly.id);
                                      return n;
                                    })
                                  }
                                  title={collapsed ? 'Expand' : 'Collapse'}
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <polyline points={collapsed ? '6 9 12 15 18 9' : '18 15 12 9 6 15'} />
                                  </svg>
                                </button>
                                <button
                                  className="icon-action-btn"
                                  onClick={() => handleResetChildren(poly.id)}
                                  title="Reset boxes"
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="1 4 1 10 7 10" />
                                    <path d="M3.51 15a9 9 0 1 0 .49-4.95" />
                                  </svg>
                                </button>
                              </>
                            )}

                            <button
                              className={`icon-action-btn ${isEditing ? 'active' : ''}`}
                              onClick={() => (isEditing ? stopEditingShape() : startEditingShape(poly.id))}
                              title={isEditing ? 'Done' : 'Reshape'}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                              </svg>
                            </button>
                            <button
                              className="icon-action-btn"
                              onClick={() => handleZoomShape(poly.id)}
                              title="Focus on map"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                              </svg>
                            </button>
                            <button
                              className="icon-action-btn delete"
                              onClick={() => handleDeleteShape(poly.id)}
                              title="Delete polygon"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {/* Child Boxes Controls & List */}
                        {children.length > 0 && !collapsed && (
                          <>
                            <div className="shape-children-summary">
                              <span><strong>{children.length}</strong> plots generated</span>
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  className={`mini-toggle-btn ${labelsHidden ? 'is-active' : ''}`}
                                  onClick={() => handleToggleLabels(poly.id)}
                                >
                                  {labelsHidden ? 'Show Label' : 'Hide Label'}
                                </button>
                                <button
                                  className={`mini-toggle-btn ${isNoFill ? 'is-active' : ''}`}
                                  onClick={() => handleToggleFill(poly.id)}
                                >
                                  {isNoFill ? 'Fill' : 'No Fill'}
                                </button>
                              </div>
                            </div>

                            <div className="shape-children-list">
                              {children.map((child) => (
                                <div key={child.id} className="shape-child-item">
                                  <span>{child.name}</span>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                      className="icon-action-btn"
                                      onClick={() => handleZoomShape(child.id)}
                                      title="Focus"
                                    >
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="11" cy="11" r="8" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                      </svg>
                                    </button>
                                    <button
                                      className="icon-action-btn delete"
                                      onClick={() => handleDeleteShape(child.id)}
                                      title="Delete"
                                    >
                                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Interactive Studio Map Canvas */}
        <div className="studio-map-container">
          {/* Quick Location Preset Dropdown inside Map (Exact Original Style and Values) */}
          <div id="map-location-controls" className="map-floating-select-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <select id="map-location-preset-select" aria-label="Jump to Location" defaultValue="14.8378337,120.7600209,18" onChange={handlePresetChange}>
              <option value="14.8378337,120.7600209,18">Cherubim</option>
              <option value="14.8375809,120.7588293,20">Single Niche - Section A</option>
              <option value="14.8378584,120.7595240,20">Single Niche - Section B</option>
              <option value="14.8376473,120.7601220,19">Ground Burial</option>
              <option value="14.8380567,120.7613991,19">Apartment - Section A</option>
              <option value="14.8377456,120.7588448,19">Apartment - Section B</option>
            </select>
          </div>

          <div id="build-plot-map"></div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {modalConfig.isOpen && (
        <div className="studio-modal-backdrop">
          <div className="studio-modal-box">
            <h4 className="modal-title">{modalConfig.title}</h4>
            <p className="modal-body">{modalConfig.body}</p>
            <div className="modal-actions">
              <button
                className="studio-btn secondary"
                onClick={() => setModalConfig({ isOpen: false, title: '', body: '', onConfirm: null })}
              >
                Cancel
              </button>
              <button
                className="studio-btn danger"
                onClick={() => {
                  if (modalConfig.onConfirm) modalConfig.onConfirm();
                  setModalConfig({ isOpen: false, title: '', body: '', onConfirm: null });
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plots Saved Success Modal */}
      {saveSuccessModal.isOpen && (
        <div className="studio-modal-backdrop" onClick={() => setSaveSuccessModal({ isOpen: false, count: 0, prefix: '', startNum: 0, endNum: 0 })}>
          <div className="studio-modal-box" style={{ textAlign: 'center', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              backgroundColor: '#ecfdf5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '4px'
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h4 className="modal-title" style={{ fontSize: '18px', marginBottom: '8px' }}>Plots Saved Successfully</h4>
            <div className="modal-actions" style={{ width: '100%', marginTop: '6px' }}>
              <button
                className="studio-btn primary"
                style={{ width: '100%', height: '40px' }}
                onClick={() => setSaveSuccessModal({ isOpen: false, count: 0, prefix: '', startNum: 0, endNum: 0 })}
              >
                Okay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Instructions Modal */}
      {showInstructionsModal && (
        <div className="studio-modal-backdrop" onClick={() => setShowInstructionsModal(false)}>
          <div className="instructions-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="instructions-modal-header">
              <div className="instructions-header-title-group">
                <div className="instructions-header-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                </div>
                <div>
                  <h4 className="instructions-title">Build Plot Instructions &amp; Guide</h4>
                  <p className="instructions-subtitle">
                    Step-by-step instructions for drawing boundaries, setting grids, and saving plots
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="instructions-close-btn"
                onClick={() => setShowInstructionsModal(false)}
                title="Close Instructions"
              >
                ✕
              </button>
            </div>

            <div className="instructions-modal-body">
              <div className="instruction-step-card">
                <div className="instruction-step-badge">1</div>
                <div className="instruction-step-content">
                  <h5 className="instruction-step-title">Draw Plot Boundary (4 Corner Nodes)</h5>
                  <p className="instruction-step-desc">
                    Click the <strong>Draw Plot (4 nodes)</strong> button on the left panel. On the satellite map, click 4 corner points around the perimeter of the plot area or structure. The polygon closes automatically after placing the 4th point.
                  </p>
                  <div className="instruction-step-note">
                    <strong>Tip:</strong> Use the location dropdown on the top-left of the map (e.g. <em>Apartment - Section A</em>) to quickly fly directly to that section.
                  </div>
                </div>
              </div>

              <div className="instruction-step-card">
                <div className="instruction-step-badge">2</div>
                <div className="instruction-step-content">
                  <h5 className="instruction-step-title">Reshape / Adjust Corners (Optional)</h5>
                  <p className="instruction-step-desc">
                    If your corner points need fine-tuning, select the polygon and click the <strong>Reshape</strong> (pencil) icon. Drag the amber vertex handles or midpoint markers to align lines along cemetery walkways and borders. Click <strong>Done Reshaping</strong> when aligned.
                  </p>
                </div>
              </div>

              <div className="instruction-step-card">
                <div className="instruction-step-badge">3</div>
                <div className="instruction-step-content">
                  <h5 className="instruction-step-title">Configure Rows, Columns &amp; Details</h5>
                  <p className="instruction-step-desc">
                    Click the polygon card so it shows <em>(Selected)</em>. Enter the number of <strong>Rows</strong> and <strong>Columns</strong> (e.g. 2 Rows × 3 Columns = 6 plots). Then select the <strong>Grave Type</strong> (e.g. <em>Apartment</em>) and type the <strong>Section</strong> name (e.g. <em>A</em>).
                  </p>
                </div>
              </div>

              <div className="instruction-step-card">
                <div className="instruction-step-badge">4</div>
                <div className="instruction-step-content">
                  <h5 className="instruction-step-title">Generate Plot Boxes &amp; Save to Database</h5>
                  <p className="instruction-step-desc">
                    Click <strong>Generate Plot</strong> to divide your polygon into bilinear plot boxes. Check the numbering preview on the map. Once satisfied, click the green <strong>Save</strong> button on the polygon card to commit all plots to Firestore.
                  </p>
                </div>
              </div>

              <div className="instructions-pro-tips">
                <div className="instructions-pro-tips-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>Pro-Tips &amp; Best Practices</span>
                </div>
                <ul>
                  <li><strong>Overlap Protection:</strong> The studio automatically prevents saving plots that overlap existing graves.</li>
                  <li><strong>Visibility:</strong> Use the <em>Hide Label</em> and <em>No Fill</em> buttons on the polygon card to clearly inspect satellite imagery beneath.</li>
                  <li><strong>Plot Code Format:</strong> Plot codes are generated automatically in the standard format (e.g. <code>AP-A-001</code>).</li>
                </ul>
              </div>
            </div>

            <div className="instructions-modal-footer">
              <button
                type="button"
                className="studio-btn primary"
                style={{ padding: '8px 24px', height: '38px' }}
                onClick={() => setShowInstructionsModal(false)}
              >
                Got it, Start Building
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BuildPlotStudio;
