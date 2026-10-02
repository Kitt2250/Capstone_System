import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Navigation, X, Volume2, VolumeX, Moon, Sun, LocateFixed, AlertTriangle, RefreshCw, Compass } from "lucide-react";
import "./NavigateGpsModal.css";

const CEMETERY_ENTRANCE = [14.839013, 120.759680];

// ── Calculate distance between two lat/lng points (Haversine formula in meters) ──
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ── Calculate initial bearing/heading between two points (in degrees 0-360) ──
function calculateBearing(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}

// ── Derive plot coordinates and polygon robustly ────────────────────────
function parsePlotCoordinates(plot) {
  if (!plot) return { center: null, polygon: null };

  let rawCoords =
    plot.coordinates || plot.polygon || plot.latlngs || plot.points || plot.bounds;

  if (typeof rawCoords === "string") {
    try {
      rawCoords = JSON.parse(rawCoords);
    } catch (_) {}
  }

  // 1. Array of points
  if (rawCoords && Array.isArray(rawCoords) && rawCoords.length > 0) {
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
      return { center: [lat, lng], polygon: pts };
    } else if (pts.length > 0) {
      return { center: pts[0], polygon: null };
    }
  }

  // 2. Direct object coordinates
  if (rawCoords && typeof rawCoords === "object" && !Array.isArray(rawCoords)) {
    const lat = rawCoords.lat ?? rawCoords.latitude;
    const lng = rawCoords.lng ?? rawCoords.longitude;
    if (lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
      return { center: [Number(lat), Number(lng)], polygon: null };
    }
  }

  // 3. Direct point fields on plot
  const lat =
    plot.latitude ?? plot.lat ?? plot.location?.latitude ?? plot.center?.[0] ?? plot.position?.lat;
  const lng =
    plot.longitude ?? plot.lng ?? plot.location?.longitude ?? plot.center?.[1] ?? plot.position?.lng;

  if (lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
    return { center: [Number(lat), Number(lng)], polygon: null };
  }

  return { center: null, polygon: null };
}

function getDestinationBadgeText(plot, deceasedNames) {
  if (plot?.plotCode) {
    const clean = plot.plotCode.replace(/[^a-zA-Z0-9]/g, "");
    if (clean.length <= 4) return clean.toUpperCase();
    return clean.slice(0, 3).toUpperCase();
  }
  if (deceasedNames && deceasedNames.length > 0 && deceasedNames[0]) {
    const parts = deceasedNames[0].trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  return "PL";
}

export default function NavigateGpsModal({ plot, deceasedNames = [], onClose }) {
  const [userLocation, setUserLocation] = useState(null); // [lat, lng]
  const [userHeading, setUserHeading] = useState(0);
  const [gpsStatus, setGpsStatus] = useState("locating"); // 'locating' | 'ready' | 'denied' | 'error'
  const [gpsErrorMsg, setGpsErrorMsg] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isHybridLayer, setIsHybridLayer] = useState(true);
  const [navInstruction, setNavInstruction] = useState("Calculating route…");

  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const polygonLayerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const routingControlRef = useRef(null);
  const fallbackLineRef = useRef(null);
  const watchIdRef = useRef(null);

  // Milestone announcement tracking
  const announcedMilestonesRef = useRef({
    started: false,
    halfway: false,
    approaching: false,
    arrived: false,
  });

  // Memoize plot coordinates so references don't change and retrigger effects
  const { center: plotCenter, polygon: plotPolygon } = useMemo(
    () => parsePlotCoordinates(plot),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plot?.id, plot?.plotCode, plot?.latitude, plot?.longitude, plot?.lat, plot?.lng]
  );

  const plotCenterRef = useRef(plotCenter);
  useEffect(() => {
    plotCenterRef.current = plotCenter;
  }, [plotCenter]);

  const badgeText = useMemo(
    () => getDestinationBadgeText(plot, deceasedNames),
    [plot?.plotCode, deceasedNames]
  );

  // Distance calculation
  const distance =
    userLocation && plotCenter
      ? calculateDistanceMeters(
          userLocation[0],
          userLocation[1],
          plotCenter[0],
          plotCenter[1]
        )
      : null;

  // Walking time (standard walking speed ~75 meters/min)
  const walkingMinutes =
    distance !== null ? Math.max(1, Math.round(distance / 75)) : null;

  // Estimated Arrival Clock Time
  const etaClockStr =
    walkingMinutes !== null
      ? new Date(Date.now() + walkingMinutes * 60000).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  // ── Voice Guidance (Speech Synthesis + Audio Chime) ─────────
  const playChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (_) {}
  }, []);

  const speak = useCallback(
    (text, withChime = true) => {
      if (isMuted || !("speechSynthesis" in window)) return;
      try {
        if (withChime) playChime();
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        utterance.lang = "en-US";
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn("Speech synthesis error:", err);
      }
    },
    [isMuted, playChime]
  );

  const toggleSound = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (!next) {
        setTimeout(() => speak("Voice guidance enabled.", true), 100);
      } else {
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      }
      return next;
    });
  }, [speak]);

  // ── Voice Milestones (Start, Approaching, Arrived) ───────────
  useEffect(() => {
    if (!userLocation || !plotCenter || distance === null) return;

    // 1. Initial Start Voice
    if (!announcedMilestonesRef.current.started && distance > 10) {
      announcedMilestonesRef.current.started = true;
      const targetName = plot?.plotCode ? `Plot ${plot.plotCode}` : "your destination";
      const distStr =
        distance < 1000
          ? `${Math.round(distance)} meters`
          : `${(distance / 1000).toFixed(1)} kilometers`;
      const timeStr =
        walkingMinutes !== null
          ? `${walkingMinutes} minute${walkingMinutes > 1 ? "s" : ""}`
          : "";
      const msg = `Starting route to ${targetName}. Distance: ${distStr}. Estimated walking time: ${timeStr}.`;
      setNavInstruction(`Head towards ${targetName}`);
      speak(msg);
      return;
    }

    // 2. Arrival (<= 7 meters)
    if (distance <= 7 && !announcedMilestonesRef.current.arrived) {
      announcedMilestonesRef.current.arrived = true;
      setNavInstruction("You have arrived at your destination");
      speak("You have arrived at the burial plot.");
      return;
    }

    // 3. Approaching (<= 25 meters)
    if (distance <= 25 && distance > 7 && !announcedMilestonesRef.current.approaching) {
      announcedMilestonesRef.current.approaching = true;
      setNavInstruction(`Arriving in ${Math.round(distance)} meters`);
      speak(`You are approaching the burial plot. ${Math.round(distance)} meters remaining.`);
      return;
    }
  }, [userLocation, plotCenter, distance, walkingMinutes, plot?.plotCode, speak]);

  // ── Cleanup speech on close ──
  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // ── Handle ESC Key ──────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // ── Multi-Tier Geolocation Watcher ──────────────────────────
  const startWatchingLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setGpsStatus("error");
      setGpsErrorMsg("Geolocation is not supported by your browser.");
      return;
    }

    setGpsStatus("locating");
    setGpsErrorMsg("");

    let resolved = false;

    const onLocationSuccess = (pos) => {
      resolved = true;
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      let heading = pos.coords.heading;

      const target = plotCenterRef.current;
      if (heading === null || heading === undefined || isNaN(heading)) {
        if (target) {
          heading = calculateBearing(lat, lng, target[0], target[1]);
        } else {
          heading = 0;
        }
      }

      setUserLocation([lat, lng]);
      setUserHeading(heading);
      setGpsStatus("ready");
    };

    const tryLowAccuracy = () => {
      if (resolved) return;
      console.log("High accuracy timed out, falling back to network/Wi-Fi geolocation...");
      navigator.geolocation.getCurrentPosition(
        onLocationSuccess,
        (err) => {
          if (resolved) return;
          console.warn("GPS error:", err);
          if (err.code === 1) {
            setGpsStatus("denied");
            setGpsErrorMsg("Location access was blocked. Please click the lock 🔒 icon in your browser address bar to allow location.");
          } else {
            setGpsStatus("error");
            setGpsErrorMsg(
              err.message || "Unable to acquire location signal on this device."
            );
          }
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    };

    // Tier 1: Try high accuracy (4-sec timeout so it doesn't hang indefinitely on Windows laptops)
    navigator.geolocation.getCurrentPosition(
      onLocationSuccess,
      tryLowAccuracy,
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 }
    );

    // Watch position in background for live movement
    try {
      const id = navigator.geolocation.watchPosition(
        onLocationSuccess,
        () => {},
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 5000 }
      );
      watchIdRef.current = id;
    } catch (_) {}
  }, []);

  useEffect(() => {
    startWatchingLocation();
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [startWatchingLocation]);

  // ── Automatic Device Compass Heading (rotates arrow as you turn) ──
  useEffect(() => {
    const handleOrientation = (e) => {
      let compass = null;
      if (e.webkitCompassHeading !== undefined && e.webkitCompassHeading !== null) {
        compass = e.webkitCompassHeading;
      } else if (e.alpha !== null && e.absolute) {
        compass = 360 - e.alpha;
      }

      if (compass !== null && !isNaN(compass)) {
        setUserHeading(Math.round(compass));
      }
    };

    if (window.DeviceOrientationEvent) {
      window.addEventListener("deviceorientationabsolute", handleOrientation, true);
      window.addEventListener("deviceorientation", handleOrientation, true);
    }
    return () => {
      if (window.DeviceOrientationEvent) {
        window.removeEventListener("deviceorientationabsolute", handleOrientation, true);
        window.removeEventListener("deviceorientation", handleOrientation, true);
      }
    };
  }, []);

  // ── Fallback simulate entrance location ──────────────────────
  const handleUseEntrance = useCallback(() => {
    const entrance = CEMETERY_ENTRANCE;
    const target = plotCenterRef.current;
    const heading = target
      ? calculateBearing(entrance[0], entrance[1], target[0], target[1])
      : 0;
    setUserLocation(entrance);
    setUserHeading(heading);
    setGpsStatus("ready");
    setGpsErrorMsg("");
  }, []);

  // ── Recenter on User or Plot ─────────────────────────────────
  const recenterOnUser = useCallback(() => {
    if (mapInstanceRef.current) {
      if (userLocation) {
        mapInstanceRef.current.setView(userLocation, 19, { animate: true });
      } else if (plotCenter) {
        mapInstanceRef.current.setView(plotCenter, 19, { animate: true });
      }
    }
  }, [userLocation, plotCenter]);

  // ── Toggle Map Layer (Hybrid vs Satellite) ───────────────────
  const toggleMapLayer = useCallback(() => {
    setIsHybridLayer((prev) => {
      const next = !prev;
      if (mapInstanceRef.current && tileLayerRef.current) {
        mapInstanceRef.current.removeLayer(tileLayerRef.current);
        const url = next
          ? "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
          : "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";
        const newLayer = window.L.tileLayer(url, {
          maxZoom: 22,
          maxNativeZoom: 20,
        }).addTo(mapInstanceRef.current);
        tileLayerRef.current = newLayer;
      }
      return next;
    });
  }, []);

  // ── Initialize Map (Only once on mount) ──────────────────────
  useEffect(() => {
    let active = true;
    let retries = 0;

    const initMap = () => {
      if (!active) return;
      const L = window.L;

      if (!L) {
        if (retries < 40) {
          retries++;
          setTimeout(initMap, 100);
        }
        return;
      }

      const container = mapContainerRef.current;
      if (!container) return;

      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (_) {}
        mapInstanceRef.current = null;
      }
      if (container._leaflet_id) {
        container._leaflet_id = null;
        container.innerHTML = "";
      }

      const initialCenter = plotCenter || CEMETERY_ENTRANCE;

      const map = L.map(container, {
        center: initialCenter,
        zoom: 18,
        zoomControl: false,
        attributionControl: false,
      });

      // Google Satellite/Hybrid tile layer
      const tileUrl = isHybridLayer
        ? "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
        : "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";

      const layer = L.tileLayer(tileUrl, {
        maxZoom: 22,
        maxNativeZoom: 20,
      }).addTo(map);
      tileLayerRef.current = layer;

      // Plot Polygon
      if (plotPolygon && plotPolygon.length >= 3) {
        const poly = L.polygon(plotPolygon, {
          color: "#38bdf8",
          weight: 3,
          fillColor: "#0284c7",
          fillOpacity: 0.35,
        }).addTo(map);
        polygonLayerRef.current = poly;
      }

      // Destination Marker matching screenshot badge (e.g. "BF")
      if (plotCenter) {
        const destIcon = L.divIcon({
          className: "",
          html: `
            <div class="gl-screen-dest-marker">
              <div class="gl-screen-dest-badge">${badgeText}</div>
              <div class="gl-screen-dest-dot"></div>
            </div>
          `,
          iconSize: [44, 44],
          iconAnchor: [22, 40],
        });

        const destMarker = L.marker(plotCenter, { icon: destIcon })
          .addTo(map)
          .bindPopup(`<strong>Burial Plot</strong><br>${plot?.plotCode || "Destination"}`);
        destMarkerRef.current = destMarker;
      }

      mapInstanceRef.current = map;

      // Size invalidation passes
      setTimeout(() => map.invalidateSize(), 100);
      setTimeout(() => map.invalidateSize(), 300);
      setTimeout(() => map.invalidateSize(), 600);
    };

    const timer = setTimeout(initMap, 50);

    return () => {
      active = false;
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch (_) {}
        mapInstanceRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plot?.id]);

  // ── Update User Marker & Navigation Route When Position Updates ──
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L = window.L;
    if (!map || !L || !userLocation) return;

    // 1. Navigation Arrowhead Marker
    const arrowHtml = `
      <div class="gl-nav-arrow-container">
        <div class="gl-nav-arrow-glow"></div>
        <div class="gl-nav-arrow-rotator" style="transform: rotate(${userHeading}deg);">
          <svg class="gl-nav-arrow-svg" viewBox="0 0 24 24" width="32" height="32">
            <path d="M12 2L4 21l8-4 8 4L12 2z" fill="#2563eb" stroke="#ffffff" stroke-width="2" stroke-linejoin="round" />
          </svg>
        </div>
      </div>
    `;

    const arrowIcon = L.divIcon({
      className: "",
      html: arrowHtml,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(userLocation);
      userMarkerRef.current.setIcon(arrowIcon);
      map.panTo(userLocation, { animate: true, duration: 0.5 });
    } else {
      userMarkerRef.current = L.marker(userLocation, {
        icon: arrowIcon,
        zIndexOffset: 1500,
      }).addTo(map);

      // Fit bounds to show both user and destination
      if (plotCenter) {
        try {
          const bounds = L.latLngBounds([userLocation, plotCenter]);
          map.fitBounds(bounds, { padding: [90, 90], maxZoom: 19 });
        } catch (_) {}
      } else {
        map.setView(userLocation, 19);
      }
    }

    // 2. Navigation Route Line
    if (plotCenter) {
      if (fallbackLineRef.current) {
        try { map.removeLayer(fallbackLineRef.current); } catch (_) {}
        fallbackLineRef.current = null;
      }

      if (routingControlRef.current) {
        try {
          routingControlRef.current.setWaypoints([
            L.latLng(...userLocation),
            L.latLng(...plotCenter),
          ]);
        } catch (_) {}
      } else if (window.L?.Routing && window.L.Routing.control) {
        try {
          let routeFound = false;

          const drawFallback = () => {
            if (!routeFound && !fallbackLineRef.current) {
              const casing = L.polyline([userLocation, plotCenter], {
                color: "#1e1b2e",
                weight: 8,
                opacity: 0.95,
              });
              const inner = L.polyline([userLocation, plotCenter], {
                color: "#ede7de",
                weight: 5,
                opacity: 1,
              });
              const group = L.featureGroup([casing, inner]).addTo(map);
              fallbackLineRef.current = group;
            }
          };

          const routingControl = window.L.Routing.control({
            waypoints: [L.latLng(...userLocation), L.latLng(...plotCenter)],
            routeWhileDragging: false,
            addWaypoints: false,
            draggableWaypoints: false,
            fitSelectedRoutes: false,
            showAlternatives: false,
            lineOptions: {
              styles: [
                { color: "#1e1b2e", opacity: 0.95, weight: 8 },
                { color: "#ede7de", opacity: 1, weight: 5 },
              ],
              extendToWaypoints: true,
              missingRouteTolerance: 0,
            },
            createMarker: () => null,
            containerClassName: "gl-lrm-panel",
          }).addTo(map);

          routingControl.on("routesfound", (e) => {
            routeFound = true;
            if (fallbackLineRef.current) {
              try { map.removeLayer(fallbackLineRef.current); } catch (_) {}
              fallbackLineRef.current = null;
            }

            const routes = e.routes;
            if (routes && routes[0]?.instructions && routes[0].instructions.length > 0) {
              const firstInstr = routes[0].instructions[0];
              if (firstInstr && firstInstr.text) {
                setNavInstruction(firstInstr.text);
              }
            }
          });

          routingControl.on("routingerror", () => {
            drawFallback();
          });

          setTimeout(() => {
            if (!routeFound) drawFallback();
          }, 1500);

          routingControlRef.current = routingControl;
        } catch (e) {
          console.warn("Routing error, using fallback line:", e);
        }
      } else {
        const casing = L.polyline([userLocation, plotCenter], {
          color: "#1e1b2e",
          weight: 8,
          opacity: 0.95,
        });
        const inner = L.polyline([userLocation, plotCenter], {
          color: "#ede7de",
          weight: 5,
          opacity: 1,
        });
        const group = L.featureGroup([casing, inner]).addTo(map);
        fallbackLineRef.current = group;
      }
    }
  }, [userLocation, userHeading, plotCenter]);

  return (
    <div className="gl-nav-fullscreen">
      {/* ── Top Turn-by-Turn / Heading Banner (matching screenshot) ── */}
      <div className="gl-nav-top-banner">
        <div className="gl-nav-top-left">
          <div className="gl-nav-turn-icon-wrap">
            <Navigation size={22} className="gl-nav-turn-icon" />
          </div>
          <div className="gl-nav-top-text">
            <h2 className="gl-nav-top-title">
              {gpsStatus === "denied"
                ? "Location Access Blocked"
                : navInstruction || `Heading to Plot ${plot?.plotCode || ""}`}
            </h2>
            <p className="gl-nav-top-subtitle">
              {deceasedNames.length > 0
                ? `Heading to ${deceasedNames.join(" & ")}`
                : plot?.location
                ? `Section: ${plot.location}`
                : "Cherubim Memorial Park"}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="gl-nav-top-close-btn"
          onClick={onClose}
          aria-label="Exit Navigation"
        >
          <X size={20} />
        </button>
      </div>

      {/* ── GPS Status / Fallback Notice Banner ── */}
      {(gpsStatus === "denied" || gpsStatus === "error" || (gpsStatus === "locating" && !userLocation)) && (
        <div className="gl-nav-warning-banner">
          <AlertTriangle size={18} className="gl-nav-warn-icon" />
          <div className="gl-nav-warn-content">
            <span className="gl-nav-warn-text">
              {gpsStatus === "denied"
                ? "Location blocked. Enable location in browser address bar (🔒 icon)."
                : gpsStatus === "error"
                ? gpsErrorMsg || "GPS signal unavailable on this device."
                : "Acquiring live GPS position automatically…"}
            </span>
            <div className="gl-nav-warn-actions">
              <button
                type="button"
                className="gl-nav-warn-btn gl-nav-warn-btn--retry"
                onClick={startWatchingLocation}
              >
                <RefreshCw size={13} /> Retry GPS
              </button>
              <button
                type="button"
                className="gl-nav-warn-btn gl-nav-warn-btn--entrance"
                onClick={handleUseEntrance}
              >
                <Compass size={13} /> Test from Gate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fullscreen Satellite Map ── */}
      <div id="gl-nav-fullscreen-map" ref={mapContainerRef} className="gl-nav-map" />

      {/* ── Floating Action Buttons (Right side) ── */}
      <div className="gl-nav-fab-group">
        <button
          type="button"
          className="gl-nav-fab"
          onClick={toggleMapLayer}
          title={isHybridLayer ? "Switch to Pure Satellite" : "Switch to Hybrid Labels"}
          aria-label="Toggle Satellite / Hybrid layer"
        >
          {isHybridLayer ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button
          type="button"
          className={`gl-nav-fab ${!isMuted ? "gl-nav-fab--sound-on" : ""}`}
          onClick={toggleSound}
          title={isMuted ? "Unmute Voice Directions" : "Mute Voice Directions"}
          aria-label="Toggle Sound"
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>

        <button
          type="button"
          className="gl-nav-fab gl-nav-fab--recenter"
          onClick={recenterOnUser}
          title="Recenter on My Location"
          aria-label="Recenter on My Location"
        >
          <LocateFixed size={20} />
        </button>
      </div>

      {/* ── Bottom Dark Navigation Bar (matching screenshot) ── */}
      <div className="gl-nav-bottom-bar">
        <div className="gl-nav-bottom-info">
          {gpsStatus === "locating" && !userLocation ? (
            <div className="gl-nav-bottom-loading">
              <span className="gl-nav-pulse-dot" />
              <span>Locating GPS position…</span>
            </div>
          ) : (
            <>
              <div className="gl-nav-eta-primary">
                {walkingMinutes !== null ? `${walkingMinutes} min` : "Calculating…"}
              </div>
              <div className="gl-nav-eta-secondary">
                <span>
                  {distance !== null
                    ? distance < 1000
                      ? `${Math.round(distance)} m`
                      : `${(distance / 1000).toFixed(1)} km`
                    : "—"}
                </span>
                {etaClockStr && <span className="gl-nav-dot">•</span>}
                {etaClockStr && <span>{etaClockStr}</span>}
              </div>
              <div className="gl-nav-mode-badge">
                <i className="fas fa-walking" />
                <span>Walking</span>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          className="gl-nav-end-btn"
          onClick={onClose}
        >
          End Route
        </button>
      </div>
    </div>
  );
}
