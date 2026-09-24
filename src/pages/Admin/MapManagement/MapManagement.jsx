import React, { useState, useEffect } from 'react';
import Header from '../../../components/Header/Header';
import SatelliteMap from './MapFolder/SatelliteMap';
import BuildPlotStudio from './MapFolder/BuildPlotStudio';
import { deletePlotController, subscribePlots } from '../../../controller/plotController';
import './MapManagement.css';

const ITEMS_PER_PAGE = 12;

function MapManagement() {
    const [plots, setPlots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedFilter, setSelectedFilter] = useState('ALL');
    const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
    const [currentPage, setCurrentPage] = useState(1);
    const [activeMode, setActiveMode] = useState('satellite');
    const [selectedPlotModal, setSelectedPlotModal] = useState(null);
    const [targetFocusPlot, setTargetFocusPlot] = useState(null);
    const [deleteFlow, setDeleteFlow] = useState(null); // { plot, step: 'confirm' | 'input' }
    const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [resetMapTrigger, setResetMapTrigger] = useState(0);

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

    const handleInitiateDelete = (plot) => {
        if (!plot) return;
        const statusKey = getStatusKey(plot.status);
        const isOccupied = statusKey === 'occupied' || Number(plot.occupiedCount || 0) > 0 || Boolean(plot.occupiedBy);

        if (isOccupied) {
            alert(`Cannot delete plot ${getLotTitle(plot)} because it is currently marked as Occupied.`);
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

        setTimeout(() => {
            const targetEl = document.querySelector('.satellite-map-outer-card') || document.querySelector('.map-view-actions') || document.getElementById('map');
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 120);
    };

    useEffect(() => {
        setLoading(true);
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

    // Helper to normalize status
    const getStatusKey = (status = '') => {
        const s = (status || '').toLowerCase().trim();
        if (s === 'available' || s === 'vacant' || s === 'open') return 'available';
        if (s === 'occupied' || s === 'taken' || s === 'used') return 'occupied';
        if (s === 'reserved' || s === 'pending') return 'reserved';
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

    // Helper to get plot type (prioritizing grave_type_id / grave_type / graveLotTypeID)
    const getLotType = (plot) => {
        return (
            plot.grave_type_id ||
            plot.grave_type ||
            plot.graveLotTypeID ||
            plot.graveLotType ||
            plot.graveType ||
            plot.lotType ||
            plot.type ||
            plot.plotType ||
            plot.category ||
            'Ground Grave'
        );
    };

    // Helper to extract section
    const getLotSection = (plot) => {
        if (plot.section) {
            return plot.section.startsWith('Section') ? plot.section : `Section ${plot.section}`;
        }
        const title = getLotTitle(plot);
        const match = title.match(/^(?:Lot\s+)?([A-Za-z])/i);
        if (match) return `Section ${match[1].toUpperCase()}`;
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

    // Generate combined unique Section + GraveLotType options
    const combinedOptionsMap = new Map();
    plots.forEach((p) => {
        const sec = getLotSection(p);
        const type = getLotType(p);
        const key = `${sec}__${type}`;
        if (!combinedOptionsMap.has(key)) {
            combinedOptionsMap.set(key, {
                key,
                section: sec,
                type: type,
                label: `${sec} - ${type}`,
            });
        }
    });

    const combinedOptions = Array.from(combinedOptionsMap.values()).sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
    );

    // Filter and sort plots by combined selection and status
    const filteredPlots = plots
        .filter((plot) => {
            if (selectedFilter !== 'ALL') {
                const sec = getLotSection(plot);
                const type = getLotType(plot);
                if (`${sec}__${type}` !== selectedFilter) return false;
            }
            if (selectedStatusFilter !== 'ALL') {
                const statusKey = getStatusKey(plot.status);
                if (statusKey !== selectedStatusFilter) return false;
            }
            return true;
        })
        .sort(sortPlots);

    // Pagination calculation (12 items per page)
    const totalPages = Math.ceil(filteredPlots.length / ITEMS_PER_PAGE) || 1;
    const paginatedPlots = filteredPlots.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // Calculate total available count
    const totalAvailableCount = filteredPlots.filter(
        (p) => getStatusKey(p.status) === 'available'
    ).length;

    return (
        <div className="map-mgmt-container">
            <Header page="map" />

            {/* MapView Card */}
            <div className="map-view-card">
                {/* Card Header */}
                <div className="map-card-header">
                    <div className="map-card-title-group">
                        <h2 className="map-card-title">MapView</h2>
                    </div>

                    <div className="map-card-actions">
                        {/* Combined Section + Grave Lot Type Dropdown */}
                        <div className="map-section-select-wrapper">
                            <select
                                className="map-section-select"
                                value={selectedFilter}
                                onChange={(e) => {
                                    setSelectedFilter(e.target.value);
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
                                    setCurrentPage(1);
                                }}
                                aria-label="Filter by status"
                            >
                                <option value="ALL">Status</option>
                                <option value="available">Available</option>
                                <option value="occupied">Occupied</option>
                                <option value="reserved">Reserved</option>
                            </select>
                            <div className="map-select-arrow">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                            </div>
                        </div>

                        <button
                            className="map-filter-btn"
                            type="button"
                            onClick={() => {
                                setSelectedFilter('ALL');
                                setSelectedStatusFilter('ALL');
                                setCurrentPage(1);
                            }}
                            title="Reset filter"
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                            </svg>
                            <span>Filter</span>
                        </button>
                    </div>
                </div>

                {/* Slots Grid Container (12 per page) */}
                <div className="slots-grid-container">
                    {loading ? (
                        <div className="slots-loading-state">
                            <div className="slots-spinner"></div>
                            <span>Loading plots from database...</span>
                        </div>
                    ) : paginatedPlots.length === 0 ? (
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
                        paginatedPlots.map((plot) => {
                            const statusKey = getStatusKey(plot.status);
                            const title = getLotTitle(plot);
                            const type = getLotType(plot);
                            const statusLabel = getStatusLabel(statusKey);

                            return (
                                <div
                                    key={plot.id}
                                    className={`slot-card ${statusKey}`}
                                    title={`${title} - Click to view & navigate`}
                                    onClick={() => setSelectedPlotModal(plot)}
                                >
                                    <div className="slot-status-icon">
                                        {statusKey === 'available' && (
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12" />
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
                                    {statusKey === 'occupied' && (
                                        <div className="slot-capacity">
                                            <span>Capacity:</span>
                                            <strong>
                                                {plot.occupiedCount != null
                                                    ? plot.occupiedCount
                                                    : 1} / {plot.maxCapacity != null
                                                        ? plot.maxCapacity
                                                        : 1}
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
                            <div className="map-pagination-controls">
                                <button
                                    className="map-page-btn"
                                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                                    disabled={currentPage === 1}
                                    aria-label="Previous Page"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="15 18 9 12 15 6" />
                                    </svg>
                                </button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                    <button
                                        key={page}
                                        className={`map-page-btn ${page === currentPage ? 'active' : ''}`}
                                        onClick={() => setCurrentPage(page)}
                                    >
                                        {page}
                                    </button>
                                ))}
                                <button
                                    className="map-page-btn"
                                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    aria-label="Next Page"
                                >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </button>
                            </div>
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
            </div>

            {/* Map Views: Satellite Mode vs Build Plot Mode */}
            {activeMode === 'satellite' ? (
                <div className="satellite-map-outer-card">
                    <SatelliteMap plots={filteredPlots} focusPlot={targetFocusPlot} resetTrigger={resetMapTrigger} />
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
