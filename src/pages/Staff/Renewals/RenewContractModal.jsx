import React, { useState, useEffect } from "react";
import {
    X,
    RefreshCw,
    Layers,
    CreditCard,
    CheckCircle,
    AlertCircle,
    Clock
} from "lucide-react";
import { processContractRenewal } from "../../../services/renewalServices";
import "./Renewals.css";

export default function RenewContractModal({
    isOpen,
    account,
    todayStr,
    onClose,
    onRenewalSuccess
}) {
    const renewalYears = 1; // Fixed 1-year annual burial lease extension
    const paymentMethod = "Cash"; // Strictly cash payment only
    const [amountTendered, setAmountTendered] = useState("3500");
    const [notes, setNotes] = useState("");
    const [processing, setProcessing] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    // Annual renewal rate: ₱3,500 per year after the 7-year term
    const annualRate = Number(
        account?.renewalRatePerYear ||
        (account?.graveTypeObj?.renewal_fee && account?.graveTypeObj?.contract_years
            ? Math.round(Number(account.graveTypeObj.renewal_fee) / Number(account.graveTypeObj.contract_years))
            : 3500) ||
        3500
    );

    const renewalFee = annualRate;

    useEffect(() => {
        if (account) {
            setAmountTendered(String(annualRate));
            setNotes(`Burial lease renewal (1 yr @ ₱${annualRate.toLocaleString()}) for ${account.deceasedName || "burial"} - Lot ${account.plotCode}.`);
            setErrorMsg("");
        }
    }, [account, annualRate]);

    if (!isOpen || !account) return null;

    const currentExpiry = account.expirationDate || todayStr;
    const baseDate = currentExpiry > todayStr ? new Date(currentExpiry) : new Date(todayStr);

    // Compute new expiration date (+1 Year)
    const calcNewExpiry = () => {
        const d = new Date(baseDate);
        d.setFullYear(d.getFullYear() + 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
    };

    const newExpirationDate = calcNewExpiry();
    const feeNum = Number(renewalFee) || 0;
    const tenderedNum = parseFloat(amountTendered) || 0;
    const change = tenderedNum >= feeNum ? tenderedNum - feeNum : 0;

    const handleConfirmRenewal = async () => {
        setErrorMsg("");

        if (isNaN(tenderedNum) || tenderedNum < feeNum) {
            setErrorMsg(`Insufficient cash tendered. Total fee due is ₱${feeNum.toLocaleString()}.`);
            return;
        }

        setProcessing(true);
        try {
            const result = await processContractRenewal({
                burialId: account.burialId || account.id || null,
                plotId: account.plotId || account.plot?.id || null,
                plotCode: account.plotCode,
                uid: account.user_id || account.ownerId || null,
                clientName: account.clientName,
                deceasedName: account.deceasedName,
                previousExpirationDate: currentExpiry,
                newExpirationDate,
                renewalYears: 1,
                renewalFee: feeNum,
                paymentMethod: "Cash",
                amountTendered: tenderedNum,
                change,
                notes,
                paymentId: account.payment?.id || null,
            });

            if (onRenewalSuccess) {
                onRenewalSuccess({
                    ...result,
                    clientName: account.clientName,
                    plotCode: account.plotCode,
                    renewalYears: 1,
                    fee: feeNum,
                });
            }
            onClose();
        } catch (err) {
            console.error("Error processing contract renewal:", err);
            setErrorMsg(err.message || "Failed to process contract renewal. Please check inputs.");
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="renew-modal-overlay" onClick={onClose}>
            <div className="renew-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "640px" }}>
                {/* Header */}
                <div className="renew-modal-header">
                    <div className="renew-modal-title-group">
                        <div className="renew-modal-icon-wrap teal">
                            <RefreshCw size={20} />
                        </div>
                        <div>
                            <h3 className="renew-modal-title">Renew Grave Lease Contract</h3>
                            <span className="renew-modal-subtitle">
                                Lot {account.plotCode} ({account.graveTypeName}) &bull; {account.clientName}
                            </span>
                        </div>
                    </div>
                    <button type="button" className="renew-modal-close-btn" onClick={onClose} title="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="renew-modal-body">
                    {errorMsg && (
                        <div className="renew-feedback-banner error">
                            <AlertCircle size={16} />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {/* Summary Overview Strip */}
                    <div style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "10px",
                        padding: "14px 16px",
                        display: "grid",
                        gridTemplateColumns: "repeat(2, 1fr)",
                        gap: "12px",
                        fontSize: "0.825rem"
                    }}>
                        <div>
                            <span style={{ color: "#64748b", display: "block", fontSize: "0.725rem", fontWeight: 700 }}>
                                ACCOUNT HOLDER / FAMILY
                            </span>
                            <strong style={{ color: "#0f172a", fontSize: "0.925rem" }}>{account.clientName}</strong>
                            <div style={{ color: "#64748b", marginTop: "2px" }}>{account.clientContact || "On File"}</div>
                        </div>

                        <div>
                            <span style={{ color: "#64748b", display: "block", fontSize: "0.725rem", fontWeight: 700 }}>
                                ASSIGNED GRAVE PLOT
                            </span>
                            <strong style={{ color: "#0f172a", fontSize: "0.925rem" }}>
                                Lot {account.plotCode} ({account.graveTypeName})
                            </strong>
                            <div style={{ color: "#0f766e", fontWeight: 600, marginTop: "2px" }}>
                                {account.deceasedName ? `Deceased: ${account.deceasedName}` : "Pre-Need Reserved"}
                            </div>
                        </div>
                    </div>

                    {/* Expiration Timeline Comparison Card */}
                    <div style={{
                        background: "#ffffff",
                        border: "1px solid #cbd5e1",
                        borderRadius: "10px",
                        padding: "16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px"
                    }}>
                        <div>
                            <span style={{ fontSize: "0.725rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                                CURRENT EXPIRATION
                            </span>
                            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: (account.status === "expired" || account.daysRemaining <= 0) ? "#dc2626" : "#475569" }}>
                                {currentExpiry}
                            </div>
                            <span style={{ fontSize: "0.75rem", color: (account.status === "expired" || account.daysRemaining <= 0) ? "#dc2626" : "#d97706", fontWeight: 600 }}>
                                {account.daysRemaining <= 0
                                    ? account.daysRemaining === 0 ? "Expired Today (0 Days Left)" : `Expired (${Math.abs(account.daysRemaining)} Days Overdue)`
                                    : `${account.daysRemaining} Days Left`}
                            </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", borderRadius: "50%", background: "#f0fdfa", color: "#0f766e" }}>
                            &rarr;
                        </div>

                        <div style={{ textAlign: "right" }}>
                            <span style={{ fontSize: "0.725rem", fontWeight: 700, color: "#0f766e", textTransform: "uppercase" }}>
                                NEW MATURITY DATE
                            </span>
                            <div style={{ fontSize: "1.15rem", fontWeight: 800, color: "#059669" }}>
                                {newExpirationDate}
                            </div>
                            <span style={{ fontSize: "0.75rem", color: "#059669", fontWeight: 700 }}>
                                +1 Year Extension
                            </span>
                        </div>
                    </div>

                    {/* Annual Burial Lease Policy Indicator */}
                    <div style={{
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        borderRadius: "10px",
                        padding: "11px 14px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        fontSize: "0.825rem",
                        color: "#1e40af"
                    }}>
                        <Layers size={18} color="#2563eb" style={{ flexShrink: 0 }} />
                        <div>
                            <strong>Annual Renewal Policy:</strong> Renewals are strictly <strong>1 year per term (₱{annualRate.toLocaleString()})</strong> payable in <strong>Cash only</strong>.
                        </div>
                    </div>

                    {/* Renewal Term & Fee Display */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                                RENEWAL DURATION
                            </label>
                            <div style={{
                                padding: "10px 14px",
                                background: "#f8fafc",
                                border: "1px solid #cbd5e1",
                                borderRadius: "8px",
                                color: "#0f172a",
                                fontWeight: 700,
                                fontSize: "0.875rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px"
                            }}>
                                <Clock size={16} color="#0f766e" />
                                <span>1 Year (Annual Extension)</span>
                            </div>
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                                RENEWAL LEASE FEE DUE (₱)
                            </label>
                            <div style={{
                                padding: "10px 14px",
                                background: "#f0fdfa",
                                border: "1px solid #99f6e4",
                                borderRadius: "8px",
                                color: "#0f766e",
                                fontWeight: 800,
                                fontSize: "0.95rem"
                            }}>
                                ₱{feeNum.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>

                    {/* Payment Settlement */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                        <div>
                            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                                PAYMENT METHOD
                            </label>
                            <div style={{
                                padding: "10px 14px",
                                background: "#f8fafc",
                                border: "1px solid #cbd5e1",
                                borderRadius: "8px",
                                color: "#0f172a",
                                fontWeight: 700,
                                fontSize: "0.875rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px"
                            }}>
                                <CreditCard size={16} color="#16a34a" />
                                <span>Cash (On the Spot Only)</span>
                            </div>
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                                CASH TENDERED (₱)
                            </label>
                            <input
                                type="number"
                                className="renew-select"
                                style={{ width: "100%", fontWeight: 700 }}
                                placeholder="3500.00"
                                value={amountTendered}
                                onChange={(e) => setAmountTendered(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Change Display */}
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        background: "#f0fdf4",
                        border: "1px solid #bbf7d0",
                        borderRadius: "8px",
                        fontSize: "0.85rem",
                        fontWeight: 700,
                        color: "#166534"
                    }}>
                        <span>Change Due:</span>
                        <span>₱{change.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* Notes Field */}
                    <div>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#334155", marginBottom: "6px" }}>
                            REMARKS / CONTRACT NOTES
                        </label>
                        <input
                            type="text"
                            className="renew-select"
                            style={{ width: "100%", fontSize: "0.8rem" }}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="renew-modal-footer">
                    <button
                        type="button"
                        className="renew-btn-details"
                        onClick={onClose}
                        disabled={processing}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="renew-btn-renew"
                        onClick={handleConfirmRenewal}
                        disabled={processing}
                        style={{ padding: "9px 18px", fontSize: "0.85rem" }}
                    >
                        <CheckCircle size={16} />
                        <span>{processing ? "Recording Renewal…" : "Process & Confirm Renewal"}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
