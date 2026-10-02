import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../../../firebase/config";
import "./BurialRecords.css";
import FamilyTopbar from "./FamilyTopbar";
import { findClientForUser } from "../../../services/clientServices";
import { resolveDueDate } from "../../../services/paymentServices";
import { downloadCertificate } from "../../../services/certificateServices";

// Helper to format date
const formatDisplayDate = (dateVal) => {
  if (!dateVal) return "—";
  try {
    const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
    if (isNaN(d.getTime())) return String(dateVal);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return String(dateVal);
  }
};

// Helper to check if a plot or grave type is Perpetual Ownership
const checkIsPerpetual = (plot, graveType, resolvedTypeName = "") => {
  if (!plot) return false;

  // 1. Explicit plot contract flags
  if (
    plot.contract === "Perpetual" ||
    plot.contract_type === "Perpetual" ||
    plot.is_perpetual === true ||
    String(plot.contract || "").toLowerCase().includes("perpetual") ||
    String(plot.contract_type || "").toLowerCase().includes("perpetual")
  ) {
    return true;
  }

  // 2. Explicit grave type config
  if (graveType) {
    if (
      graveType.contract === "Perpetual" ||
      String(graveType.contract || "").toLowerCase().includes("perpetual") ||
      graveType.renewable === false ||
      graveType.isRenewable === false
    ) {
      return true;
    }
  }

  // 3. By Plot Code Prefix (CO = Columbarium, MA/ML = Mausoleum, LG/GG/LL = Lawn Grave, BV = Bone Vault, FE = Family Estate, CB = Cherubim)
  const code = String(plot.plotCode || plot.name || plot.lotNumber || plot.id || "").toUpperCase().trim();
  if (
    code.startsWith("CO") ||
    code.startsWith("MA") ||
    code.startsWith("ML") ||
    code.startsWith("LG") ||
    code.startsWith("GG") ||
    code.startsWith("LL") ||
    code.startsWith("BV") ||
    code.startsWith("FE") ||
    code.startsWith("CB")
  ) {
    return true;
  }

  // 4. By Grave Type name
  const typeStr = String(resolvedTypeName || graveType?.grave_type || graveType?.name || plot.grave_type || plot.type || "").toLowerCase();
  if (
    typeStr.includes("columbarium") ||
    typeStr.includes("mausoleum") ||
    typeStr.includes("lawn") ||
    typeStr.includes("bone vault") ||
    typeStr.includes("family estate") ||
    typeStr.includes("ground") ||
    typeStr.includes("perpetual")
  ) {
    return true;
  }

  // 5. In Cherubim Memorial Park, only Apartment (AP) and Renewable Single Niche (SN) are renewable leases.
  // Default to Perpetual if not an explicit renewable lease!
  if (!plot.contract_expiration_date && !plot.lease_end && !plot.lease_expiry && !code.startsWith("AP")) {
    return true;
  }

  return false;
};

// Helper to calculate lease expiry (only applicable for renewable leases, never for Perpetual)
const formatLeaseExpiry = (plot, burial, graveType = null, resolvedTypeName = "") => {
  if (checkIsPerpetual(plot, graveType, resolvedTypeName)) {
    return null; // Perpetual plots NEVER have a lease expiry
  }
  if (plot?.contract_expiration_date || plot?.lease_end || plot?.lease_expiry) {
    return formatDisplayDate(plot.contract_expiration_date || plot.lease_end || plot.lease_expiry);
  }
  const contractYears = Number(plot?.contract_years || graveType?.contract_years || 7);
  const startDate = plot?.contract_start_date || plot?.lease_start || burial?.date_buried || burial?.created_at;
  if (!startDate) return `${contractYears} Years from Interment`;
  try {
    const d = startDate.toDate ? startDate.toDate() : new Date(startDate);
    if (isNaN(d.getTime())) return `${contractYears} Years from Interment`;
    const expiry = new Date(d);
    expiry.setFullYear(expiry.getFullYear() + contractYears);
    return expiry.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return `${contractYears} Years from Interment`;
  }
};

function BurialRecords() {
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [userDoc, setUserDoc] = useState(null);

  const [rawBurials, setRawBurials] = useState([]);
  const [rawPlots, setRawPlots] = useState([]);
  const [rawClients, setRawClients] = useState([]);
  const [rawPayments, setRawPayments] = useState([]);
  const [rawHistory, setRawHistory] = useState([]);
  const [rawGraveTypes, setRawGraveTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // 1. Auth Listener & User profile fetch
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const uSnap = await getDoc(doc(db, "users", user.uid));
          if (uSnap.exists()) {
            setUserDoc(uSnap.data());
          }
        } catch (e) {
          console.warn("Could not fetch user document:", e);
        }
      } else {
        setUserDoc(null);
      }
    });

    return () => unsubAuth();
  }, []);

  // 2. Realtime Subscriptions to Firestore Collections
  useEffect(() => {
    let burialsReady = false;
    let plotsReady = false;

    const checkReady = () => {
      if (burialsReady && plotsReady) {
        setLoading(false);
      }
    };

    const unsubBurials = onSnapshot(
      collection(db, "burials"),
      (snap) => {
        setRawBurials(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        burialsReady = true;
        checkReady();
      },
      (err) => {
        console.warn("Error listening to burials:", err);
        burialsReady = true;
        checkReady();
      }
    );

    const unsubPlots = onSnapshot(
      collection(db, "plots"),
      (snap) => {
        setRawPlots(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        plotsReady = true;
        checkReady();
      },
      (err) => {
        console.warn("Error listening to plots:", err);
        plotsReady = true;
        checkReady();
      }
    );

    const unsubClients = onSnapshot(
      collection(db, "clients"),
      (snap) => {
        setRawClients(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn("Error listening to clients:", err)
    );

    const unsubPayments = onSnapshot(
      collection(db, "payments"),
      (snap) => {
        setRawPayments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn("Error listening to payments:", err)
    );

    const unsubHistory = onSnapshot(
      collection(db, "payment_history"),
      (snap) => {
        setRawHistory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn("Error listening to payment_history:", err)
    );

    // Subscribe to both grave_types and grave_type collections reliably
    const handleGraveTypeSnap = (snap) => {
      setRawGraveTypes((prev) => {
        const incoming = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const map = new Map(prev.map((g) => [g.id, g]));
        incoming.forEach((g) => map.set(g.id, g));
        return Array.from(map.values());
      });
    };
    const unsubGraveTypes1 = onSnapshot(collection(db, "grave_types"), handleGraveTypeSnap, () => {});
    const unsubGraveTypes2 = onSnapshot(collection(db, "grave_type"), handleGraveTypeSnap, () => {});

    return () => {
      unsubBurials();
      unsubPlots();
      unsubClients();
      unsubPayments();
      unsubHistory();
      unsubGraveTypes1();
      unsubGraveTypes2();
    };
  }, []);

  // 3. Connect & Filter Burial Records for the logged-in Family User
  const connectedBurialRecords = useMemo(() => {
    if (!currentUser) return [];

    const uid = currentUser.uid;
    const userEmail = (currentUser.email || userDoc?.email || "").toLowerCase().trim();
    const userName = (userDoc?.name || currentUser.displayName || "").toLowerCase().trim();

    // Step A: Find all client record IDs matching this user
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

    // Step B: Find all plot IDs owned by or linked to this user/client
    const matchingPlotIds = new Set();
    rawPlots.forEach((p) => {
      const isPlotOwner =
        p.user_id === uid ||
        p.userId === uid ||
        (p.user_id && clientIds.has(p.user_id)) ||
        (userName && p.owner && p.owner.toLowerCase().trim() === userName);

      if (isPlotOwner) {
        matchingPlotIds.add(p.id);
      }
    });

    // Step C: Find payment records linked to this user/client
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

    // Step D: Filter burials from the "burials" collection
    const matchedBurials = rawBurials.filter((b) => {
      // 1. Direct user_id match
      if (b.user_id === uid || b.userId === uid || b.uid === uid) return true;

      // 2. Client match
      if (b.user_id && clientIds.has(b.user_id)) return true;
      if (b.client_id && clientIds.has(b.client_id)) return true;

      // 3. Plot match
      if (b.plot_id && (matchingPlotIds.has(b.plot_id) || matchingPaymentPlotIds.has(b.plot_id))) {
        return true;
      }

      // 4. Payment burial_id match
      if (matchingPaymentBurialIds.has(b.id)) return true;

      return false;
    });

    // Step E: Transform matched burials into the standard display card schema
    const formattedBurials = matchedBurials
      .map((burial) => {
        const plot = rawPlots.find(
          (p) => p.id === burial.plot_id || p.plotCode === burial.plot_id
        );

        // Find linked payment contract
        const linkedPayment = rawPayments.find((p) => {
          if (p.burial_id && (p.burial_id === burial.id || p.burialId === burial.id)) return true;
          if (burial.plot_id && (p.plot_id === burial.plot_id || p.plotId === burial.plot_id)) return true;
          if (plot && (p.plot_id === plot.id || p.plotId === plot.id || p.plot_id === plot.plotCode)) return true;
          return false;
        });

        // Determine if this record is on contract:
        // A burial is on contract if it has a linked payment record or a contracted plot
        const hasContract = Boolean(
          linkedPayment ||
          (plot && (plot.contract || plot.contract_expiration_date || plot.contract_years || plot.lease_start || plot.lease_end || plot.user_id)) ||
          burial.contract ||
          burial.contract_id ||
          burial.contractId
        );

        // If there is no record on contract, remove it!
        if (!hasContract) {
          return null;
        }

        // Grave Type resolution with deep matching
        const graveType = rawGraveTypes.find((gt) => {
          const gtId = String(gt.grave_type_id || gt.id || "").toLowerCase().trim();
          const gtName = String(gt.grave_type || gt.name || gt.graveType || "").toLowerCase().trim();
          const pTypeId = String(plot?.grave_type_id || plot?.graveLotTypeID || "").toLowerCase().trim();
          const pTypeName = String(plot?.grave_type || plot?.graveType || burial?.interment_type || "").toLowerCase().trim();

          if (gtId && (gtId === pTypeId || gtId === pTypeName)) return true;
          if (gtName && (gtName === pTypeName || gtName === pTypeId)) return true;
          if (gtName && pTypeName && (gtName.includes(pTypeName) || pTypeName.includes(gtName))) return true;
          return false;
        });

        const graveTypeName =
          graveType?.grave_type ||
          graveType?.name ||
          graveType?.graveType ||
          plot?.grave_type ||
          plot?.graveType ||
          burial.interment_type ||
          "Standard Burial";

        // Date of birth and death string
        const dobStr = formatDisplayDate(burial.date_of_birth);
        const dodStr = formatDisplayDate(burial.date_of_death);
        const datesDisplay =
          dobStr !== "—" || dodStr !== "—"
            ? `${dobStr !== "—" ? `Born: ${dobStr}` : ""} ${dodStr !== "—" ? `• Died: ${dodStr}` : ""}`.trim()
            : "—";

        // Plot code / location display
        const rawPlotCode = plot?.plotCode || plot?.plotcode || plot?.lotNumber || burial.plot_id || "Assigned Lot";
        const plotCode = String(rawPlotCode).trim();
        const sectionName =
          plot?.section ||
          plot?.grave_section ||
          "Main Section";
        const blockName =
          plot?.block ||
          plot?.grave_block ||
          (plot?.lotNumber ? `Lot ${plot.lotNumber}` : "Block A");

        // Determine if this plot is Perpetual Ownership
        const isPerpetual = checkIsPerpetual(plot, graveType, graveTypeName);
        const leaseExpiry = formatLeaseExpiry(plot, burial, graveType, graveTypeName);

        // Payment & Due Date resolution (only if a payment contract exists)
        const dueInfo = linkedPayment ? resolveDueDate(linkedPayment, burial, rawHistory) : null;
        const balance = Number(linkedPayment?.balance ?? 0);
        const isPaid = linkedPayment
          ? balance <= 0 || (linkedPayment.payment_status || "").toLowerCase() === "paid"
          : null;

        let paymentDisplay = null;
        let nextDueDisplay = null;
        let isOverdue = false;

        if (linkedPayment) {
          if (isPaid) {
            paymentDisplay = "Paid in Full";
            nextDueDisplay = "Paid in Full";
          } else {
            paymentDisplay = `Installment (Bal: ₱${balance.toLocaleString()})`;
            nextDueDisplay = dueInfo?.formattedDate || "On Schedule";
            isOverdue = dueInfo?.isOverdue || false;
          }
        }

        const lease = {
          isPerpetual,
          contractType: isPerpetual
            ? "Perpetual Ownership"
            : `${plot?.contract_years || graveType?.contract_years || 5}-Year Renewable Lease`,
          start: formatDisplayDate(
            plot?.contract_start_date ||
            plot?.lease_start ||
            burial.date_buried ||
            burial.created_at
          ),
          expiry: leaseExpiry,
          payment: paymentDisplay,
          nextDue: nextDueDisplay,
          dueBadge: dueInfo?.displayBadge,
          isOverdue,
          isPaid,
          balance,
        };

        return {
          id: burial.id,
          name: burial.name || "Deceased Family Member",
          recordId: plotCode.startsWith("Lot") || plotCode.startsWith("Plot") ? plotCode : `Lot ${plotCode}`,
          status: plot?.status === "occupied" ? "Interred" : burial.status || "Active",
          personal: {
            name: burial.name || "—",
            dates: datesDisplay,
          },
          location: {
            grave: plotCode.startsWith("Plot") ? plotCode : `Plot ${plotCode}`,
            section: sectionName,
            block: blockName,
          },
          burial: {
            dateBuried: formatDisplayDate(burial.date_buried || burial.created_at),
            type: burial.interment_type || graveTypeName,
          },
          lease,
        };
      })
      .filter(Boolean);

    return formattedBurials;
  }, [currentUser, userDoc, rawBurials, rawPlots, rawClients, rawPayments, rawHistory, rawGraveTypes]);

  return (
    <div className="fam-page-wrapper">
      {/* Top Bar */}
      <FamilyTopbar
        title="Burial Records"
        greeting="View details and certificates for your interred family members"
      />

      {/* Main Content */}
      <div className="fam-container">
        <div className="fbr-header-row">
          <h2>
            <i className="fas fa-file-alt" style={{ color: "#d4af37", marginRight: "8px" }}></i>
            My Burial Records ({connectedBurialRecords.length})
          </h2>
        </div>

        {loading ? (
          <p style={{ color: "#6a8aaa", padding: "20px 0" }}>
            <i className="fas fa-spinner fa-spin"></i> Loading connected burial records...
          </p>
        ) : connectedBurialRecords.length === 0 ? (
          <div className="fmp-empty" style={{ padding: "4rem 2rem", textAlign: "center" }}>
            <i
              className="fas fa-folder-open"
              style={{ fontSize: "2.8rem", color: "#cbd5e1", marginBottom: "1rem" }}
            ></i>
            <p style={{ fontSize: "1.15rem", fontWeight: 700, color: "#1a3d5c", marginBottom: "0.4rem" }}>
              No burial records linked to your account.
            </p>
            <p style={{ fontSize: "0.9rem", color: "#64748b", maxWidth: 440, margin: "0 auto" }}>
              Burial records registered under your name or plot purchase will automatically appear here.
            </p>
          </div>
        ) : (
          <div className="fbr-grid">
            {connectedBurialRecords.map((record) => (
              <div key={record.id} className="fbr-card">
                {/* Card Header */}
                <div className="fbr-card-header">
                  <div className="fbr-card-title-group">
                    <h2 className="fbr-card-name">{record.name}</h2>
                    <p className="fbr-card-id">
                      <i className="fas fa-file-contract" style={{ marginRight: 5, color: "#d4af37" }}></i>
                      {record.recordId}
                    </p>
                  </div>
                  <span
                    className={`fbr-badge fbr-badge--${(record.status || "active").toLowerCase()}`}
                  >
                    <i className="fas fa-check-circle" style={{ marginRight: 4 }}></i>
                    {record.status}
                  </span>
                </div>

                <div className="fbr-divider" />

                {/* Card Body */}
                <div className="fbr-card-body">
                  {/* Personal Information */}
                  <div className="fbr-section">
                    <p className="fbr-section-label">Personal Information</p>
                    <div className="fbr-field-row">
                      <i className="fas fa-user" style={{ color: "#9ca3af", width: 16 }}></i>
                      <span>{record.personal?.name}</span>
                    </div>
                    <div className="fbr-field-row">
                      <i className="fas fa-calendar-alt" style={{ color: "#9ca3af", width: 16 }}></i>
                      <span>{record.personal?.dates}</span>
                    </div>
                  </div>

                  {/* Location */}
                  <div className="fbr-section">
                    <p className="fbr-section-label">Location</p>
                    <div className="fbr-field-row">
                      <i className="fas fa-map-marker-alt" style={{ color: "#d4af37", width: 16 }}></i>
                      <span style={{ fontWeight: 600, color: "#1a3d5c" }}>
                        {record.location?.grave}
                      </span>
                    </div>
                    <div className="fbr-kv-row">
                      <span className="fbr-kv-label">Section / Block:</span>
                      <span className="fbr-kv-value">
                        {record.location?.section} / {record.location?.block}
                      </span>
                    </div>
                  </div>

                  {/* Burial Details */}
                  <div className="fbr-section">
                    <p className="fbr-section-label">Burial Details</p>
                    <div className="fbr-kv-row">
                      <span className="fbr-kv-label">Date Buried:</span>
                      <span className="fbr-kv-value fbr-kv-value--bold">
                        {record.burial?.dateBuried}
                      </span>
                    </div>
                    <div className="fbr-kv-row">
                      <span className="fbr-kv-label">Type:</span>
                      <span className="fbr-kv-value fbr-kv-value--bold">
                        {record.burial?.type}
                      </span>
                    </div>
                  </div>

                  {/* Lease & Contract */}
                  {record.lease && (
                    <div className="fbr-section">
                      <p className="fbr-section-label">Lease & Contract</p>
                      <div className="fbr-kv-row">
                        <span className="fbr-kv-label">Contract Type:</span>
                        <span
                          className="fbr-kv-value fbr-kv-value--bold"
                          style={{
                            color: record.lease.isPerpetual ? "#27ae60" : "#1a3d5c",
                          }}
                        >
                          {record.lease.contractType}
                        </span>
                      </div>

                      {/* Only show Lease Start and Expiry if NOT Perpetual */}
                      {!record.lease.isPerpetual && (
                        <>
                          {record.lease.start && record.lease.start !== "—" && (
                            <div className="fbr-kv-row">
                              <span className="fbr-kv-label">Lease Start:</span>
                              <span className="fbr-kv-value fbr-kv-value--bold">
                                {record.lease.start}
                              </span>
                            </div>
                          )}
                          {record.lease.expiry && (
                            <div className="fbr-kv-row">
                              <span className="fbr-kv-label">Lease Expiry:</span>
                              <span
                                className="fbr-kv-value fbr-kv-value--bold"
                                style={{ color: "#d97706" }}
                              >
                                {record.lease.expiry}
                              </span>
                            </div>
                          )}
                        </>
                      )}

                      {/* Payment Status */}
                      {record.lease.payment && (
                        <div className="fbr-kv-row">
                          <span className="fbr-kv-label">Payment:</span>
                          <span className="fbr-kv-value fbr-kv-value--bold">
                            {record.lease.payment}
                          </span>
                        </div>
                      )}

                      {/* Next Due Date */}
                      {record.lease.nextDue && !record.lease.isPaid && (
                        <div className="fbr-kv-row">
                          <span className="fbr-kv-label">Next Due:</span>
                          <span
                            className="fbr-kv-value fbr-kv-value--bold"
                            style={{
                              color: record.lease.isOverdue ? "#c0392b" : "#1a3d5c",
                            }}
                          >
                            {record.lease.nextDue}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="fbr-card-footer">
                  <button
                    className="fam-btn-secondary"
                    onClick={() => downloadCertificate(record)}
                    title="Download Official Burial Certificate"
                  >
                    <i className="fas fa-download"></i> Download Certificate
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default BurialRecords;

