import { useState, useEffect, useRef } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import "./NavigateEntranceModal.css";

// ── Fixed cemetery entrance coordinates ──────────────────────
const ENTRANCE_LAT = 14.839013;
const ENTRANCE_LNG = 120.759680;

// ── Derive plot coordinates and polygon ────────────────────────
function parsePlotCoordinates(plot) {
  if (!plot) return { center: null, polygon: null };

  let rawCoords =
    plot.coordinates || plot.polygon || plot.latlngs || plot.points || plot.bounds;

  if (typeof rawCoords === "string") {
    try {
      rawCoords = JSON.parse(rawCoords);
    } catch (_) {}
  }

  // 1. Polygon / Polyline coordinates
  if (rawCoords && Array.isArray(rawCoords) && rawCoords.length >= 3) {
    const pts = rawCoords
      .map((pt) => {
        if (Array.isArray(pt)) return [Number(pt[0]), Number(pt[1])];
        if (pt.lat !== undefined && pt.lng !== undefined)
          return [Number(pt.lat), Number(pt.lng)];
        if (pt.latitude !== undefined && pt.longitude !== undefined)
          return [Number(pt.latitude), Number(pt.longitude)];
        return null;
      })
      .filter((p) => p && !isNaN(p[0]) && !isNaN(p[1]));

    if (pts.length >= 3) {
      const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const lng = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      return {
        center: [lat, lng],
        polygon: pts,
      };
    }
  }

  // 2. Direct point fields
  const lat =
    plot.latitude ?? plot.lat ?? plot.location?.latitude ?? plot.center?.[0] ?? plot.position?.lat;
  const lng =
    plot.longitude ?? plot.lng ?? plot.location?.longitude ?? plot.center?.[1] ?? plot.position?.lng;

  if (lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
    return {
      center: [Number(lat), Number(lng)],
      polygon: null,
    };
  }

  return { center: null, polygon: null };
}

export default function NavigateEntranceModal({ plot, deceasedNames = [], onClose }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);

  const { center: plotCenter, polygon: plotPolygon } = parsePlotCoordinates(plot);

  // Re-adjust map viewport whenever fullscreen is toggled
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const t1 = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 60);
    const t2 = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 260);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isFullscreen]);

  // Handle ESC key to exit fullscreen first or close modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, onClose]);

  useEffect(() => {
    let active = true;
    let retries = 0;

    const initNavMap = () => {
      if (!active) return;
      const L = window.L;

      if (!L) {
        if (retries < 30) {
          retries++;
          setTimeout(initNavMap, 100);
        } else {
          console.error("Leaflet is not available on window.L");
        }
        return;
      }

      const container = mapContainerRef.current;
      if (!container) return;

      // Clean existing instance
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (_) {}
        mapInstanceRef.current = null;
      }
      if (container._leaflet_id) {
        container._leaflet_id = null;
        container.innerHTML = "";
      }

      const pointA = [ENTRANCE_LAT, ENTRANCE_LNG];
      const pointB = plotCenter || pointA;

      // Initialize Leaflet map
      const map = L.map(container, {
        center: pointA,
        zoom: 18,
        zoomControl: false,
        attributionControl: false,
      });

      L.control.zoom({ position: "topright" }).addTo(map);

      // Google Satellite Tile Layer (matches the rest of the application)
      L.tileLayer("https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
        maxZoom: 22,
        maxNativeZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
      }).addTo(map);

      // ── Marker A: Cemetery Entrance ────────────────────────
      const iconA = L.divIcon({
        className: "",
        html: `<div class="gl-nav-marker gl-nav-marker--a"><span>A</span><span class="gl-nav-marker-label">Entrance</span></div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });
      L.marker(pointA, { icon: iconA })
        .addTo(map)
        .bindPopup("<strong>Cemetery Entrance</strong><br>Starting point (Gate)");

      // ── If plot has valid coordinates ───────────────────────
      if (plotCenter) {
        // Draw plot polygon if available
        if (plotPolygon && plotPolygon.length >= 3) {
          L.polygon(plotPolygon, {
            color: "#60a5fa",
            weight: 3,
            fillColor: "#3b82f6",
            fillOpacity: 0.35,
          }).addTo(map);
        }

        // Marker B: Plot
        const iconB = L.divIcon({
          className: "",
          html: `<div class="gl-nav-marker gl-nav-marker--b"><span>B</span><span class="gl-nav-marker-label">${plot?.plotCode || "Plot"}</span></div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 36],
        });
        L.marker(pointB, { icon: iconB })
          .addTo(map)
          .bindPopup(`<strong>Burial Plot</strong><br>${plot?.plotCode || "Destination"}`);

        // Try LRM (Leaflet Routing Machine)
        let routeFound = false;
        let fallbackLine = null;

        const drawFallbackLine = () => {
          if (!routeFound && !fallbackLine && active) {
            fallbackLine = L.polyline([pointA, pointB], {
              color: "#3b82f6",
              weight: 5,
              opacity: 0.9,
              dashArray: "8, 8",
            }).addTo(map);
          }
        };

        if (window.L?.Routing && window.L.Routing.control) {
          try {
            const routingControl = window.L.Routing.control({
              waypoints: [L.latLng(...pointA), L.latLng(...pointB)],
              routeWhileDragging: false,
              addWaypoints: false,
              draggableWaypoints: false,
              fitSelectedRoutes: true,
              showAlternatives: false,
              lineOptions: {
                styles: [
                  { color: "#1e3a8a", opacity: 0.9, weight: 6 },
                  { color: "#38bdf8", opacity: 0.8, weight: 4 },
                ],
                extendToWaypoints: true,
                missingRouteTolerance: 0,
              },
              createMarker: () => null, // use custom A/B markers
              containerClassName: "gl-lrm-panel",
            }).addTo(map);

            routingControl.on("routesfound", () => {
              routeFound = true;
              if (fallbackLine) {
                try { map.removeLayer(fallbackLine); } catch (_) {}
              }
            });

            routingControl.on("routingerror", () => {
              drawFallbackLine();
            });

            // Timeout fallback: if OSRM doesn't respond within 2.5s, draw direct walking path
            setTimeout(() => {
              if (!routeFound) drawFallbackLine();
            }, 2500);
          } catch (err) {
            console.warn("Routing control error, using direct line:", err);
            drawFallbackLine();
          }
        } else {
          // LRM not available -> direct route line
          drawFallbackLine();
        }

        // Fit map bounds to encompass both Entrance (A) and Plot (B)
        try {
          const bounds = L.latLngBounds([pointA, pointB]);
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 19 });
        } catch (_) {}
      } else {
        map.setView(pointA, 18);
      }

      // Invalidate size once modal finishes opening / rendering
      setTimeout(() => map.invalidateSize(), 150);
      setTimeout(() => map.invalidateSize(), 400);

      mapInstanceRef.current = map;
    };

    // Delay slightly to ensure modal DOM is mounted
    const timer = setTimeout(initNavMap, 50);

    return () => {
      active = false;
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (_) {}
        mapInstanceRef.current = null;
      }
    };
  }, [plot, plotCenter, plotPolygon]);

  return (
    <div
      className={`gl-modal-overlay ${isFullscreen ? "gl-modal-overlay--fullscreen" : ""}`}
      onClick={onClose}
    >
      <div
        className={`gl-modal ${isFullscreen ? "gl-modal--fullscreen" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="gl-modal-header">
          <div className="gl-modal-title-block">
            <h3 className="gl-modal-title">Navigate from Entrance</h3>
            {deceasedNames.length > 0 && (
              <p className="gl-modal-subtitle">
                Plot of{" "}
                <strong>{deceasedNames.join(" & ")}</strong>
                {plot?.plotCode ? ` — ${plot.plotCode}` : ""}
              </p>
            )}
          </div>
          <div className="gl-modal-header-actions">
            <button
              type="button"
              className="gl-modal-action-btn"
              onClick={() => setIsFullscreen((prev) => !prev)}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              aria-label="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              type="button"
              className="gl-modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="gl-modal-legend">
          <span className="gl-legend-item gl-legend-a">
            <span className="gl-legend-dot" />A — Cemetery Entrance
          </span>
          <span className="gl-legend-item gl-legend-b">
            <span className="gl-legend-dot" />B — Burial Plot
          </span>
        </div>

        {/* Map */}
        <div className="gl-modal-map-wrapper">
          {!plotCenter && (
            <div className="gl-modal-no-coords">
              No coordinates registered for this plot yet.
            </div>
          )}
          <div
            id="gl-entrance-nav-map"
            ref={mapContainerRef}
            className="gl-modal-map"
          />
        </div>
      </div>
    </div>
  );
}
