import React, { useEffect, useRef } from 'react';
import { initMap, renderPlotsOnMap, focusOnPlot, resetMapView } from './mapInit';
import { getCentered12Plots } from '../../../../services/plotServices';
import './SatelliteMap.css';

function SatelliteMap({
  plots = [],
  allPlots = [],
  focusPlot = null,
  resetTrigger = 0,
  onRegisterPlot = null,
  onLocationSelect = null,
  currentLocationKey = null,
  mapId = 'map',
  plotLimit = 12,
  onPlotLimitChange = null,
  showLocationSelect = true
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);

  // Enforce rate limiting: show at most plotLimit (default 12) plots centered around focusPlot
  const plotsToRender = React.useMemo(() => {
    if (!plots || plots.length === 0) return [];
    const limit = (plotLimit && parseInt(plotLimit, 10) > 0)
      ? parseInt(plotLimit, 10)
      : (plotLimit === '' ? plots.length : 12);

    if (plots.length <= limit) return plots;

    if (focusPlot) {
      return getCentered12Plots(plots, focusPlot);
    }
    return plots.slice(0, limit);
  }, [plots, plotLimit, focusPlot]);

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
        if (instances && plotsToRender && plotsToRender.length > 0) {
          renderPlotsOnMap(instances, plotsToRender, true, onRegisterPlot);
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
      renderPlotsOnMap(mapInstanceRef.current, plotsToRender, false, onRegisterPlot);
    }
  }, [plotsToRender, onRegisterPlot]);

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

  const locationOptions = React.useMemo(() => {
    const defaultOptions = [
      { label: 'Cherubim', key: 'Cherubim__General Section', type: 'Cherubim', section: 'General Section', value: '14.8378337,120.7600209,18' },
      { label: 'Single Niche - Section A', key: 'Single Niche__Section A', type: 'Single Niche', section: 'Section A', value: '14.8375809,120.7588293,20' },
      { label: 'Single Niche - Section B', key: 'Single Niche__Section B', type: 'Single Niche', section: 'Section B', value: '14.8378584,120.7595240,20' },
      { label: 'Ground Burial', key: 'Ground Burial__General Section', type: 'Ground Burial', section: 'General Section', value: '14.8376473,120.7601220,19' },
      { label: 'Apartment - Section A', key: 'Apartment__Section A', type: 'Apartment', section: 'Section A', value: '14.8380567,120.7613991,19' },
      { label: 'Apartment - Section B', key: 'Apartment__Section B', type: 'Apartment', section: 'Section B', value: '14.8377456,120.7588448,19' },
    ];

    const sourceList = (allPlots && allPlots.length > 0) ? allPlots : plots;
    if (!sourceList || sourceList.length === 0) return defaultOptions;

    const groups = new Map();
    sourceList.forEach((p) => {
      let type = p.grave_type || p.graveType || p.lotType || p.type || '';
      if (!type || /^GT\d+$/i.test(String(type).trim())) {
        const title = p.plotCode || p.name || '';
        if (/^SN/i.test(title)) type = 'Single Niche';
        else if (/^AP/i.test(title)) type = 'Apartment';
        else if (/^GB/i.test(title)) type = 'Ground Burial';
        else if (/^CB/i.test(title)) type = 'Cherubim';
        else type = 'Grave Lot';
      }

      let sec = 'General Section';
      if (p.section) {
        const s = String(p.section).trim();
        sec = /^section\b/i.test(s) ? s : `Section ${s}`;
      } else {
        const title = p.plotCode || p.name || '';
        const m = title.match(/^[A-Z]+-([A-Za-z0-9]+)-/i) || title.match(/^([A-Za-z]+)-/);
        if (m) sec = `Section ${m[1].toUpperCase()}`;
      }

      const label = (sec && sec !== 'General Section') ? `${type} - ${sec}` : type;
      const key = `${type}__${sec}`;

      let lat = null;
      let lng = null;
      if (p.coordinates && Array.isArray(p.coordinates) && p.coordinates.length > 0) {
        const c = p.coordinates[0];
        lat = Number(c.lat ?? c.latitude ?? (Array.isArray(c) ? c[0] : NaN));
        lng = Number(c.lng ?? c.longitude ?? (Array.isArray(c) ? c[1] : NaN));
      } else if (p.latitude != null && p.longitude != null) {
        lat = Number(p.latitude);
        lng = Number(p.longitude);
      }

      if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
        if (!groups.has(key)) {
          groups.set(key, { label, key, type, section: sec, lats: [lat], lngs: [lng] });
        } else {
          groups.get(key).lats.push(lat);
          groups.get(key).lngs.push(lng);
        }
      }
    });

    if (groups.size === 0) return defaultOptions;

    const dynamicOptions = Array.from(groups.values()).map((g) => {
      const avgLat = g.lats.reduce((a, b) => a + b, 0) / g.lats.length;
      const avgLng = g.lngs.reduce((a, b) => a + b, 0) / g.lngs.length;
      return {
        label: g.label,
        key: g.key,
        type: g.type,
        section: g.section,
        value: `${avgLat.toFixed(7)},${avgLng.toFixed(7)},20`
      };
    });

    defaultOptions.forEach((def) => {
      const exists = dynamicOptions.some((d) => d.label.toLowerCase() === def.label.toLowerCase() || d.key === def.key);
      if (!exists) {
        dynamicOptions.push(def);
      }
    });

    return dynamicOptions.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [plots, allPlots]);

  const selectedValue = React.useMemo(() => {
    if (!currentLocationKey || currentLocationKey === 'ALL') return '';
    const match = locationOptions.find(
      (opt) => opt.key === currentLocationKey || opt.label.toLowerCase() === String(currentLocationKey).toLowerCase()
    );
    return match ? match.value : '';
  }, [currentLocationKey, locationOptions]);

  const handlePresetChange = (e) => {
    const val = e.target.value;
    if (!val) return;
    const [lat, lng, zoom] = val.split(',').map(Number);
    if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
      mapInstanceRef.current?.map?.setView([lat, lng], zoom);
    }

    const selectedOpt = locationOptions.find((opt) => opt.value === val);
    if (selectedOpt) {
      const sourceList = (allPlots && allPlots.length > 0) ? allPlots : plots;
      const matchingPlots = sourceList.filter((p) => {
        let type = p.grave_type || p.graveType || p.lotType || p.type || '';
        if (!type || /^GT\d+$/i.test(String(type).trim())) {
          const title = p.plotCode || p.name || '';
          if (/^SN/i.test(title)) type = 'Single Niche';
          else if (/^AP/i.test(title)) type = 'Apartment';
          else if (/^GB/i.test(title)) type = 'Ground Burial';
          else if (/^CB/i.test(title)) type = 'Cherubim';
          else type = 'Grave Lot';
        }
        let sec = 'General Section';
        if (p.section) {
          const s = String(p.section).trim();
          sec = /^section\b/i.test(s) ? s : `Section ${s}`;
        } else {
          const title = p.plotCode || p.name || '';
          const m = title.match(/^[A-Z]+-([A-Za-z0-9]+)-/i) || title.match(/^([A-Za-z]+)-/);
          if (m) sec = `Section ${m[1].toUpperCase()}`;
        }

        const matchesType = type.toLowerCase() === (selectedOpt.type || '').toLowerCase();
        const optSec = (selectedOpt.section || '').toLowerCase();
        const matchesSec = optSec === 'general section' || !optSec || sec.toLowerCase() === optSec;
        return matchesType && matchesSec;
      });

      // Limit plots based on plotLimit
      const limit = (plotLimit && parseInt(plotLimit, 10) > 0)
        ? parseInt(plotLimit, 10)
        : (plotLimit === '' ? matchingPlots.length : 12);
      const limitedPlots = matchingPlots.slice(0, limit);

      if (mapInstanceRef.current?.map && limitedPlots.length > 0) {
        renderPlotsOnMap(mapInstanceRef.current, limitedPlots, false, onRegisterPlot);
      }

      if (onLocationSelect) {
        onLocationSelect(selectedOpt.key || selectedOpt.label, limitedPlots, selectedOpt);
      }
    }
  };

  return (
    <div className="satellite-map-wrapper">
      <div id={mapId} ref={mapRef} className="full-satellite-map"></div>

      {/* Quick Location Preset Dropdown inside Map */}
      {showLocationSelect && (
        <div id="map-location-controls" className="map-floating-select-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <select
            id="map-location-preset-select"
            aria-label="Jump to Location"
            value={selectedValue || locationOptions[0]?.value || ''}
            onChange={handlePresetChange}
          >
            {locationOptions.map((opt) => (
              <option key={opt.key || opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export default SatelliteMap;
