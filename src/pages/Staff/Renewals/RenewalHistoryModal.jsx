import React, { useState, useEffect } from "react";
import {
    X,
    History,
    FileText,
    Calendar,
    Clock,
    RefreshCw,
    CheckCircle,
    Printer
} from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../../firebase/config";
import "./Renewals.css";

export default function RenewalHistoryModal({
    isOpen,
    account,
    onClose,
    onOpenRenewModal
}) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isOpen || !account) return;

        let isMounted = true;
        setLoading(true);

        const fetchHistory = async () => {
            try {
                const targetPlotId = account.plotId || account.id;
                const targetPlotCode = account.plotCode;
                const targetBurialId = account.burialId || account.id;

                // Fetch renewal records for this plot
                let list = [];
                if (targetPlotId) {
                    const renewSnap = await getDocs(
                        query(collection(db, "renewals"), where("plot_id", "==", targetPlotId))
                    );
                    list = renewSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
                }

                // Supplement or fallback by plot_code
                if (list.length === 0 && targetPlotCode) {
                    const renewByCodeSnap = await getDocs(
                        query(collection(db, "renewals"), where("plot_code", "==", targetPlotCode))
                    );
                    list = renewByCodeSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
                }

                // Sort descending by created_at / renewal_date
                list.sort((a, b) => {
                    const tA = a.created_at?.toMillis ? a.created_at.toMillis() : new Date(a.renewal_date || 0).getTime();
                    const tB = b.created_at?.toMillis ? b.created_at.toMillis() : new Date(b.renewal_date || 0).getTime();
                    return tB - tA;
                });

                if (isMounted) {
                    setHistory(list);
                    setLoading(false);
                }
            } catch (err) {
                console.error("Error fetching renewal history:", err);
                if (isMounted) setLoading(false);
            }
        };

        fetchHistory();

        return () => {
            isMounted = false;
        };
    }, [isOpen, account]);

    if (!isOpen || !account) return null;

    const totalFeesCollected = history.reduce((sum, h) => sum + Number(h.fee || 0), 0);

    return (
        <div className="renew-modal-overlay" onClick={onClose}>
            <div className="renew-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "720px" }}>
                {/* Header */}
                <div className="renew-modal-header">
                    <div className="renew-modal-title-group">
                        <div className="renew-modal-icon-wrap amber">
                            <History size={20} />
                        </div>
                        <div>
                            <h3 className="renew-modal-title">Contract Renewal History & Receipts</h3>
                            <span className="renew-modal-subtitle">
                                Lot {account.plotCode} &bull; {account.clientName}
                            </span>
                        </div>
                    </div>
                    <button type="button" className="renew-modal-close-btn" onClick={onClose} title="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="renew-modal-body">
                    {/* Summary Strip */}
                    <div style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "12px 18px",
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: "12px",
                        fontSize: "0.825rem"
                    }}>
                        <div>
                            <span style={{ color: "#64748b", display: "block", fontSize: "0.7rem", fontWeight: 700 }}>
                                TOTAL RENEWALS LOGGED
                            </span>
                            <strong style={{ color: "#0f172a", fontSize: "1.1rem" }}>
                                {history.length} {history.length === 1 ? "Renewal" : "Renewals"}
                            </strong>
                        </div>

                        <div>
                            <span style={{ color: "#64748b", display: "block", fontSize: "0.7rem", fontWeight: 700 }}>
                                TOTAL LEASE FEES PAID
                            </span>
                            <strong style={{ color: "#059669", fontSize: "1.1rem" }}>
                                ₱{totalFeesCollected.toLocaleString()}
                            </strong>
                        </div>

                        <div>
                            <span style={{ color: "#64748b", display: "block", fontSize: "0.7rem", fontWeight: 700 }}>
                                CURRENT MATURITY
                            </span>
                            <strong style={{ color: "#004d8c", fontSize: "1.1rem" }}>
                                {account.expirationDate || "N/A"}
                            </strong>
                        </div>
                    </div>

                    {/* Table / List */}
                    {loading ? (
                        <div style={{ padding: "40px 20px", textAlign: "center", color: "#64748b" }}>
                            <Clock size={24} className="spinning" />
                            <p style={{ marginTop: "8px", fontSize: "0.85rem" }}>Loading renewal records...</p>
                        </div>
                    ) : history.length === 0 ? (
                        <div style={{
                            padding: "40px 20px",
                            textAlign: "center",
                            background: "#f8fafc",
                            border: "1px dashed #cbd5e1",
                            borderRadius: "10px",
                            color: "#64748b"
                        }}>
                            <FileText size={36} color="#94a3b8" style={{ margin: "0 auto 8px" }} />
                            <h5 style={{ margin: "0 0 4px", fontSize: "0.95rem", color: "#1e293b", fontWeight: 700 }}>
                                No Prior Renewals Logged
                            </h5>
                            <p style={{ margin: 0, fontSize: "0.8rem", color: "#94a3b8" }}>
                                This grave lot has not recorded any lease renewals yet. It is running on its initial lease contract.
                            </p>
                        </div>
                    ) : (
                        <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", textAlign: "left" }}>
                                <thead>
                                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontWeight: 700 }}>
                                        <th style={{ padding: "10px 14px" }}>Receipt</th>
                                        <th style={{ padding: "10px 14px" }}>Date</th>
                                        <th style={{ padding: "10px 14px" }}>Extension</th>
                                        <th style={{ padding: "10px 14px" }}>Amount Paid</th>
                                        <th style={{ padding: "10px 14px" }}>New Expiration</th>
                                        <th style={{ padding: "10px 14px" }}>Method</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((item, idx) => (
                                        <tr
                                            key={item.id || idx}
                                            style={{
                                                borderBottom: idx !== history.length - 1 ? "1px solid #f1f5f9" : "none",
                                                background: idx % 2 === 0 ? "#ffffff" : "#fafafa"
                                            }}
                                        >
                                            <td style={{ padding: "10px 14px", fontFamily: "monospace", fontWeight: 700, color: "#004d8c" }}>
                                                {item.receipt || `CHM-${item.id?.substring(0, 7)}`}
                                            </td>
                                            <td style={{ padding: "10px 14px", color: "#334155" }}>
                                                {item.renewal_date || "—"}
                                            </td>
                                            <td style={{ padding: "10px 14px" }}>
                                                <span style={{
                                                    background: "#ecfdf5",
                                                    color: "#059669",
                                                    fontWeight: 700,
                                                    fontSize: "0.75rem",
                                                    padding: "2px 8px",
                                                    borderRadius: "9999px",
                                                    border: "1px solid #a7f3d0"
                                                }}>
                                                    +{item.years_added || 1} Year{Number(item.years_added) === 1 ? "" : "s"}
                                                </span>
                                            </td>
                                            <td style={{ padding: "10px 14px", fontWeight: 700, color: "#0f172a" }}>
                                                ₱{Number(item.fee || 0).toLocaleString()}
                                            </td>
                                            <td style={{ padding: "10px 14px", fontWeight: 600, color: "#0f766e" }}>
                                                {item.new_expiration_date || "—"}
                                            </td>
                                            <td style={{ padding: "10px 14px", color: "#64748b" }}>
                                                {item.payment_method || "Cash"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
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

                    {(account.status === "expired" || account.daysRemaining <= 0) && (
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
