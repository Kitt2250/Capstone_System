import React, { useRef } from "react";
import { Printer, Check, X, ShieldCheck, Landmark, User, Calendar, Receipt } from "lucide-react";
import "./IntermentReceiptModal.css";

export default function IntermentReceiptModal({ isOpen, receiptData, onClose }) {
    const printableRef = useRef(null);

    if (!isOpen || !receiptData) return null;

    const {
        receiptNumber,
        transactionDate,
        paymentDate,
        client,
        deceased,
        plot,
        items = [],
        subtotal = 0,
        discount = null,
        totalPaid = 0,
        amountTendered = 0,
        change = 0,
        paymentMethod = "Cash",
    } = receiptData;

    const handlePrint = () => {
        window.print();
    };

    // Format formatted date
    const formattedDate = transactionDate
        ? new Date(transactionDate).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
          })
        : new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
          });

    return (
        <div className="irm-overlay" onClick={onClose}>
            <div className="irm-container" onClick={(e) => e.stopPropagation()}>
                {/* Modal Action Bar (Hidden in Print) */}
                <div className="irm-actions-bar no-print">
                    <div className="irm-actions-left">
                        <span className="irm-badge-success">
                            <ShieldCheck size={14} /> Transaction Completed
                        </span>
                        <span className="irm-receipt-code-pill">{receiptNumber}</span>
                    </div>
                    <div className="irm-actions-right">
                        <button
                            type="button"
                            className="irm-btn-print"
                            onClick={handlePrint}
                            title="Print Official Receipt"
                        >
                            <Printer size={16} />
                            <span>Print Receipt</span>
                        </button>
                        <button
                            type="button"
                            className="irm-btn-close"
                            onClick={onClose}
                            title="Close Receipt"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Printable Receipt Card */}
                <div className="irm-receipt-card" id="interment-receipt-printable" ref={printableRef}>
                    {/* Header */}
                    <div className="irm-header">
                        <div className="irm-header-emblem">
                            <Landmark size={28} color="#0f766e" />
                        </div>
                        <h2 className="irm-brand-title">CHERUBIM MEMORIAL GARDEN</h2>
                        <p className="irm-brand-subtitle">Memorial Services & Cemetery Management</p>
                        <p className="irm-brand-address">Brgy. Sta. Veronica, Guimba, Nueva Ecija • Tel: (044) 958-1234</p>
                        <div className="irm-receipt-banner">OFFICIAL INTERMENT RECEIPT</div>
                    </div>

                    {/* Receipt Meta Bar */}
                    <div className="irm-meta-bar">
                        <div className="irm-meta-item">
                            <span className="irm-meta-label">Receipt Number</span>
                            <span className="irm-meta-val highlight">{receiptNumber}</span>
                        </div>
                        <div className="irm-meta-item">
                            <span className="irm-meta-label">Date & Time</span>
                            <span className="irm-meta-val">{formattedDate}</span>
                        </div>
                        <div className="irm-meta-item">
                            <span className="irm-meta-label">Payment Method</span>
                            <span className="irm-meta-val">{paymentMethod} (On The Spot)</span>
                        </div>
                        <div className="irm-meta-item">
                            <span className="irm-meta-label">Status</span>
                            <span className="irm-meta-val paid">PAID IN FULL</span>
                        </div>
                    </div>

                    <div className="irm-divider"></div>

                    {/* Parties Grid (Owner & Deceased) */}
                    <div className="irm-parties-grid">
                        <div className="irm-party-col">
                            <h4 className="irm-section-title">
                                <User size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
                                Payor / Lot Owner
                            </h4>
                            <div className="irm-detail-line">
                                <span className="irm-detail-lbl">Name:</span>
                                <span className="irm-detail-txt bold">{client?.name || "N/A"}</span>
                            </div>
                            <div className="irm-detail-line">
                                <span className="irm-detail-lbl">Contact:</span>
                                <span className="irm-detail-txt">{client?.contact || "On File"}</span>
                            </div>
                            <div className="irm-detail-line">
                                <span className="irm-detail-lbl">Address:</span>
                                <span className="irm-detail-txt">{client?.address || "On File"}</span>
                            </div>
                        </div>

                        <div className="irm-party-col">
                            <h4 className="irm-section-title">
                                <Calendar size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: "4px" }} />
                                Deceased & Lot Assignment
                            </h4>
                            <div className="irm-detail-line">
                                <span className="irm-detail-lbl">Deceased:</span>
                                <span className="irm-detail-txt bold">{deceased?.name || "N/A"}</span>
                            </div>
                            <div className="irm-detail-line">
                                <span className="irm-detail-lbl">Owned Lot:</span>
                                <span className="irm-detail-txt highlight">
                                    {plot?.plotCode} (Section {plot?.section} • {plot?.graveType})
                                </span>
                            </div>
                            <div className="irm-detail-line">
                                <span className="irm-detail-lbl">Burial Date:</span>
                                <span className="irm-detail-txt">{deceased?.burialDate || paymentDate || "Scheduled"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Itemized Table of Charges */}
                    <div className="irm-table-wrap">
                        <table className="irm-table">
                            <thead>
                                <tr>
                                    <th>Description / Item</th>
                                    <th style={{ textAlign: "right", width: "140px" }}>Amount (₱)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td>
                                            <div className="irm-item-desc">{item.description}</div>
                                        </td>
                                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                                            ₱{Number(item.amount || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Breakdown & Totals */}
                    <div className="irm-totals-section">
                        <div className="irm-totals-rows">
                            <div className="irm-calc-row">
                                <span>Subtotal</span>
                                <span>₱{Number(subtotal || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
                            </div>

                            {discount && discount.amount > 0 && (
                                <div className="irm-calc-row discount">
                                    <span>Discount ({discount.type} - {discount.rate}%)</span>
                                    <span>-₱{Number(discount.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
                                </div>
                            )}

                            <div className="irm-calc-row total">
                                <span>TOTAL AMOUNT PAID</span>
                                <span>₱{Number(totalPaid || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
                            </div>

                            <div className="irm-calc-row tender">
                                <span>Cash Tendered</span>
                                <span>₱{Number(amountTendered || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
                            </div>

                            <div className="irm-calc-row change">
                                <span>Change</span>
                                <span>₱{Number(change || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>

                    {/* Signatures & Confirmation */}
                    <div className="irm-footer">
                        <div className="irm-notes">
                            <p>
                                <strong>Official Note:</strong> This receipt serves as official acknowledgment of payment for interment and burial services on the registered family grave lot.
                            </p>
                        </div>
                        <div className="irm-signatures-grid">
                            <div className="irm-sig-block">
                                <div className="irm-sig-line"></div>
                                <span className="irm-sig-name">Authorized Cashier / Staff</span>
                                <span className="irm-sig-title">Cherubim Memorial Garden</span>
                            </div>
                            <div className="irm-sig-block">
                                <div className="irm-sig-line"></div>
                                <span className="irm-sig-name">{client?.name || "Client / Payor"}</span>
                                <span className="irm-sig-title">Client Signature</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modal Footer (Hidden in Print) */}
                <div className="irm-modal-footer no-print">
                    <button type="button" className="irm-btn-finish" onClick={onClose}>
                        <Check size={16} />
                        <span>Done & New Booking</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
