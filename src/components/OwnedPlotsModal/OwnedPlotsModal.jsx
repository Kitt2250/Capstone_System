import React, { useState, useMemo } from "react";
import { Search, X, Landmark, User, ShieldCheck, CheckCircle2 } from "lucide-react";
import "./OwnedPlotsModal.css";

export default function OwnedPlotsModal({
    isOpen,
    onClose,
    plots = [],
    clients = [],
    burials = [],
    selectedPlotId,
    onSelectPlot,
}) {
    const [searchTerm, setSearchTerm] = useState("");
    const [filterMode, setFilterMode] = useState("all"); // "all", "reserved", "partial"

    // Combine plots and strictly include ONLY "partial" and "reserved" statuses
    const mappedPlots = useMemo(() => {
        return plots
            .filter((p) => {
                const status = String(p.status || "").trim().toLowerCase();
                // Strictly exclude "available" or other statuses; only keep "partial" and "reserved"
                return status === "partial" || status === "reserved";
            })
            .map((p) => {
                const plotId = p.id;
                const plotCode = p.plotCode || p.name || `Lot ${plotId}`;
                const section = p.section || "A";
                const graveType = p.grave_type || p.graveType || "Grave Lot";
                const maxCapacity = Number(p.maxCapacity ?? p.capacity ?? 1);
                const status = String(p.status || "").trim().toLowerCase();

                // Find linked burials
                const plotBurials = burials.filter((b) => b.plot_id === plotId);
                const occupiedCount = plotBurials.length > 0 ? plotBurials.length : Number(p.occupiedCount ?? 0);

                // Find registered owner
                const ownerId = p.user_id || plotBurials[0]?.user_id;
                const ownerClient = clients.find(
                    (c) => c.user_id === ownerId || c.id === ownerId
                );

                const ownerName = ownerClient
                    ? `${ownerClient.first_name || ""} ${ownerClient.last_name || ""}`.trim()
                    : (p.owner_name || p.owner || (ownerId ? `Account ${ownerId.slice(0, 6)}` : "Registered Lot Owner"));

                const remainingSpace = Math.max(0, maxCapacity - occupiedCount);

                return {
                    id: plotId,
                    plotCode,
                    section,
                    graveType,
                    maxCapacity,
                    occupiedCount,
                    remainingSpace,
                    ownerId,
                    ownerName,
                    ownerClient,
                    status, // "reserved" or "partial"
                    rawPlot: p,
                };
            });
    }, [plots, clients, burials]);

    // Filter results by search query and category (all, reserved, partial)
    const filteredPlots = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();

        return mappedPlots.filter((item) => {
            // Filter by mode
            if (filterMode === "reserved" && item.status !== "reserved") return false;
            if (filterMode === "partial" && item.status !== "partial") return false;

            if (!query) return true;

            const matchCode = item.plotCode.toLowerCase().includes(query);
            const matchSection = item.section.toLowerCase().includes(query);
            const matchOwner = item.ownerName.toLowerCase().includes(query);
            const matchType = item.graveType.toLowerCase().includes(query);

            return matchCode || matchSection || matchOwner || matchType;
        });
    }, [mappedPlots, searchTerm, filterMode]);

    if (!isOpen) return null;

    return (
        <div className="opm-overlay" onClick={onClose}>
            <div className="opm-modal-card" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="opm-header">
                    <div className="opm-title-group">
                        <div className="opm-header-icon">
                            <Landmark size={20} />
                        </div>
                        <div>
                            <h3 className="opm-title">Select Owned Grave Lot</h3>
                            <p className="opm-subtitle">
                                Showing only <strong>Partial</strong> and <strong>Reserved</strong> cemetery lots for interment & transfer.
                            </p>
                        </div>
                    </div>
                    <button type="button" className="opm-close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="opm-toolbar">
                    <div className="opm-search-wrap">
                        <Search size={16} className="opm-search-icon" />
                        <input
                            type="text"
                            className="opm-search-input"
                            placeholder="Search by lot code (e.g. A-03), owner name, or section..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="opm-filter-chips">
                        <button
                            type="button"
                            className={`opm-filter-btn ${filterMode === "all" ? "active" : ""}`}
                            onClick={() => setFilterMode("all")}
                        >
                            All ({mappedPlots.length})
                        </button>
                        <button
                            type="button"
                            className={`opm-filter-btn ${filterMode === "reserved" ? "active" : ""}`}
                            onClick={() => setFilterMode("reserved")}
                        >
                            Reserved Only ({mappedPlots.filter((p) => p.status === "reserved").length})
                        </button>
                        <button
                            type="button"
                            className={`opm-filter-btn ${filterMode === "partial" ? "active" : ""}`}
                            onClick={() => setFilterMode("partial")}
                        >
                            Partial Only ({mappedPlots.filter((p) => p.status === "partial").length})
                        </button>
                    </div>
                </div>

                {/* Body Table */}
                <div className="opm-body">
                    {filteredPlots.length === 0 ? (
                        <div className="opm-empty-state">
                            <Landmark size={36} color="#94a3b8" />
                            <p style={{ fontWeight: 600, color: "#334155", margin: 0 }}>
                                No partial or reserved lots found {searchTerm ? `matching "${searchTerm}"` : ""}
                            </p>
                            <span style={{ fontSize: "0.775rem" }}>
                                Available unowned lots are excluded. Only registered partial and reserved lots appear here.
                            </span>
                        </div>
                    ) : (
                        <table className="opm-table">
                            <thead>
                                <tr>
                                    <th>Plot Code</th>
                                    <th>Status</th>
                                    <th>Registered Owner</th>
                                    <th>Type & Section</th>
                                    <th>Capacity</th>
                                    <th style={{ textAlign: "right", paddingRight: "16px" }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPlots.map((plot) => {
                                    const isCurrent = plot.id === selectedPlotId;
                                    return (
                                        <tr key={plot.id} className={isCurrent ? "selected" : ""}>
                                            <td>
                                                <div className="opm-plot-code-cell">{plot.plotCode}</div>
                                            </td>

                                            <td>
                                                {plot.status === "reserved" ? (
                                                    <span className="opm-pill blue">
                                                        <ShieldCheck size={11} /> Reserved (Owned)
                                                    </span>
                                                ) : (
                                                    <span className="opm-pill amber">
                                                        <ShieldCheck size={11} /> Partial ({plot.occupiedCount}/{plot.maxCapacity})
                                                    </span>
                                                )}
                                            </td>

                                            <td>
                                                <div className="opm-owner-name">{plot.ownerName}</div>
                                                <div className="opm-owner-meta">
                                                    {plot.ownerClient?.contact || "Verified Lot Deed"}
                                                </div>
                                            </td>

                                            <td>
                                                <div style={{ fontWeight: 600, color: "#334155" }}>
                                                    {plot.graveType}
                                                </div>
                                                <div className="opm-owner-meta">Section {plot.section}</div>
                                            </td>

                                            <td>
                                                {plot.remainingSpace > 0 ? (
                                                    <span style={{ fontSize: "0.775rem", fontWeight: 700, color: "#059669" }}>
                                                        {plot.remainingSpace} Space{plot.remainingSpace > 1 ? "s" : ""} Free
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: "0.775rem", fontWeight: 700, color: "#b45309" }}>
                                                        At Capacity
                                                    </span>
                                                )}
                                            </td>

                                            <td style={{ textAlign: "right", paddingRight: "16px" }}>
                                                {isCurrent ? (
                                                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.775rem", fontWeight: 700, color: "#059669" }}>
                                                        <CheckCircle2 size={15} /> Selected
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className="opm-select-btn"
                                                        onClick={() => onSelectPlot(plot, plot.ownerClient)}
                                                    >
                                                        Select Lot
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
