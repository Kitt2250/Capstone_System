import { createIntermentBurialTransaction } from "../services/intermentServices";
import { assertWakeSpaceBookingAvailableController } from "./wakeSpaceController";

/**
 * Checks whether a given date falls on a weekend (Saturday or Sunday).
 * Uses local calendar date parsing to avoid timezone discrepancies.
 *
 * @param {string|Date} dateInput - Date string (YYYY-MM-DD or ISO) or Date instance
 * @returns {boolean}
 */
export function isWeekendInterment(dateInput) {
    if (!dateInput) return false;
    let d;
    if (typeof dateInput === "string") {
        const datePart = dateInput.split("T")[0];
        const parts = datePart.split("-");
        if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            d = new Date(y, m, day);
        } else {
            d = new Date(dateInput);
        }
    } else if (dateInput instanceof Date) {
        d = dateInput;
    } else {
        return false;
    }

    if (isNaN(d.getTime())) return false;
    const dayOfWeek = d.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday = 0, Saturday = 6
}

/**
 * Checks whether the given plot or grave type name/code is Mausoleum or Single Niche.
 *
 * @param {Object|string} plotOrType - Grave lot object, plot code, or grave type string
 * @returns {boolean}
 */
export function isMausoleumOrSingleNiche(plotOrType) {
    if (!plotOrType) return false;
    let text = "";
    if (typeof plotOrType === "string") {
        text = plotOrType;
    } else if (typeof plotOrType === "object") {
        text = [
            plotOrType.graveType,
            plotOrType.grave_type,
            plotOrType.name,
            plotOrType.plotCode,
            plotOrType.lotId,
            plotOrType.rawPlot?.grave_type,
            plotOrType.rawPlot?.grave_type_id,
            plotOrType.rawPlot?.graveLotTypeID,
            plotOrType.matchingType?.name,
            plotOrType.matchingType?.grave_type,
        ].filter(Boolean).join(" ");
    }
    const lower = text.toLowerCase();
    const isMausoleum = lower.includes("mausoleum") || /\bma\b/i.test(lower) || /^ma-/i.test(text.trim());
    const isSingleNiche = lower.includes("single niche") || lower.includes("singleniche") || /\bsn\b/i.test(lower) || /^sn-/i.test(text.trim());
    return isMausoleum || isSingleNiche;
}

/**
 * Checks whether the interment service is a Fresh Burial / Standard Interment.
 * Excludes bone transfers and cremation vaults.
 *
 * @param {Object|string} intermentServiceOrType - Service object or service type string
 * @returns {boolean}
 */
export function isFreshBurialInterment(intermentServiceOrType) {
    if (!intermentServiceOrType) return false;
    const text = typeof intermentServiceOrType === "string"
        ? intermentServiceOrType
        : (intermentServiceOrType.interment_type || intermentServiceOrType.type || intermentServiceOrType.name || "");
    const lower = text.toLowerCase();
    // Exclude other distinct services
    if (lower.includes("bone") || lower.includes("cremat")) return false;
    // Matches fresh burial or standard burial / interment
    return lower.includes("fresh") || lower.includes("standard") || lower.includes("casket") || lower.includes("ground burial");
}

/**
 * Calculates the interment fee with the weekend policy:
 * Mausoleum and Single Niche Fresh Burial Interment have increased 3K (+₱3,000) if it's weekends.
 *
 * @param {Object} params
 * @param {number|string} params.baseFee - Base interment fee
 * @param {Object|string} params.plotOrGraveType - Selected grave lot or grave type identifier
 * @param {Object|string} params.intermentServiceOrType - Interment service or type name
 * @param {string|Date} params.burialDate - Scheduled interment / burial date
 * @returns {{
 *   baseFee: number,
 *   finalFee: number,
 *   weekendSurcharge: number,
 *   isWeekendRateApplied: boolean,
 *   isWeekend: boolean,
 *   isEligibleGraveType: boolean,
 *   isFreshBurial: boolean,
 *   rateNote: string
 * }}
 */
export function calculateIntermentFeeController({
    baseFee = 0,
    plotOrGraveType,
    intermentServiceOrType,
    burialDate
}) {
    const rawFee = Number(baseFee || 0);
    const eligiblePlot = isMausoleumOrSingleNiche(plotOrGraveType);
    const freshBurial = isFreshBurialInterment(intermentServiceOrType);
    const weekend = isWeekendInterment(burialDate);

    const isWeekendRateApplied = eligiblePlot && freshBurial && weekend;
    const weekendSurcharge = isWeekendRateApplied ? 3000 : 0;
    const finalFee = rawFee + weekendSurcharge;

    const rateNote = isWeekendRateApplied
        ? "Weekend Surcharge (+₱3,000) applied for Fresh Burial on Mausoleum / Single Niche"
        : "";

    return {
        baseFee: rawFee,
        finalFee,
        weekendSurcharge,
        isWeekendRateApplied,
        isWeekend: weekend,
        isEligibleGraveType: eligiblePlot,
        isFreshBurial: freshBurial,
        rateNote
    };
}

/**
 * Validates and coordinates interment booking on an ALREADY OWNED grave lot.
 */
export async function processIntermentBookingController(transactionData) {
    const { plotId, clientData, burialData, paymentData, historyData, wakeSpaceData } = transactionData;

    // 1. Plot Validation
    if (!plotId) {
        throw new Error("Please select an owned grave lot for the interment.");
    }

    // 2. Deceased Validation
    if (!burialData?.deceasedFirstName?.trim() || !burialData?.deceasedLastName?.trim()) {
        throw new Error("Deceased first and last name are required.");
    }
    if (!burialData?.intermentType?.trim()) {
        throw new Error("Please select an interment service package.");
    }

    // 3. Registered Owner / Client Data Validation
    const ownerName = clientData?.name || `${clientData?.firstName ?? ""} ${clientData?.lastName ?? ""}`.trim();
    if (!ownerName) {
        throw new Error("Registered lot owner details are required.");
    }

    // 4. Documents Validation
    const docs = Array.isArray(burialData?.documents) ? burialData.documents : [];
    const hasValidId = docs.some((d) => /valid\s*id/i.test(String(d)));
    const hasPermit = docs.some((d) => /permit/i.test(String(d)));

    if (!hasValidId) {
        throw new Error("Valid ID of Informant / Payor must be verified.");
    }
    if (!hasPermit) {
        throw new Error("Burial / Transfer Permit is required for interment.");
    }

    // 5. Payment Validation
    const totalCash = Number(paymentData?.totalCash ?? paymentData?.total ?? 0);
    const amountTendered = paymentData?.amountTendered;

    if (amountTendered == null || amountTendered === "" || isNaN(Number(amountTendered))) {
        throw new Error("Amount tendered is required.");
    }
    if (Number(amountTendered) < totalCash) {
        throw new Error(`Amount tendered is insufficient. Total Cash required is ₱${totalCash.toLocaleString()}.`);
    }

    // 6. Wake Space Validation (if wake facility is booked with interment)
    if (wakeSpaceData) {
        await assertWakeSpaceBookingAvailableController({
            spaceId: wakeSpaceData.spaceId,
            wake: wakeSpaceData.wake,
            startDate: wakeSpaceData.startDate,
            endDate: wakeSpaceData.endDate,
            days: wakeSpaceData.days,
        });
    }

    // 7. Delegate to Service
    return await createIntermentBurialTransaction(transactionData);
}
