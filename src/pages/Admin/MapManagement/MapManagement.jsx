import React, { useState, useEffect } from 'react';
import Header from '../../../components/Header/Header';
import SatelliteMap from './MapFolder/SatelliteMap';
import BuildPlotStudio from './MapFolder/BuildPlotStudio';
import { deletePlotController, subscribePlots, syncAllPlotsOccupancy, updatePlotOccupancy } from '../../../controller/plotController';
import { subscribeGraveTypes } from '../../../services/graveServices';
import { getCentered12Plots } from '../../../services/plotServices';
import Pagination from '../../../components/Pagination/Pagination';
import {
    LayoutGrid,
    CheckCircle2,
    AlertCircle,
    Clock,
    Bookmark,
    Layers,
    ChevronDown,
    ChevronUp,
    Filter,
    X,
    Info,
    RefreshCw
} from 'lucide-react';
import './MapManagement.css';

const ITEMS_PER_PAGE = 12;

function MapManagement() {
    const [plots, setPlots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedFilter, setSelectedFilter] = useState('ALL');
    const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
    const [selectedGraveTypeFilter, setSelectedGraveTypeFilter] = useState('ALL');
    const [satelliteLimit, setSatelliteLimit] = useState(12);
    const [mapViewCollapsed, setMapViewCollapsed] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [activeMode, setActiveMode] = useState('satellite');
    const [selectedPlotModal, setSelectedPlotModal] = useState(null);
    const [targetFocusPlot, setTargetFocusPlot] = useState(null);
    const [deleteFlow, setDeleteFlow] = useState(null); // { plot, step: 'confirm' | 'input' }
    const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [resetMapTrigger, setResetMapTrigger] = useState(0);
    const [graveTypes, setGraveTypes] = useState([]);

    useEffect(() => {
        const unsub = subscribeGraveTypes(
            (types) => setGraveTypes(types || []),
            (err) => console.error('Error loading grave types in MapManagement:', err)
        );
        return () => unsub();
    }, []);

    const getPlotCenter = (plot) => {
        if (!plot) return null;
        if (plot.coordinates && Array.isArray(plot.coordinates) && plot.coordinates.length > 0) {
            const latlngs = plot.coordinates.map((c) => ({
                lat: Number(c.lat ?? c.latitude ?? (Array.isArray(c) ? c[0] : NaN)),
                lng: Number(c.lng ?? c.longitude ?? (Array.isArray(c) ? c[1] : NaN))
            })).filter((c) => !isNaN(c.lat) && !isNaN(c.lng));
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
        return null;
    };

    const handleInitiateDelete = async (plot) => {
        if (!plot) return;
        let currentPlot = plot;
        const statusKey = getStatusKey(currentPlot.status);
        let isOccupied = statusKey === 'occupied' || Number(currentPlot.occupiedCount || 0) > 0 || Boolean(currentPlot.occupiedBy);

        if (isOccupied) {
            // Live-check against actual burials in case the record was deleted
            try {
                const refreshed = await updatePlotOccupancy(currentPlot.id);
                if (refreshed && refreshed.occupiedCount === 0 && refreshed.status !== 'occupied') {
                    isOccupied = false;
                    currentPlot = { ...currentPlot, ...refreshed };
                }
            } catch (err) {
                console.warn('Could not re-verify plot occupancy:', err);
            }
        }

        if (isOccupied) {
            alert(`Cannot delete plot ${getLotTitle(currentPlot)} because it is currently marked as Occupied.`);
            return;
        }

        setSelectedPlotModal(null);
        setActiveMode('satellite');
        setTargetFocusPlot(plot);
        setDeleteFlow({ plot, step: 'confirm' });
        setDeleteConfirmInput('');

        setTimeout(() => {
            const targetEl = document.querySelector('.satellite-map-outer-card') || document.querySelector('.map-view-actions') || document.getElementById('map');
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 120);
    };

    const handleCancelDelete = () => {
        setDeleteFlow(null);
        setDeleteConfirmInput('');
        setTargetFocusPlot(null);
        setResetMapTrigger((t) => t + 1);
    };

    const handleDeletePlot = async (plotId) => {
        if (!plotId) return;
        const targetPlot = plots.find((p) => p.id === plotId);
        if (!targetPlot) return;

        setIsDeleting(true);
        try {
            await deletePlotController(plotId, {
                ...targetPlot,
                plotCode: getLotTitle(targetPlot),
                section: targetPlot?.section || 'N/A',
                graveType: getLotType(targetPlot)
            });

            setDeleteFlow(null);
            setDeleteConfirmInput('');
            setTargetFocusPlot(null);
            setResetMapTrigger((t) => t + 1);
        } catch (err) {
            console.error('Error deleting plot:', err);
            alert(err.message || 'Failed to delete plot.');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleNavigateOnMap = (plot) => {
        setSelectedPlotModal(null);
        setDeleteFlow(null);
        setActiveMode('satellite');
        setTargetFocusPlot(plot);

        // Center on the page containing the navigated plot
        const targetIdx = filteredPlots.findIndex((p) => String(p.id) === String(plot?.id));
        if (targetIdx !== -1) {
            const pageNum = Math.floor(targetIdx / ITEMS_PER_PAGE) + 1;
            setCurrentPage(pageNum);
        }

        setTimeout(() => {
            const targetEl = document.querySelector('.satellite-map-outer-card') || document.querySelector('.map-view-actions') || document.getElementById('map');
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 120);
    };

    useEffect(() => {
        setLoading(true);
        // Automatically sync plot occupancy against actual burial records to heal orphaned occupied plots
        syncAllPlotsOccupancy().catch((err) => console.error('Failed auto-sync occupancy:', err));

        // Real-time listener for the 'plots' collection via plotController
        const unsubscribe = subscribePlots(
            (plotList) => {
                setPlots(plotList);
                setLoading(false);
            },
            (error) => {
                console.error('Error fetching plots from Firestore:', error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    // Re-verify plot occupancy with burials collection when modal opens
    useEffect(() => {
        if (!selectedPlotModal?.id) return;
        updatePlotOccupancy(selectedPlotModal.id)
            .then((res) => {
                if (res) {
                    setSelectedPlotModal((prev) => (prev && prev.id === res.plotId ? { ...prev, ...res } : prev));
                }
            })
            .catch(() => {});
    }, [selectedPlotModal?.id]);

    // Helper to normalize status
    const getStatusKey = (status = '') => {
        const s = (status || '').toLowerCase().trim();
        if (s === 'available' || s === 'vacant' || s === 'open') return 'available';
        if (s === 'occupied' || s === 'taken' || s === 'used') return 'occupied';
        if (s === 'reserved' || s === 'pending') return 'reserved';
        if (s === 'partial') return 'partial';
        return 'available';
    };

    // Helper to format status display
    const getStatusLabel = (statusKey) => {
        switch (statusKey) {
            case 'available':
                return 'Available';
            case 'occupied':
                return 'Occupied';
            case 'reserved':
                return 'Reserved';
            case 'partial':
                return 'Partial';
            default:
                return 'Available';
        }
    };

    // Helper to get title / lot number (prioritizing plotCode)
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
            `Lot ${plot.id}`
        );
    };

    // Helper to check if a grave type is active
    const isGraveTypeActive = (gt) => {
        if (!gt) return true;
        if (gt.status !== undefined && gt.status !== null && gt.status !== '') {
            const s = String(gt.status).toLowerCase().trim();
            if (s === 'inactive' || s === 'disabled' || s === 'archived') return false;
            if (s === 'active' || s === 'enabled') return true;
        }
        if (gt.isActive !== undefined && gt.isActive !== null) {
            return Boolean(gt.isActive);
        }
        return true;
    };

    // Helper to get plot type prioritizing plot.grave_type
    const getLotType = (plot) => {
        if (!plot) return 'Ground Grave';

        // 1. Direct plot.grave_type
        const rawGraveType = plot.grave_type || plot.graveType || plot.lotType || plot.type;
        if (rawGraveType && typeof rawGraveType === 'string' && rawGraveType.trim()) {
            const trimmed = rawGraveType.trim();
            // If it's a code like GT001, try to resolve to human name from graveTypes
            if (/^GT\d+$/i.test(trimmed) && Array.isArray(graveTypes) && graveTypes.length > 0) {
                const matched = graveTypes.find((gt) => {
                    const gtId = String(gt.id || gt.grave_type_id || '').trim().toLowerCase();
                    return gtId === trimmed.toLowerCase();
                });
                if (matched?.name || matched?.grave_type) {
                    return String(matched.name || matched.grave_type).trim();
                }
            }
            return trimmed;
        }

        // 2. Resolve target ID (e.g. grave_type_id) via graveTypes collection
        const targetId = String(plot.grave_type_id || plot.graveLotTypeID || '').trim().toLowerCase();
        if (targetId && Array.isArray(graveTypes) && graveTypes.length > 0) {
            const matched = graveTypes.find((gt) => {
                const gtId = String(gt.id || gt.grave_type_id || '').trim().toLowerCase();
                return gtId === targetId;
            });
            if (matched) {
                const name = matched.name || matched.grave_type || matched.graveType;
                if (name) return String(name).trim();
            }
        }

        // 3. Fallback to plotCode prefix
        const title = getLotTitle(plot);
        if (/^SN/i.test(title)) return 'Single Niche';
        if (/^AP/i.test(title)) return 'Apartment';
        if (/^GB/i.test(title)) return 'Ground Burial';
        if (/^CB/i.test(title)) return 'Cherubim';
        if (/^MA/i.test(title)) return 'Mausoleum';
        if (/^CO/i.test(title)) return 'Columbarium';
        if (/^BV/i.test(title)) return 'Bone Vault';
        if (/^GT/i.test(title)) return 'Garden Type';
        if (/^LL/i.test(title)) return 'Lawn Lot';
        if (/^FE/i.test(title)) return 'Family Estate';

        return 'Ground Grave';
    };

    // Helper to extract section
    const getLotSection = (plot) => {
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
        return 'General Section';
    };

    // Helper to sort plots by Section and then by plot Index/Number within each section
    const sortPlots = (a, b) => {
        // 1. Section order
        const secA = getLotSection(a);
        const secB = getLotSection(b);
        const secCompare = secA.localeCompare(secB, undefined, { numeric: true, sensitivity: 'base' });
        if (secCompare !== 0) return secCompare;

        // 2. Explicit index/slotIndex/order within section
        const idxA = a.index ?? a.slotIndex ?? a.plotIndex ?? a.lotIndex ?? a.order ?? a.number;
        const idxB = b.index ?? b.slotIndex ?? b.plotIndex ?? b.lotIndex ?? b.order ?? b.number;
        if (idxA !== undefined && idxB !== undefined && !isNaN(idxA) && !isNaN(idxB)) {
            if (Number(idxA) !== Number(idxB)) return Number(idxA) - Number(idxB);
        }

        // 3. Natural alphanumeric sort by lot title / plotCode
        const titleA = getLotTitle(a);
        const titleB = getLotTitle(b);
        return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
    };

    // Generate combined unique GraveType & Section options directly based on plot.grave_type
    const combinedOptionsMap = new Map();
    plots.forEach((p) => {
        const type = getLotType(p);
        if (!type) return;

        const sec = getLotSection(p);
        const key = `${type}__${sec}`;
        if (!combinedOptionsMap.has(key)) {
            combinedOptionsMap.set(key, {
                key,
                section: sec,
                type: type,
                label: sec ? `${type} - ${sec}` : type,
            });
        }
    });

    const combinedOptions = Array.from(combinedOptionsMap.values()).sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
    );

    // Filter and sort plots by combined selection, grave type, and status
    const filteredPlots = plots
        .filter((plot) => {
            if (selectedGraveTypeFilter !== 'ALL') {
                const type = getLotType(plot);
                if (type.toLowerCase() !== selectedGraveTypeFilter.toLowerCase()) return false;
            }
            if (selectedFilter !== 'ALL') {
                const sec = getLotSection(plot);
                const type = getLotType(plot);
                if (`${type}__${sec}` !== selectedFilter) return false;
            }
            if (selectedStatusFilter !== 'ALL') {
                const statusKey = getStatusKey(plot.status);
                if (statusKey !== selectedStatusFilter) return false;
            }
            return true;
        })
        .sort(sortPlots);

    // Overall status counts across all plots
    const overallStats = React.useMemo(() => {
        let available = 0;
        let partial = 0;
        let occupied = 0;
        let reserved = 0;

        plots.forEach((p) => {
            const s = getStatusKey(p.status);
            if (s === 'available') available += 1;
            else if (s === 'partial') partial += 1;
            else if (s === 'occupied') occupied += 1;
            else if (s === 'reserved') reserved += 1;
            else available += 1;
        });

        const total = plots.length;
        return {
            total,
            available,
            partial,
            occupied,
            reserved,
            availablePct: total > 0 ? Math.round((available / total) * 100) : 0,
            partialPct: total > 0 ? Math.round((partial / total) * 100) : 0,
            occupiedPct: total > 0 ? Math.round((occupied / total) * 100) : 0,
            reservedPct: total > 0 ? Math.round((reserved / total) * 100) : 0,
        };
    }, [plots]);

    // Per-GraveType breakdown
    const graveTypeStats = React.useMemo(() => {
        const map = new Map();

        plots.forEach((p) => {
            const type = getLotType(p) || 'Other';
            const s = getStatusKey(p.status);

            if (!map.has(type)) {
                map.set(type, {
                    type,
                    total: 0,
                    available: 0,
                    partial: 0,
                    occupied: 0,
                    reserved: 0
                });
            }

            const item = map.get(type);
            item.total += 1;
            if (item[s] !== undefined) {
                item[s] += 1;
            } else {
                item.available += 1;
            }
        });

        // Also add any registered grave types from database with 0 plots
        graveTypes.forEach((gt) => {
            const name = String(gt.name || gt.grave_type || '').trim();
            if (name && !map.has(name) && isGraveTypeActive(gt)) {
                map.set(name, {
                    type: name,
                    total: 0,
                    available: 0,
                    partial: 0,
                    occupied: 0,
                    reserved: 0
                });
            }
        });

        return Array.from(map.values()).sort((a, b) => b.total - a.total);
    }, [plots, graveTypes]);

    const handleGraveTypeClick = (typeName) => {
        if (selectedGraveTypeFilter === typeName) {
            setSelectedGraveTypeFilter('ALL');
        } else {
            setSelectedGraveTypeFilter(typeName);
            if (selectedFilter !== 'ALL' && !selectedFilter.startsWith(`${typeName}__`)) {
                setSelectedFilter('ALL');
            }
        }
        setTargetFocusPlot(null);
        setCurrentPage(1);
    };

    const handleStatusCardClick = (statusKey) => {
        if (selectedStatusFilter === statusKey) {
            setSelectedStatusFilter('ALL');
        } else {
            setSelectedStatusFilter(statusKey);
        }
        setTargetFocusPlot(null);
        setCurrentPage(1);
    };

    // Pagination calculation (12 items per page)
    const totalPages = Math.ceil(filteredPlots.length / ITEMS_PER_PAGE) || 1;
    const paginatedPlots = filteredPlots.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // 12-plot centered slice around the navigated plot (5 before, navigate in middle, 6 after)
    const centered12Plots = React.useMemo(() => {
        if (!targetFocusPlot) return null;
        return getCentered12Plots(filteredPlots, targetFocusPlot);
    }, [filteredPlots, targetFocusPlot]);

    const displayedPlots = centered12Plots || paginatedPlots;

    // Dynamic plots for Satellite map respecting satelliteLimit and targetFocusPlot
    const satellitePlots = React.useMemo(() => {
        const sourceList = (targetFocusPlot && !filteredPlots.some((p) => String(p.id) === String(targetFocusPlot.id)))
            ? plots
            : filteredPlots;

        const limit = (satelliteLimit !== '' && parseInt(satelliteLimit, 10) > 0)
            ? parseInt(satelliteLimit, 10)
            : (satelliteLimit === '' ? sourceList.length : 12);

        if (limit >= sourceList.length || satelliteLimit === '') {
            return sourceList;
        }

        if (targetFocusPlot) {
            const targetId = String(targetFocusPlot.id || '');
            const targetCode = String(targetFocusPlot.plotCode || targetFocusPlot.name || '').toLowerCase().trim();

            let targetIdx = sourceList.findIndex((p) => {
                if (targetId && String(p.id) === targetId) return true;
                if (targetCode && String(p.plotCode || p.name || '').toLowerCase().trim() === targetCode) return true;
                return false;
            });

            if (targetIdx === -1) {
                return sourceList.slice(0, limit);
            }

            const halfBefore = Math.floor((limit - 1) / 2);
            let startIdx = targetIdx - halfBefore;
            let endIdx = startIdx + limit;

            if (startIdx < 0) {
                startIdx = 0;
                endIdx = Math.min(sourceList.length, limit);
            } else if (endIdx > sourceList.length) {
                endIdx = sourceList.length;
                startIdx = Math.max(0, endIdx - limit);
            }

            return sourceList.slice(startIdx, endIdx);
        }

        return sourceList.slice(0, limit);
    }, [filteredPlots, plots, targetFocusPlot, satelliteLimit]);

    const handleLocationSelectFromMap = (locationKeyOrLabel, limitedPlots, selectedOpt) => {
        const matchedCombo = combinedOptions.find(
            (c) => c.key === locationKeyOrLabel || c.label.toLowerCase() === String(locationKeyOrLabel).toLowerCase()
        );
        if (matchedCombo) {
            setSelectedFilter(matchedCombo.key);
        } else if (selectedOpt) {
            const fallbackKey = `${selectedOpt.type}__${selectedOpt.section}`;
            const fallbackCombo = combinedOptions.find((c) => c.key === fallbackKey);
            if (fallbackCombo) setSelectedFilter(fallbackCombo.key);
        }
        setSelectedStatusFilter('ALL');
        setTargetFocusPlot(null);
        setCurrentPage(1);
    };

    // Calculate total available count
    const totalAvailableCount = filteredPlots.filter(
        (p) => getStatusKey(p.status) === 'available'
    ).length;

    return (
        <div className="map-mgmt-container">
            <Header page="map" />

            {/* ===== Plot Classification Breakdown ===== */}
            <div className="map-dashboard-card">
                <div className="map-dash-header">
                    <h2 className="map-dash-title">
                        Plot Classification Breakdown
                    </h2>
                </div>

                {/* Per-GraveType Breakdown Grid */}
                <div className="map-dash-types-section">
                    <div className="map-types-grid">
                        {graveTypeStats.map((item) => {
                            const isSelected = selectedGraveTypeFilter.toLowerCase() === item.type.toLowerCase();
                            const availPct = item.total > 0 ? (item.available / item.total) * 100 : 0;
                            const partPct = item.total > 0 ? (item.partial / item.total) * 100 : 0;
                            const occPct = item.total > 0 ? (item.occupied / item.total) * 100 : 0;
                            const resPct = item.total > 0 ? (item.reserved / item.total) * 100 : 0;

                            return (
                                <div
                                    key={item.type}
                                    className={`map-type-card ${isSelected ? 'type-card-active' : ''}`}
                                    onClick={() => handleGraveTypeClick(item.type)}
                                    title={`Filter map to ${item.type}`}
                                >
                                    <div className="map-type-card-top">
                                        <span className="map-type-name">{item.type}</span>
                                        <span className="map-type-total-pill">
                                            {item.total} plot{item.total === 1 ? '' : 's'}
                                        </span>
                                    </div>

                                    {/* Multi-color visual progress bar */}
                                    <div className="map-type-progress-bar">
                                        {availPct > 0 && (
                                            <div
                                                className="prog-seg prog-avail"
                                                style={{ width: `${availPct}%` }}
                                                title={`Available: ${item.available} (${Math.round(availPct)}%)`}
                                            />
                                        )}
                                        {partPct > 0 && (
                                            <div
                                                className="prog-seg prog-part"
                                                style={{ width: `${partPct}%` }}
                                                title={`Partial: ${item.partial} (${Math.round(partPct)}%)`}
                                            />
                                        )}
                                        {occPct > 0 && (
                                            <div
                                                className="prog-seg prog-occ"
                                                style={{ width: `${occPct}%` }}
                                                title={`Occupied: ${item.occupied} (${Math.round(occPct)}%)`}
                                            />
                                        )}
                                        {resPct > 0 && (
                                            <div
                                                className="prog-seg prog-res"
                                                style={{ width: `${resPct}%` }}
                                                title={`Reserved: ${item.reserved} (${Math.round(resPct)}%)`}
                                            />
                                        )}
                                    </div>

                                    {/* 4 Status Pill Badges */}
                                    <div className="map-type-pills-row">
                                        <div className="type-stat-pill pill-avail">
                                            <span className="stat-dot dot-green" />
                                            <span className="stat-label">Available:</span>
                                            <strong className="stat-val">{item.available}</strong>
                                        </div>
                                        <div className="type-stat-pill pill-part">
                                            <span className="stat-dot dot-amber" />
                                            <span className="stat-label">Partial:</span>
                                            <strong className="stat-val">{item.partial}</strong>
                                        </div>
                                        <div className="type-stat-pill pill-occ">
                                            <span className="stat-dot dot-red" />
                                            <span className="stat-label">Occupied:</span>
                                            <strong className="stat-val">{item.occupied}</strong>
                                        </div>
                                        <div className="type-stat-pill pill-res">
                                            <span className="stat-dot dot-purple" />
                                            <span className="stat-label">Reserved:</span>
                                            <strong className="stat-val">{item.reserved}</strong>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* MapView Card */}
            <div className={`map-view-card ${mapViewCollapsed ? 'is-collapsed' : ''}`}>
                {/* Card Header */}
                <div className="map-card-header">
                    <div className="map-card-title-group">
                        <h2 className="map-card-title">MapView</h2>
                        {mapViewCollapsed && (
                            <span className="map-collapsed-pill">Collapsed</span>
                        )}
                    </div>

                    <div className="map-card-actions">
                        {/* Combined Section + Grave Lot Type Dropdown */}
                        <div className="map-section-select-wrapper">
                            <select
                                className="map-section-select"
                                value={selectedFilter}
                                onChange={(e) => {
                                    setSelectedFilter(e.target.value);
                                    setTargetFocusPlot(null);
                                    setCurrentPage(1);
                                }}
                                aria-label="Filter by section and grave lot type"
                            >
                                <option value="ALL">Grave Type</option>
                                {combinedOptions.map((combo) => (
                                    <option key={combo.key} value={combo.key}>
                                        {combo.label}
                                    </option>
                                ))}
                            </select>
                            <div className="map-select-arrow">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </div>
                        </div>

                        {/* Status Dropdown */}
                        <div className="map-section-select-wrapper">
                            <select
                                className="map-section-select"
                                value={selectedStatusFilter}
                                onChange={(e) => {
                                    setSelectedStatusFilter(e.target.value);
                                    setTargetFocusPlot(null);
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
                            <div className="map-select-arrow">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </div>
                        </div>

                        {/* Collapse / Expand MapView Button */}
                        <button
                            type="button"
                            className={`map-collapse-toggle-btn ${mapViewCollapsed ? 'collapsed' : ''}`}
                            onClick={() => setMapViewCollapsed((prev) => !prev)}
                            title={mapViewCollapsed ? "Expand MapView Slots" : "Collapse MapView Slots"}
                        >
                            <span>{mapViewCollapsed ? "Expand" : "Collapse"}</span>
                            {mapViewCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        </button>
                    </div>
                </div>

                {/* Slots Grid & Controls (Collapsible) */}
                {!mapViewCollapsed && (
                    <>
                        {/* Slots Grid Container (12 per page) */}
                        <div className="slots-grid-container">
                            {loading ? (
                                <div className="slots-loading-state">
                                    <div className="slots-spinner"></div>
                                    <span>Loading plots from database...</span>
                                </div>
                            ) : displayedPlots.length === 0 ? (
                                <div className="slots-empty-state">
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="7" height="7" rx="1.5" />
                                        <rect x="14" y="3" width="7" height="7" rx="1.5" />
                                        <rect x="14" y="14" width="7" height="7" rx="1.5" />
                                        <rect x="3" y="14" width="7" height="7" rx="1.5" />
                                    </svg>
                                    <p>No plots found in this section.</p>
                                </div>
                            ) : (
                                displayedPlots.map((plot) => {
                                    const statusKey = getStatusKey(plot.status);
                                    const title = getLotTitle(plot);
                                    const type = getLotType(plot);
                                    const statusLabel = getStatusLabel(statusKey);
                                    const isNavigated = targetFocusPlot && (String(targetFocusPlot.id) === String(plot.id));

                                    return (
                                        <div
                                            key={plot.id}
                                            className={`slot-card ${statusKey} ${isNavigated ? 'navigated-focused' : ''}`}
                                            title={`${title} - Click to view & navigate`}
                                            onClick={() => setSelectedPlotModal(plot)}
                                        >
                                            <div className="slot-status-icon">
                                                {statusKey === 'available' && (
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <polyline points="20 6 9 17 4 12" />
                                                    </svg>
                                                )}
                                                {statusKey === 'partial' && (
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <line x1="12" y1="5" x2="12" y2="19" />
                                                        <line x1="5" y1="12" x2="12" y2="12" />
                                                    </svg>
                                                )}
                                                {statusKey === 'occupied' && (
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                        <line x1="18" y1="6" x2="6" y2="18" />
                                                        <line x1="6" y1="6" x2="18" y2="18" />
                                                    </svg>
                                                )}
                                                {statusKey === 'reserved' && (
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <circle cx="12" cy="12" r="10" />
                                                        <polyline points="12 6 12 12 16 14" />
                                                    </svg>
                                                )}
                                            </div>
                                            <div className="slot-name">{title}</div>
                                            <div className="slot-status-text">{statusLabel}</div>
                                            <div className="slot-type">{type}</div>
                                            {(statusKey === 'occupied' || statusKey === 'partial') && (
                                                <div className="slot-capacity">
                                                    <span>Capacity:</span>
                                                    <strong>
                                                        {plot.occupiedCount != null
                                                            ? plot.occupiedCount
                                                            : 0} / {plot.maxCapacity != null
                                                                ? plot.maxCapacity
                                                                : (plot.capacity != null ? plot.capacity : 1)}
                                                    </strong>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Pagination Bar */}
                        {!loading && filteredPlots.length > 0 && (
                            <div className="map-pagination-bar">
                                <span className="map-showing-text">
                                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
                                    {Math.min(currentPage * ITEMS_PER_PAGE, filteredPlots.length)} of{' '}
                                    {filteredPlots.length} slots
                                </span>
                                {totalPages > 1 && (
                                    <Pagination
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        onPageChange={(page) => {
                                            setTargetFocusPlot(null);
                                            setCurrentPage(page);
                                        }}
                                    />
                                )}
                            </div>
                        )}

                        {/* Card Footer / Legend */}
                        <div className="map-card-footer">
                            <div className="map-legend-items">
                                <div className="legend-item">
                                    <span className="legend-badge available"></span>
                                    <span>Available</span>
                                </div>
                                <div className="legend-item">
                                    <span className="legend-badge partial"></span>
                                    <span>Partial</span>
                                </div>
                                <div className="legend-item">
                                    <span className="legend-badge occupied"></span>
                                    <span>Occupied</span>
                                </div>
                                <div className="legend-item">
                                    <span className="legend-badge reserved"></span>
                                    <span>Reserved</span>
                                </div>
                            </div>

                            <div className="map-total-available">
                                <span className="total-dot"></span>
                                <span>Total Available: <span className="total-count">{loading ? '—' : totalAvailableCount}</span></span>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* View Mode Action Buttons */}
            <div className="map-view-actions">
                <button
                    className={`map-action-btn satellite-btn ${activeMode === 'satellite' ? 'active' : ''}`}
                    type="button"
                    onClick={() => setActiveMode('satellite')}
                    title="Satellite View"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                        <path d="M2 12h20" />
                    </svg>
                    <span>Satellite View</span>
                </button>

                <button
                    className={`map-action-btn build-plot-btn ${activeMode === 'build' ? 'active' : ''}`}
                    type="button"
                    onClick={() => setActiveMode('build')}
                    title="Build Plot"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                    </svg>
                    <span>Build Plot</span>
                </button>

                {/* Satellite Grave Limiting Control in Toolbar */}
                {activeMode === 'satellite' && (
                    <div className="satellite-limit-control-wrap">
                        <label htmlFor="sat-limit-input" className="sat-limit-label">
                            Show Grave Limit:
                        </label>
                        <input
                            id="sat-limit-input"
                            type="number"
                            min="1"
                            max={plots.length || 500}
                            className="sat-limit-input"
                            value={satelliteLimit}
                            onChange={(e) => setSatelliteLimit(e.target.value)}
                            placeholder="All"
                            title="Limit number of graves shown on Satellite map"
                        />
                        {satelliteLimit !== '' && (
                            <button
                                type="button"
                                className="sat-limit-all-btn"
                                onClick={() => setSatelliteLimit('')}
                                title="Show All Matching Plots"
                            >
                                All
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Map Views: Satellite Mode vs Build Plot Mode */}
            {activeMode === 'satellite' ? (
                <div className="satellite-map-outer-card">
                    <SatelliteMap
                        allPlots={plots}
                        plots={satellitePlots}
                        focusPlot={targetFocusPlot}
                        currentLocationKey={selectedFilter}
                        onLocationSelect={handleLocationSelectFromMap}
                        resetTrigger={resetMapTrigger}
                        plotLimit={satelliteLimit}
                        onPlotLimitChange={setSatelliteLimit}
                    />
                </div>
            ) : (
                <BuildPlotStudio onPlotSaved={() => { }} />
            )}

            {/* Slot Details & Navigation Modal */}
            {selectedPlotModal && (
                <div className="slot-nav-modal-backdrop" onClick={() => setSelectedPlotModal(null)}>
                    <div className="slot-nav-modal-box" onClick={(e) => e.stopPropagation()}>
                        <div className="slot-nav-modal-header">
                            <div className="slot-nav-badge-wrap">
                                <span className={`slot-nav-status-badge ${getStatusKey(selectedPlotModal.status)}`}>
                                    ● {getStatusLabel(getStatusKey(selectedPlotModal.status))}
                                </span>
                            </div>
                            <button
                                className="slot-nav-close-btn"
                                onClick={() => setSelectedPlotModal(null)}
                                title="Close"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="slot-nav-modal-content">
                            <h3 className="slot-nav-code">{getLotTitle(selectedPlotModal)}</h3>
                            <div className="slot-nav-details">
                                <div className="slot-nav-detail-row">
                                    <span className="nav-detail-label">Section</span>
                                    <span className="nav-detail-value">{selectedPlotModal.section || 'Unassigned'}</span>
                                </div>
                                <div className="slot-nav-detail-row">
                                    <span className="nav-detail-label">Grave Type</span>
                                    <span className="nav-detail-value">{getLotType(selectedPlotModal)}</span>
                                </div>
                                <div className="slot-nav-detail-row">
                                    <span className="nav-detail-label">Status</span>
                                    <span className="nav-detail-value capitalize">{getStatusLabel(getStatusKey(selectedPlotModal.status))}</span>
                                </div>
                                <div className="slot-nav-detail-row">
                                    <span className="nav-detail-label">Capacity</span>
                                    <span className="nav-detail-value">
                                        {selectedPlotModal.occupiedCount != null
                                            ? selectedPlotModal.occupiedCount
                                            : 0} / {selectedPlotModal.maxCapacity != null
                                                ? selectedPlotModal.maxCapacity
                                                : 1}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="slot-nav-modal-actions">
                            <button
                                className="slot-nav-btn primary"
                                onClick={() => handleNavigateOnMap(selectedPlotModal)}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="3 11 22 2 13 21 11 13 3 11" />
                                </svg>
                                <span>Navigate on Map</span>
                            </button>

                            {getPlotCenter(selectedPlotModal) && (
                                <a
                                    className="slot-nav-btn secondary"
                                    href={`https://www.google.com/maps/dir/?api=1&destination=${getPlotCenter(selectedPlotModal).lat},${getPlotCenter(selectedPlotModal).lng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open navigation in Google Maps"
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                        <polyline points="15 3 21 3 21 9" />
                                        <line x1="10" y1="14" x2="21" y2="3" />
                                    </svg>
                                    <span>Google Maps</span>
                                </a>
                            )}
                        </div>

                        {/* Delete Plot Action */}
                        <div className="slot-nav-modal-delete-row">
                            {getStatusKey(selectedPlotModal.status) === 'occupied' || Number(selectedPlotModal.occupiedCount || 0) > 0 || selectedPlotModal.occupiedBy ? (
                                <div style={{
                                    padding: '9px 14px',
                                    background: '#fee2e2',
                                    border: '1px solid #fecaca',
                                    borderRadius: '8px',
                                    color: '#b91c1c',
                                    fontSize: '12px',
                                    fontWeight: '700',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    width: '100%',
                                    boxSizing: 'border-box'
                                }}>
                                    <span>Occupied plot cannot be deleted</span>
                                </div>
                            ) : (
                                <button
                                    className="slot-nav-btn danger"
                                    onClick={() => handleInitiateDelete(selectedPlotModal)}
                                >
                                    <span>Delete Plot</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Interactive Delete Flow Over Map */}
            {deleteFlow && (
                <div className="slot-delete-flow-overlay" onClick={handleCancelDelete}>
                    <div className="slot-delete-flow-card" onClick={(e) => e.stopPropagation()}>
                        {deleteFlow.step === 'confirm' ? (
                            <>
                                <div className="slot-delete-flow-header">
                                    <h4 className="slot-delete-flow-title">Confirm Plot Deletion</h4>
                                    <button className="slot-nav-close-btn" onClick={handleCancelDelete} title="Cancel">✕</button>
                                </div>

                                <div className="slot-delete-flow-content">
                                    <p className="slot-delete-flow-desc">
                                        The map has navigated to <strong className="slot-delete-code-highlight">{getLotTitle(deleteFlow.plot)}</strong> ({deleteFlow.plot.section || 'Unassigned'} • {getLotType(deleteFlow.plot)}).
                                        <br />
                                        Do you want to proceed to delete this plot?
                                    </p>
                                </div>

                                <div className="slot-delete-flow-actions">
                                    <button className="slot-delete-flow-btn cancel" onClick={handleCancelDelete}>
                                        Cancel
                                    </button>
                                    <button
                                        className="slot-delete-flow-btn next"
                                        onClick={() => {
                                            setDeleteFlow({ ...deleteFlow, step: 'input' });
                                            setDeleteConfirmInput('');
                                        }}
                                    >
                                        Proceed to Delete
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="slot-delete-flow-header">
                                    <h4 className="slot-delete-flow-title">Confirm Deletion</h4>
                                    <button className="slot-nav-close-btn" onClick={handleCancelDelete} title="Cancel" disabled={isDeleting}>✕</button>
                                </div>

                                <div className="slot-delete-flow-content">
                                    <p className="slot-delete-flow-desc">
                                        Type <span className="slot-delete-code-highlight">{getLotTitle(deleteFlow.plot)}</span> below to confirm:
                                    </p>
                                    <input
                                        type="text"
                                        className="slot-delete-input"
                                        placeholder={`Type ${getLotTitle(deleteFlow.plot)}`}
                                        value={deleteConfirmInput}
                                        onChange={(e) => setDeleteConfirmInput(e.target.value)}
                                        autoFocus
                                    />
                                </div>

                                <div className="slot-delete-flow-actions">
                                    <button
                                        className="slot-delete-flow-btn cancel"
                                        onClick={handleCancelDelete}
                                        disabled={isDeleting}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="slot-delete-flow-btn confirm"
                                        onClick={() => handleDeletePlot(deleteFlow.plot.id)}
                                        disabled={
                                            isDeleting ||
                                            deleteConfirmInput.trim().toUpperCase() !==
                                            getLotTitle(deleteFlow.plot).trim().toUpperCase()
                                        }
                                    >
                                        {isDeleting ? 'Deleting...' : 'Delete Plot'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default MapManagement;
