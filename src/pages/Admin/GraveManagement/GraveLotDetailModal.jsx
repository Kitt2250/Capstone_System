import { useState } from "react";
import {
    X,
    User,
    Calendar,
    FileText,
    MapPin,
    Layers,
    CheckCircle,
    Clock,
    AlertCircle,
    RefreshCw,
    Phone,
    Home,
    Heart,
    ShieldCheck,
    CreditCard
} from "lucide-react";
import { updatePlotOccupancy } from "../../../services/plotServices";
import "./GraveLotDetailModal.css";

export default function GraveLotDetailModal({ isOpen, plot, onClose, onRefresh }) {
    const [syncing, setSyncing] = useState(false);
    const [feedback, setFeedback] = useState(null);

    if (!isOpen || !plot) return null;

    const burials = plot.plotBurials || [];
    const client = plot.client;
    const maxCap = Number(plot.maxCap ?? plot.maxCapacity ?? 1);
    const occupiedCount = burials.length > 0 ? burials.length : Number(plot.occupied ?? plot.occupiedCount ?? 0);
    const occupancyPercent = Math.min(100, Math.round((occupiedCount / Math.max(1, maxCap)) * 100));

    const handleSyncPlot = async () => {
        try {
            setSyncing(true);
            await updatePlotOccupancy(plot.id);
            setFeedback({ type: "success", text: "Plot occupancy status verified and synchronized with Firestore!" });
            if (onRefresh) await onRefresh();
            setTimeout(() => setFeedback(null), 4000);
        } catch (err) {
            setFeedback({ type: "error", text: err.message || "Failed to sync plot occupancy." });
            setTimeout(() => setFeedback(null), 4000);
        } finally {
            setSyncing(false);
        }
    };

    const getStatusBadge = (status) => {
        const s = (status || "").toLowerCase();
        if (s === "available") {
            return <span className="lot-modal-badge badge-available"><span className="lot-badge-dot" /> Available</span>;
        }
        if (s === "partial") {
            return <span className="lot-modal-badge badge-partial"><span className="lot-badge-dot" /> Partially Occupied</span>;
        }
        if (s === "occupied") {
            return <span className="lot-modal-badge badge-occupied"><span className="lot-badge-dot" /> Fully Occupied</span>;
        }
        if (s === "reserved") {
            return <span className="lot-modal-badge badge-reserved"><span className="lot-badge-dot" /> Reserved (Pre-Need)</span>;
        }
        return <span className="lot-modal-badge badge-available"><span className="lot-badge-dot" /> {status}</span>;
    };

    return (
        <div className="lot-modal-overlay" onClick={onClose}>
            <div className="lot-modal-card" onClick={(e) => e.stopPropagation()}>
                {/* ── Header ── */}
                <div className="lot-modal-header">
                    <div className="lot-modal-title-group">
                        <div className="lot-modal-icon-wrap">
                            <Layers size={20} />
                        </div>
                        <div>
                            <div className="lot-modal-code-row">
                                <h3 className="lot-modal-title">{plot.plotCode || "Grave Lot"}</h3>
                                {getStatusBadge(plot.status)}
                            </div>
                            <span className="lot-modal-subtitle">
                                Section {plot.section || "—"} &bull; {plot.graveTypeName || "Grave Lot"}
                            </span>
                        </div>
                    </div>
                    <button type="button" className="lot-modal-close-btn" onClick={onClose} title="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* ── Feedback Banner ── */}
                {feedback && (
                    <div className={`lot-feedback-box ${feedback.type}`}>
                        {feedback.type === "success" ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                        <span>{feedback.text}</span>
                    </div>
                )}

                {/* ── Modal Body Scrollable ── */}
                <div className="lot-modal-body">
                    {/* Stat Grid */}
                    <div className="lot-stats-grid">
                        <div className="lot-stat-item">
                            <span className="lot-stat-label">Grave Type</span>
                            <span className="lot-stat-val">{plot.graveTypeName || "Standard Lot"}</span>
                            {plot.lotPrice != null && (
                                <span className="lot-stat-sub">₱{Number(plot.lotPrice).toLocaleString()}</span>
                            )}
                        </div>
                        <div className="lot-stat-item">
                            <span className="lot-stat-label">Section</span>
                            <span className="lot-stat-val">Section {plot.section || "—"}</span>
                            <span className="lot-stat-sub">Cemetery Block</span>
                        </div>
                        <div className="lot-stat-item">
                            <span className="lot-stat-label">Occupancy</span>
                            <span className="lot-stat-val">
                                {occupiedCount} / {maxCap} slot{maxCap > 1 ? "s" : ""}
                            </span>
                            <div className="lot-occupancy-bar">
                                <div
                                    className="lot-occupancy-fill"
                                    style={{
                                        width: `${occupancyPercent}%`,
                                        backgroundColor:
                                            occupancyPercent >= 100 ? "#ef4444" : occupancyPercent > 0 ? "#f59e0b" : "#10b981",
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── Buried Deceased Records (The Core Burial Data) ── */}
                    <div className="lot-section-card">
                        <div className="lot-section-header">
                            <div className="lot-section-title-wrap">
                                <Heart size={16} className="lot-icon-deceased" />
                                <h4>Buried Individual(s) ({burials.length})</h4>
                            </div>
                            <span className="lot-section-count-badge">
                                {burials.length > 0 ? `${burials.length} Deceased Record(s)` : "Vacant Lot"}
                            </span>
                        </div>

                        {burials.length === 0 ? (
                            <div className="lot-empty-burials">
                                <Clock size={24} strokeWidth={1.5} />
                                <p>No burials registered in this lot yet.</p>
                                <span>This lot is currently ready and available for interments.</span>
                            </div>
                        ) : (
                            <div className="lot-burials-list">
                                {burials.map((burial, idx) => (
                                    <div key={burial.id || idx} className="lot-burial-item">
                                        <div className="lot-burial-item-top">
                                            <div className="lot-burial-avatar">
                                                <span>{burial.name ? burial.name.charAt(0).toUpperCase() : "D"}</span>
                                            </div>
                                            <div className="lot-burial-info">
                                                <h5 className="lot-deceased-name">{burial.name || "Unnamed Deceased"}</h5>
                                                <div className="lot-deceased-meta">
                                                    {burial.interment_type && (
                                                        <span className="lot-interment-pill">
                                                            {burial.interment_type}
                                                        </span>
                                                    )}
                                                    {burial.date_buried && (
                                                        <span className="lot-burial-date">
                                                            <Calendar size={12} /> Buried: {burial.date_buried}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="lot-burial-details-grid">
                                            {burial.date_of_death && (
                                                <div className="lot-detail-item">
                                                    <span className="detail-k">Date of Death:</span>
                                                    <span className="detail-v">{burial.date_of_death}</span>
                                                </div>
                                            )}
                                            {burial.date_of_birth && (
                                                <div className="lot-detail-item">
                                                    <span className="detail-k">Date of Birth:</span>
                                                    <span className="detail-v">{burial.date_of_birth}</span>
                                                </div>
                                            )}
                                        </div>

                                        {burial.documents && burial.documents.length > 0 && (
                                            <div className="lot-burial-docs">
                                                <span className="lot-docs-title">
                                                    <ShieldCheck size={12} /> Verified Documents:
                                                </span>
                                                <div className="lot-docs-tags">
                                                    {burial.documents.map((docName, dIdx) => (
                                                        <span key={dIdx} className="lot-doc-tag">
                                                            {docName}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Buyer / Client Information ── */}
                    <div className="lot-section-card">
                        <div className="lot-section-header">
                            <div className="lot-section-title-wrap">
                                <User size={16} className="lot-icon-client" />
                                <h4>Lot Owner / Client Information</h4>
                            </div>
                            {client ? (
                                <span className="lot-owner-assigned-pill">Assigned Owner</span>
                            ) : (
                                <span className="lot-owner-unassigned-pill">Unsold / Available</span>
                            )}
                        </div>

                        {client ? (
                            <div className="lot-client-info-grid">
                                <div className="lot-client-field">
                                    <span className="client-field-label">Full Name</span>
                                    <span className="client-field-value bold">
                                        {client.first_name} {client.last_name}
                                    </span>
                                </div>
                                <div className="lot-client-field">
                                    <span className="client-field-label">Relationship to Deceased</span>
                                    <span className="client-field-value">{client.relationship || "—"}</span>
                                </div>
                                <div className="lot-client-field">
                                    <span className="client-field-label">
                                        <Phone size={12} /> Contact Number
                                    </span>
                                    <span className="client-field-value">{client.contact || "—"}</span>
                                </div>
                                <div className="lot-client-field">
                                    <span className="client-field-label">
                                        <Home size={12} /> Registered Address
                                    </span>
                                    <span className="client-field-value">{client.address || "—"}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="lot-client-empty">
                                <p>No owner assigned yet. Available for purchase in Point of Sale.</p>
                            </div>
                        )}
                    </div>

                    {/* ── Payment Details ── */}
                    <div className="lot-section-card">
                        <div className="lot-section-header">
                            <div className="lot-section-title-wrap">
                                <CreditCard size={16} style={{ color: "#059669" }} />
                                <h4>Payment &amp; Billing Details</h4>
                            </div>
                            {plot.paymentCategory === "paid" && (
                                <span className="lot-table-status-pill status-available" style={{ width: "fit-content" }}>
                                    <span className="lot-badge-dot" /> Paid in Full
                                </span>
                            )}
                            {plot.paymentCategory === "overdue" && (
                                <span className="lot-table-status-pill status-occupied" style={{ width: "fit-content" }}>
                                    <span className="lot-badge-dot" /> Overdue
                                </span>
                            )}
                            {plot.paymentCategory === "installment" && (
                                <span className="lot-table-status-pill status-partial" style={{ width: "fit-content" }}>
                                    <span className="lot-badge-dot" /> Installment Active
                                </span>
                            )}
                            {plot.paymentCategory === "unsold" && (
                                <span className="lot-table-unassigned" style={{ width: "fit-content" }}>
                                    Unsold / Available
                                </span>
                            )}
                            {(!plot.paymentCategory || plot.paymentCategory === "unpaid") && (
                                <span className="lot-table-unassigned" style={{ width: "fit-content" }}>
                                    No Payment Document
                                </span>
                            )}
                        </div>

                        <div className="lot-client-info-grid">
                            <div className="lot-client-field">
                                <span className="client-field-label">Payment Status</span>
                                <span className="client-field-value bold">
                                    {plot.paymentCategory === "paid" && "Paid in Full"}
                                    {plot.paymentCategory === "overdue" && "Payment Overdue"}
                                    {plot.paymentCategory === "installment" && "Active Installment"}
                                    {plot.paymentCategory === "unsold" && "Available for Purchase"}
                                    {(!plot.paymentCategory || plot.paymentCategory === "unpaid") && "No Payment Record"}
                                </span>
                            </div>

                            <div className="lot-client-field">
                                <span className="client-field-label">Total Amount</span>
                                <span className="client-field-value" style={{ fontWeight: 700, color: "#059669" }}>
                                    ₱{Number(plot.payment?.total ?? plot.lotPrice ?? 0).toLocaleString()}
                                </span>
                            </div>

                            <div className="lot-client-field">
                                <span className="client-field-label">Remaining Balance</span>
                                <span className="client-field-value" style={{ fontWeight: 700, color: (plot.payment?.balance || 0) > 0 ? "#dc2626" : "#475569" }}>
                                    ₱{Number(plot.payment?.balance ?? 0).toLocaleString()}
                                </span>
                            </div>

                            {plot.paymentDueDate && (plot.paymentCategory === "installment" || plot.paymentCategory === "overdue") && (
                                <div className="lot-client-field">
                                    <span className="client-field-label">
                                        {plot.paymentCategory === "overdue" ? "Past Due Since" : "Next Payment Due"}
                                    </span>
                                    <span className="client-field-value bold" style={{ color: plot.paymentCategory === "overdue" ? "#dc2626" : "#0f172a" }}>
                                        {plot.paymentDueDate}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── GPS Map Coordinates ── */}
                    {plot.coordinates && Array.isArray(plot.coordinates) && plot.coordinates.length > 0 && (
                        <div className="lot-section-card">
                            <div className="lot-section-header">
                                <div className="lot-section-title-wrap">
                                    <MapPin size={16} style={{ color: "#0284c7" }} />
                                    <h4>Map Boundaries &amp; Coordinates</h4>
                                </div>
                                <span className="lot-coords-pill">
                                    {plot.coordinates.length} Boundary Points
                                </span>
                            </div>
                            <div className="lot-coords-summary">
                                <span className="coords-label">GPS Vertex Sample:</span>
                                <span className="coords-val monospace">
                                    Lat: {plot.coordinates[0]?.lat?.toFixed(6) || "—"}, Lng: {plot.coordinates[0]?.lng?.toFixed(6) || "—"}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Footer Actions ── */}
                <div className="lot-modal-footer">
                    <button
                        type="button"
                        className="lot-sync-btn"
                        onClick={handleSyncPlot}
                        disabled={syncing}
                        title="Recheck and sync plot occupancy status against burials in Firestore"
                    >
                        <RefreshCw size={14} className={syncing ? "spinning" : ""} />
                        {syncing ? "Verifying..." : "Sync Occupancy"}
                    </button>
                    <button type="button" className="lot-close-action-btn" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
