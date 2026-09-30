import { useState, useEffect } from "react";
import { X, History, FileText, CheckCircle, Clock, Calendar, Download } from "lucide-react";
import { getPaymentHistoryByPaymentId } from "../../../services/paymentServices";
import "./Payments.css";

export default function PaymentHistoryModal({ isOpen, account, onClose }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!isOpen || !account?.id) return;

        let isMounted = true;
        setLoading(true);

        getPaymentHistoryByPaymentId(account.id)
            .then((list) => {
                if (isMounted) {
                    setHistory(list || []);
                    setLoading(false);
                }
            })
            .catch((err) => {
                console.error("Error fetching payment history:", err);
                if (isMounted) setLoading(false);
            });

        return () => {
            isMounted = false;
        };
    }, [isOpen, account?.id]);

    if (!isOpen || !account) return null;

    const totalCollected = history.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

    return (
        <div className="pay-modal-overlay" onClick={onClose}>
            <div className="pay-modal-card history-modal-card" onClick={(e) => e.stopPropagation()}>
                {/* ── Modal Header ── */}
                <div className="pay-modal-header">
                    <div className="pay-modal-title-group">
                        <div className="pay-modal-icon-wrap amber">
                            <History size={20} />
                        </div>
                        <div>
                            <div className="pay-modal-title-row">
                                <h3 className="pay-modal-title">Payment &amp; Receipt History</h3>
                                <span className="pay-counter-pill">{history.length} receipt{history.length === 1 ? "" : "s"}</span>
                            </div>
                            <span className="pay-modal-subtitle">
                                {account.clientName} &bull; Lot {account.plotCode}
                            </span>
                        </div>
                    </div>
                    <button type="button" className="pay-modal-close-btn" onClick={onClose} title="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* ── Modal Body ── */}
                <div className="pay-modal-body">
                    {/* Summary Strip */}
                    <div className="pay-history-summary-strip">
                        <div className="strip-item">
                            <span className="strip-lbl">Total Logged Payments</span>
                            <span className="strip-val bold green">₱{totalCollected.toLocaleString()}</span>
                        </div>
                        <div className="strip-item">
                            <span className="strip-lbl">Remaining Account Balance</span>
                            <span className={`strip-val bold ${(account.balance || 0) > 0 ? "amber" : "gray"}`}>
                                ₱{Number(account.balance || 0).toLocaleString()}
                            </span>
                        </div>
                        <div className="strip-item">
                            <span className="strip-lbl">Total Contract Price</span>
                            <span className="strip-val">₱{Number(account.total || 0).toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Receipts List */}
                    {loading ? (
                        <div className="pay-history-loading">
                            <Clock size={24} className="spinning" />
                            <p>Loading payment history...</p>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="pay-history-empty">
                            <FileText size={32} strokeWidth={1.4} />
                            <h5>No Receipts Found</h5>
                            <p>No transactions have been recorded in the database for this account yet.</p>
                        </div>
                    ) : (
                        <div className="pay-history-table-wrap">
                            <table className="pay-history-table">
                                <thead>
                                    <tr>
                                        <th className="col-idx">#</th>
                                        <th className="col-receipt">Receipt Number</th>
                                        <th className="col-date">Payment Date</th>
                                        <th className="col-method">Payment Method</th>
                                        <th className="col-amount">Amount</th>
                                        <th className="col-notes">Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {history.map((item, idx) => (
                                        <tr key={item.id || idx}>
                                            <td className="idx-cell col-idx">{idx + 1}</td>
                                            <td className="col-receipt">
                                                <span className="receipt-badge monospace">
                                                    {item.receipt || `CHM-${item.id?.substring(0, 8)}`}
                                                </span>
                                            </td>
                                            <td className="col-date">
                                                <span className="date-cell">
                                                    <Calendar size={12} /> {item.payment_date || "—"}
                                                </span>
                                            </td>
                                            <td className="col-method">
                                                <span className="method-pill">
                                                    {item.payment_method || "Cash"}
                                                </span>
                                            </td>
                                            <td className="amount-cell bold col-amount">
                                                ₱{Number(item.amount || 0).toLocaleString()}
                                            </td>
                                            <td className="notes-cell col-notes">
                                                {item.notes || "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ── Modal Footer ── */}
                <div className="pay-modal-footer">
                    <button type="button" className="pay-btn-secondary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
