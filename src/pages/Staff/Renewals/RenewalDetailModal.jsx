import React from "react";
import {
    X,
    Calendar,
    Layers,
    User,
    Clock,
    CheckCircle,
    AlertTriangle,
    FileText,
    RefreshCw,
    MapPin,
    ShieldCheck,
    Check
} from "lucide-react";
import "./Renewals.css";

export default function RenewalDetailModal({
    isOpen,
    account,
    todayStr,
    onClose,
    onOpenRenewModal
}) {
    if (!isOpen || !account) return null;

    const isExpired = account.status === "expired";
    const isExpiringSoon = account.status === "expiring_soon";

    return (
        <div className="renew-modal-overlay" onClick={onClose}>
            <div className="renew-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "660px" }}>
                {/* Header */}
                <div className="renew-modal-header">
                    <div className="renew-modal-title-group">
                        <div className="renew-modal-icon-wrap blue">
                            <FileText size={20} />
                        </div>
                        <div>
                            <h3 className="renew-modal-title">Grave Lease Contract Details</h3>
                            <span className="renew-modal-subtitle">
                                Lot {account.plotCode} &bull; {account.graveTypeName}
                            </span>
                        </div>
                    </div>
                    <button type="button" className="renew-modal-close-btn" onClick={onClose} title="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="renew-modal-body">
                    {/* Status Alert Banner */}
                    <div style={{
                        padding: "12px 16px",
                        borderRadius: "10px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        backgroundColor: isExpired ? "#fef2f2" : isExpiringSoon ? "#fffbeb" : "#f0fdf4",
                        border: `1px solid ${isExpired ? "#fecaca" : isExpiringSoon ? "#fde68a" : "#bbf7d0"}`,
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            {isExpired ? (
                                <AlertTriangle size={18} color="#dc2626" />
                            ) : isExpiringSoon ? (
                                <Clock size={18} color="#d97706" />
                            ) : (
                                <CheckCircle size={18} color="#16a34a" />
                            )}
                            <div>
                                <span style={{
                                    display: "block",
                                    fontSize: "0.85rem",
                                    fontWeight: 700,
                                    color: isExpired ? "#991b1b" : isExpiringSoon ? "#92400e" : "#166534"
                                }}>
                                    {(isExpired || account.daysRemaining <= 0)
                                        ? account.daysRemaining === 0
                                            ? "Contract Expired Today (0 days left)"
                                            : `Contract Expired (${Math.abs(account.daysRemaining)} days overdue)`
                                        : isExpiringSoon
                                            ? `Lease Expiring Soon (${account.daysRemaining} days left)`
                                            : `Active Lease Contract (${account.daysRemaining} days left)`}
                                </span>
                                <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                                    Contract maturity date: {account.expirationDate || "N/A"}
                                </span>
                            </div>
                        </div>

                        <span className={`renew-status-pill status-${account.status}`}>
                            <span className="renew-dot"></span>
                            {account.status.replace("_", " ")}
                        </span>
                    </div>

                    {/* Lease Timeline Progress Track */}
                    <div style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "14px 16px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px"
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", fontWeight: 700, color: "#475569" }}>
                            <span>LEASE LIFECYCLE PROGRESS</span>
                            <span>{account.progressPercent}% of contract elapsed</span>
                        </div>

                        <div className="renew-progress-track" style={{ height: "8px" }}>
                            <div
                                className={`renew-progress-fill fill-${account.progressColor}`}
                                style={{ width: `${account.progressPercent}%` }}
                            ></div>
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.725rem", color: "#64748b" }}>
                            <span>Start: <strong>{account.startDate}</strong></span>
                            <span>Duration: <strong>{account.contractYears} Years</strong></span>
                            <span>Expiration: <strong style={{ color: (isExpired || account.daysRemaining <= 30) ? "#dc2626" : "#0f766e" }}>{account.expirationDate}</strong></span>
                        </div>
                    </div>

                    {/* Two Column Grid: Account & Grave Lot Info */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                        {/* Account & Family */}
                        <div style={{
                            background: "#ffffff",
                            border: "1px solid #e2e8f0",
                            borderRadius: "10px",
                            padding: "14px 16px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#004d8c", fontWeight: 700, fontSize: "0.8rem", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                                <User size={15} />
                                <span>CLIENT & FAMILY INFO</span>
                            </div>

                            <div>
                                <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>OWNER / APPLICANT</span>
                                <strong style={{ fontSize: "0.9rem", color: "#0f172a" }}>{account.clientName}</strong>
                            </div>

                            <div>
                                <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>CONTACT NUMBER</span>
                                <span style={{ fontSize: "0.825rem", color: "#334155" }}>{account.clientContact || "None listed"}</span>
                            </div>

                            <div>
                                <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>EMAIL / ADDRESS</span>
                                <span style={{ fontSize: "0.825rem", color: "#334155" }}>{account.clientEmail || account.clientAddress || "None listed"}</span>
                            </div>
                        </div>

                        {/* Grave Lot & Interred Record */}
                        <div style={{
                            background: "#ffffff",
                            border: "1px solid #e2e8f0",
                            borderRadius: "10px",
                            padding: "14px 16px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#0f766e", fontWeight: 700, fontSize: "0.8rem", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                                <MapPin size={15} />
                                <span>PLOT & DECEASED RECORD</span>
                            </div>

                            <div>
                                <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>GRAVE LOT CODE & TYPE</span>
                                <strong style={{ fontSize: "0.9rem", color: "#0f172a" }}>
                                    Lot {account.plotCode} &bull; {account.graveTypeName}
                                </strong>
                            </div>

                            <div>
                                <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>
                                    INTERRED / DECEASED OCCUPANTS ({account.burials?.length || account.burialCount || 0})
                                </span>
                                {Array.isArray(account.burials) && account.burials.length > 0 ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                                        {account.burials.map((b, idx) => (
                                            <span key={idx} style={{ fontSize: "0.85rem", color: "#0f766e", fontWeight: 600 }}>
                                                &bull; {b.name || b.deceased_name || "Unknown"}
                                                {b.date_buried ? ` (Buried: ${b.date_buried})` : ""}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <strong style={{ fontSize: "0.85rem", color: "#0f766e" }}>
                                        {account.deceasedName || "None (Pre-Need Lot)"}
                                    </strong>
                                )}
                            </div>

                            <div>
                                <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block" }}>BURIAL DATE / LEASE START</span>
                                <span style={{ fontSize: "0.825rem", color: "#334155" }}>{account.startDate || account.burialDate || "N/A"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Contract Configuration & History Statistics */}
                    <div style={{
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "14px 16px",
                        display: "grid",
                        gridTemplateColumns: "repeat(4, 1fr)",
                        gap: "12px",
                        textAlign: "center"
                    }}>
                        <div>
                            <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block", textTransform: "uppercase" }}>
                                TOTAL RENEWALS
                            </span>
                            <strong style={{ fontSize: "1.15rem", color: "#0f172a" }}>
                                {account.renewalCount || 0}x
                            </strong>
                            <span style={{ fontSize: "0.7rem", color: "#94a3b8", display: "block" }}>Times Extended</span>
                        </div>

                        <div>
                            <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block", textTransform: "uppercase" }}>
                                CONTRACT LEASE TERM
                            </span>
                            <strong style={{ fontSize: "1.05rem", color: "#0f766e" }}>
                                {account.renewalCount > 0 ? "Renewed Lease" : `${account.contractYears || 7} Years`}
                            </strong>
                            <span style={{ fontSize: "0.7rem", color: "#94a3b8", display: "block" }}>
                                {account.renewalCount > 0 ? "Extended Burial Lease" : "Initial Burial Term"}
                            </span>
                        </div>

                        <div>
                            <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block", textTransform: "uppercase" }}>
                                ANNUAL RENEWAL FEE
                            </span>
                            <strong style={{ fontSize: "1.05rem", color: "#059669" }}>
                                ₱3,500 / Year
                            </strong>
                            <span style={{ fontSize: "0.7rem", color: "#94a3b8", display: "block" }}>Post-7-Year Rate</span>
                        </div>

                        <div>
                            <span style={{ fontSize: "0.7rem", color: "#64748b", display: "block", textTransform: "uppercase" }}>
                                LAST RENEWED
                            </span>
                            <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>
                                {account.lastRenewedDate || "Original"}
                            </strong>
                            <span style={{ fontSize: "0.7rem", color: "#94a3b8", display: "block" }}>Recorded on file</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="renew-modal-footer">
                    <button
                        type="button"
                        className="renew-btn-details"
                        onClick={onClose}
                    >
                        Close
                    </button>

                    {(isExpired || account.daysRemaining <= 0) && (
                        <button
                            type="button"
                            className="renew-btn-renew"
                            onClick={() => {
                                onClose();
                                if (onOpenRenewModal) onOpenRenewModal(account);
                            }}
                        >
                            <RefreshCw size={14} />
                            <span>Renew Contract Now</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
