import React, { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase/config";
import Header from "../../../components/Header/Header";
import {
    Search,
    User,
    Calendar,
    MapPin,
    FileText,
    RefreshCw,
    Users,
    Layers,
    X,
    ExternalLink,
    Eye
} from "lucide-react";
import SatelliteMap from "../../Admin/MapManagement/MapFolder/SatelliteMap.jsx";
import { isApartmentPlot, getPlotRowAndColumn } from "../../Admin/MapManagement/MapFolder/mapInit.js";
import { getCentered12Plots } from "../../../services/plotServices.jsx";
import BurialDetailModal from "./BurialDetailModal.jsx";
import Pagination from "../../../components/Pagination/Pagination";
import "./Burials.css";

const ITEMS_PER_PAGE = 10;

// Helper to extract clean plot title
const getLotTitle = (plot) => {
    if (!plot) return "";
    return String(plot.plotCode || plot.name || plot.lotName || plot.title || plot.id || "");
};

// Helper to determine grave type
const getLotType = (plot, graveTypes = []) => {
    if (!plot) return "Standard Plot";
    const targetTypeId = String(plot.grave_type_id || plot.graveLotTypeID || plot.graveType || plot.type || "").trim().toLowerCase();
    const gt = graveTypes.find((item) => {
        const id = String(item.id || item.grave_type_id || "").trim().toLowerCase();
        const name = String(item.grave_type || item.name || "").trim().toLowerCase();
        return (id && id === targetTypeId) || (targetTypeId && name === targetTypeId);
    });
    if (gt?.grave_type || gt?.name) return gt.grave_type || gt.name;
    if (plot.graveType) return plot.graveType;

    const title = getLotTitle(plot);
    if (/^SN/i.test(title)) return "Single Niche";
    if (/^AP/i.test(title)) return "Apartment";
    if (/^GB/i.test(title)) return "Ground Burial";
    if (/^CB/i.test(title)) return "Cherubim";
    if (/^MA/i.test(title)) return "Mausoleum";
    if (/^CO/i.test(title)) return "Columbarium";
    if (/^BV/i.test(title)) return "Bone Vault";
    if (/^GT/i.test(title)) return "Garden Type";
    if (/^LL/i.test(title)) return "Lawn Lot";
    if (/^FE/i.test(title)) return "Family Estate";

    return "Ground Grave";
};

// Helper to extract cemetery section
const getLotSection = (plot) => {
    if (!plot) return "General Section";
    if (plot.section) {
        const s = String(plot.section).trim();
        if (/^section\b/i.test(s)) return s;
        return `Section ${s}`;
    }
    const title = getLotTitle(plot);
    const match = title.match(/^[A-Z]+-([A-Za-z0-9]+)-/i);
    if (match) return `Section ${match[1].toUpperCase()}`;
    const match2 = title.match(/^(?:Lot\s+)?([A-Za-z])/i);
    if (match2) return `Section ${match2[1].toUpperCase()}`;
    return "General Section";
};

export default function Burials() {
    const [burials, setBurials] = useState([]);
    const [plots, setPlots] = useState([]);
    const [clients, setClients] = useState([]);
    const [graveTypes, setGraveTypes] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filter - Combined Grave Type & Section
    const [searchQuery, setSearchQuery] = useState("");
    const [combinedFilter, setCombinedFilter] = useState("all");

    // Pagination State (10 items per page)
    const [currentPage, setCurrentPage] = useState(1);

    // Map Locator Modal state
    const [selectedBurialForMap, setSelectedBurialForMap] = useState(null);

    // View Details & Documents Modal state
    const [selectedBurialForView, setSelectedBurialForView] = useState(null);

    // Close modal on Escape
    useEffect(() => {
        if (!selectedBurialForMap && !selectedBurialForView) return;
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                setSelectedBurialForMap(null);
                setSelectedBurialForView(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedBurialForMap, selectedBurialForView]);

    // ── Realtime Subscriptions ──
    useEffect(() => {
        let burialsReady = false;
        let plotsReady = false;

        const checkReady = () => {
            if (burialsReady && plotsReady) {
                setLoading(false);
            }
        };

        const unsubBurials = onSnapshot(collection(db, "burials"), (snapshot) => {
            setBurials(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
            burialsReady = true;
            checkReady();
        }, (err) => console.warn("Error listening to burials:", err));

        const unsubPlots = onSnapshot(collection(db, "plots"), (snapshot) => {
            setPlots(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
            plotsReady = true;
            checkReady();
        }, (err) => console.warn("Error listening to plots:", err));

        const unsubClients = onSnapshot(collection(db, "clients"), (snapshot) => {
            setClients(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, (err) => console.warn("Error listening to clients:", err));

        const unsubGraveTypes = onSnapshot(collection(db, "grave_types"), (snapshot) => {
            setGraveTypes(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, (err) => {
            // fallback to grave_type
            onSnapshot(collection(db, "grave_type"), (s) => {
                setGraveTypes(s.docs.map((d) => ({ id: d.id, ...d.data() })));
            });
        });

        return () => {
            unsubBurials();
            unsubPlots();
            unsubClients();
            unsubGraveTypes();
        };
    }, []);

    // ── Format Helper ──
    const formatDisplayDate = (dateVal) => {
        if (!dateVal) return "—";
        try {
            const d = dateVal.toDate ? dateVal.toDate() : new Date(dateVal);
            if (isNaN(d.getTime())) return String(dateVal);
            return d.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
            });
        } catch {
            return String(dateVal);
        }
    };

    // Helper to get coordinates for external Google Maps direction link
    const getPlotCoordinates = (plot) => {
        if (!plot) return null;
        if (plot.coordinates && Array.isArray(plot.coordinates) && plot.coordinates.length > 0) {
            const c = plot.coordinates[0];
            const lat = Number(c.lat ?? c.latitude ?? (Array.isArray(c) ? c[0] : NaN));
            const lng = Number(c.lng ?? c.longitude ?? (Array.isArray(c) ? c[1] : NaN));
            if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
        }
        if (plot.latitude != null && plot.longitude != null) {
            const lat = Number(plot.latitude);
            const lng = Number(plot.longitude);
            if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
        }
        return null;
    };

    // ── Enriched Burials Data ──
    const enrichedBurials = useMemo(() => {
        return burials.map((burial) => {
            // Find linked plot
            const plot = plots.find((p) => p.id === burial.plot_id);

            // Find linked client / family
            const clientId = burial.user_id || plot?.user_id;
            const client = clients.find((c) => c.user_id === clientId || c.id === clientId);

            let familyName = "Family / Walk-in";
            if (client) {
                familyName = `${client.first_name || ""} ${client.last_name || ""}`.trim();
            } else if (plot?.owner) {
                familyName = plot.owner;
            }

            const plotCode = plot?.plotCode || plot?.id || "Unassigned";

            // Unified Grave Type and Section
            const graveTypeName = getLotType(plot || burial, graveTypes);
            const section = getLotSection(plot || burial);
            const graveTypeAndSection = `${graveTypeName} - ${section}`;
            const combinedKey = `${graveTypeName}__${section}`;

            // Visual badge styling theme based on grave type
            const gtLower = graveTypeName.toLowerCase();
            let typeBadgeClass = "standard";
            if (gtLower.includes("apartment")) {
                typeBadgeClass = "apartment";
            } else if (gtLower.includes("niche")) {
                typeBadgeClass = "niche";
            } else if (gtLower.includes("vault") || gtLower.includes("bone")) {
                typeBadgeClass = "vault";
            } else if (gtLower.includes("mausoleum")) {
                typeBadgeClass = "mausoleum";
            }

            return {
                ...burial,
                plot,
                client,
                plotCode,
                section,
                graveTypeName,
                graveTypeAndSection,
                combinedKey,
                familyName,
                typeBadgeClass,
                displayBuriedDate: formatDisplayDate(burial.date_buried || burial.created_at),
                displayDOB: formatDisplayDate(burial.date_of_birth),
                displayDOD: formatDisplayDate(burial.date_of_death),
            };
        });
    }, [burials, plots, clients, graveTypes]);

    // ── Generate Combined Unique Grave Type & Section Options ──
    const combinedFilterOptions = useMemo(() => {
        const map = new Map();
        enrichedBurials.forEach((b) => {
            const key = b.combinedKey;
            if (key && !map.has(key)) {
                map.set(key, {
                    key,
                    type: b.graveTypeName,
                    section: b.section,
                    label: b.graveTypeAndSection,
                });
            }
        });
        plots.forEach((p) => {
            const type = getLotType(p, graveTypes);
            const sec = getLotSection(p);
            const key = `${type}__${sec}`;
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    type,
                    section: sec,
                    label: `${type} - ${sec}`,
                });
            }
        });
        return Array.from(map.values()).sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" })
        );
    }, [enrichedBurials, plots, graveTypes]);

    // ── Filtered Records ──
    const filteredBurials = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return enrichedBurials.filter((b) => {
            // Filter by combined Grave Type & Section
            if (combinedFilter !== "all") {
                if (b.combinedKey !== combinedFilter) {
                    return false;
                }
            }

            // Search query
            if (!query) return true;

            const matchName = String(b.name || "").toLowerCase().includes(query);
            const matchPlot = String(b.plotCode || "").toLowerCase().includes(query);
            const matchFamily = String(b.familyName || "").toLowerCase().includes(query);
            const matchGraveType = String(b.graveTypeName || "").toLowerCase().includes(query);
            const matchSection = String(b.section || "").toLowerCase().includes(query);
            const matchCombined = String(b.graveTypeAndSection || "").toLowerCase().includes(query);

            return matchName || matchPlot || matchFamily || matchGraveType || matchSection || matchCombined;
        });
    }, [enrichedBurials, searchQuery, combinedFilter]);

    // ── Pagination Calculation ──
    const totalPages = Math.ceil(filteredBurials.length / ITEMS_PER_PAGE) || 1;
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedBurials = useMemo(() => {
        return filteredBurials.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredBurials, startIndex]);

    // Reset to page 1 whenever filters or search change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, combinedFilter]);

    // Clamp current page if total pages decreases
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(1);
        }
    }, [totalPages, currentPage]);

    // ── KPI Counts ──
    const uniquePlotsOccupied = useMemo(() => {
        const set = new Set();
        burials.forEach((b) => {
            if (b.plot_id) set.add(b.plot_id);
        });
        return set.size;
    }, [burials]);

    const activePlotCoords = useMemo(() => {
        if (!selectedBurialForMap) return null;
        const p = selectedBurialForMap.plot || plots.find((item) =>
            item.id === selectedBurialForMap.plot_id || item.plotCode === selectedBurialForMap.plotCode
        );
        return getPlotCoordinates(p);
    }, [selectedBurialForMap, plots]);

    // ── 12-Plot Rate-Limited Selection for Grave Plot Locator ──
    const locator12Plots = useMemo(() => {
        if (!selectedBurialForMap) return [];

        const targetPlot = selectedBurialForMap.plot || plots.find((p) =>
            p.id === selectedBurialForMap.plot_id ||
            p.plotCode === selectedBurialForMap.plotCode ||
            p.name === selectedBurialForMap.plotCode
        ) || {
            id: selectedBurialForMap.plot_id,
            plotCode: selectedBurialForMap.plotCode
        };

        const targetCode = String(
            targetPlot.plotCode || selectedBurialForMap.plotCode || ""
        ).trim();

        // Extract section name or code prefix (e.g. AP-A from AP-A-001)
        const targetSection = String(
            targetPlot.section || selectedBurialForMap.section || ""
        ).replace(/^section\s+/i, "").toLowerCase().trim();

        const prefixMatch = targetCode.match(/^([A-Z]+-[A-Za-z0-9]+)-/i);
        const targetPrefix = prefixMatch ? prefixMatch[1].toLowerCase() : "";

        // Filter plots in the same section or matching code prefix
        const sectionPlots = plots.filter((p) => {
            const pSection = String(p.section || "").replace(/^section\s+/i, "").toLowerCase().trim();
            if (targetSection && pSection && pSection === targetSection) {
                return true;
            }
            if (targetPrefix) {
                const pCode = String(p.plotCode || p.name || "").trim().toLowerCase();
                if (pCode.startsWith(targetPrefix)) return true;
            }
            return false;
        });

        const sortAlphanumeric = (a, b) => {
            const codeA = String(a.plotCode || a.name || a.id || "");
            const codeB = String(b.plotCode || b.name || b.id || "");
            return codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: "base" });
        };

        const candidates = (sectionPlots.length > 0 ? sectionPlots : plots).slice().sort(sortAlphanumeric);

        // Ensure targetPlot is included
        const hasTarget = candidates.some((p) =>
            String(p.id) === String(targetPlot.id) ||
            String(p.plotCode || "").toLowerCase() === targetCode.toLowerCase()
        );

        const fullPool = hasTarget ? candidates : [targetPlot, ...candidates].sort(sortAlphanumeric);

        // Rate-limit to 12 plots centered on the target plot
        return getCentered12Plots(fullPool, targetPlot);
    }, [selectedBurialForMap, plots]);

    const targetLocationKey = useMemo(() => {
        if (!selectedBurialForMap) return null;
        const p = selectedBurialForMap.plot || plots.find((item) =>
            item.id === selectedBurialForMap.plot_id || item.plotCode === selectedBurialForMap.plotCode
        );
        const sec = p?.section
            ? (String(p.section).startsWith("Section") ? p.section : `Section ${p.section}`)
            : (selectedBurialForMap.section || "General Section");
        const type = selectedBurialForMap.graveTypeName || p?.graveType || "Grave Plot";
        return `${type}__${sec}`;
    }, [selectedBurialForMap, plots]);

    return (
        <div className="user-management-page">
            <Header page="burials" />

            <div className="user-management-container burials-page-container">
                {/* ── KPI Metrics Cards ── */}
                <div className="burials-kpi-grid">
                    <div className="burials-kpi-card">
                        <div className="burials-kpi-icon blue">
                            <Users size={22} />
                        </div>
                        <div className="burials-kpi-info">
                            <span className="burials-kpi-label">Total Burials</span>
                            <span className="burials-kpi-value">{burials.length}</span>
                        </div>
                    </div>

                    <div className="burials-kpi-card">
                        <div className="burials-kpi-icon green">
                            <MapPin size={22} />
                        </div>
                        <div className="burials-kpi-info">
                            <span className="burials-kpi-label">Plots Occupied</span>
                            <span className="burials-kpi-value">{uniquePlotsOccupied}</span>
                        </div>
                    </div>

                    <div className="burials-kpi-card">
                        <div className="burials-kpi-icon purple">
                            <Layers size={22} />
                        </div>
                        <div className="burials-kpi-info">
                            <span className="burials-kpi-label">Grave Types &amp; Sections</span>
                            <span className="burials-kpi-value">
                                {new Set(enrichedBurials.map((b) => b.combinedKey)).size || 0}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ── Controls / Search Bar ── */}
                <div className="burials-controls-bar">
                    <div className="burials-search-wrap">
                        <Search size={16} className="burials-search-icon" />
                        <input
                            type="text"
                            className="burials-search-input"
                            placeholder="Search deceased name, lot code, family..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="burials-filter-group">
                        <select
                            className="burials-filter-select"
                            value={combinedFilter}
                            onChange={(e) => setCombinedFilter(e.target.value)}
                        >
                            <option value="all">All Grave Types &amp; Sections</option>
                            {combinedFilterOptions.map((opt) => (
                                <option key={opt.key} value={opt.key}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>

                        <span className="burials-count-badge">
                            {filteredBurials.length} record{filteredBurials.length === 1 ? "" : "s"}
                        </span>
                    </div>
                </div>

                {/* ── Burials Table Component with Map Locator Action ── */}
                <div className="burials-table-card">
                    {loading ? (
                        <div className="burials-empty-state">
                            <RefreshCw size={28} className="spinning" />
                            <p>Loading burial records...</p>
                        </div>
                    ) : filteredBurials.length === 0 ? (
                        <div className="burials-empty-state">
                            <Users size={36} color="#94a3b8" />
                            <h4>No Burial Records Found</h4>
                            <p>No records match your search or filter criteria.</p>
                        </div>
                    ) : (
                        <>
                            <div className="burials-table-wrapper">
                                <table className="burials-table">
                                    <thead>
                                        <tr>
                                            <th>Deceased Name</th>
                                            <th>Grave Plot Location</th>
                                            <th>Date Buried</th>
                                            <th>Grave Type &amp; Section</th>
                                            <th>Next of Kin / Family</th>
                                            <th style={{ textAlign: "center" }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedBurials.map((burial) => {
                                            return (
                                                <tr key={burial.id}>
                                                    {/* 1. Deceased Name */}
                                                    <td>
                                                        <div className="deceased-name-cell">
                                                            <span className="deceased-name">{burial.name || "Unnamed"}</span>
                                                            {(burial.date_of_birth || burial.date_of_death) && (
                                                                <span className="deceased-dates-sub">
                                                                    {burial.displayDOB} &bull; {burial.displayDOD}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* 2. Grave Plot Location */}
                                                    <td>
                                                        <div className="plot-cell-wrap">
                                                            <span
                                                                className="plot-code-badge clickable"
                                                                onClick={() => setSelectedBurialForMap(burial)}
                                                                title="Click to view plot on map"
                                                            >
                                                                <MapPin size={11} /> {burial.plotCode}
                                                            </span>
                                                            {isApartmentPlot(burial.plot || burial) ? (
                                                                <span className="plot-type-sub apartment-loc">
                                                                    Row {getPlotRowAndColumn(burial.plot || burial).row || "—"}, Col {getPlotRowAndColumn(burial.plot || burial).column || "—"}
                                                                </span>
                                                            ) : (
                                                                <span className="plot-type-sub">
                                                                    {burial.plotCode !== "Unassigned" ? "Click to view on map" : "No plot assigned"}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* 3. Date Buried */}
                                                    <td>
                                                        <span className="buried-date-text">
                                                            <Calendar size={13} /> {burial.displayBuriedDate}
                                                        </span>
                                                    </td>

                                                    {/* 4. Grave Type & Section (Replaced Interment Type) */}
                                                    <td>
                                                        <span className={`grave-type-section-badge ${burial.typeBadgeClass}`}>
                                                            <Layers size={12} />
                                                            {burial.graveTypeAndSection}
                                                        </span>
                                                    </td>

                                                    {/* 5. Family / Buyer */}
                                                    <td>
                                                        <div className="family-cell-wrap">
                                                            <span className="family-name">{burial.familyName}</span>
                                                            {burial.plot?.owner && burial.plot.owner !== burial.familyName && (
                                                                <span className="family-sub">Lot Owner: {burial.plot.owner}</span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* 6. Actions: View Details & Map Locator */}
                                                    <td style={{ textAlign: "center" }}>
                                                        <div className="burials-actions-wrap">
                                                            <button
                                                                type="button"
                                                                className="burials-action-view-btn"
                                                                onClick={() => setSelectedBurialForView(burial)}
                                                                title={`View record details and submitted documents for ${burial.name || "deceased"}`}
                                                            >
                                                                <Eye size={13} />
                                                                <span>View</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="burials-action-locate-btn"
                                                                onClick={() => setSelectedBurialForMap(burial)}
                                                                title={`Locate plot ${burial.plotCode} on cemetery map`}
                                                            >
                                                                <MapPin size={13} />
                                                                <span>Locate</span>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* ── Pagination Bar ── */}
                            {filteredBurials.length > 0 && (
                                <div className="burials-pagination-bar">
                                    <span className="burials-showing-text">
                                        Showing {startIndex + 1} to {Math.min(startIndex + ITEMS_PER_PAGE, filteredBurials.length)} of {filteredBurials.length} records
                                    </span>
                                    {totalPages > 1 && (
                                        <Pagination
                                            currentPage={currentPage}
                                            totalPages={totalPages}
                                            onPageChange={setCurrentPage}
                                        />
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── Interactive Map Locator Modal ── */}
            {selectedBurialForMap && (
                <div
                    className="burials-modal-backdrop"
                    onClick={() => setSelectedBurialForMap(null)}
                >
                    <div
                        className="burials-modal-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="burials-modal-header">
                            <div className="burials-modal-title-group">
                                <div className="burials-modal-icon">
                                    <MapPin size={20} />
                                </div>
                                <div>
                                    <h3 className="burials-modal-title">Grave Plot Locator</h3>
                                    <p className="burials-modal-subtitle">
                                        Viewing map location for <strong>{selectedBurialForMap.name || "Deceased Record"}</strong>
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="burials-modal-close-btn"
                                onClick={() => setSelectedBurialForMap(null)}
                                aria-label="Close Map Locator"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Plot Details Quick Summary Strip */}
                        <div className="burials-map-info-strip">
                            <div className="burials-map-info-item">
                                <span className="info-label">Plot Code</span>
                                <span className="info-value plot-badge">{selectedBurialForMap.plotCode}</span>
                            </div>
                            <div className="burials-map-info-item">
                                <span className="info-label">Section & Grave Type</span>
                                <span className="info-value">
                                    {selectedBurialForMap.graveTypeAndSection || `${selectedBurialForMap.graveTypeName} ${selectedBurialForMap.section ? `• ${selectedBurialForMap.section}` : ""}`}
                                </span>
                            </div>
                            {isApartmentPlot(selectedBurialForMap.plot || selectedBurialForMap) && (
                                <>
                                    <div className="burials-map-info-item">
                                        <span className="info-label">Row</span>
                                        <span className="info-value">
                                            {getPlotRowAndColumn(selectedBurialForMap.plot || selectedBurialForMap).row || "—"}
                                        </span>
                                    </div>
                                    <div className="burials-map-info-item">
                                        <span className="info-label">Column</span>
                                        <span className="info-value">
                                            {getPlotRowAndColumn(selectedBurialForMap.plot || selectedBurialForMap).column || "—"}
                                        </span>
                                    </div>
                                </>
                            )}
                            <div className="burials-map-info-item">
                                <span className="info-label">Deceased Name</span>
                                <span className="info-value">{selectedBurialForMap.name || "Unnamed"}</span>
                            </div>
                            <div className="burials-map-info-item">
                                <span className="info-label">Family / Lot Owner</span>
                                <span className="info-value">{selectedBurialForMap.familyName || "—"}</span>
                            </div>
                            <div className="burials-map-info-item">
                                <span className="info-label">Date Buried</span>
                                <span className="info-value">{selectedBurialForMap.displayBuriedDate}</span>
                            </div>
                        </div>

                        {/* Interactive Satellite Map Container (Rate Limited to 12 Plots) */}
                        <div className="burials-map-wrapper">
                            <SatelliteMap
                                allPlots={plots}
                                plots={locator12Plots}
                                focusPlot={selectedBurialForMap.plot || { id: selectedBurialForMap.plot_id, plotCode: selectedBurialForMap.plotCode }}
                                mapId="burials-satellite-map-locator"
                                plotLimit={12}
                                showLocationSelect={false}
                            />
                        </div>

                        {/* Modal Footer */}
                        <div className="burials-modal-footer">
                            <div className="burials-modal-footer-hint">
                                <MapPin size={14} color="#004d8c" />
                                <span>The cemetery map automatically centers and highlights the assigned plot location.</span>
                            </div>
                            <div className="burials-modal-footer-actions">
                                {activePlotCoords && (
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${activePlotCoords.lat},${activePlotCoords.lng}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="burials-btn-gmaps"
                                    >
                                        <ExternalLink size={14} />
                                        <span>Google Maps</span>
                                    </a>
                                )}
                                <button
                                    type="button"
                                    className="burials-btn-modal-close"
                                    onClick={() => setSelectedBurialForMap(null)}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Burial Details & Documents View Modal ── */}
            {selectedBurialForView && (
                <BurialDetailModal
                    isOpen={!!selectedBurialForView}
                    burial={selectedBurialForView}
                    onClose={() => setSelectedBurialForView(null)}
                    onLocatePlot={(b) => {
                        setSelectedBurialForView(null);
                        setSelectedBurialForMap(b);
                    }}
                />
            )}
        </div>
    );
}

