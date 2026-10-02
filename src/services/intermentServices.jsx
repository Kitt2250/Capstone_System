import {
    collection,
    doc,
    addDoc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { updatePlotOccupancy } from "./plotServices";
import { generateReceiptNumber } from "./paymentServices";
import { logAuditEvent } from "../utils/auditLogger";
import { createNotification } from "./notificationServices";

/**
 * Creates an Interment & Burial transaction on an ALREADY OWNED grave lot.
 * - Does NOT charge for the grave lot (lot is already owned/paid).
 * - Records the burial in "burials".
 * - Recalculates and updates plot occupancy/status.
 * - Creates service payment & payment history receipt.
 * - Logs audit event.
 */
export async function createIntermentBurialTransaction({
    plotId,
    ownerId,
    clientData,
    burialData,
    paymentData,
    historyData,
}) {
    if (!plotId) {
        throw new Error("An owned grave lot must be selected.");
    }
    if (!burialData?.deceasedFirstName?.trim() || !burialData?.deceasedLastName?.trim()) {
        throw new Error("Deceased first and last name are required.");
    }
    if (!burialData?.intermentType?.trim()) {
        throw new Error("Interment service package is required.");
    }

    // 1. Resolve UID (existing lot owner UID, or matching user by email, or create new family record)
    let uid = ownerId || null;

    if (!uid && clientData?.email?.trim()) {
        try {
            const userQ = query(
                collection(db, "users"),
                where("email", "==", clientData.email.trim().toLowerCase())
            );
            const userSnap = await getDocs(userQ);
            if (!userSnap.empty) {
                uid = userSnap.docs[0].id;
            }
        } catch (err) {
            console.warn("Could not lookup user by email:", err);
        }
    }

    // If still no UID, generate a client record
    if (!uid) {
        const tempUserDoc = await addDoc(collection(db, "users"), {
            email: clientData?.email?.trim() || "",
            name: `${clientData?.firstName ?? ""} ${clientData?.lastName ?? ""}`.trim() || "Owned Lot Informant",
            role: "family",
            status: "inactive",
            isActivate: false,
            createdAt: serverTimestamp(),
        });
        uid = tempUserDoc.id;

        await addDoc(collection(db, "clients"), {
            user_id: uid,
            first_name: clientData?.firstName ?? "",
            last_name: clientData?.lastName ?? "",
            contact: clientData?.contactNumber ?? "",
            address: clientData?.address ?? "",
            relationship: clientData?.relationship ?? "Informant",
            isActivate: false,
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
        });
    }

    // 2. Create Burial document
    const deceasedFullName = `${burialData.deceasedFirstName ?? ""} ${burialData.deceasedLastName ?? ""}`.trim();
    const burialRef = await addDoc(collection(db, "burials"), {
        user_id: uid,
        plot_id: plotId,
        name: deceasedFullName,
        date_of_birth: burialData.deceasedDOB ?? "",
        date_of_death: burialData.deceasedDOD ?? "",
        date_buried: burialData.deceasedDateBuried ?? "",
        interment_type: burialData.intermentType ?? "Standard Burial / Interment",
        documents: burialData.documents ?? [],
        notes: "Interment on owned lot (transfer / burial)",
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
    });

    // 3. Recalculate and update Plot Occupancy (marks partial or occupied based on capacity)
    await updatePlotOccupancy(plotId, { needType: "actual", userId: uid });

    // 4. Create Payment Record (for the interment burial service fee + optional wake space)
    const clientFullName = clientData?.name || `${clientData?.firstName ?? ""} ${clientData?.lastName ?? ""}`.trim();
    const paymentRef = await addDoc(collection(db, "payments"), {
        user_id: uid,
        plot_id: plotId,
        burial_id: burialRef.id,
        service_type: "Interment & Burial Services (Owned Lot)",
        subtotal: Number(paymentData?.subtotal ?? paymentData?.total ?? 0),
        interment_fee: Number(paymentData?.intermentFee ?? 0),
        wake_price: Number(paymentData?.wakePrice ?? 0),
        discount_type: paymentData?.discountType || null,
        discount_amount: Number(paymentData?.discountAmount ?? 0),
        total: Number(paymentData?.total ?? 0),
        balance: 0,
        payment_status: "paid",
        lot_status: "owned",
        client_name: clientFullName,
        deceased_name: deceasedFullName,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
    });

    // 5. Create Payment History Entry (CHM receipt)
    const receiptCode = historyData?.receipt?.trim() || generateReceiptNumber();
    const discountNote = paymentData?.discountAmount > 0
        ? ` (${paymentData.discountType} -20%: -₱${Number(paymentData.discountAmount).toLocaleString()})`
        : "";
    const historyRef = await addDoc(collection(db, "payment_history"), {
        pay_id: paymentRef.id,
        receipt: receiptCode,
        amount: Number(historyData?.amount ?? paymentData?.totalCash ?? 0),
        payment_date: historyData?.paymentDate ?? new Date().toISOString().split("T")[0],
        payment_method: "Cash",
        notes: `Interment service payment for ${deceasedFullName} on owned plot ${plotId}${discountNote}`,
        created_at: serverTimestamp(),
    });

    // 6. Audit Log
    try {
        await logAuditEvent({
            module: "Interment",
            actionType: "BURIAL_BOOKING",
            description: `Scheduled interment burial for ${deceasedFullName} on owned lot (${plotId}). Fee: ₱${Number(paymentData?.total ?? 0).toLocaleString()}. Receipt: ${receiptCode}`,
            targetItem: burialRef.id,
            details: {
                burialId: burialRef.id,
                plotId,
                uid,
                receipt: receiptCode,
                totalPaid: paymentData?.totalCash ?? 0,
                intermentType: burialData.intermentType,
            },
        });
    } catch (auditErr) {
        console.warn("Could not log audit event for interment:", auditErr);
    }

    // 7. Operational Notification
    try {
        await createNotification({
            type: "medium",
            category: "payments",
            title: `Interment Scheduled: ${deceasedFullName}`,
            message: `Burial scheduled for ${deceasedFullName} on owned plot ${plotId}. Payment receipt: ${receiptCode}. Total: ₱${Number(paymentData?.totalCash ?? paymentData?.total ?? 0).toLocaleString()}.`,
            action_link: "/staff/payments",
            user_id: "staff",
        });
    } catch (notifErr) {
        console.warn("Could not log notification for interment:", notifErr);
    }

    return {
        uid,
        burialId: burialRef.id,
        paymentId: paymentRef.id,
        historyId: historyRef.id,
        receipt: receiptCode,
    };
}
