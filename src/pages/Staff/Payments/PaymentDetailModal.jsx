import { X, User, Phone, Home, Mail, Layers, CreditCard, Calendar, CheckCircle, Clock, AlertCircle } from "lucide-react";
import "./Payments.css";

export default function PaymentDetailModal({ isOpen, account, onClose, onOpenPay }) {
    if (!isOpen || !account) return null;

    const {
        client,
        plot,
        graveTypeName,
        burials = [],
        total = 0,
        balance = 0,
        status,
        dueDate,
        lastPaymentDate,
        percentPaid = 0,
        paidAmount = 0
    } = account;

    const clientName = account.clientName || "Unassigned / Reserved";
    const isInterment = Boolean(account.isIntermentPayment);

    return (
        <div className="pay-modal-overlay" onClick={onClose}>
            <div className="pay-modal-card" onClick={(e) => e.stopPropagation()}>
                {/* ── Modal Header ── */}
                <div className="pay-modal-header">
                    <div className="pay-modal-title-group">
                        <div className={`pay-modal-icon-wrap ${isInterment ? "amber" : "blue"}`}>
                            <CreditCard size={20} />
                        </div>
                        <div>
                            <div className="pay-modal-title-row">
                                <h3 className="pay-modal-title">
                                    {isInterment ? "Interment Service Payment" : "Payment Account Details"}
                                </h3>
                                <span className={`pay-status-pill status-${status}`}>
                                    <span className="pay-dot" />
                                    {status === "fully_paid" ? "Fully Paid" : status === "overdue" ? "Overdue" : "Active Installment"}
                                </span>
                                {isInterment && (
                                    <span className="pay-service-pill">
                                        Interment &amp; Burial
                                    </span>
                                )}
                            </div>
                            <span className="pay-modal-subtitle">
                                {clientName} &bull; Lot {account.plotCode} ({graveTypeName})
                            </span>
                        </div>
                    </div>
                    <button type="button" className="pay-modal-close-btn" onClick={onClose} title="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* ── Modal Body ── */}
                <div className="pay-modal-body">
                    {/* Financial Overview Card */}
                    <div className="pay-detail-financial-box">
                        <div className="pay-financial-grid">
                            <div className="pay-financial-stat">
                                <span className="stat-label">
                                    {isInterment ? "Service Subtotal" : "Total Plan Amount"}
                                </span>
                                <span className="stat-val">
                                    ₱{Number(account.subtotal || total).toLocaleString()}
                                </span>
                                <span className="stat-sub">
                                    {isInterment ? "Standard Fees" : "Official Contract Price"}
                                </span>
                            </div>
                            <div className="pay-financial-stat">
                                <span className="stat-label">Total Paid</span>
                                <span className="stat-val green">₱{paidAmount.toLocaleString()}</span>
                                <span className="stat-sub">
                                    {isInterment ? "Settled On The Spot" : `${percentPaid}% Completed`}
                                </span>
                            </div>
                            <div className="pay-financial-stat">
                                <span className="stat-label">
                                    {isInterment ? "Discount Applied" : "Monthly Installment"}
                                </span>
                                <span
                                    className="stat-val"
                                    style={{ color: isInterment ? (account.discountAmount > 0 ? "#15803d" : "#64748b") : "#0284c7" }}
                                >
                                    {isInterment
                                        ? account.discountAmount > 0
                                            ? `-₱${Number(account.discountAmount).toLocaleString()}`
                                            : "₱0.00"
                                        : `₱${Number(account.monthlyInstallment || 0).toLocaleString()}`}
                                </span>
                                <span className="stat-sub">
                                    {isInterment
                                        ? account.discountType || "No Discount"
                                        : "Monthly Due"}
                                </span>
                            </div>
                            <div className="pay-financial-stat">
                                <span className="stat-label">Remaining Balance</span>
                                <span className={`stat-val ${balance > 0 ? (status === "overdue" ? "red" : "amber") : "gray"}`}>
                                    ₱{balance.toLocaleString()}
                                </span>
                                <span className="stat-sub">
                                    {balance > 0 ? (status === "overdue" ? "Past Due" : "Active Plan") : "Zero Balance (Paid)"}
                                </span>
                            </div>
                        </div>

                        {/* Progress Bar inside box */}
                        <div className="pay-detail-progress-wrap">
                            <div className="pay-detail-progress-track">
                                <div
                                    className={`pay-detail-progress-fill ${status === "fully_paid" ? "fill-green" : status === "overdue" ? "fill-red" : "fill-amber"}`}
                                    style={{ width: `${percentPaid}%` }}
                                />
                            </div>
                            <div className="pay-detail-progress-labels">
                                <span>
                                    {isInterment ? "One-time payment complete" : `${percentPaid}% of plan fulfilled`}
                                </span>
                                {dueDate && status !== "fully_paid" && (
                                    <span className={status === "overdue" ? "text-danger" : ""}>
                                        Next Due: {dueDate}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Client Information */}
                    <div className="pay-detail-section">
                        <div className="pay-detail-section-header">
                            <User size={15} className="section-icon" />
                            <h4>{isInterment ? "Payor / Client Information" : "Buyer / Account Holder"}</h4>
                        </div>
                        <div className="pay-detail-grid">
                            <div className="pay-field-item">
                                <span className="field-lbl">Full Name</span>
                                <span className="field-val bold">{clientName}</span>
                            </div>
                            <div className="pay-field-item">
                                <span className="field-lbl"><Phone size={12} /> Contact Number</span>
                                <span className="field-val">{client?.contact || client?.contactNumber || "—"}</span>
                            </div>
                            <div className="pay-field-item">
                                <span className="field-lbl"><Mail size={12} /> Email Address</span>
                                <span className="field-val">{client?.email || "—"}</span>
                            </div>
                            <div className="pay-field-item">
                                <span className="field-lbl"><Home size={12} /> Address</span>
                                <span className="field-val">{client?.address || "—"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Plot & Interment Details */}
                    <div className="pay-detail-section">
                        <div className="pay-detail-section-header">
                            <Layers size={15} className="section-icon" />
                            <h4>{isInterment ? "Owned Grave Lot & Deceased Assignment" : "Grave Lot & Burials"}</h4>
                        </div>
                        <div className="pay-detail-grid">
                            <div className="pay-field-item">
                                <span className="field-lbl">Plot Code</span>
                                <span className="field-val monospace bold">{account.plotCode}</span>
                            </div>
                            <div className="pay-field-item">
                                <span className="field-lbl">Cemetery Section</span>
                                <span className="field-val">Section {plot?.section || "—"}</span>
                            </div>
                            <div className="pay-field-item">
                                <span className="field-lbl">Grave Type</span>
                                <span className="field-val bold">{graveTypeName}</span>
                            </div>
                            <div className="pay-field-item">
                                <span className="field-lbl">
                                    {isInterment ? "Deceased" : "Burial Record(s)"}
                                </span>
                                <span className="field-val bold" style={{ color: "#0f766e" }}>
                                    {account.deceasedName
                                        ? account.deceasedName
                                        : burials.length > 0
                                        ? burials.map((b) => b.name).join(", ")
                                        : "Vacant (Pre-Need Lot)"}
                                </span>
                            </div>
                            {isInterment && (
                                <div className="pay-field-item">
                                    <span className="field-lbl">Service Package</span>
                                    <span className="field-val">
                                        {account.serviceType || "Standard Burial / Interment"}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Timeline Info */}
                    <div className="pay-detail-section">
                        <div className="pay-detail-section-header">
                            <Calendar size={15} className="section-icon" />
                            <h4>Account Timeline</h4>
                        </div>
                        <div className="pay-detail-grid">
                            <div className="pay-field-item">
                                <span className="field-lbl">Last Payment Date</span>
                                <span className="field-val">{lastPaymentDate || "No payments yet"}</span>
                            </div>
                            <div className="pay-field-item">
                                <span className="field-lbl">Next Due Date</span>
                                <span className={`field-val ${status === "overdue" ? "text-danger bold" : ""}`}>
                                    {status === "fully_paid" ? "N/A (Fully Paid)" : dueDate || "—"}
                                </span>
                            </div>
                            <div className="pay-field-item">
                                <span className="field-lbl">Account Document ID</span>
                                <span className="field-val monospace" style={{ fontSize: "0.75rem" }}>
                                    {account.id}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── Modal Footer ── */}
                <div className="pay-modal-footer">
                    <button type="button" className="pay-btn-secondary" onClick={onClose}>
                        Close
                    </button>
                    {balance > 0 && onOpenPay && (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {Number(account.monthlyInstallment || 0) > 0 && Number(account.monthlyInstallment) < balance && (
                                <button
                                    type="button"
                                    className="pay-btn-primary"
                                    style={{ backgroundColor: "#0284c7" }}
                                    onClick={() => {
                                        onClose();
                                        onOpenPay({ ...account, defaultAmount: account.monthlyInstallment });
                                    }}
                                >
                                    <CreditCard size={14} /> Pay Installment (₱{Number(account.monthlyInstallment).toLocaleString()})
                                </button>
                            )}
                            <button
                                type="button"
                                className="pay-btn-primary"
                                onClick={() => {
                                    onClose();
                                    onOpenPay({ ...account, defaultAmount: balance });
                                }}
                            >
                                <CreditCard size={14} /> Settle Full Balance (₱{balance.toLocaleString()})
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
