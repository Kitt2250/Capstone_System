import { X, Download } from "lucide-react";
import { useState } from "react";
import "./Export.css";

function ExportModal({
    isOpen,
    onClose,
    title = "Export Data",
    onExport
}) {
    const [format, setFormat] = useState("csv");

    if (!isOpen) return null;

    const handleExport = () => {
        onExport(format);
        onClose();
    };

    return (
        <div className="export-modal-overlay" onClick={onClose}>
            <div
                className="export-modal"
                onClick={(e) => e.stopPropagation()}
            >

                {/* Header */}
                <div className="export-modal-header">
                    <div className="export-modal-title">
                        <div className="export-modal-icon">
                            <Download size={18} />
                        </div>

                        <h2>{title}</h2>
                    </div>

                    <button
                        type="button"
                        className="export-modal-close"
                        onClick={onClose}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="export-modal-body">

                    <p className="export-modal-description">
                        Choose the format you want to export.
                    </p>

                    <div className="export-format-group">

                        <label className="export-format-option">
                            <input
                                type="radio"
                                name="exportFormat"
                                value="csv"
                                checked={format === "csv"}
                                onChange={(e) => setFormat(e.target.value)}
                            />

                            <div>
                                <strong>CSV</strong>
                                <span>Spreadsheet-friendly format</span>
                            </div>
                        </label>

                        <label className="export-format-option">
                            <input
                                type="radio"
                                name="exportFormat"
                                value="json"
                                checked={format === "json"}
                                onChange={(e) => setFormat(e.target.value)}
                            />

                            <div>
                                <strong>JSON</strong>
                                <span>Data format for applications</span>
                            </div>
                        </label>

                        <label className="export-format-option">
                            <input
                                type="radio"
                                name="exportFormat"
                                value="pdf"
                                checked={format === "pdf"}
                                onChange={(e) => setFormat(e.target.value)}
                            />

                            <div>
                                <strong>PDF</strong>
                                <span>Printable report format</span>
                            </div>
                        </label>

                    </div>
                </div>

                {/* Footer */}
                <div className="export-modal-actions">

                    <button
                        type="button"
                        className="export-btn-cancel"
                        onClick={onClose}
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        className="export-btn-confirm"
                        onClick={handleExport}
                    >
                        <Download size={16} />
                        Export
                    </button>

                </div>

            </div>
        </div>
    );
}

export default ExportModal;