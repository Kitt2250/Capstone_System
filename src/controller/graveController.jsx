import {
    createGraveType,
    updateGraveType,
    createIntermentFee,
    updateIntermentFee,
    generateNextIntermentFeeId,
    getIntermentFees
} from "../services/graveServices";

// ── Add Grave Type ──────────────────────────────────────────────────────────
export const createGraveTypeController = async (payload, stagedInterments = []) => {
    if (!payload.grave_type?.trim()) {
        throw new Error("Grave type name is required.");
    }

    if (payload.lot_price === "" || payload.lot_price === undefined || isNaN(Number(payload.lot_price)) || Number(payload.lot_price) < 0) {
        throw new Error("Please enter a valid lot price.");
    }

    if (payload.installment && (!payload.installment_duration || Number(payload.installment_duration) < 1)) {
        throw new Error("Please specify a valid installment duration in months.");
    }

    if (payload.renewable && (!payload.contract_years || Number(payload.contract_years) < 1)) {
        throw new Error("Please specify a valid number of contract years.");
    }

    if (payload.capacity !== null && payload.capacity !== undefined && Number(payload.capacity) < 1) {
        throw new Error("Capacity must be at least 1.");
    }

    // Create the grave type document and get its new sequential ID
    const createdId = await createGraveType(payload);

    // Save all staged interment fees linked to the new grave type
    for (const item of stagedInterments) {
        await createIntermentFee({
            fee: item.fee,
            graveLot_type: createdId,
            grave_type_id: createdId,
            grave_type: payload.grave_type?.trim() || "",
            interment_fee_id: item.interment_fee_id,
            interment_type: item.interment_type
        });
    }

    return createdId;
};

// ── Update Grave Type ───────────────────────────────────────────────────────
export const updateGraveTypeController = async (graveId, payload) => {
    if (!graveId) {
        throw new Error("Grave ID is required.");
    }

    if (!payload.grave_type?.trim()) {
        throw new Error("Grave type name is required.");
    }

    if (payload.lot_price === "" || payload.lot_price === undefined || isNaN(Number(payload.lot_price)) || Number(payload.lot_price) < 0) {
        throw new Error("Please enter a valid lot price.");
    }

    if (payload.installment && (!payload.installment_duration || Number(payload.installment_duration) < 1)) {
        throw new Error("Please specify a valid installment duration in months.");
    }

    if (payload.renewable && (!payload.contract_years || Number(payload.contract_years) < 1)) {
        throw new Error("Please specify a valid number of contract years.");
    }

    await updateGraveType(graveId, payload);

    return { success: true, message: "Grave type updated successfully." };
};

// ── Add Interment Fee ───────────────────────────────────────────────────────
export const createIntermentFeeController = async (feeData) => {
    if (!feeData.interment_type?.trim()) {
        throw new Error("Interment type is required.");
    }

    if (feeData.fee === "" || feeData.fee === undefined || isNaN(Number(feeData.fee)) || Number(feeData.fee) < 0) {
        throw new Error("Please enter a valid fee amount.");
    }

    if (!feeData.graveLot_type && !feeData.grave_type_id) {
        throw new Error("Grave type reference is required.");
    }

    // If no ID provided, generate one
    if (!feeData.interment_fee_id) {
        const allFees = await getIntermentFees();
        feeData.interment_fee_id = generateNextIntermentFeeId(allFees);
    }

    const savedId = await createIntermentFee({
        fee: Number(feeData.fee),
        graveLot_type: feeData.graveLot_type || feeData.grave_type_id,
        grave_type_id: feeData.grave_type_id || feeData.graveLot_type,
        grave_type: feeData.grave_type?.trim() || "",
        interment_fee_id: feeData.interment_fee_id,
        interment_type: feeData.interment_type.trim()
    });

    return savedId;
};

// ── Update Interment Fee ────────────────────────────────────────────────────
export const updateIntermentFeeController = async (feeId, updatedData) => {
    if (!feeId) {
        throw new Error("Interment fee ID is required.");
    }

    if (!updatedData.interment_type?.trim()) {
        throw new Error("Interment type is required.");
    }

    if (updatedData.fee === "" || updatedData.fee === undefined || isNaN(Number(updatedData.fee)) || Number(updatedData.fee) < 0) {
        throw new Error("Please enter a valid fee amount.");
    }

    await updateIntermentFee(feeId, {
        fee: Number(updatedData.fee),
        interment_type: updatedData.interment_type.trim()
    });

    return { success: true, message: "Interment fee updated successfully." };
};
