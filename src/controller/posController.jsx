import { processPOSTransaction } from "../services/posServices";
import {
    calculateIntermentFeeController,
    isWeekendInterment,
    isMausoleumOrSingleNiche,
    isFreshBurialInterment
} from "./intermentController";

export {
    calculateIntermentFeeController,
    isWeekendInterment,
    isMausoleumOrSingleNiche,
    isFreshBurialInterment
};

// ─────────────────────────────────────────────────────────────────────────────
// Validates the full POS transaction payload and delegates to the service.
// Throws descriptive errors for any missing required field.
// ─────────────────────────────────────────────────────────────────────────────
export async function processPOSController(transactionData) {
    const { clientData, burialData, plotId, needType, paymentData, historyData } = transactionData;

    // ── Client Validation ────────────────────────────────────────────────────
    if (!clientData?.firstName?.trim()) {
        throw new Error("Client first name is required.");
    }
    if (!clientData?.lastName?.trim()) {
        throw new Error("Client last name is required.");
    }
    if (!clientData?.email?.trim()) {
        throw new Error("Client email is required.");
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(clientData.email.trim())) {
        throw new Error("Please enter a valid email address.");
    }
    if (!clientData?.contactNumber?.trim()) {
        throw new Error("Contact number is required.");
    }
    const cleanContact = clientData.contactNumber.trim().replace(/\D/g, "");
    if (cleanContact.length !== 11) {
        throw new Error("Contact number must be 11 digits.");
    }

    // ── Plot Validation ───────────────────────────────────────────────────────
    if (!plotId) {
        throw new Error("A grave lot must be selected.");
    }

    // ── Interment Validation ──────────────────────────────────────────────────
    if (needType !== "pre-need" && !burialData?.intermentType?.trim()) {
        throw new Error("Interment service is required.");
    }

    // ── Required Documents Validation ─────────────────────────────────────────
    const submittedDocs = Array.isArray(burialData?.documents) ? burialData.documents : [];
    const hasValidId = submittedDocs.some((d) => /valid\s*id/i.test(String(d)));
    const hasAgreement = submittedDocs.some((d) => /purchase\s*agreement/i.test(String(d)));

    if (!hasValidId) {
        throw new Error("Valid ID of Payor is required.");
    }
    if (!hasAgreement) {
        throw new Error("Signed Purchase Agreement is required.");
    }

    // ── Payment Validation ────────────────────────────────────────────────────
    if (paymentData?.total == null || isNaN(Number(paymentData.total))) {
        throw new Error("Payment total is required.");
    }

    const totalCash = Number(paymentData?.totalCash ?? paymentData?.total ?? 0);
    const amountTendered = paymentData?.amountTendered;

    if (amountTendered == null || amountTendered === "" || isNaN(Number(amountTendered))) {
        throw new Error("Amount tendered is required.");
    }
    if (Number(amountTendered) < totalCash) {
        throw new Error(`Amount tendered is insufficient. Total Cash required is ₱${totalCash.toLocaleString()}.`);
    }

    // ── Delegate to service ───────────────────────────────────────────────────
    return await processPOSTransaction({
        clientData: {
            firstName: clientData.firstName.trim(),
            lastName: clientData.lastName.trim(),
            email: clientData.email.trim(),
            contactNumber: clientData.contactNumber.trim(),
            address: clientData.address?.trim() ?? "",
            relationship: clientData.relationship?.trim() ?? "",
        },
        burialData: {
            deceasedFirstName: burialData?.deceasedFirstName?.trim() ?? "",
            deceasedLastName: burialData?.deceasedLastName?.trim() ?? "",
            deceasedDOB: burialData?.deceasedDOB ?? "",
            deceasedDOD: burialData?.deceasedDOD ?? "",
            deceasedDateBuried: burialData?.deceasedDateBuried ?? "",
            intermentType: burialData?.intermentType?.trim() ?? "",
            documents: burialData?.documents ?? [],
        },
        plotId,
        needType: needType ?? "actual",
        paymentData: {
            total: Number(paymentData.total),
            balance: Number(paymentData.balance ?? paymentData.total),
            paymentStatus: paymentData.paymentStatus ?? "pending",
        },
        historyData: {
            receipt: historyData?.receipt ?? "",
            amount: Number(historyData?.amount ?? 0),
            paymentDate: historyData?.paymentDate ?? new Date().toISOString().split("T")[0],
        },
    });
}
