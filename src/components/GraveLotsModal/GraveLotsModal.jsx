import React, { useState, useEffect, useMemo } from "react";
import {
    X,
    Layers,
    Search,
    ChevronDown,
    LayoutGrid,
    Check,
    Clock,
    Map as MapIcon,
    ChevronLeft,
    ChevronRight,
    Navigation,
    ExternalLink
} from "lucide-react";
import SatelliteMap from "../../pages/Admin/MapManagement/MapFolder/SatelliteMap.jsx";
import { subscribePlots, getCentered12Plots } from "../../services/plotServices.jsx";
import { subscribeGraveTypes } from "../../services/graveServices.jsx";
import Pagination from "../Pagination/Pagination.jsx";
import "./GraveLotsModal.css";

/**
 * GraveLotsModal
 * Displays the Plot & Burial Search, Grave Lot slot grid, Satellite Map below,
 * and an interactive plot details popup modal when a slot is clicked.
 *
 * Props:
 *  isOpen            {boolean}   – controls modal visibility
 *  onClose           {Function}  – called on close/cancel
 *  plots             {Array}     – list of plot objects from Firestore
 *  selectedGraveType {Object}    – optional currently selected grave lot type
 *  graveTypes        {Array}     – list of configured grave types from POS
 *  onSelectPlot      {Function}  – optional callback when user selects a plot
 */
function GraveLotsModal({
    isOpen,
    onClose,
    plots: propPlots = [],
    selectedGraveType = null,
    graveTypes = [],
    onSelectPlot = null,
    selectedPlotId = null,
}) {
    const [livePlots, setLivePlots] = useState([]);
    const [liveGraveTypes, setLiveGraveTypes] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedPlot, setSelectedPlot] = useState(null);
    const [focusedPlot, setFocusedPlot] = useState(null);
    const [selectedGraveTypeFilter, setSelectedGraveTypeFilter] = useState("ALL");
    const [activeStatus, setActiveStatus] = useState("ALL");
    const [searchQuery, setSearchQuery] = useState("");
    const ITEMS_PER_PAGE = 12;

    // Close on Escape key (closes popup first if open, or closes whole modal)
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                if (selectedPlot) {
                    setSelectedPlot(null);
                } else {
                    onClose?.();
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, selectedPlot, onClose]);

    // Live subscription fallback if propPlots is empty
    useEffect(() => {
        if (!isOpen) return;
        if (propPlots && propPlots.length > 0) {
            setLivePlots(propPlots);
            return;
        }

        const unsub = subscribePlots(
            (data) => setLivePlots(data || []),
            (err) => console.error("Error loading plots in GraveLotsModal:", err)
        );
        return () => unsub();
    }, [isOpen, propPlots]);

    // Live subscription fallback if graveTypes prop is empty
    useEffect(() => {
        if (!isOpen) return;
        if (graveTypes && graveTypes.length > 0) {
            setLiveGraveTypes(graveTypes);
            return;
        }

        const unsub = subscribeGraveTypes(
            (data) => setLiveGraveTypes(data || []),
            (err) => console.error("Error loading grave types in GraveLotsModal:", err)
        );
        return () => unsub();
    }, [isOpen, graveTypes]);

    const allGraveTypes = (graveTypes && graveTypes.length > 0) ? graveTypes : liveGraveTypes;

    // Helper to resolve any grave type object or id to a clean human-readable name
    const resolveGraveTypeName = (gtObjOrStr) => {
        if (!gtObjOrStr) return "";
        if (typeof gtObjOrStr === "string") {
            const trimmed = gtObjOrStr.trim();
            if (!/^GT\d+$/i.test(trimmed)) return trimmed;
            const matched = allGraveTypes.find(
                (gt) => String(gt.id || gt.grave_type_id || "").trim().toLowerCase() === trimmed.toLowerCase()
            );
            return matched ? (matched.name || matched.grave_type || "") : "";
        }
        const name = gtObjOrStr.name || gtObjOrStr.grave_type || gtObjOrStr.graveType || "";
        if (name && !/^GT\d+$/i.test(String(name).trim())) return String(name).trim();
        const id = String(gtObjOrStr.id || gtObjOrStr.grave_type_id || "").trim().toLowerCase();
        if (id) {
            const matched = allGraveTypes.find(
                (gt) => String(gt.id || gt.grave_type_id || "").trim().toLowerCase() === id
            );
            return matched ? (matched.name || matched.grave_type || "") : "";
        }
        return "";
    };


    // Invalidate map size so all tiles render properly inside the modal
    useEffect(() => {
        if (!isOpen) return;
        const timer = setTimeout(() => {
            window.dispatchEvent(new Event("resize"));
        }, 250);
        return () => clearTimeout(timer);
    }, [isOpen]);

    // Helper functions for plots
    const getStatusKey = (plotOrStatus = "") => {
        let status = "";
        let occupied = null;
        let maxCap = null;

        if (plotOrStatus && typeof plotOrStatus === "object") {
            status = plotOrStatus.status || plotOrStatus.plot_status || "";
            occupied = plotOrStatus.occupiedCount != null ? Number(plotOrStatus.occupiedCount) : null;
            maxCap = plotOrStatus.maxCapacity != null ? Number(plotOrStatus.maxCapacity) : (plotOrStatus.capacity != null ? Number(plotOrStatus.capacity) : null);
        } else {
            status = String(plotOrStatus || "");
        }

        const s = status.toLowerCase().trim();

        if (s === "partial" || s === "partially occupied" || s === "partially-occupied") return "partial";
        if (s === "occupied" || s === "taken" || s === "used") {
            if (occupied != null && maxCap != null && maxCap > 1 && occupied > 0 && occupied < maxCap) {
                return "partial";
            }
            return "occupied";
        }
        if (s === "reserved" || s === "pending") return "reserved";
        if (s === "available" || s === "vacant" || s === "open") {
            if (occupied != null && occupied > 0) {
                if (maxCap != null && maxCap > 0 && occupied >= maxCap) return "occupied";
                return "partial";
            }
            return "available";
        }

        if (occupied != null && occupied > 0) {
            if (maxCap != null && maxCap > 0 && occupied >= maxCap) return "occupied";
            return "partial";
        }

        return "available";
    };

    const getStatusLabel = (statusKey) => {
        switch (statusKey) {
            case "available":
                return "Available";
            case "partial":
                return "Partial";
            case "occupied":
                return "Occupied";
            case "reserved":
                return "Reserved";
            default:
                return "Available";
        }
    };

    const allPlots = (propPlots && propPlots.length > 0) ? propPlots : livePlots;

    const getLotTitle = (plot) => {
        return (
            plot.plotCode ||
            plot.plotcode ||
            plot.plot_code ||
            plot.lotNumber ||
            plot.plotNumber ||
            plot.lotName ||
            plot.plotId ||
            plot.lot ||
            plot.name ||
            `Lot ${plot.id || ""}`
        );
    };

    const getLotType = (plot) => {
        if (!plot) return "Apartment";

        // 1. Direct human-readable grave_type if present and not an ID like "GT001"
        const directType = plot.grave_type || plot.graveType || plot.lotType || plot.type;
        if (directType && !/^GT\d+$/i.test(String(directType).trim())) {
            return String(directType).trim();
        }

        // 2. Resolve via allGraveTypes list by ID
        const targetId = String(plot.grave_type_id || plot.graveLotTypeID || directType || "").trim().toLowerCase();
        if (targetId && Array.isArray(allGraveTypes) && allGraveTypes.length > 0) {
            const matched = allGraveTypes.find((gt) => {
                const gtId = String(gt.id || gt.grave_type_id || "").trim().toLowerCase();
                return gtId === targetId;
            });
            if (matched) {
                const name = matched.name || matched.grave_type || matched.graveType;
                if (name && !/^GT\d+$/i.test(String(name).trim())) {
                    return String(name).trim();
                }
            }
        }

        // 3. Fallback based on plotCode prefix
        const code = getLotTitle(plot);
        if (/^SN/i.test(code)) return "Single Niche";
        if (/^AP/i.test(code)) return "Apartment";
        if (/^GB/i.test(code)) return "Ground Burial";
        if (/^CB/i.test(code)) return "Cherubim";

        return "Grave Lot";
    };

    // Helper to check if a grave type is active
    const isGraveTypeActive = (gt) => {
        if (!gt) return true;
        if (gt.status !== undefined && gt.status !== null && gt.status !== "") {
            const s = String(gt.status).toLowerCase().trim();
            if (s === "inactive" || s === "disabled" || s === "archived") return false;
            if (s === "active" || s === "enabled") return true;
        }
        if (gt.isActive !== undefined && gt.isActive !== null) {
            return Boolean(gt.isActive);
        }
        return true;
    };

    const getLotSection = (plot) => {
        if (plot.section) {
            const s = String(plot.section).trim();
            if (/^section\b/i.test(s)) return s;
            return `Section ${s}`;
        }
        const code = getLotTitle(plot);
        const match = code.match(/^[A-Z]+-([A-Za-z0-9]+)-/i);
        if (match) return `Section ${match[1].toUpperCase()}`;
        const match2 = code.match(/^([A-Za-z]+)-/);
        if (match2) return `Section ${match2[1].toUpperCase()}`;
        return "General Section";
    };

    // Generate unique GraveType & Section combined options (segregated in a single dropdown)
    const availableGraveTypeSectionOptions = useMemo(() => {
        const optionsMap = new Map();

        // 1. Gather all unique (GraveType, Section) pairs from actual plots
        allPlots.forEach((p) => {
            const type = getLotType(p);
            if (!type || type === "Grave Lot" || /^GT\d+$/i.test(String(type).trim())) {
                return;
            }

            // Filter out if grave type is inactive in allGraveTypes
            const matchingGt = allGraveTypes.find((gt) => {
                const gtId = String(gt.id || gt.grave_type_id || "").trim().toLowerCase();
                const gtName = String(gt.name || gt.grave_type || "").trim().toLowerCase();
                const pTypeId = String(p.grave_type_id || p.graveLotTypeID || "").trim().toLowerCase();
                return (gtId && gtId === pTypeId) || (gtName && gtName === type.toLowerCase());
            });
            if (matchingGt && !isGraveTypeActive(matchingGt)) {
                return;
            }

            const sec = getLotSection(p);
            const key = `${type}__${sec}`;
            if (!optionsMap.has(key)) {
                optionsMap.set(key, {
                    key,
                    type,
                    section: sec,
                    label: `${type} - ${sec}`
                });
            }
        });

        // 2. Fallback for configured active grave types that don't have plots yet
        allGraveTypes.forEach((gt) => {
            if (!isGraveTypeActive(gt)) return;
            const name = gt.name || gt.grave_type || gt.graveType;
            if (name && !/^GT\d+$/i.test(String(name).trim())) {
                const trimmedName = String(name).trim();
                const hasEntry = Array.from(optionsMap.values()).some(
                    (opt) => opt.type.toLowerCase() === trimmedName.toLowerCase()
                );
                if (!hasEntry) {
                    const key = `${trimmedName}__General Section`;
                    optionsMap.set(key, {
                        key,
                        type: trimmedName,
                        section: "General Section",
                        label: `${trimmedName}`
                    });
                }
            }
        });

        return Array.from(optionsMap.values()).sort((a, b) =>
            a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" })
        );
    }, [allPlots, allGraveTypes]);

    // Sync active filters when modal opens or selectedGraveType changes
    useEffect(() => {
        if (isOpen) {
            if (selectedPlotId && allPlots.length > 0) {
                const initialPlot = allPlots.find((p) => p.id === selectedPlotId);
                if (initialPlot) {
                    const key = `${getLotType(initialPlot)}__${getLotSection(initialPlot)}`;
                    setSelectedGraveTypeFilter(key);
                } else if (selectedGraveType) {
                    const resolvedName = resolveGraveTypeName(selectedGraveType);
                    const matching = availableGraveTypeSectionOptions.filter(
                        (opt) => opt.type.toLowerCase() === (resolvedName || "").toLowerCase()
                    );
                    setSelectedGraveTypeFilter(matching.length > 0 ? matching[0].key : (resolvedName || "ALL"));
                } else {
                    setSelectedGraveTypeFilter("ALL");
                }
            } else if (selectedGraveType) {
                const resolvedName = resolveGraveTypeName(selectedGraveType);
                if (resolvedName) {
                    const matching = availableGraveTypeSectionOptions.filter(
                        (opt) => opt.type.toLowerCase() === resolvedName.toLowerCase()
                    );
                    if (matching.length > 0) {
                        setSelectedGraveTypeFilter(matching[0].key);
                    } else {
                        setSelectedGraveTypeFilter(resolvedName);
                    }
                } else {
                    setSelectedGraveTypeFilter("ALL");
                }
            } else {
                setSelectedGraveTypeFilter("ALL");
            }
            setActiveStatus("ALL");
            setSearchQuery("");
            setCurrentPage(1);
            setSelectedPlot(null);
            setFocusedPlot(null);
        }
    }, [isOpen, selectedGraveType, selectedPlotId, availableGraveTypeSectionOptions]);

    const matchesGraveType = (plot, targetFilter) => {
        if (!targetFilter || targetFilter === "ALL") return true;

        const plotLotType = getLotType(plot).trim().toLowerCase();
        const plotSec = getLotSection(plot).trim().toLowerCase();

        // 1. If filtering by combined GraveType & Section ("Type__Section")
        if (targetFilter.includes("__")) {
            const [filterType, filterSec] = targetFilter.split("__");
            const normFilterType = filterType.trim().toLowerCase();
            const normFilterSec = filterSec.trim().toLowerCase();

            let isTypeMatch = (plotLotType === normFilterType) ||
                plotLotType.includes(normFilterType) ||
                normFilterType.includes(plotLotType);

            if (!isTypeMatch) {
                const plotTypeId = String(plot.grave_type_id || plot.graveLotTypeID || "").trim().toLowerCase();
                const targetObj = allGraveTypes.find((gt) => {
                    const n = String(gt.name || gt.grave_type || "").trim().toLowerCase();
                    return n === normFilterType;
                });
                if (targetObj) {
                    const targetId = String(targetObj.id || targetObj.grave_type_id || "").trim().toLowerCase();
                    if (targetId && plotTypeId === targetId) isTypeMatch = true;
                }
            }

            if (!isTypeMatch) return false;

            const isSecMatch = (plotSec === normFilterSec) ||
                (plot.section && String(plot.section).trim().toLowerCase() === normFilterSec.replace(/^section\s*/i, "").trim().toLowerCase());

            return isSecMatch;
        }

        // 2. If targetFilter is a simple type name
        const normTarget = String(targetFilter).trim().toLowerCase();
        if (plotLotType === normTarget || plotLotType.includes(normTarget) || normTarget.includes(plotLotType)) {
            return true;
        }

        const plotTypeId = String(plot.grave_type_id || plot.graveLotTypeID || "").trim().toLowerCase();
        const targetObj = allGraveTypes.find((gt) => {
            const n = String(gt.name || gt.grave_type || "").trim().toLowerCase();
            return n === normTarget;
        });
        if (targetObj) {
            const targetId = String(targetObj.id || targetObj.grave_type_id || "").trim().toLowerCase();
            if (targetId && plotTypeId === targetId) return true;
        }

        return false;
    };

    // Filtered plots based on Grave Type, Status, and Search Query
    const filteredPlots = useMemo(() => {
        const hasSearch = searchQuery.trim().length > 0;

        return allPlots
            .filter((plot) => {
                const statusKey = getStatusKey(plot);

                // 1. Grave Type filter (only grave_type)
                if (!matchesGraveType(plot, selectedGraveTypeFilter)) {
                    return false;
                }

                // 2. Status filter:
                // When NOT searching: only display the available graves (or respect explicit status filter)
                // When searching: partial, reserved, occupied, available are all able to render
                if (!hasSearch) {
                    if (activeStatus !== "ALL") {
                        if (statusKey !== activeStatus) return false;
                    } else {
                        // Default when user is not searching: only display available graves
                        if (statusKey !== "available") return false;
                    }
                } else {
                    // When searching: respect activeStatus if user selected one
                    if (activeStatus !== "ALL" && statusKey !== activeStatus) {
                        return false;
                    }
                }

                // 3. Search query
                if (hasSearch) {
                    const q = searchQuery.toLowerCase().trim();
                    const code = getLotTitle(plot).toLowerCase();
                    const sec = getLotSection(plot).toLowerCase();
                    const type = getLotType(plot).toLowerCase();
                    const deceased = String(plot.deceased_name || plot.deceasedName || "").toLowerCase();
                    if (!code.includes(q) && !sec.includes(q) && !type.includes(q) && !deceased.includes(q)) {
                        return false;
                    }
                }

                return true;
            })
            .sort((a, b) => {
                const titleA = getLotTitle(a);
                const titleB = getLotTitle(b);
                return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: "base" });
            });
    }, [allPlots, selectedGraveTypeFilter, activeStatus, searchQuery, allGraveTypes]);

    const getPlotCenter = (plot) => {
        if (!plot) return null;
        if (plot.coordinates && Array.isArray(plot.coordinates) && plot.coordinates.length > 0) {
            const latlngs = plot.coordinates
                .map((c) => ({
                    lat: Number(c.lat ?? c.latitude ?? (Array.isArray(c) ? c[0] : NaN)),
                    lng: Number(c.lng ?? c.longitude ?? (Array.isArray(c) ? c[1] : NaN))
                }))
                .filter((c) => !isNaN(c.lat) && !isNaN(c.lng));
            if (latlngs.length > 0) {
                const lat = latlngs.reduce((s, p) => s + p.lat, 0) / latlngs.length;
                const lng = latlngs.reduce((s, p) => s + p.lng, 0) / latlngs.length;
                return { lat, lng };
            }
        }
        const lat = plot.latitude ?? plot.lat ?? plot.location?.latitude ?? plot.center?.[0];
        const lng = plot.longitude ?? plot.lng ?? plot.location?.longitude ?? plot.center?.[1];
        if (lat !== undefined && lng !== undefined && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
            return { lat: Number(lat), lng: Number(lng) };
        }
        return { lat: 14.8378234, lng: 120.7600800 };
    };

    const handleNavigateOnMap = (plot) => {
        setSelectedPlot(null);
        setFocusedPlot(plot);

        // Center on the page containing the navigated plot
        const targetIdx = filteredPlots.findIndex((p) => String(p.id) === String(plot?.id));
        if (targetIdx !== -1) {
            const pageNum = Math.floor(targetIdx / ITEMS_PER_PAGE) + 1;
            setCurrentPage(pageNum);
        }

        setTimeout(() => {
            const mapEl = document.querySelector(".glm-map-panel-card");
            if (mapEl) {
                mapEl.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }, 120);
    };

    const handleSelectGraveLot = (plot) => {
        if (!plot) return;
        const statusKey = getStatusKey(plot);
        // Only available grave is selectable
        if (statusKey !== "available") return;
        if (onSelectPlot) {
            onSelectPlot(plot);
        }
        setSelectedPlot(null);
        onClose?.();
    };

    const totalAvailable = allPlots.filter((p) => getStatusKey(p) === "available").length;

    const handleLocationSelectFromMap = (locationKeyOrLabel, limitedPlots, selectedOpt) => {
        const matched = availableGraveTypeSectionOptions.find(
            (o) => o.key === locationKeyOrLabel || o.label.toLowerCase() === String(locationKeyOrLabel).toLowerCase()
        );
        if (matched) {
            setSelectedGraveTypeFilter(matched.key);
        } else if (selectedOpt) {
            const fallbackKey = `${selectedOpt.type}__${selectedOpt.section}`;
            const fallbackOpt = availableGraveTypeSectionOptions.find((o) => o.key === fallbackKey);
            if (fallbackOpt) setSelectedGraveTypeFilter(fallbackOpt.key);
        }
        setActiveStatus("ALL");
        setFocusedPlot(null);
        setCurrentPage(1);
    };

    // Pagination calculations (12 plots per page)
    const totalPlots = filteredPlots.length;
    const totalPages = Math.ceil(totalPlots / ITEMS_PER_PAGE) || 1;
    const startIdx = totalPlots === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endIdx = Math.min(currentPage * ITEMS_PER_PAGE, totalPlots);
    const paginatedPlots = filteredPlots.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // 12-plot centered slice around the navigated plot (5 before, navigate in middle, 6 after)
    const centered12Plots = useMemo(() => {
        if (!focusedPlot) return null;
        return getCentered12Plots(filteredPlots.length > 0 ? filteredPlots : allPlots, focusedPlot);
    }, [filteredPlots, allPlots, focusedPlot]);

    const displayedPlots = centered12Plots || paginatedPlots;

    const title = useMemo(() => {
        if (selectedGraveTypeFilter !== "ALL") {
            const opt = availableGraveTypeSectionOptions.find((o) => o.key === selectedGraveTypeFilter);
            const label = opt ? opt.label : selectedGraveTypeFilter;
            return `Grave Lot Selection – ${label}`;
        }
        if (selectedGraveType) {
            const name = resolveGraveTypeName(selectedGraveType);
            if (name) return `Grave Lot Selection – ${name}`;
        }
        return "Grave Lots";
    }, [selectedGraveTypeFilter, selectedGraveType, availableGraveTypeSectionOptions]);

    // Selected plot metadata for the popup
    const popupStatusKey = selectedPlot ? getStatusKey(selectedPlot) : "available";
    const popupStatusLabel = getStatusLabel(popupStatusKey);
    const popupLotCode = selectedPlot ? getLotTitle(selectedPlot) : "";
    const popupGraveType = selectedPlot ? getLotType(selectedPlot) : "Apartment";
    const popupSectionRaw = selectedPlot?.section || "A";
    const popupSectionTitle = popupSectionRaw.toLowerCase().startsWith("section")
        ? popupSectionRaw
        : `Section ${popupSectionRaw}`;
    const popupCenter = selectedPlot ? getPlotCenter(selectedPlot) : null;

    if (!isOpen) return null;

    return (
        <div className="glm-overlay" onClick={onClose}>
            <div
                className="glm-modal-card"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="glm-header">
                    <div className="glm-title-group">
                        <span className="glm-icon-badge">
                            <Layers size={18} />
                        </span>
                        <div>
                            <h3 className="glm-title">{title}</h3>
                            <p className="glm-subtitle">
                                Browse available grave plots and cemetery satellite map
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        className="glm-close-btn"
                        onClick={onClose}
                        aria-label="Close modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Modal Body (Scrollable container holding all sections) */}
                <div className="glm-body">
                    <div className="glm-content-container">
                        {/* 1. Card: Plot & Burial Search */}
                        <div className="glm-panel-card">
                            <div className="glm-panel-header">
                                <div className="glm-panel-title-group">
                                    <Search size={15} className="glm-blue-icon" />
                                    <h4 className="glm-panel-title">Plot & Burial Search</h4>
                                </div>
                                <span className="glm-header-note">
                                    Showing {totalAvailable} available plots
                                </span>
                            </div>

                            <div className="glm-search-controls-row">
                                <div className="glm-search-input-wrap">
                                    <Search size={14} className="glm-search-input-icon" />
                                    <input
                                        type="text"
                                        className="glm-search-input"
                                        placeholder="Search by plot code, section, deceased name..."
                                        value={searchQuery}
                                        onChange={(e) => {
                                            setSearchQuery(e.target.value);
                                            setFocusedPlot(null);
                                            setCurrentPage(1);
                                        }}
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            className="glm-search-clear-btn"
                                            onClick={() => {
                                                setSearchQuery("");
                                                setFocusedPlot(null);
                                                setCurrentPage(1);
                                            }}
                                            aria-label="Clear search"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>

                                {/* Grave Type & Section Combined Dropdown */}
                                <div className="glm-select-wrap glm-select-wrap-type">
                                    <select
                                        className="glm-select-control"
                                        value={selectedGraveTypeFilter}
                                        onChange={(e) => {
                                            setSelectedGraveTypeFilter(e.target.value);
                                            setFocusedPlot(null);
                                            setCurrentPage(1);
                                        }}
                                        aria-label="Filter by grave type and section"
                                    >
                                        <option value="ALL">All Grave Types</option>
                                        {availableGraveTypeSectionOptions.map((opt) => (
                                            <option key={opt.key} value={opt.key}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} className="glm-select-arrow" />
                                </div>

                                {/* Status Dropdown */}
                                <div className="glm-select-wrap">
                                    <select
                                        className="glm-select-control"
                                        value={activeStatus}
                                        onChange={(e) => {
                                            setActiveStatus(e.target.value);
                                            setFocusedPlot(null);
                                            setCurrentPage(1);
                                        }}
                                        aria-label="Filter by status"
                                    >
                                        <option value="ALL">Status</option>
                                        <option value="available">Available</option>
                                        <option value="partial">Partial</option>
                                        <option value="occupied">Occupied</option>
                                        <option value="reserved">Reserved</option>
                                    </select>
                                    <ChevronDown size={14} className="glm-select-arrow" />
                                </div>
                            </div>
                        </div>

                        {/* 2. Card: Grave Lot Grid */}
                        <div className="glm-panel-card">
                            <div className="glm-panel-header">
                                <div className="glm-panel-title-group">
                                    <LayoutGrid size={15} className="glm-amber-icon" />
                                    <h4 className="glm-panel-title">Grave Lot</h4>
                                </div>
                            </div>

                            {/* Plots Grid (4 columns, 12 slots) */}
                            <div className="glm-slots-grid">
                                {totalPlots === 0 ? (
                                    <div className="glm-slots-empty">
                                        <LayoutGrid size={32} color="#94a3b8" />
                                        <p>No plots found. Please add plots in Map Management.</p>
                                    </div>
                                ) : (
                                    displayedPlots.map((plot, idx) => {
                                        const statusKey = getStatusKey(plot);
                                        const lotTitle = getLotTitle(plot);
                                        const lotType = getLotType(plot);
                                        const statusLabel = getStatusLabel(statusKey);
                                        const isSelected = selectedPlotId && (String(selectedPlotId) === String(plot.id));
                                        const isNavigated = focusedPlot && (String(focusedPlot.id) === String(plot.id));
                                        return (
                                            <div
                                                key={plot.id || idx}
                                                className={`glm-slot-card ${statusKey} ${isSelected ? "selected" : ""} ${isNavigated ? "navigated-focused" : ""}`}
                                                onClick={() => setSelectedPlot(plot)}
                                                title={`${lotTitle} (${statusLabel}) - Click to view details`}
                                            >
                                                <div className={`glm-card-status-icon ${statusKey}`}>
                                                    {statusKey === "available" && (
                                                        <Check size={12} strokeWidth={3.5} color="#ffffff" />
                                                    )}
                                                    {statusKey === "partial" && (
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <line x1="12" y1="5" x2="12" y2="19" />
                                                            <line x1="5" y1="12" x2="12" y2="12" />
                                                        </svg>
                                                    )}
                                                    {statusKey === "occupied" && (
                                                        <X size={12} strokeWidth={3.5} color="#ffffff" />
                                                    )}
                                                    {statusKey === "reserved" && (
                                                        <Clock size={12} strokeWidth={3} color="#ffffff" />
                                                    )}
                                                </div>
                                                <div className="glm-slot-code">{lotTitle}</div>
                                                <div className="glm-slot-status">{statusLabel}</div>
                                                <div className="glm-slot-type">{lotType}</div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Pagination Controls */}
                            {totalPlots > 0 && (
                                <div className="glm-pagination-bar">
                                    <span className="glm-showing-text">
                                        Showing {startIdx} to {endIdx} of {totalPlots} slots
                                    </span>
                                    {totalPages > 1 && (
                                        <Pagination
                                            currentPage={currentPage}
                                            totalPages={totalPages}
                                            onPageChange={(page) => {
                                                setFocusedPlot(null);
                                                setCurrentPage(page);
                                            }}
                                        />
                                    )}
                                </div>
                            )}

                            {/* Legend & Total Available Footer */}
                            <div className="glm-legend-bar">
                                <div className="glm-legend-items">
                                    <div className="glm-legend-item">
                                        <span className="glm-legend-badge available"></span>
                                        <span>Available</span>
                                    </div>
                                    <div className="glm-legend-item">
                                        <span className="glm-legend-badge partial"></span>
                                        <span>Partial</span>
                                    </div>
                                    <div className="glm-legend-item">
                                        <span className="glm-legend-badge occupied"></span>
                                        <span>Occupied</span>
                                    </div>
                                    <div className="glm-legend-item">
                                        <span className="glm-legend-badge reserved"></span>
                                        <span>Reserved</span>
                                    </div>
                                </div>

                                <div className="glm-total-available">
                                    <span className="glm-total-dot"></span>
                                    <span>Total Available: <strong>{totalAvailable}</strong></span>
                                </div>
                            </div>
                        </div>

                        {/* 3. Card: Cemetery Satellite Map (Placed directly below) */}
                        <div className="glm-panel-card glm-map-panel-card">
                            <div className="glm-panel-header">
                                <div className="glm-panel-title-group">
                                    <MapIcon size={15} className="glm-blue-icon" />
                                    <h4 className="glm-panel-title">Cemetery Satellite Map</h4>
                                </div>
                                <span className="glm-header-note">
                                    Interactive aerial plot view
                                </span>
                            </div>

                            <div className="glm-map-container">
                                <SatelliteMap
                                    allPlots={allPlots}
                                    plots={displayedPlots}
                                    focusPlot={focusedPlot}
                                    currentLocationKey={selectedGraveTypeFilter}
                                    onLocationSelect={handleLocationSelectFromMap}
                                    mapId="grave-lots-modal-map"
                                    onRegisterPlot={(plot) => handleSelectGraveLot(plot)}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Plot Details Modal Popup (Matches Screenshot) */}
            {selectedPlot && (
                <div
                    className="glm-popup-backdrop"
                    onClick={() => setSelectedPlot(null)}
                >
                    <div
                        className="glm-popup-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Popup Header */}
                        <div className="glm-popup-header">
                            <span className={`glm-popup-badge ${popupStatusKey}`}>
                                ● {popupStatusLabel.toUpperCase()}
                            </span>
                            <button
                                type="button"
                                className="glm-popup-close-btn"
                                onClick={() => setSelectedPlot(null)}
                                aria-label="Close details"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* Title & Code */}
                        <div className="glm-popup-title-section">
                            <h3 className="glm-popup-title">
                                {popupSectionTitle} - {popupGraveType}
                            </h3>
                            <div className="glm-popup-code">{popupLotCode}</div>
                        </div>

                        {/* Details Card */}
                        <div className="glm-popup-details-box">
                            <div className="glm-popup-detail-row">
                                <span className="glm-popup-label">Section</span>
                                <span className="glm-popup-value">{popupSectionRaw}</span>
                            </div>
                            <div className="glm-popup-detail-row">
                                <span className="glm-popup-label">Grave Type</span>
                                <span className="glm-popup-value">{popupGraveType}</span>
                            </div>
                            <div className="glm-popup-detail-row">
                                <span className="glm-popup-label">Status</span>
                                <span className="glm-popup-value">{popupStatusLabel}</span>
                            </div>
                        </div>

                        {/* Action Buttons Row 1: Navigate on Map & Google Maps */}
                        <div className="glm-popup-actions-row">
                            <button
                                type="button"
                                className="glm-popup-btn-navigate"
                                onClick={() => handleNavigateOnMap(selectedPlot)}
                            >
                                Navigate
                            </button>

                            <a
                                className="glm-popup-btn-gmaps"
                                href={
                                    popupCenter
                                        ? `https://www.google.com/maps/dir/?api=1&destination=${popupCenter.lat},${popupCenter.lng}`
                                        : `https://www.google.com/maps/search/?api=1&query=14.8378234,120.7600800`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <ExternalLink size={15} />
                                <span>Google Maps</span>
                            </a>
                        </div>

                        {/* Action Button Row 2: Select Grave Lot (Only when Available) */}
                        {popupStatusKey === "available" && (
                            <button
                                type="button"
                                className="glm-popup-btn-select"
                                onClick={() => handleSelectGraveLot(selectedPlot)}
                            >
                                Select Grave Lot
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default GraveLotsModal;
