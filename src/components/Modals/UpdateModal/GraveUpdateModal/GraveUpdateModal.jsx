import { useEffect, useState } from "react";
import { X, Layers, AlertCircle, FileText, Plus, Pencil } from "lucide-react";
import "../UpdateModal.css";
import {
    updateGraveTypeController,
    createIntermentFeeController,
    updateIntermentFeeController
} from "../../../../controller/graveController";
import {
    getIntermentFees,
    generateNextIntermentFeeId
} from "../../../../services/graveServices";

function GraveUpdateModal({ isOpen, grave, onClose, onUpdate, intermentFees: propIntermentFees }) {
    const [formData, setFormData] = useState({
        grave_type: "",
        lot_price: "",
        capacity: "",
        hasInstallment: true,
        installmentDuration: 12,
        isRenewable: false,
        contractYears: 5,
        renewalFee: "",
        isActive: true
    });

    const [allIntermentFees, setAllIntermentFees] = useState([]);
    const [connectedInterments, setConnectedInterments] = useState([]);
    const [loadingInterments, setLoadingInterments] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Sub-form state for Add / Update connected interment fee
    const [isAddingInterment, setIsAddingInterment] = useState(false);
    const [editingInterment, setEditingInterment] = useState(null);
    const [intermentForm, setIntermentForm] = useState({
        interment_fee_id: "",
        interment_type: "",
        fee: ""
    });
    const [intermentError, setIntermentError] = useState("");
    const [savingInterment, setSavingInterment] = useState(false);

    // Populate data when modal opens or grave prop changes
    useEffect(() => {
        if (grave) {
            const hasInstall = grave.installment === true ||
                grave.installment === "true" ||
                grave.installment === "Eligible" ||
                (grave.installment !== false && grave.installment !== "false" && grave.installment !== "No" && !!grave.installment);

            const isRenew = grave.renewable === true ||
                grave.renewable === "true" ||
                (grave.contract && grave.contract !== "Perpetual" && !String(grave.contract).toLowerCase().includes("perpetual"));

            const parsedYears = parseInt(grave.contract_years || grave.contractYears || grave.contract, 10);

            setFormData({
                grave_type: grave.grave_type || "",
                lot_price: grave.lot_price !== undefined && grave.lot_price !== null ? grave.lot_price : "",
                capacity: grave.capacity !== undefined && grave.capacity !== null ? grave.capacity : "",
                hasInstallment: hasInstall,
                installmentDuration: grave.installment_duration || grave.installmentDuration || 12,
                isRenewable: isRenew,
                contractYears: !isNaN(parsedYears) && parsedYears > 0 ? parsedYears : 5,
                renewalFee: grave.renewal_fee !== undefined && grave.renewal_fee !== null ? grave.renewal_fee : (grave.renewalFee || ""),
                isActive: grave.status ? String(grave.status).toLowerCase() === "active" : (grave.isActive !== false)
            });
            setError("");
            setIsAddingInterment(false);
            setEditingInterment(null);
            setIntermentError("");
        }
    }, [grave, isOpen]);

    // Helper: reload all and connected interments from collection
    const reloadInterments = async () => {
        if (!grave) return;
        try {
            setLoadingInterments(true);
            const allFees = await getIntermentFees();
            setAllIntermentFees(allFees);
            const filtered = allFees.filter(
                (f) =>
                    (f.graveLot_type || f.grave_type_id) === grave.id ||
                    (f.grave_type && f.grave_type.toLowerCase() === (grave.grave_type || "").toLowerCase())
            );
            setConnectedInterments(filtered);
        } catch (err) {
            console.error("Error reloading interment fees:", err);
        } finally {
            setLoadingInterments(false);
        }
    };

    // Fetch or filter connected interment fees from interment_fee collection
    useEffect(() => {
        if (!grave || !isOpen) return;

        if (propIntermentFees && propIntermentFees.length > 0) {
            setAllIntermentFees(propIntermentFees);
            const filtered = propIntermentFees.filter(
                (f) =>
                    (f.graveLot_type || f.grave_type_id) === grave.id ||
                    (f.grave_type && f.grave_type.toLowerCase() === (grave.grave_type || "").toLowerCase())
            );
            setConnectedInterments(filtered);
        } else {
            reloadInterments();
        }
    }, [grave, isOpen, propIntermentFees]);

    if (!isOpen || !grave) {
        return null;
    }

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === "checkbox" ? checked : value
        }));

        if (error) setError("");
    };

    const handleClose = () => {
        setError("");
        setLoading(false);
        setIsAddingInterment(false);
        setEditingInterment(null);
        setIntermentError("");
        onClose();
    };

    // Calculate Downpayment (50%) & Monthly Payment dynamically
    const lotPriceNum = Math.max(0, Number(formData.lot_price) || 0);
    const durationMonths = Math.max(1, Number(formData.installmentDuration) || 12);
    const downpayment = lotPriceNum * 0.5; // 50%
    const monthlyPayment = durationMonths > 0 ? (lotPriceNum - downpayment) / durationMonths : 0;

    const formattedDownpayment = downpayment.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    const formattedMonthlyPayment = monthlyPayment.toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    // ── Connected Interment Action Handlers ──
    const handleStartAddInterment = () => {
        setEditingInterment(null);
        // Generate next sequential ID based on all existing fees (e.g. 1F001 -> 1F002)
        const nextId = generateNextIntermentFeeId(allIntermentFees);

        setIntermentForm({
            interment_fee_id: nextId,
            interment_type: "",
            fee: ""
        });
        setIntermentError("");
        setIsAddingInterment(true);
    };

    const handleStartEditInterment = (item) => {
        setIsAddingInterment(false);
        setEditingInterment(item);
        setIntermentForm({
            interment_fee_id: item.interment_fee_id || item.id || "",
            interment_type: item.interment_type || item.fee_name || item.name || "",
            fee: item.fee !== undefined ? item.fee : (item.amount !== undefined ? item.amount : "")
        });
        setIntermentError("");
    };

    const handleCancelIntermentForm = () => {
        setIsAddingInterment(false);
        setEditingInterment(null);
        setIntermentError("");
    };

    const handleSaveInterment = async () => {
        setIntermentError("");
        setSavingInterment(true);

        try {
            if (editingInterment) {
                await updateIntermentFeeController(editingInterment.id, {
                    fee: intermentForm.fee,
                    interment_type: intermentForm.interment_type
                });
            } else {
                const generatedId = intermentForm.interment_fee_id || generateNextIntermentFeeId(allIntermentFees);
                await createIntermentFeeController({
                    fee: intermentForm.fee,
                    graveLot_type: grave.id,
                    grave_type_id: grave.grave_type_id || grave.id,
                    grave_type: grave.grave_type || "",
                    interment_fee_id: generatedId,
                    interment_type: intermentForm.interment_type
                });
            }

            await reloadInterments();
            handleCancelIntermentForm();
        } catch (err) {
            console.error("Error saving interment fee:", err);
            setIntermentError(err.message || "Failed to save interment fee.");
        } finally {
            setSavingInterment(false);
        }
    };

    // ── Submit Grave Update ──
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const payload = {
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

            if (onUpdate) {
                await onUpdate(payload);
            } else if (grave?.id) {
                await updateGraveTypeController(grave.id, payload);
            }

            handleClose();
        } catch (err) {
            console.error("Error updating grave type:", err);
            setError(err.message || "Failed to update grave.");
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
                        <h2>Update Grave</h2>
                    </div>

                    <button
                        type="button"
                        className="update-modal-close-btn"
                        onClick={handleClose}
                    >
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

                {/* Update Form */}
                <form onSubmit={handleSubmit} noValidate>
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
                                <span className="grave-interment-badge">
                                    {connectedInterments.length}
                                </span>
                            </div>

                            <button
                                type="button"
                                className="grave-add-interment-btn"
                                onClick={handleStartAddInterment}
                                title="Add new interment fee"
                            >
                                <Plus size={13} />
                                <span>Add Interment</span>
                            </button>
                        </div>

                        {/* Inline Add/Edit Interment Sub-Form */}
                        {(isAddingInterment || editingInterment) && (
                            <div className="grave-interment-form-card">
                                <div className="grave-interment-form-title">
                                    {editingInterment ? "Update Interment Fee" : "Add New Interment Fee"}
                                </div>

                                {intermentError && (
                                    <div className="update-modal-error" style={{ marginBottom: "10px" }}>
                                        <AlertCircle size={14} />
                                        <span>{intermentError}</span>
                                    </div>
                                )}

                                <div className="grave-box-field" style={{ marginBottom: "10px" }}>
                                    <label className="grave-box-label">
                                        INTERMENT FEE ID
                                    </label>
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
                                            className="grave-box-input"
                                            placeholder="e.g. 5000"
                                            min="0"
                                            step="any"
                                        />
                                    </div>
                                </div>

                                <div className="grave-interment-form-actions">
                                    <button
                                        type="button"
                                        className="grave-interment-btn-cancel"
                                        onClick={handleCancelIntermentForm}
                                        disabled={savingInterment}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className="grave-interment-btn-save"
                                        onClick={handleSaveInterment}
                                        disabled={savingInterment}
                                    >
                                        {savingInterment ? "Saving..." : editingInterment ? "Update Fee" : "Add Fee"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {loadingInterments ? (
                            <div className="grave-interment-empty">Loading interment details...</div>
                        ) : connectedInterments.length > 0 ? (
                            <div className="grave-interment-list">
                                {connectedInterments.map((item, idx) => {
                                    const feeAmount = item.fee !== undefined ? item.fee : (item.amount !== undefined ? item.amount : 0);
                                    const typeName = item.interment_type || item.fee_name || item.name || `Interment Fee #${idx + 1}`;
                                    const feeId = item.interment_fee_id || item.id;
                                    return (
                                        <div key={item.id || idx} className="grave-interment-item">
                                            <div>
                                                {feeId && (
                                                    <span className="grave-interment-id-tag">{feeId}</span>
                                                )}
                                                <span className="grave-interment-type-name">{typeName}</span>
                                            </div>
                                            <div className="grave-interment-item-right">
                                                <span className="grave-interment-fee-amount">
                                                    ₱{Number(feeAmount).toLocaleString()}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="grave-edit-interment-btn"
                                                    onClick={() => handleStartEditInterment(item)}
                                                    title="Update Interment"
                                                >
                                                    <Pencil size={12} />
                                                    <span>Update</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="grave-interment-empty">
                                No connected interment fees for this grave type.
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
                            {loading ? "Updating..." : "Update Grave"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default GraveUpdateModal;
