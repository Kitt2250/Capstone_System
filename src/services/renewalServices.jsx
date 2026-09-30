import {
    collection,
    doc,
    addDoc,
    updateDoc,
    getDocs,
    getDoc,
    onSnapshot,
    serverTimestamp,
    query,
    orderBy
} from "firebase/firestore";
import { db } from "../firebase/config";
import { generateReceiptNumber } from "./paymentServices";
import { logAuditEvent } from "../utils/auditLogger";
import { createNotification } from "./notificationServices";
import { getSystemDateISO } from "../utils/systemDate";

const RENEWALS_COLLECTION = "renewals";

/**
 * Fetch all renewal records
 */
export async function getRenewals() {
    try {
        const snap = await getDocs(
            query(collection(db, RENEWALS_COLLECTION), orderBy("created_at", "desc"))
        );
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err) {
        // Fallback without ordering in case index is pending
        const snap = await getDocs(collection(db, RENEWALS_COLLECTION));
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
}

/**
 * Real-time listener for renewals collection
 */
export function subscribeRenewals(onData, onError) {
    return onSnapshot(
        collection(db, RENEWALS_COLLECTION),
        (snapshot) => {
            const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            // Client-side sort by date descending
            list.sort((a, b) => {
                const tA = a.created_at?.toMillis ? a.created_at.toMillis() : new Date(a.renewal_date || 0).getTime();
                const tB = b.created_at?.toMillis ? b.created_at.toMillis() : new Date(b.renewal_date || 0).getTime();
                return tB - tA;
            });
            if (onData) onData(list);
        },
        (err) => {
            console.error("Error in renewals subscription:", err);
            if (onError) onError(err);
        }
    );
}

/**
 * Process a Contract Renewal for a Grave Plot:
 * 1. Writes record to "renewals" collection.
 * 2. Updates plot with new contract_expiration_date & renewal_count in "plots".
 * 3. Records official payment receipt in "payment_history".
 * 4. Logs audit event.
 * 5. Generates operational notification under category "renewals".
 */
export async function processContractRenewal({
    burialId = null,
    plotId,
    plotCode,
    uid,
    clientName,
    deceasedName,
    previousExpirationDate,
    newExpirationDate,
    renewalYears,
    renewalFee,
    paymentMethod = "Cash",
    amountTendered = 0,
    change = 0,
    notes = "",
    paymentId = null,
}) {
    if (!plotId && !burialId) {
        throw new Error("Grave lot or burial selection is required for renewal.");
    }
    if (!renewalYears || Number(renewalYears) < 1) {
        throw new Error("Please specify valid renewal contract years.");
    }
    if (!newExpirationDate) {
        throw new Error("New contract expiration date is required.");
    }

    const todayStr = getSystemDateISO();
    const receiptCode = generateReceiptNumber();
    const feeNum = Number(renewalFee || 0);

    // 1. Create Renewal Record
    const renewalRef = await addDoc(collection(db, RENEWALS_COLLECTION), {
        burial_id: burialId || null,
        plot_id: plotId || null,
        plot_code: plotCode || "N/A",
        user_id: uid || null,
        client_name: clientName || "Lot Owner / Family",
        deceased_name: deceasedName || "",
        previous_expiration_date: previousExpirationDate || todayStr,
        new_expiration_date: newExpirationDate,
        years_added: Number(renewalYears),
        fee: feeNum,
        receipt: receiptCode,
        payment_method: paymentMethod,
        amount_tendered: Number(amountTendered || feeNum),
        change: Number(change || 0),
        notes: notes || `Burial lease renewed for ${renewalYears} year(s) @ ₱${feeNum.toLocaleString()}.`,
        renewal_date: todayStr,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
    });

    // 2. Update Burial in "burials" collection (if burialId is provided)
    if (burialId) {
        try {
            const burialRef = doc(db, "burials", burialId);
            const burialSnap = await getDoc(burialRef);
            const currentBurialCount = burialSnap.exists() ? Number(burialSnap.data().renewal_count || 0) : 0;

            await updateDoc(burialRef, {
                contract_expiration_date: newExpirationDate,
                last_renewed_date: todayStr,
                renewal_count: currentBurialCount + 1,
                contract_years_extended: Number(renewalYears),
                updated_at: serverTimestamp(),
            });
        } catch (burialErr) {
            console.warn("Could not update burial expiration date directly:", burialErr);
        }
    }

    // 3. Update Plot in "plots" collection (if plotId is provided)
    if (plotId) {
        try {
            const plotRef = doc(db, "plots", plotId);
            const plotSnap = await getDoc(plotRef);
            const currentCount = plotSnap.exists() ? Number(plotSnap.data().renewal_count || 0) : 0;

            await updateDoc(plotRef, {
                contract_expiration_date: newExpirationDate,
                last_renewed_date: todayStr,
                renewal_count: currentCount + 1,
                contract: `${renewalYears} Years`,
                contract_years: Number(renewalYears),
                renewal_fee: Number(renewalFee),
                updated_at: serverTimestamp(),
            });
        } catch (plotErr) {
            console.warn("Could not update plot expiration date directly:", plotErr);
        }
    }

    // 3. Create Payment History Entry (CHM receipt)
    let historyId = null;
    try {
        const histRef = await addDoc(collection(db, "payment_history"), {
            pay_id: paymentId || `RENEW-${plotId}`,
            receipt: receiptCode,
            amount: feeNum,
            payment_date: todayStr,
            payment_method: paymentMethod,
            notes: `Contract renewal (${renewalYears} yrs) for Lot ${plotCode}. Valid until ${newExpirationDate}`,
            created_at: serverTimestamp(),
        });
        historyId = histRef.id;
    } catch (histErr) {
        console.warn("Could not log payment history for renewal:", histErr);
    }

    // 4. Audit Log
    try {
        await logAuditEvent({
            module: "Renewals",
            actionType: "CONTRACT_RENEWAL",
            description: `Renewed grave contract for Lot ${plotCode} (${clientName}) for ${renewalYears} years. Fee: ₱${feeNum.toLocaleString()}. New Expiry: ${newExpirationDate}. Receipt: ${receiptCode}`,
            targetItem: plotId,
            details: {
                plotId,
                plotCode,
                renewalId: renewalRef.id,
                receipt: receiptCode,
                renewalYears,
                renewalFee: feeNum,
                newExpirationDate,
            },
        });
    } catch (auditErr) {
        console.warn("Could not log audit event for contract renewal:", auditErr);
    }

    // 5. Operational Notification under "renewals"
    try {
        await createNotification({
            type: "medium",
            category: "renewals",
            title: `Contract Renewed: Lot ${plotCode}`,
            message: `Grave plot lease for Lot ${plotCode} (${clientName}) was successfully renewed for ${renewalYears} years until ${newExpirationDate}. Official Receipt: ${receiptCode}.`,
            action_link: "/staff/renewals",
            user_id: "staff",
        });
    } catch (notifErr) {
        console.warn("Could not log notification for contract renewal:", notifErr);
    }

    return {
        renewalId: renewalRef.id,
        receipt: receiptCode,
        newExpirationDate,
        historyId,
    };
}
