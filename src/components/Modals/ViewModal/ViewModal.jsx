import { X, User } from "lucide-react";
import "./ViewModal.css";
import DateFormatter from "../../DateFormatter/Date";

function ViewModal({ isOpen, onClose, title = "Details", data, fields = [] }) {
    if (!isOpen || !data) return null;

    const renderValue = (field, value) => {
        if (value === null || value === undefined || value === "") {
            return <span className="view-value-empty">—</span>;
        }

        if (field.type === "date") {
            return (
                <span className="view-value-text">
                    <DateFormatter value={value} />
                </span>
            );
        }

        const fieldName = field.name.toLowerCase();

        if (fieldName === "status") {
            const statusClass = String(value).toLowerCase() === "active" ? "status-active" : "status-inactive";
            return <span className={`view-badge ${statusClass}`}>{value}</span>;
        }

        if (fieldName === "role") {
            return <span className="view-badge role-badge">{value}</span>;
        }

        return <span className="view-value-text">{String(value)}</span>;
    };

    return (
        <div className="view-modal-overlay" onClick={onClose}>
            <div className="view-modal" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="view-modal-header">
                    <div className="view-modal-title">
                        <div className="view-modal-icon-badge">
                            <User size={18} />
                        </div>
                        <h2>{title}</h2>
                    </div>

                    <button
                        type="button"
                        className="view-modal-close-btn"
                        onClick={onClose}
                        aria-label="Close modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="view-modal-body">
                    {fields.map((field) => (
                        <div className="view-field-row" key={field.name}>
                            <span className="view-field-label">
                                {field.label}
                            </span>
                            <div className="view-field-content">
                                {renderValue(field, data[field.name])}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Actions / Footer */}
                <div className="view-modal-actions">
                    <button
                        type="button"
                        className="view-modal-btn-close"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>

            </div>
        </div>
    );
}

export default ViewModal;