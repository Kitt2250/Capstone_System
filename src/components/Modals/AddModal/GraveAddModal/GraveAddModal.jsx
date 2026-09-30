import { useState, useEffect } from "react";
import { X, Layers, AlertCircle, FileText, Plus, Pencil, Trash2 } from "lucide-react";
import "../../UpdateModal/UpdateModal.css";
import { createGraveTypeController } from "../../../../controller/graveController";
import { getGraveTypes, generateNextGraveTypeId, getIntermentFees, generateNextIntermentFeeId } from "../../../../services/graveServices";

function GraveAddModal({ isOpen, onClose, onAdd }) {
    const [formData, setFormData] = useState({
        grave_type: "",
        lot_price: "",
        capacity: "",
        hasInstallment: false,
        installmentDuration: 12,
        isRenewable: false,
        contractYears: 5,
        renewalFee: "",
        isActive: true
    });

    const [nextId, setNextId] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // ── Staged interment fees (saved on submit after grave is created) ──
    const [stagedInterments, setStagedInterments] = useState([]);
    const [allExistingFees, setAllExistingFees] = useState([]);
    const [isAddingInterment, setIsAddingInterment] = useState(false);
    const [editingIntermentIdx, setEditingIntermentIdx] = useState(null);
    const [intermentForm, setIntermentForm] = useState({ interment_fee_id: "", interment_type: "", fee: "" });
    const [intermentError, setIntermentError] = useState("");

    // Load next sequential IDs when modal opens
    useEffect(() => {
        if (!isOpen) return;
        Promise.all([getGraveTypes(), getIntermentFees()])
            .then(([types, fees]) => {
                setNextId(generateNextGraveTypeId(types));
                setAllExistingFees(fees);
            })
            .catch(() => {
                setNextId("GT001");
                setAllExistingFees([]);
            });
    }, [isOpen]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value
        }));
        if (error) setError("");
    };

    const resetForm = () => {
        setFormData({
            grave_type: "",
            lot_price: "",
            capacity: "",
            hasInstallment: false,
            installmentDuration: 12,
            isRenewable: false,
            contractYears: 5,
            renewalFee: "",
            isActive: true
        });
        setNextId("");
        setError("");
        setLoading(false);
        setStagedInterments([]);
        setAllExistingFees([]);
        setIsAddingInterment(false);
        setEditingIntermentIdx(null);
        setIntermentForm({ interment_fee_id: "", interment_type: "", fee: "" });
        setIntermentError("");
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    // Calculate Downpayment (50%) & Monthly Payment dynamically
    const lotPriceNum = Math.max(0, Number(formData.lot_price) || 0);
    const durationMonths = Math.max(1, Number(formData.installmentDuration) || 12);
    const downpayment = lotPriceNum * 0.5;
    const monthlyPayment = durationMonths > 0 ? (lotPriceNum - downpayment) / durationMonths : 0;

    const formattedDownpayment = downpayment.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formattedMonthlyPayment = monthlyPayment.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // ── Interment staged list helpers ──
    // Compute next fee ID taking both existing DB fees and staged ones into account
    const getNextStagedFeeId = () => {
        const combined = [...allExistingFees, ...stagedInterments];
        return generateNextIntermentFeeId(combined);
    };

    const handleStartAddInterment = () => {
        setEditingIntermentIdx(null);
        setIntermentForm({ interment_fee_id: getNextStagedFeeId(), interment_type: "", fee: "" });
        setIntermentError("");
        setIsAddingInterment(true);
    };

    const handleStartEditInterment = (idx) => {
        const item = stagedInterments[idx];
        setIsAddingInterment(false);
        setEditingIntermentIdx(idx);
        setIntermentForm({
            interment_fee_id: item.interment_fee_id,
            interment_type: item.interment_type,
            fee: item.fee
        });
        setIntermentError("");
    };

    const handleRemoveInterment = (idx) => {
        setStagedInterments((prev) => prev.filter((_, i) => i !== idx));
    };

    const handleCancelIntermentForm = () => {
        setIsAddingInterment(false);
        setEditingIntermentIdx(null);
        setIntermentError("");
    };

    const handleSaveInterment = () => {
        setIntermentError("");

        if (!intermentForm.interment_type.trim()) {
            setIntermentError("Interment type is required.");
            return;
        }
        if (intermentForm.fee === "" || isNaN(Number(intermentForm.fee)) || Number(intermentForm.fee) < 0) {
            setIntermentError("Please enter a valid fee amount.");
            return;
        }

        const entry = {
            interment_fee_id: intermentForm.interment_fee_id,
            interment_type: intermentForm.interment_type.trim(),
            fee: Number(intermentForm.fee)
        };

        if (editingIntermentIdx !== null) {
            setStagedInterments((prev) => prev.map((item, i) => (i === editingIntermentIdx ? entry : item)));
        } else {
            setStagedInterments((prev) => [...prev, entry]);
        }

        handleCancelIntermentForm();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            // Auto-commit staged interment if user filled it out but didn't click "Add Fee"
            let finalStaged = [...stagedInterments];
            if (isAddingInterment || editingIntermentIdx !== null) {
                if (intermentForm.interment_type?.trim() && intermentForm.fee !== "" && !isNaN(Number(intermentForm.fee))) {
                    const entry = {
                        interment_fee_id: intermentForm.interment_fee_id || getNextStagedFeeId(),
                        interment_type: intermentForm.interment_type.trim(),
                        fee: Number(intermentForm.fee)
                    };
                    if (editingIntermentIdx !== null) {
                        finalStaged = finalStaged.map((item, i) => i === editingIntermentIdx ? entry : item);
                    } else {
                        finalStaged.push(entry);
                    }
                }
            }

            const payload = {
                grave_type_id: nextId,
                grave_type: formData.grave_type.trim(),
                lot_price: Number(formData.lot_price),
                capacity: formData.capacity !== "" ? Number(formData.capacity) : null,
                installment: formData.hasInstallment,
                installment_duration: formData.hasInstallment ? Number(formData.installmentDuration) : null,
                downpayment: formData.hasInstallment ? downpayment : null,
                monthly_payment: formData.hasInstallment ? monthlyPayment : null,
                renewable: formData.isRenewable,
                contract: formData.isRenewable ? `${formData.contractYears} Years` : "Perpetual",
                contract_years: formData.isRenewable ? Number(formData.contractYears) : null,
                renewal_fee: formData.isRenewable && formData.renewalFee !== "" ? Number(formData.renewalFee) : null,
                status: formData.isActive ? "active" : "inactive",
                isActive: formData.isActive
            };

            let createdId;
            if (onAdd) {
                // GraveManagement passes onAdd — it calls the controller itself
                createdId = await onAdd(payload, finalStaged);
            } else {
                createdId = await createGraveTypeController(payload, finalStaged);
            }

            handleClose();
        } catch (err) {
            console.error("Error adding grave type:", err);
            setError(err.message || "Failed to add grave.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="update-modal-overlay" onClick={handleClose}>
            <div className="update-modal" onClick={(e) => e.stopPropagation()}>
                {/* Modal Header */}
                <div className="update-modal-header">
                    <div className="update-modal-title">
                        <Layers size={20} />
                        <h2>Add Grave Type</h2>
                    </div>
                    <button type="button" className="update-modal-close-btn" onClick={handleClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="update-modal-error">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                    </div>
                )}

                {/* Add Form */}
                <form onSubmit={handleSubmit} noValidate>
                    {/* Grave Type ID - read only */}
                    <div className="update-modal-form-group">
                        <label>Grave Type ID</label>
                        <input
                            type="text"
                            value={nextId}
                            readOnly
                            style={{ backgroundColor: "#f1f5f9", color: "#0369a1", fontWeight: "700", cursor: "default" }}
                        />
                    </div>

                    {/* Grave Type Name */}
                    <div className="update-modal-form-group">
                        <label>Grave Type</label>
                        <input
                            type="text"
                            name="grave_type"
                            value={formData.grave_type}
                            onChange={handleChange}
                            placeholder="e.g. Lawn Lot, Mausoleum"
                            required
                        />
                    </div>

                    {/* Lot Price + Capacity side-by-side */}
                    <div className="grave-two-col-grid" style={{ marginBottom: "14px" }}>
                        <div className="update-modal-form-group" style={{ margin: 0 }}>
                            <label>Lot Price (₱)</label>
                            <input
                                type="number"
                                name="lot_price"
                                value={formData.lot_price}
                                onChange={handleChange}
                                placeholder="e.g. 150000"
                                min="0"
                                step="any"
                                required
                            />
                        </div>
                        <div className="update-modal-form-group" style={{ margin: 0 }}>
                            <label>Capacity</label>
                            <input
                                type="number"
                                name="capacity"
                                value={formData.capacity}
                                onChange={handleChange}
                                placeholder="e.g. 2"
                                min="1"
                            />
                        </div>
                    </div>

                    {/* ── Connected Interment Section ── */}
                    <div className="grave-interment-section">
                        <div className="grave-interment-header">
                            <div className="grave-interment-title">
                                <FileText size={15} />
                                <span>Connected Interment</span>
                                <span className="grave-interment-badge">{stagedInterments.length}</span>
                            </div>
                            <button
                                type="button"
                                className="grave-add-interment-btn"
                                onClick={handleStartAddInterment}
                                title="Add interment fee"
                            >
                                <Plus size={13} />
                                <span>Add Interment</span>
                            </button>
                        </div>

                        {/* Inline Add / Edit Sub-Form */}
                        {(isAddingInterment || editingIntermentIdx !== null) && (
                            <div className="grave-interment-form-card">
                                <div className="grave-interment-form-title">
                                    {editingIntermentIdx !== null ? "Update Interment Fee" : "Add New Interment Fee"}
                                </div>

                                {intermentError && (
                                    <div className="update-modal-error" style={{ marginBottom: "10px" }}>
                                        <AlertCircle size={14} />
                                        <span>{intermentError}</span>
                                    </div>
                                )}

                                <div className="grave-box-field" style={{ marginBottom: "10px" }}>
                                    <label className="grave-box-label">INTERMENT FEE ID</label>
                                    <input
                                        type="text"
                                        value={intermentForm.interment_fee_id}
                                        readOnly
                                        className="grave-box-input"
                                        style={{ backgroundColor: "#f1f5f9", color: "#0369a1", fontWeight: "700" }}
                                    />
                                </div>

                                <div className="grave-two-col-grid">
                                    <div className="grave-box-field">
                                        <label className="grave-box-label">
                                            INTERMENT TYPE <span className="req-star">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={intermentForm.interment_type}
                                            onChange={(e) => setIntermentForm((prev) => ({ ...prev, interment_type: e.target.value }))}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    handleSaveInterment();
                                                }
                                            }}
                                            className="grave-box-input"
                                            placeholder="e.g. Standard Burial"
                                        />
                                    </div>
                                    <div className="grave-box-field">
                                        <label className="grave-box-label">
                                            FEE (₱) <span className="req-star">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            value={intermentForm.fee}
                                            onChange={(e) => setIntermentForm((prev) => ({ ...prev, fee: e.target.value }))}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    handleSaveInterment();
                                                }
                                            }}
                                            className="grave-box-input"
                                            placeholder="e.g. 5000"
                                            min="0"
                                            step="any"
                                        />
                                    </div>
                                </div>

                                <div className="grave-interment-form-actions">
                                    <button type="button" className="grave-interment-btn-cancel" onClick={handleCancelIntermentForm}>
                                        Cancel
                                    </button>
                                    <button type="button" className="grave-interment-btn-save" onClick={handleSaveInterment}>
                                        {editingIntermentIdx !== null ? "Update Fee" : "Add Fee"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Staged list */}
                        {stagedInterments.length > 0 ? (
                            <div className="grave-interment-list">
                                {stagedInterments.map((item, idx) => (
                                    <div key={idx} className="grave-interment-item">
                                        <div>
                                            <span className="grave-interment-id-tag">{item.interment_fee_id}</span>
                                            <span className="grave-interment-type-name">{item.interment_type}</span>
                                        </div>
                                        <div className="grave-interment-item-right">
                                            <span className="grave-interment-fee-amount">
                                                ₱{Number(item.fee).toLocaleString()}
                                            </span>
                                            <button
                                                type="button"
                                                className="grave-edit-interment-btn"
                                                onClick={() => handleStartEditInterment(idx)}
                                                title="Edit"
                                            >
                                                <Pencil size={12} />
                                                <span>Edit</span>
                                            </button>
                                            <button
                                                type="button"
                                                className="grave-edit-interment-btn"
                                                onClick={() => handleRemoveInterment(idx)}
                                                title="Remove"
                                                style={{ color: "#ef4444" }}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="grave-interment-empty">
                                No interment fees added yet. Click "Add Interment" to add one.
                            </div>
                        )}
                    </div>

                    {/* ── Installment Checkbox & Sub-Box ── */}
                    <div className="grave-toggle-group">
                        <label className="grave-checkbox-label">
                            <input
                                type="checkbox"
                                name="hasInstallment"
                                checked={formData.hasInstallment}
                                onChange={handleChange}
                                className="grave-custom-checkbox"
                            />
                            <span className="grave-checkbox-text">Installment</span>
                        </label>

                        {formData.hasInstallment && (
                            <div className="grave-nested-box">
                                <div className="grave-box-field">
                                    <label className="grave-box-label">
                                        INSTALLMENT DURATION (MONTHS) <span className="req-star">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        name="installmentDuration"
                                        value={formData.installmentDuration}
                                        onChange={handleChange}
                                        className="grave-box-input"
                                        placeholder="12"
                                        min="1"
                                    />
                                </div>
                                <div className="grave-calc-summary-card">
                                    <div className="grave-calc-col">
                                        <div className="grave-calc-label">DOWNPAYMENT (50%)</div>
                                        <div className="grave-calc-value-down">₱{formattedDownpayment}</div>
                                    </div>
                                    <div className="grave-calc-col">
                                        <div className="grave-calc-label">MONTHLY PAYMENT</div>
                                        <div className="grave-calc-value-monthly">₱{formattedMonthlyPayment} / mo</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Renewable Checkbox & Sub-Box ── */}
                    <div className="grave-toggle-group">
                        <label className="grave-checkbox-label">
                            <input
                                type="checkbox"
                                name="isRenewable"
                                checked={formData.isRenewable}
                                onChange={handleChange}
                                className="grave-custom-checkbox"
                            />
                            <span className="grave-checkbox-text">Renewable</span>
                        </label>

                        {formData.isRenewable && (
                            <div className="grave-nested-box">
                                <div className="grave-two-col-grid">
                                    <div className="grave-box-field">
                                        <label className="grave-box-label">
                                            CONTRACT YEARS <span className="req-star">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            name="contractYears"
                                            value={formData.contractYears}
                                            onChange={handleChange}
                                            className="grave-box-input"
                                            placeholder="5"
                                            min="1"
                                        />
                                    </div>
                                    <div className="grave-box-field">
                                        <label className="grave-box-label">
                                            RENEWAL FEE PER YEAR (₱) <span className="req-star">*</span>
                                        </label>
                                        <input
                                            type="number"
                                            name="renewalFee"
                                            value={formData.renewalFee}
                                            onChange={handleChange}
                                            className="grave-box-input"
                                            placeholder="e.g. 1000"
                                            min="0"
                                            step="any"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Active Checkbox ── */}
                    <div className="grave-toggle-group">
                        <label className="grave-checkbox-label">
                            <input
                                type="checkbox"
                                name="isActive"
                                checked={formData.isActive}
                                onChange={handleChange}
                                className="grave-custom-checkbox"
                            />
                            <span className="grave-checkbox-text">Active</span>
                        </label>
                    </div>

                    {/* Action Buttons */}
                    <div className="update-modal-actions">
                        <button
                            type="button"
                            className="update-modal-btn-cancel"
                            onClick={handleClose}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="update-modal-btn-submit"
                            disabled={loading}
                        >
                            {loading ? "Adding..." : "Add Grave"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default GraveAddModal;
