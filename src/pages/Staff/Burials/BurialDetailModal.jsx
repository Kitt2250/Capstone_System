import React, { useEffect } from "react";
import {
    X,
    User,
    Calendar,
    MapPin,
    FileText,
    FolderCheck,
    FileCheck,
    ShieldCheck,
    Layers,
    Phone,
    Mail,
    Home,
    ExternalLink,
    AlertCircle,
    CheckCircle2,
    Hash
} from "lucide-react";
import "./BurialDetailModal.css";
import { isApartmentPlot, getPlotRowAndColumn } from "../../Admin/MapManagement/MapFolder/mapInit.js";

export default function BurialDetailModal({
    isOpen,
    burial,
    onClose,
    onLocatePlot
}) {
    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                onClose();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen || !burial) return null;

    // Helper to calculate age at passing
    const calculateAge = (dob, dod) => {
        if (!dob || !dod) return null;
        try {
            const d1 = dob.toDate ? dob.toDate() : new Date(dob);
            const d2 = dod.toDate ? dod.toDate() : new Date(dod);
            if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
            let age = d2.getFullYear() - d1.getFullYear();
            const m = d2.getMonth() - d1.getMonth();
            if (m < 0 || (m === 0 && d2.getDate() < d1.getDate())) {
                age--;
            }
            return age >= 0 ? age : null;
        } catch {
            return null;
        }
    };

    const age = calculateAge(burial.date_of_birth, burial.date_of_death);

    // Normalize documents list
    const rawDocs = Array.isArray(burial.documents) ? burial.documents : [];
    const docs = rawDocs.map((doc, idx) => {
        if (typeof doc === "string") {
            return { id: idx, name: doc, url: null, verified: true };
        }
        if (typeof doc === "object" && doc !== null) {
            return {
                id: doc.id || idx,
                name: doc.name || doc.title || doc.documentType || "Burial Document",
                url: doc.url || doc.fileUrl || doc.downloadURL || null,
                verified: doc.verified !== false
            };
        }
        return { id: idx, name: String(doc), url: null, verified: true };
    });

    const client = burial.client;
    const clientName = client
        ? `${client.first_name || ""} ${client.last_name || ""}`.trim()
        : burial.familyName || "Family / Walk-in";
    const clientContact =
        client?.contact || client?.contactNumber || client?.phone_number || client?.phone || null;
    const clientEmail = client?.email || null;
    const clientAddress = client?.address || null;
    const clientRelationship = client?.relationship || "Applicant / Nearest Kin";
    const lotOwner = burial.plot?.owner || (clientName !== "Family / Walk-in" ? clientName : "—");

    return (
        <div className="burial-detail-modal-backdrop" onClick={onClose}>
            <div
                className="burial-detail-modal-card"
                onClick={(e) => e.stopPropagation()}
            >
                {/* ── Modal Header ── */}
                <div className="burial-detail-modal-header">
                    <div className="burial-detail-title-group">
                        <div className="burial-detail-header-icon">
                            <FileText size={20} />
                        </div>
                        <div>
                            <h3 className="burial-detail-modal-title">Burial Record Details</h3>
                            <p className="burial-detail-modal-subtitle">
                                Plot <strong>{burial.plotCode}</strong> &bull; Record #{burial.id?.slice(0, 8)}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="burial-detail-close-btn"
                        onClick={onClose}
                        aria-label="Close modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* ── Modal Body (Scrollable) ── */}
                <div className="burial-detail-modal-body">
                    {/* 1. Deceased Profile Hero Card */}
                    <div className="burial-profile-card">
                        <div className="burial-profile-top">
                            <div className="burial-profile-avatar">
                                <User size={26} />
                            </div>
                            <div className="burial-profile-meta">
                                <h4 className="burial-deceased-name">{burial.name || "Unnamed Record"}</h4>
                                <div className="burial-profile-badges">
                                    <span className={`grave-type-section-badge ${burial.typeBadgeClass || "standard"}`}>
                                        <Layers size={12} />
                                        {burial.graveTypeAndSection || `${burial.graveTypeName || "Standard Plot"}${burial.section ? ` • ${burial.section}` : ""}`}
                                    </span>
                                    <span className="burial-plot-pill">
                                        <MapPin size={11} /> Lot {burial.plotCode}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Date Metrics Strip */}
                        <div className="burial-dates-grid">
                            <div className="burial-date-col">
                                <span className="burial-date-lbl">Date of Birth</span>
                                <span className="burial-date-val">
                                    <Calendar size={13} /> {burial.displayDOB || "—"}
                                </span>
                            </div>
                            <div className="burial-date-col">
                                <span className="burial-date-lbl">Date of Death</span>
                                <span className="burial-date-val">
                                    <Calendar size={13} /> {burial.displayDOD || "—"}
                                </span>
                            </div>
                            <div className="burial-date-col">
                                <span className="burial-date-lbl">Date Buried / Interred</span>
                                <span className="burial-date-val highlight">
                                    <Calendar size={13} /> {burial.displayBuriedDate || "—"}
                                </span>
                            </div>
                            <div className="burial-date-col">
                                <span className="burial-date-lbl">Age at Passing</span>
                                <span className="burial-date-val">
                                    {age !== null ? `${age} years old` : "—"}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 2. SUBMITTED DOCUMENTS (Primary Request Feature) */}
                    <div className="burial-section-block">
                        <div className="burial-section-header">
                            <div className="burial-section-title-wrap">
                                <FolderCheck size={18} className="burial-section-icon blue" />
                                <div>
                                    <h4 className="burial-section-title">Submitted Documents & Permits</h4>
                                    <span className="burial-section-sub">
                                        Official clearance papers and required documentation on file
                                    </span>
                                </div>
                            </div>
                            <span className={`burial-docs-counter-pill ${docs.length > 0 ? "has-docs" : "empty"}`}>
                                {docs.length} {docs.length === 1 ? "Document" : "Documents"}
                            </span>
                        </div>

                        {docs.length > 0 ? (
                            <div className="burial-docs-list">
                                {docs.map((doc, idx) => (
                                    <div key={doc.id || idx} className="burial-doc-item">
                                        <div className="burial-doc-left">
                                            <div className="burial-doc-icon-badge">
                                                <FileCheck size={18} />
                                            </div>
                                            <div className="burial-doc-info">
                                                <span className="burial-doc-name">{doc.name}</span>
                                                <span className="burial-doc-status-sub">
                                                    <ShieldCheck size={12} /> Verified &amp; On File
                                                </span>
                                            </div>
                                        </div>
                                        <div className="burial-doc-right">
                                            {doc.url ? (
                                                <a
                                                    href={doc.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="burial-doc-view-link"
                                                    title="Open attached document file"
                                                >
                                                    <ExternalLink size={13} />
                                                    <span>View File</span>
                                                </a>
                                            ) : (
                                                <span className="burial-doc-verified-pill">
                                                    <CheckCircle2 size={13} /> Verified
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="burial-docs-empty-state">
                                <AlertCircle size={22} className="burial-docs-empty-icon" />
                                <div className="burial-docs-empty-text">
                                    <h5>No Documents Recorded</h5>
                                    <p>
                                        No required documents or permits are currently attached to this burial transaction.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 3. Grave Plot & Location Details */}
                    <div className="burial-section-block">
                        <div className="burial-section-header">
                            <div className="burial-section-title-wrap">
                                <MapPin size={18} className="burial-section-icon green" />
                                <div>
                                    <h4 className="burial-section-title">Grave Plot Location</h4>
                                    <span className="burial-section-sub">
                                        Assigned cemetery lot and interment capacity
                                    </span>
                                </div>
                            </div>
                            {onLocatePlot && (
                                <button
                                    type="button"
                                    className="burial-quick-locate-btn"
                                    onClick={() => onLocatePlot(burial)}
                                    title="View this plot on the cemetery satellite map"
                                >
                                    <MapPin size={13} />
                                    <span>Locate on Map</span>
                                </button>
                            )}
                        </div>

                        <div className="burial-info-grid">
                            <div className="burial-info-item">
                                <span className="burial-info-label">Plot Code</span>
                                <span className="burial-info-value plot-highlight">
                                    {burial.plotCode}
                                </span>
                            </div>
                            <div className="burial-info-item">
                                <span className="burial-info-label">Grave Type &amp; Section</span>
                                <span className="burial-info-value">
                                    {burial.graveTypeAndSection || `${burial.graveTypeName || burial.plot?.graveType || "Standard Plot"} - ${burial.section || (burial.plot?.section ? `Section ${burial.plot.section}` : "General Section")}`}
                                </span>
                            </div>
                            {isApartmentPlot(burial.plot || burial) && (
                                <>
                                    <div className="burial-info-item">
                                        <span className="burial-info-label">Row</span>
                                        <span className="burial-info-value">
                                            {getPlotRowAndColumn(burial.plot || burial).row || "—"}
                                        </span>
                                    </div>
                                    <div className="burial-info-item">
                                        <span className="burial-info-label">Column</span>
                                        <span className="burial-info-value">
                                            {getPlotRowAndColumn(burial.plot || burial).column || "—"}
                                        </span>
                                    </div>
                                </>
                            )}
                            <div className="burial-info-item">
                                <span className="burial-info-label">Plot Status</span>
                                <span className="burial-info-value">
                                    <span className="burial-status-tag">
                                        {burial.plot?.status ? burial.plot.status.toUpperCase() : "OCCUPIED"}
                                    </span>
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 4. Family & Lot Owner Contact Information */}
                    <div className="burial-section-block">
                        <div className="burial-section-header">
                            <div className="burial-section-title-wrap">
                                <User size={18} className="burial-section-icon purple" />
                                <div>
                                    <h4 className="burial-section-title">Next of Kin &amp; Contact Details</h4>
                                    <span className="burial-section-sub">
                                        Contact person and lot owner information
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="burial-info-grid">
                            <div className="burial-info-item">
                                <span className="burial-info-label">Applicant / Next of Kin</span>
                                <span className="burial-info-value bold">
                                    {clientName}
                                </span>
                            </div>
                            <div className="burial-info-item">
                                <span className="burial-info-label">Relationship to Deceased</span>
                                <span className="burial-info-value">
                                    {clientRelationship}
                                </span>
                            </div>
                            <div className="burial-info-item">
                                <span className="burial-info-label">
                                    <Phone size={12} /> Contact Number
                                </span>
                                <span className="burial-info-value">
                                    {clientContact || "—"}
                                </span>
                            </div>
                            <div className="burial-info-item">
                                <span className="burial-info-label">
                                    <Mail size={12} /> Email Address
                                </span>
                                <span className="burial-info-value">
                                    {clientEmail || "—"}
                                </span>
                            </div>
                            <div className="burial-info-item wide">
                                <span className="burial-info-label">
                                    <Home size={12} /> Registered Address
                                </span>
                                <span className="burial-info-value">
                                    {clientAddress || "—"}
                                </span>
                            </div>
                            <div className="burial-info-item wide">
                                <span className="burial-info-label">Lot Owner</span>
                                <span className="burial-info-value">
                                    {lotOwner}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* 5. Notes / Remarks (if any) */}
                    {burial.notes && (
                        <div className="burial-section-block">
                            <div className="burial-section-header">
                                <div className="burial-section-title-wrap">
                                    <FileText size={18} className="burial-section-icon amber" />
                                    <div>
                                        <h4 className="burial-section-title">Booking Notes &amp; Remarks</h4>
                                    </div>
                                </div>
                            </div>
                            <p className="burial-notes-content">{burial.notes}</p>
                        </div>
                    )}
                </div>

                {/* ── Modal Footer ── */}
                <div className="burial-detail-modal-footer">
                    <div className="burial-detail-footer-info">
                        <Hash size={14} color="#64748b" />
                        <span>Burial ID: <strong>{burial.id}</strong></span>
                    </div>

                    <div className="burial-detail-footer-actions">
                        {onLocatePlot && (
                            <button
                                type="button"
                                className="burial-modal-btn-locate"
                                onClick={() => onLocatePlot(burial)}
                            >
                                <MapPin size={14} />
                                <span>Locate on Map</span>
                            </button>
                        )}
                        <button
                            type="button"
                            className="burial-modal-btn-close"
                            onClick={onClose}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
