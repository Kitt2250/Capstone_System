import React, { useState, useEffect, useMemo } from "react";
import {
    Search,
    RefreshCw,
    Clock,
    AlertTriangle,
    CheckCircle,
    Calendar,
    Layers,
    FileText,
    History,
    Shield,
    Sparkles,
    Check,
    HelpCircle,
    User
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase/config";
import Header from "../../../components/Header/Header";
import { getSystemDateISO, subscribeSystemDate } from "../../../utils/systemDate";
import RenewContractModal from "./RenewContractModal";
import RenewalDetailModal from "./RenewalDetailModal";
import RenewalHistoryModal from "./RenewalHistoryModal";
import "./Renewals.css";

// ── Friendly Date Formatter ──
function formatFriendlyDate(dateStr) {
    if (!dateStr) return null;
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric"
        });
    } catch {
        return dateStr;
    }
}

// ── Calculate expiration date from start date and years ──
function calculateExpirationDate(startDateStr, years) {
    if (!startDateStr || !years) return null;
    try {
        const d = new Date(startDateStr);
        if (isNaN(d.getTime())) return null;
        d.setFullYear(d.getFullYear() + Number(years));
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    } catch {
        return null;
    }
}

export default function Renewals() {
    // ── Firestore Collections Data ──
    const [plots, setPlots] = useState([]);
    const [clients, setClients] = useState([]);
    const [burials, setBurials] = useState([]);
    const [graveTypes, setGraveTypes] = useState([]);
    const [payments, setPayments] = useState([]);
    const [renewalsList, setRenewalsList] = useState([]);
    const [loading, setLoading] = useState(true);

    // ── Active System Date ──
    const [todayStr, setTodayStr] = useState(getSystemDateISO());

    // ── Search & Filter State ──
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all"); // "all", "expiring_soon", "expired", "active", "renewed"
    const [graveTypeFilter, setGraveTypeFilter] = useState("all");

    // ── Modal State ──
    const [selectedAccountForDetail, setSelectedAccountForDetail] = useState(null);
    const [selectedAccountForHistory, setSelectedAccountForHistory] = useState(null);
    const [selectedAccountForRenew, setSelectedAccountForRenew] = useState(null);

    // ── Feedback Banner ──
    const [feedback, setFeedback] = useState(null);

    // ── Subscribe to active System Date ──
    useEffect(() => {
        const unsub = subscribeSystemDate((info) => {
            setTodayStr(info.activeDate);
        });
        return () => unsub();
    }, []);

    // ── Realtime listeners for Firestore ──
    useEffect(() => {
        let plotsReady = false;

        const checkReady = () => {
            if (plotsReady) setLoading(false);
        };

        const unsubPlots = onSnapshot(collection(db, "plots"), (snapshot) => {
            setPlots(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
            plotsReady = true;
            checkReady();
        }, (err) => console.warn("Error listening to plots:", err));

        const unsubClients = onSnapshot(collection(db, "clients"), (snapshot) => {
            setClients(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, (err) => console.warn("Error listening to clients:", err));

        const unsubBurials = onSnapshot(collection(db, "burials"), (snapshot) => {
            setBurials(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, (err) => console.warn("Error listening to burials:", err));

        const handleGraveTypeSnap = (snapshot) => {
            const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            setGraveTypes((prev) => {
                const map = new Map();
                prev.forEach((gt) => map.set(gt.id || gt.grave_type_id, gt));
                list.forEach((gt) => map.set(gt.id || gt.grave_type_id, gt));
                return Array.from(map.values());
            });
        };

        const unsubGraveTypes1 = onSnapshot(collection(db, "grave_types"), handleGraveTypeSnap, (err) => console.warn("Error listening to grave_types:", err));
        const unsubGraveTypes2 = onSnapshot(collection(db, "grave_type"), handleGraveTypeSnap, (err) => console.warn("Error listening to grave_type:", err));

        const unsubPayments = onSnapshot(collection(db, "payments"), (snapshot) => {
            setPayments(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, (err) => console.warn("Error listening to payments:", err));

        const unsubRenewals = onSnapshot(collection(db, "renewals"), (snapshot) => {
            setRenewalsList(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, (err) => console.warn("Error listening to renewals:", err));

        return () => {
            unsubPlots();
            unsubClients();
            unsubBurials();
            unsubGraveTypes1();
            unsubGraveTypes2();
            unsubPayments();
            unsubRenewals();
        };
    }, []);

    // ── Assemble Contract Accounts: Strictly 1 Renewal Contract Per Grave Plot ──
    const contractAccounts = useMemo(() => {
        const todayDate = new Date(todayStr);

        // Filter plots that are sold, occupied, reserved, or contracted (exclude empty available inventory)
        const relevantPlots = plots.filter((plot) => {
            const hasOwner = Boolean(plot.user_id || plot.owner);
            const isOccupiedOrReserved = plot.status === "occupied" || plot.status === "reserved" || plot.status === "partial";
            const hasContract = Boolean(plot.contract || plot.contract_expiration_date || plot.contract_years);
            const hasBurials = burials.some((b) => b.plot_id === plot.id);
            return hasOwner || isOccupiedOrReserved || hasContract || hasBurials;
        });

        const list = relevantPlots.map((plot) => {
            // Find all burials interred inside this plot
            const plotBurials = burials.filter((b) => b.plot_id === plot.id);

            // Deceased names inside this plot
            const deceasedNames = plotBurials.map((b) => b.name).filter(Boolean);
            const deceasedDisplay = deceasedNames.length > 0
                ? deceasedNames.join(", ")
                : (plot.status === "reserved" ? "Pre-Need Reserved" : "No Burials Interred");

            // Find linked payment
            const linkedPayment = payments.find((p) => p.plot_id === plot.id);

            // Find client / family owner
            const ownerId = plot.user_id || plotBurials[0]?.user_id || linkedPayment?.user_id;
            const client = clients.find((c) => c.user_id === ownerId || c.id === ownerId);

            let clientName = "";
            if (client) {
                clientName = `${client.first_name || ""} ${client.last_name || ""}`.trim();
            } else if (plot.owner) {
                clientName = plot.owner;
            } else if (linkedPayment?.client_name) {
                clientName = linkedPayment.client_name;
            } else if (deceasedNames.length > 0) {
                clientName = `${deceasedNames[0]} (Family)`;
            } else {
                clientName = "Grave Lot Holder";
            }

            // Resolve Grave Type from Plot
            const targetTypeId = String(plot?.grave_type_id || plot?.graveLotTypeID || plot?.graveType || plot?.type || "").trim().toLowerCase();
            const matchedType = graveTypes.find((gt) => {
                const gtId = String(gt.id || gt.grave_type_id || "").trim().toLowerCase();
                const gtName = String(gt.grave_type || gt.name || "").trim().toLowerCase();
                return (gtId && gtId === targetTypeId) || (targetTypeId && gtName === targetTypeId);
            });

            let graveTypeName = matchedType?.grave_type || matchedType?.name || plot?.graveType || plot?.grave_type || "";
            const plotCode = plot?.plotCode || plot?.plot_number || plot?.id || "N/A";
            if (!graveTypeName) {
                const code = String(plotCode).toUpperCase();
                if (code.startsWith("AP")) graveTypeName = "Apartment";
                else if (code.startsWith("SN")) graveTypeName = "Single Niche";
                else if (code.startsWith("MA") || code.startsWith("ML")) graveTypeName = "Mausoleum";
                else if (code.startsWith("LG") || code.startsWith("FN")) graveTypeName = "Lawn Grave";
                else graveTypeName = "Single Niche";
            }

            // Determine if Perpetual - Perpetual plots do not require periodic renewal, exclude completely
            const isPerpetual = Boolean(
                plot?.contract === "Perpetual" ||
                plot?.contract_type === "Perpetual" ||
                plot?.is_perpetual === true ||
                (matchedType && (matchedType.renewable === false || matchedType.contract === "Perpetual" || String(matchedType.contract || "").toLowerCase().includes("perpetual")))
            );

            if (isPerpetual) {
                return null;
            }

            // Initial Lease Duration: 7 Years default (or from grave type / plot)
            const contractYears = Number(
                plot?.contract_years ||
                matchedType?.contract_years ||
                7
            );

            // Start Date: Plot contract date or earliest burial date
            let startDate = plot?.contract_start_date;
            if (!startDate && plotBurials.length > 0) {
                const sortedBurialDates = plotBurials
                    .map((b) => b.date_buried)
                    .filter(Boolean)
                    .sort();
                if (sortedBurialDates.length > 0) {
                    startDate = sortedBurialDates[0];
                }
            }
            if (!startDate && linkedPayment?.created_at?.toDate) {
                startDate = linkedPayment.created_at.toDate().toISOString().split("T")[0];
            } else if (!startDate && plot?.created_at?.toDate) {
                startDate = plot.created_at.toDate().toISOString().split("T")[0];
            } else if (!startDate) {
                startDate = "2021-10-01";
            }

            // Expiration Date: stored on plot or calculated from startDate + contractYears
            let expirationDate = plot?.contract_expiration_date;
            if (!expirationDate) {
                expirationDate = calculateExpirationDate(startDate, contractYears);
            }

            // Renewal rate after lease ended: 1 year per ₱3,500 Cash
            const renewalRatePerYear = 3500;
            const renewalFee = 3500;
            const renewalCount = Number(plot?.renewal_count || 0);
            const lastRenewedDate = plot?.last_renewed_date || null;

            // Calculate Days Remaining & Contract Status
            let status = "active";
            let daysRemaining = 0;
            let progressPercent = 0;
            let progressColor = "green";

            if (expirationDate) {
                const expiryDate = new Date(expirationDate);
                const diffMs = expiryDate.getTime() - todayDate.getTime();
                daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

                let termStartDateObj;
                let totalDurationMs;

                if (renewalCount > 0) {
                    // For renewed lease: calculate progress against the CURRENT active renewal term
                    if (lastRenewedDate) {
                        termStartDateObj = new Date(lastRenewedDate);
                    } else {
                        // Derivation: each renewal extended lease by 1 year (or renewalCount years)
                        const yearsExtended = Math.max(1, renewalCount);
                        termStartDateObj = new Date(expiryDate);
                        termStartDateObj.setFullYear(termStartDateObj.getFullYear() - yearsExtended);
                    }

                    if (termStartDateObj >= expiryDate) {
                        termStartDateObj = new Date(expiryDate);
                        termStartDateObj.setFullYear(termStartDateObj.getFullYear() - Math.max(1, renewalCount));
                    }

                    totalDurationMs = Math.max(1, expiryDate.getTime() - termStartDateObj.getTime());
                    const elapsedMs = Math.max(0, todayDate.getTime() - termStartDateObj.getTime());

                    if (daysRemaining <= 0) {
                        progressPercent = 100;
                    } else {
                        progressPercent = Math.min(100, Math.max(0, Math.round((elapsedMs / totalDurationMs) * 100)));
                    }
                } else {
                    // Initial lease period (e.g. 7-year term)
                    termStartDateObj = new Date(startDate);
                    if (termStartDateObj >= expiryDate) {
                        termStartDateObj = new Date(expiryDate);
                        termStartDateObj.setFullYear(termStartDateObj.getFullYear() - Math.max(1, contractYears));
                    }
                    totalDurationMs = Math.max(1, expiryDate.getTime() - termStartDateObj.getTime());
                    const elapsedMs = Math.max(0, todayDate.getTime() - termStartDateObj.getTime());

                    if (daysRemaining <= 0) {
                        progressPercent = 100;
                    } else {
                        progressPercent = Math.min(100, Math.max(0, Math.round((elapsedMs / totalDurationMs) * 100)));
                    }
                }

                // Determine Status & Progress Color
                if (daysRemaining <= 0) {
                    status = "expired";
                    progressColor = "red";
                } else if (daysRemaining <= 30) {
                    status = "expiring_soon";
                    progressColor = "red"; // Red fill when contract nearing 30 days
                } else if (daysRemaining <= 60) {
                    status = "expiring_soon";
                    progressColor = "green"; // Green for days used
                } else if (renewalCount > 0) {
                    status = "renewed";
                    progressColor = "green"; // Green for days used
                } else {
                    status = "active";
                    progressColor = "green"; // Green for days used
                }
            }

            return {
                id: plot.id,
                plotId: plot.id,
                plotCode,
                user_id: ownerId,
                clientName,
                clientContact: client?.phone || client?.contact_number || "",
                clientEmail: client?.email || "",
                clientAddress: client?.address || "",
                deceasedName: deceasedDisplay,
                deceasedNames,
                plotBurials,
                burialCount: plotBurials.length,
                burialDate: plotBurials[0]?.date_buried || null,
                graveTypeName,
                graveTypeObj: matchedType || null,
                contractYears,
                renewalRatePerYear,
                renewalFee,
                startDate,
                expirationDate,
                daysRemaining,
                status,
                progressPercent,
                progressColor,
                renewalCount,
                lastRenewedDate,
                plot,
                payment: linkedPayment,
            };
        }).filter(Boolean);

        // Sort: Expired first, then Expiring Soon, then nearest expiration
        return list.sort((a, b) => {
            if (a.status === "expired" && b.status !== "expired") return -1;
            if (b.status === "expired" && a.status !== "expired") return 1;
            if (a.status === "expiring_soon" && b.status !== "expiring_soon") return -1;
            if (b.status === "expiring_soon" && a.status !== "expiring_soon") return 1;
            return (a.daysRemaining || 0) - (b.daysRemaining || 0);
        });
    }, [plots, burials, clients, graveTypes, payments, todayStr]);

    // ── Compute KPIs ──
    const kpis = useMemo(() => {
        let activeCount = 0;
        let expiringSoonCount = 0;
        let expiredCount = 0;
        let totalRenewalsCount = 0;

        contractAccounts.forEach((acc) => {
            if (acc.status === "active" || acc.status === "renewed") {
                activeCount++;
            }
            if (acc.status === "expiring_soon") {
                expiringSoonCount++;
            }
            if (acc.status === "expired") {
                expiredCount++;
            }
            if (acc.renewalCount > 0) {
                totalRenewalsCount += acc.renewalCount;
            }
        });

        // Also incorporate records from renewals collection if higher
        const loggedRenewals = Math.max(totalRenewalsCount, renewalsList.length);

        return {
            activeCount,
            expiringSoonCount,
            expiredCount,
            totalRenewalsCount: loggedRenewals,
        };
    }, [contractAccounts, renewalsList]);

    // ── Filtered Contract Accounts ──
    const filteredAccounts = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return contractAccounts.filter((acc) => {
            // Status filter
            if (statusFilter !== "all") {
                if (statusFilter === "active" && acc.status !== "active" && acc.status !== "renewed") return false;
                if (statusFilter !== "active" && acc.status !== statusFilter) return false;
            }

            // Grave type filter
            if (graveTypeFilter !== "all") {
                if (acc.graveTypeName.toLowerCase() !== graveTypeFilter.toLowerCase()) return false;
            }

            // Search query
            if (!query) return true;

            const matchName = acc.clientName.toLowerCase().includes(query);
            const matchDeceased = acc.deceasedName.toLowerCase().includes(query);
            const matchLot = acc.plotCode.toLowerCase().includes(query);
            const matchType = acc.graveTypeName.toLowerCase().includes(query);

            return matchName || matchDeceased || matchLot || matchType;
        });
    }, [contractAccounts, searchQuery, statusFilter, graveTypeFilter]);

    // ── Dynamic Grave Types for Filter ──
    const availableGraveTypeNames = useMemo(() => {
        const set = new Set(["Single Niche", "Apartment", "Mausoleum", "Lawn Grave"]);
        graveTypes.forEach((gt) => {
            const name = gt.grave_type || gt.name;
            if (name) set.add(name);
        });
        return Array.from(set);
    }, [graveTypes]);

    // ── Handle Successful Renewal ──
    const handleRenewalSuccess = (data) => {
        setFeedback({
            type: "success",
            message: `Contract for Lot ${data.plotCode} successfully renewed for ${data.renewalYears} years! Official Receipt: ${data.receipt}`
        });

        setTimeout(() => {
            setFeedback(null);
        }, 8000);
    };

    return (
        <div className="user-management-page">
            <Header page="renewals" />

            <div className="renewals-page-container">
                {/* ── KPI METRICS CARDS ── */}
                <div className="renew-kpi-grid">
                    <div className="renew-kpi-card">
                        <div className="renew-kpi-info">
                            <span className="renew-kpi-title">Active Grave Leases</span>
                            <span className="renew-kpi-value">{kpis.activeCount}</span>
                            <span className="renew-kpi-sub">Renewable leases in good standing</span>
                        </div>
                        <div className="renew-kpi-icon-box emerald">
                            <CheckCircle size={22} />
                        </div>
                    </div>

                    <div className="renew-kpi-card">
                        <div className="renew-kpi-info">
                            <span className="renew-kpi-title">Expiring Soon (60 Days)</span>
                            <span className="renew-kpi-value" style={{ color: "#d97706" }}>
                                {kpis.expiringSoonCount}
                            </span>
                            <span className="renew-kpi-sub">Notice sent to families</span>
                        </div>
                        <div className="renew-kpi-icon-box amber">
                            <Clock size={22} />
                        </div>
                    </div>

                    <div className="renew-kpi-card">
                        <div className="renew-kpi-info">
                            <span className="renew-kpi-title">Expired Contracts</span>
                            <span className="renew-kpi-value" style={{ color: "#dc2626" }}>
                                {kpis.expiredCount}
                            </span>
                            <span className="renew-kpi-sub">Requires lease renewal</span>
                        </div>
                        <div className="renew-kpi-icon-box red">
                            <AlertTriangle size={22} />
                        </div>
                    </div>

                    <div className="renew-kpi-card">
                        <div className="renew-kpi-info">
                            <span className="renew-kpi-title">Total Renewals Logged</span>
                            <span className="renew-kpi-value" style={{ color: "#004d8c" }}>
                                {kpis.totalRenewalsCount}
                            </span>
                            <span className="renew-kpi-sub">Extended terms &amp; receipts</span>
                        </div>
                        <div className="renew-kpi-icon-box blue">
                            <RefreshCw size={22} />
                        </div>
                    </div>
                </div>

                {/* Feedback Banner */}
                {feedback && (
                    <div className={`renew-feedback-banner ${feedback.type}`}>
                        <Check size={16} />
                        <span>{feedback.message}</span>
                    </div>
                )}

                {/* ── FILTER & SEARCH BAR ── */}
                <div className="renew-filter-bar">
                    <div className="renew-search-wrap">
                        <Search size={16} className="renew-search-icon" />
                        <input
                            type="text"
                            className="renew-search-input"
                            placeholder="Search by lot number, family name, or deceased..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="renew-filters-group">
                        <select
                            className="renew-select"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="all">All Lease Statuses</option>
                            <option value="expiring_soon">Expiring Soon (Within 60 Days)</option>
                            <option value="expired">Expired Contracts</option>
                            <option value="active">Active Leases</option>
                            <option value="renewed">Recently Renewed</option>
                        </select>

                        <select
                            className="renew-select"
                            value={graveTypeFilter}
                            onChange={(e) => setGraveTypeFilter(e.target.value)}
                        >
                            <option value="all">All Grave Types</option>
                            {availableGraveTypeNames.map((name) => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>

                        {(searchQuery || statusFilter !== "all" || graveTypeFilter !== "all") && (
                            <button
                                type="button"
                                className="renew-btn-details"
                                onClick={() => {
                                    setSearchQuery("");
                                    setStatusFilter("all");
                                    setGraveTypeFilter("all");
                                }}
                            >
                                Reset
                            </button>
                        )}
                    </div>
                </div>

                {/* ── CONTRACT ACCOUNTS LIST ── */}
                {loading ? (
                    <div className="renew-empty-state">
                        <RefreshCw size={32} className="spinning" color="#004d8c" />
                        <h4>Loading Contract Records...</h4>
                        <p>Syncing cemetery plot leases, contract years, and expiration data.</p>
                    </div>
                ) : filteredAccounts.length === 0 ? (
                    <div className="renew-empty-state">
                        <FileText size={40} strokeWidth={1.5} color="#94a3b8" />
                        <h4>No Contract Leases Found</h4>
                        <p>No grave plot leases matched your search or status filter criteria.</p>
                    </div>
                ) : (
                    <div className="renew-accounts-list">
                        {filteredAccounts.map((account) => {
                            const isExpired = account.status === "expired";
                            const isExpiringSoon = account.status === "expiring_soon";

                            // Countdown text
                            let countdownLabel = "CONTRACT EXPIRATION";
                            let countdownVal = "";
                            let cdClass = "active";

                            if (account.daysRemaining < 0) {
                                countdownLabel = "CONTRACT EXPIRED";
                                countdownVal = `${Math.abs(account.daysRemaining)} DAYS OVERDUE`;
                                cdClass = "expired";
                            } else if (account.daysRemaining === 0) {
                                countdownLabel = "CONTRACT EXPIRED";
                                countdownVal = "EXPIRED TODAY (0 DAYS LEFT)";
                                cdClass = "expired";
                            } else if (account.daysRemaining <= 30) {
                                countdownLabel = "EXPIRING SOON";
                                countdownVal = `${account.daysRemaining} DAYS LEFT`;
                                cdClass = "expired"; // Red text when nearing 30 days
                            } else if (account.daysRemaining <= 60) {
                                countdownLabel = "EXPIRING SOON";
                                countdownVal = `${account.daysRemaining} DAYS LEFT`;
                                cdClass = "warning";
                            } else {
                                countdownLabel = "REMAINING LEASE";
                                countdownVal = `${account.daysRemaining} DAYS LEFT`;
                                cdClass = "active";
                            }

                            return (
                                <div key={account.id} className="renew-account-card">
                                    {/* Top Row: Information & Actions */}
                                    <div className="renew-card-top">
                                        <div className="renew-card-main-info">
                                            <div className="renew-card-title-row">
                                                <span className="renew-client-name">{account.clientName}</span>

                                                <span className={`renew-status-pill status-${account.status}`}>
                                                    <span className="renew-dot"></span>
                                                    {account.status.replace("_", " ")}
                                                </span>

                                                <span className="renew-type-pill">
                                                    {account.graveTypeName}
                                                </span>

                                                <span className="renew-term-pill">
                                                    {account.renewalCount > 0 ? "Renewed Lease" : `${account.contractYears}-Year Lease`}
                                                </span>

                                                <span style={{
                                                    fontSize: "0.725rem",
                                                    fontWeight: 600,
                                                    color: "#0f766e",
                                                    background: "#f0fdfa",
                                                    border: "1px solid #ccfbf1",
                                                    padding: "2px 8px",
                                                    borderRadius: "9999px"
                                                }}>
                                                    Renewal: ₱3,500 / Year
                                                </span>

                                                {account.renewalCount > 0 && (
                                                    <span style={{
                                                        fontSize: "0.725rem",
                                                        fontWeight: 700,
                                                        color: "#004d8c",
                                                        background: "#eff6ff",
                                                        border: "1px solid #bfdbfe",
                                                        padding: "2px 8px",
                                                        borderRadius: "9999px"
                                                    }}>
                                                        Renewed {account.renewalCount}x
                                                    </span>
                                                )}
                                            </div>

                                            <div className="renew-meta-row">
                                                <span className="renew-meta-lot">
                                                    Lot {account.plotCode}
                                                </span>

                                                <span className="renew-meta-item">
                                                    <Calendar size={13} />
                                                    Start: {formatFriendlyDate(account.startDate)}
                                                </span>

                                                <span className="renew-meta-item">
                                                    <Clock size={13} />
                                                    Maturity: {formatFriendlyDate(account.expirationDate)}
                                                    <span style={{
                                                        marginLeft: "5px",
                                                        fontWeight: 700,
                                                        color: account.daysRemaining <= 0 ? "#dc2626" : account.daysRemaining <= 60 ? "#d97706" : "#0f766e"
                                                    }}>
                                                        ({account.daysRemaining <= 0
                                                            ? account.daysRemaining === 0 ? "0 days left • Expired" : `${Math.abs(account.daysRemaining)} days overdue`
                                                            : `${account.daysRemaining} days left`})
                                                    </span>
                                                </span>
                                            </div>
                                        </div>

                                        {/* Right Group: Countdown & Action Buttons */}
                                        <div className="renew-card-right-group">
                                            <div className="renew-card-countdown">
                                                <span className="renew-cd-label">{countdownLabel}</span>
                                                <span className={`renew-cd-val ${cdClass}`}>{countdownVal}</span>
                                            </div>

                                            <div className="renew-actions-wrap">
                                                <button
                                                    type="button"
                                                    className="renew-btn-details"
                                                    onClick={() => setSelectedAccountForDetail(account)}
                                                    title="View complete contract details"
                                                >
                                                    <FileText size={14} />
                                                    <span>Details</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    className="renew-btn-history"
                                                    onClick={() => setSelectedAccountForHistory(account)}
                                                    title="View previous renewal receipts"
                                                >
                                                    <History size={14} />
                                                    <span>History</span>
                                                </button>

                                                {(isExpired || account.daysRemaining <= 0) && (
                                                    <button
                                                        type="button"
                                                        className="renew-btn-renew"
                                                        onClick={() => setSelectedAccountForRenew(account)}
                                                        title="Renew expired contract for this lot"
                                                    >
                                                        <RefreshCw size={14} />
                                                        <span>Renew</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bottom Row: Contract Lifecycle Progress */}
                                    <div className="renew-card-bottom">
                                        <div className="renew-progress-track">
                                            <div
                                                className={`renew-progress-fill fill-${account.progressColor}`}
                                                style={{ width: `${account.progressPercent}%` }}
                                            ></div>
                                        </div>

                                        <div className="renew-progress-footer">
                                            <span>
                                                {account.renewalCount > 0
                                                    ? `Renewed Term (${account.progressPercent}% elapsed) • Annual Renewal: ₱3,500/yr`
                                                    : `Initial ${account.contractYears}-Year Term (${account.progressPercent}% elapsed) • Annual Renewal: ₱3,500/yr`}
                                            </span>

                                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                                {account.lastRenewedDate && (
                                                    <span>Last Renewed: {formatFriendlyDate(account.lastRenewedDate)}</span>
                                                )}

                                                {isExpired || account.daysRemaining <= 0 ? (
                                                    <span style={{ color: "#dc2626", fontWeight: 700 }}>
                                                        Action Required: Renew Lease
                                                    </span>
                                                ) : account.daysRemaining <= 30 ? (
                                                    <span style={{ color: "#dc2626", fontWeight: 700 }}>
                                                        ⚠️ Nearing Expiration ({account.daysRemaining} days left)
                                                    </span>
                                                ) : isExpiringSoon ? (
                                                    <span style={{ color: "#d97706", fontWeight: 700 }}>
                                                        Renewal Period Active ({account.daysRemaining} days left)
                                                    </span>
                                                ) : (
                                                    <span className="renew-complete-tag">
                                                        <Check size={12} /> Current
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── MODALS ── */}
            {selectedAccountForDetail && (
                <RenewalDetailModal
                    isOpen={Boolean(selectedAccountForDetail)}
                    account={selectedAccountForDetail}
                    todayStr={todayStr}
                    onClose={() => setSelectedAccountForDetail(null)}
                    onOpenRenewModal={(acc) => setSelectedAccountForRenew(acc)}
                />
            )}

            {selectedAccountForHistory && (
                <RenewalHistoryModal
                    isOpen={Boolean(selectedAccountForHistory)}
                    account={selectedAccountForHistory}
                    onClose={() => setSelectedAccountForHistory(null)}
                    onOpenRenewModal={(acc) => setSelectedAccountForRenew(acc)}
                />
            )}

            {selectedAccountForRenew && (
                <RenewContractModal
                    isOpen={Boolean(selectedAccountForRenew)}
                    account={selectedAccountForRenew}
                    todayStr={todayStr}
                    onClose={() => setSelectedAccountForRenew(null)}
                    onRenewalSuccess={handleRenewalSuccess}
                />
            )}
        </div>
    );
}
