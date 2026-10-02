import { useState, useEffect, useMemo } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase/config";
import { findClientForUser } from "../../../services/clientServices";
import { Navigation } from "lucide-react";
import FamilyTopbar from "./FamilyTopbar";
import SatelliteMap from "../../Admin/MapManagement/MapFolder/SatelliteMap.jsx";
import NavigateEntranceModal from "./NavigateEntranceModal";
import NavigateGpsModal from "./NavigateGpsModal";
import "./GraveLocation.css";

export default function GraveLocation() {
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [userDoc, setUserDoc] = useState(null);
  const [rawBurials, setRawBurials] = useState([]);
  const [rawPlots, setRawPlots] = useState([]);
  const [rawClients, setRawClients] = useState([]);
  const [rawPayments, setRawPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  // { plot, deceasedNames } | null
  const [navModal, setNavModal] = useState(null);
  // { plot, deceasedNames } | null
  const [navGpsModal, setNavGpsModal] = useState(null);

  // 1. Auth Listener + userDoc fetch
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const snap = await getDoc(doc(db, "users", user.uid));
          if (snap.exists()) setUserDoc(snap.data());
        } catch (e) {
          console.warn("GraveLocation: could not fetch userDoc", e);
        }
      } else {
        setUserDoc(null);
      }
    });
    return () => unsub();
  }, []);

  // 2. Realtime Firestore Subscriptions
  useEffect(() => {
    let burialsReady = false;
    let plotsReady = false;
    const check = () => { if (burialsReady && plotsReady) setLoading(false); };

    const unsubBurials = onSnapshot(
      collection(db, "burials"),
      (snap) => { setRawBurials(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); burialsReady = true; check(); },
      () => { burialsReady = true; check(); }
    );
    const unsubPlots = onSnapshot(
      collection(db, "plots"),
      (snap) => { setRawPlots(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); plotsReady = true; check(); },
      () => { plotsReady = true; check(); }
    );
    const unsubClients = onSnapshot(
      collection(db, "clients"),
      (snap) => setRawClients(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    const unsubPayments = onSnapshot(
      collection(db, "payments"),
      (snap) => setRawPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {}
    );

    return () => { unsubBurials(); unsubPlots(); unsubClients(); unsubPayments(); };
  }, []);

  // 3. Resolve family user's burial records & linked plots (mirrors BurialRecords.jsx logic)
  const familyBurials = useMemo(() => {
    if (!currentUser) return [];

    const uid = currentUser.uid;
    const userEmail = (currentUser.email || userDoc?.email || "").toLowerCase().trim();
    const userName = (userDoc?.name || currentUser.displayName || "").toLowerCase().trim();

    // Step A: Build clientIds set via findClientForUser + manual sweep
    const matchedClient = findClientForUser(currentUser, userDoc, rawClients);
    const clientIds = new Set();
    if (matchedClient) {
      clientIds.add(matchedClient.id);
      if (matchedClient.user_id) clientIds.add(matchedClient.user_id);
    }
    rawClients.forEach((c) => {
      if (
        c.user_id === uid ||
        c.userId === uid ||
        c.uid === uid ||
        c.id === uid ||
        (userEmail && c.email && c.email.toLowerCase().trim() === userEmail)
      ) {
        clientIds.add(c.id);
        if (c.user_id) clientIds.add(c.user_id);
      }
    });

    // Step B: Plot IDs owned by this user/client
    const matchingPlotIds = new Set();
    rawPlots.forEach((p) => {
      const isOwner =
        p.user_id === uid ||
        p.userId === uid ||
        (p.user_id && clientIds.has(p.user_id)) ||
        (userName && p.owner && p.owner.toLowerCase().trim() === userName);
      if (isOwner) matchingPlotIds.add(p.id);
    });

    // Step C: Payment-linked burial & plot IDs
    const matchingPaymentBurialIds = new Set();
    const matchingPaymentPlotIds = new Set();
    rawPayments.forEach((pmt) => {
      const isPmtOwner =
        pmt.user_id === uid ||
        pmt.userId === uid ||
        (pmt.user_id && clientIds.has(pmt.user_id));
      if (isPmtOwner) {
        if (pmt.burial_id) matchingPaymentBurialIds.add(pmt.burial_id);
        if (pmt.plot_id) matchingPaymentPlotIds.add(pmt.plot_id);
      }
    });

    // Step D: Filter burials
    const matched = rawBurials.filter((b) => {
      if (b.user_id === uid || b.userId === uid || b.uid === uid) return true;
      if (b.user_id && clientIds.has(b.user_id)) return true;
      if (b.client_id && clientIds.has(b.client_id)) return true;
      if (b.plot_id && (matchingPlotIds.has(b.plot_id) || matchingPaymentPlotIds.has(b.plot_id))) return true;
      if (matchingPaymentBurialIds.has(b.id)) return true;
      return false;
    });

    // Connect each burial with its plot
    return matched.map((burial) => {
      const plot = rawPlots.find(
        (p) =>
          p.id === burial.plot_id ||
          p.plotCode === burial.plot_id ||
          (p.burial_id && (p.burial_id === burial.id || p.burialId === burial.id))
      );
      return { burial, plot: plot || null };
    });
  }, [currentUser, userDoc, rawBurials, rawPlots, rawClients, rawPayments]);

  // 4. Group burials by plot ID (null key = no linked plot)
  //    → same plot → one map; different plots → one map each
  const plotGroups = useMemo(() => {
    const map = new Map(); // plotKey → { plot, burials[] }

    familyBurials.forEach(({ burial, plot }) => {
      const key = plot?.id || `no-plot-${burial.id}`;
      if (!map.has(key)) {
        map.set(key, { plot: plot || null, burials: [] });
      }
      map.get(key).burials.push(burial);
    });

    return Array.from(map.values());
  }, [familyBurials]);

  return (
    <>
    <div className="fam-page-wrapper">
      <FamilyTopbar
        title="Grave Location"
        greeting="Satellite view of your loved one's burial plot"
      />

      <div className="fam-container">
        <div className="gl-section-header">
          <h2>Burial Plot Map</h2>
        </div>

        {loading ? (
          <div className="gl-loading">
            <div className="gl-spinner" />
            <span>Loading burial location…</span>
          </div>
        ) : plotGroups.length === 0 ? (
          <div className="gl-empty">
            <span className="gl-empty-icon">📍</span>
            <p>No burial records found for your account.</p>
          </div>
        ) : (
          <div className="gl-body">
            {plotGroups.map((group, idx) => {
              const { plot, burials } = group;
              const deceasedNames = burials.map((b) => b.name).filter(Boolean);
              const plotPlots = plot ? [plot] : [];

              return (
                <div key={plot?.id || idx} className="gl-plot-group">
                  {/* Info strip for this plot group */}
                  <div className="gl-info-strip">
                    {/* Deceased name(s) */}
                    <div className="gl-info-item">
                      <span className="gl-info-label">
                        {deceasedNames.length > 1 ? "Deceased" : "Deceased"}
                      </span>
                      <span className="gl-info-value">
                        {deceasedNames.length > 0
                          ? deceasedNames.join(" & ")
                          : "—"}
                      </span>
                    </div>

                    {plot?.plotCode && (
                      <div className="gl-info-item">
                        <span className="gl-info-label">Plot Code</span>
                        <span className="gl-info-value">{plot.plotCode}</span>
                      </div>
                    )}
                    {plot?.location && (
                      <div className="gl-info-item">
                        <span className="gl-info-label">Location</span>
                        <span className="gl-info-value">{plot.location}</span>
                      </div>
                    )}
                  </div>

                  {/* Satellite map for this plot */}
                  {plot ? (
                    <div className="gl-map-wrapper">
                      <SatelliteMap
                        allPlots={rawPlots}
                        plots={plotPlots}
                        focusPlot={plot}
                        mapId={`family-grave-map-${plot.id}`}
                        plotLimit={1}
                        showLocationSelect={false}
                      />
                    </div>
                  ) : (
                    <div className="gl-no-map">
                      <i className="fas fa-map-marked-alt" />
                      <span>No plot location registered for this burial.</span>
                    </div>
                  )}

                  {/* Navigate Buttons per plot */}
                  <div className="gl-actions">
                    <button
                      className="gl-navigate-btn"
                      onClick={() => setNavModal({ plot, deceasedNames })}
                    >
                      <Navigation size={15} />
                      Navigate from Entrance
                    </button>
                    <button
                      className="gl-navigate-btn gl-navigate-btn--gps"
                      onClick={() => setNavGpsModal({ plot, deceasedNames })}
                    >
                      <i className="fas fa-location-arrow" style={{ fontSize: "14px" }} />
                      Navigate GPS
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>

    {/* Navigate from Entrance Modal */}
    {navModal && (
      <NavigateEntranceModal
        plot={navModal.plot}
        deceasedNames={navModal.deceasedNames}
        onClose={() => setNavModal(null)}
      />
    )}

    {/* Live GPS Navigation Turn-by-Turn Interface */}
    {navGpsModal && (
      <NavigateGpsModal
        plot={navGpsModal.plot}
        deceasedNames={navGpsModal.deceasedNames}
        onClose={() => setNavGpsModal(null)}
      />
    )}
    </>
  );
}
