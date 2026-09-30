import { useState, useEffect } from "react";
import { X, CreditCard, CheckCircle, AlertCircle, RefreshCw, Calendar } from "lucide-react";
import { generateReceiptNumber, recordInstallmentPayment } from "../../../services/paymentServices";
import { getSystemDateISO } from "../../../utils/systemDate";
import "./Payments.css";

export default function PayInstallmentModal({ isOpen, account, todayStr, onClose, onPaymentSuccess }) {
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("Cash");
    const [paymentDate, setPaymentDate] = useState(todayStr || getSystemDateISO());
    const [receipt, setReceipt] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState(null);

    useEffect(() => {
        if (isOpen && account) {
            const currentBal = Number(account.balance || 0);
            const mInstallment = Number(account.monthlyInstallment || account.monthly_amount || 0);
            // Default to monthly installment needed for the month if valid, otherwise full balance
            const defAmt = account.defaultAmount !== undefined
                ? Number(account.defaultAmount)
                : (mInstallment > 0 && mInstallment <= currentBal ? mInstallment : currentBal);
            setAmount(String(defAmt));
            setReceipt(generateReceiptNumber());
            setPaymentDate(todayStr || getSystemDateISO());
            setMethod("Cash");
            setErrorMsg(null);
        }
    }, [isOpen, account, todayStr]);

    if (!isOpen || !account) return null;

    const currentBalance = Number(account.balance || 0);
    const monthlyInstallment = Number(account.monthlyInstallment || account.monthly_amount || 0);
    const numAmount = Number(amount) || 0;
    const projectedBalance = Math.max(0, currentBalance - numAmount);
    const willBeFullyPaid = projectedBalance === 0 && numAmount > 0;

    // Calculation for dates paid / installments count
    const duration = Number(account.duration || account.graveType?.installment_duration || account.installment_duration || 12);
    const paymentsHistory = Array.isArray(account.accountHistory) ? account.accountHistory : [];
    const paymentsPaidCount = paymentsHistory.length;
    const remainingDatesCount = Math.max(0, duration - paymentsPaidCount);

    // Calculation for due date & overdue / days remaining
    const rawDue = account.dueDateRaw || account.dueDate;
    let dueDaysInfo = null;
    if (rawDue) {
        const dueTime = new Date(rawDue).getTime();
        const currTime = new Date(todayStr || getSystemDateISO()).getTime();
        if (!isNaN(dueTime) && !isNaN(currTime)) {
            const diffDays = Math.round((dueTime - currTime) / (1000 * 60 * 60 * 24));
            dueDaysInfo = {
                diffDays,
                isOverdue: diffDays < 0,
                isDueToday: diffDays === 0,
                text: diffDays < 0
                    ? `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? "" : "s"} overdue`
                    : diffDays === 0
                    ? "Due today"
                    : `${diffDays} day${diffDays === 1 ? "" : "s"} left`
            };
        }
    }



    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg(null);

        if (numAmount <= 0) {
            setErrorMsg("Please enter a valid payment amount greater than zero.");
            return;
        }

        if (numAmount > currentBalance) {
            setErrorMsg(`Payment amount (₱${numAmount.toLocaleString()}) cannot exceed remaining balance (₱${currentBalance.toLocaleString()}).`);
            return;
        }

        try {
            setSubmitting(true);
            const res = await recordInstallmentPayment({
                paymentId: account.id,
                amount: numAmount,
                paymentMethod: method,
                paymentDate: paymentDate || getSystemDateISO(),
                receipt: receipt.trim() || generateReceiptNumber(),
                notes: "", // Hidden from form UI per user request
                currentDueDate: account.dueDateRaw || account.dueDate,
                monthlyAmount: monthlyInstallment,
            });

            if (onPaymentSuccess) {
                onPaymentSuccess({
                    ...res,
                    clientName: account.clientName,
                    plotCode: account.plotCode,
                    amountPaid: numAmount,
                });
            }
            onClose();
        } catch (err) {
            console.error("Payment submission failed:", err);
            setErrorMsg(err.message || "Failed to process installment payment.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="pay-modal-overlay" onClick={onClose}>
            <div className="pay-modal-card pay-action-card" onClick={(e) => e.stopPropagation()}>
                {/* ── Modal Header ── */}
                <div className="pay-modal-header">
                    <div className="pay-modal-title-group">
                        <div className="pay-modal-icon-wrap green">
                            <CreditCard size={20} />
                        </div>
                        <div>
                            <h3 className="pay-modal-title">Record Installment Payment</h3>
                            <span className="pay-modal-subtitle">
                                {account.clientName} &bull; Lot {account.plotCode} ({account.graveTypeName})
                            </span>
                        </div>
                    </div>
                    <button type="button" className="pay-modal-close-btn" onClick={onClose} title="Close">
                        <X size={18} />
                    </button>
                </div>

                {/* ── Form Body ── */}
                <form onSubmit={handleSubmit}>
                    <div className="pay-modal-body">
                        {/* Error Alert */}
                        {errorMsg && (
                            <div className="pay-alert-box error">
                                <AlertCircle size={15} />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        {/* Account Financial Overview Card - 2x2 Balanced Layout */}
                        <div className="pay-detail-financial-box">
                            <div className="pay-installment-grid">
                                <div className="pay-financial-stat">
                                    <span className="stat-label">Remaining Balance</span>
                                    <span className="stat-val red">₱{currentBalance.toLocaleString()}</span>
                                    <span className="stat-sub">Total Plan: ₱{Number(account.total || 0).toLocaleString()}</span>
                                </div>
                                <div className="pay-financial-stat">
                                    <span className="stat-label">Payment Needed This Month</span>
                                    <span className="stat-val blue">
                                        ₱{monthlyInstallment.toLocaleString()}
                                    </span>
                                    <span className="stat-sub">Monthly Due</span>
                                </div>
                                <div className="pay-financial-stat">
                                    <span className="stat-label">Dates Paid</span>
                                    <span className="stat-val green">
                                        {paymentsPaidCount} of {duration} Dates
                                    </span>
                                    <span className="stat-sub">
                                        {remainingDatesCount > 0 ? `${remainingDatesCount} Dates Remaining` : "Complete"}
                                    </span>
                                </div>
                                <div className="pay-financial-stat">
                                    <span className="stat-label">Next Due Date</span>
                                    <span className={`stat-val ${dueDaysInfo?.isOverdue ? "red" : ""}`}>
                                        {account.dueDate || "—"}
                                    </span>
                                    {dueDaysInfo ? (
                                        <span className={`stat-badge ${dueDaysInfo.isOverdue ? "badge-overdue" : "badge-upcoming"}`}>
                                            <Calendar size={11} /> {dueDaysInfo.text}
                                        </span>
                                    ) : (
                                        <span className="stat-sub">Up to date</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Payment Amount Input */}
                        <div className="pay-form-group">
                            <label className="pay-form-label">Payment Amount (₱) *</label>
                            <div className="pay-input-prefix-wrap">
                                <span className="pay-prefix">₱</span>
                                <input
                                    type="number"
                                    min="1"
                                    max={currentBalance}
                                    step="any"
                                    className="pay-input-field with-prefix"
                                    placeholder="Enter amount..."
                                    value={amount}
                                    onChange={(e) => {
                                        setAmount(e.target.value);
                                        setErrorMsg(null);
                                    }}
                                    required
                                    autoFocus
                                />
                            </div>
                        </div>
                    </div>

                    {/* ── Modal Footer ── */}
                    <div className="pay-modal-footer">
                        <button type="button" className="pay-btn-secondary" onClick={onClose} disabled={submitting}>
                            Cancel
                        </button>
                        <button type="submit" className="pay-btn-primary" disabled={submitting || numAmount <= 0}>
                            {submitting ? (
                                <>
                                    <RefreshCw size={14} className="spinning" />
                                    <span>Processing...</span>
                                </>
                            ) : (
                                <>
                                    <CheckCircle size={14} />
                                    <span>Confirm Payment (₱{numAmount.toLocaleString()})</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
