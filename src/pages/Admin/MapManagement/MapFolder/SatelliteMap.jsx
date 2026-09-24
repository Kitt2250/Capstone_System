import React, { useEffect, useRef } from 'react';
import { initMap, renderPlotsOnMap, focusOnPlot, resetMapView } from './mapInit';
import './SatelliteMap.css';

function SatelliteMap({ plots = [], focusPlot = null, resetTrigger = 0, onRegisterPlot = null, mapId = 'map' }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  // Initialize Map
  useEffect(() => {
    let active = true;
    let timer = null;

    const checkAndInit = (retries = 0) => {
      if (!active) return;
      if (!window.L) {
        if (retries < 30) {
          timer = setTimeout(() => checkAndInit(retries + 1), 100);
        } else {
          console.error('Leaflet is not available on window.L');
        }
        return;
      }

      if (mapRef.current) {
        const instances = initMap(mapId);
        mapInstanceRef.current = instances;
        if (instances && plots && plots.length > 0) {
          renderPlotsOnMap(instances, plots, true, onRegisterPlot);
        }
        if (instances && focusPlot) {
          focusOnPlot(instances, focusPlot);
        }
        setTimeout(() => {
          instances?.map?.invalidateSize();
        }, 250);
      }
    };

    timer = setTimeout(() => checkAndInit(0), 100);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      if (mapInstanceRef.current && mapInstanceRef.current.map) {
        try {
          mapInstanceRef.current.map.remove();
        } catch (e) {
          console.warn('Map cleanup error:', e);
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Re-render plot layers whenever plots data or onRegisterPlot changes (without resetting zoom)
  useEffect(() => {
    if (mapInstanceRef.current && mapInstanceRef.current.map) {
      renderPlotsOnMap(mapInstanceRef.current, plots, false, onRegisterPlot);
    }
  }, [plots, onRegisterPlot]);

  // Click delegation for popup register button
  useEffect(() => {
    const container = mapRef.current;
    if (!container || !onRegisterPlot) return;

    const handleMapClick = (e) => {
      const btn = e.target.closest('.map-popup-register-btn');
      if (btn) {
        const plotId = btn.getAttribute('data-plot-id');
        const plot = plots.find((p) => String(p.id) === String(plotId));
        if (plot) {
          if (mapInstanceRef.current?.map) {
            mapInstanceRef.current.map.closePopup();
          }
          onRegisterPlot(plot);
        }
      }
    };

    container.addEventListener('click', handleMapClick);
    return () => container.removeEventListener('click', handleMapClick);
  }, [plots, onRegisterPlot]);

  // Focus on a specific plot when requested
  useEffect(() => {
    if (focusPlot && mapInstanceRef.current && mapInstanceRef.current.map) {
      focusOnPlot(mapInstanceRef.current, focusPlot);
    }
  }, [focusPlot]);

  // Zoom back out when reset is triggered
  useEffect(() => {
    if (resetTrigger > 0 && mapInstanceRef.current && mapInstanceRef.current.map) {
      resetMapView(mapInstanceRef.current);
    }
  }, [resetTrigger]);

  const handlePresetChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    const [lat, lng, zoom] = val.split(',').map(Number);
    if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
      mapInstanceRef.current?.map?.setView([lat, lng], zoom);
    }
  };

  return (
    <div className="satellite-map-wrapper">
      <div id={mapId} ref={mapRef} className="full-satellite-map"></div>

      {/* Quick Location Preset Dropdown inside Map (Exact Original Style and Values) */}
      <div id="map-location-controls" className="map-floating-select-wrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <select id="map-location-preset-select" aria-label="Jump to Location" defaultValue="14.8378337,120.7600209,18" onChange={handlePresetChange}>
          <option value="14.8378337,120.7600209,18">Cherubim</option>
          <option value="14.8375809,120.7588293,20">Single Niche A</option>
          <option value="14.8378584,120.7595240,20">Single Niche B</option>
          <option value="14.8376473,120.7601220,19">Ground Burial</option>
          <option value="14.8380567,120.7613991,19">Apartment A</option>
          <option value="14.8377456,120.7588448,19">Apartment B</option>
        </select>
      </div>
    </div>
  );
}

export default SatelliteMap;
