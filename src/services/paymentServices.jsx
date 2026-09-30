import {
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    updateDoc,
    serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { logAuditEvent } from "../utils/auditLogger";
import { createNotification } from "./notificationServices";

// ─────────────────────────────────────────────────────────────────────────────
// RECEIPT GENERATOR
// Generates unique receipt codes starting with "CHM"
// Format: CHM-YYYYMMDD-XXXXXX (e.g., CHM-20260925-839102)
// ─────────────────────────────────────────────────────────────────────────────
export function generateReceiptNumber() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    return `CHM-${yyyy}${mm}${dd}-${randomSuffix}`;
}

// Callable alias or helper object for flexibility: ReceiptGenerator() or ReceiptGenerator.generate()
export function ReceiptGenerator() {
    return generateReceiptNumber();
}
ReceiptGenerator.generate = generateReceiptNumber;

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT SERVICES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new payment document in the "payments" collection.
 *
 * @param {string} uid - Firebase user ID of the client
 * @param {string} plotId - ID of the plot being purchased/reserved
 * @param {string|null} burialId - ID of the burial record (null for pre-need)
 * @param {Object} paymentData - { total, balance, paymentStatus }
 * @returns {Promise<string>} Created payment document ID
 */
export async function createPaymentDocument(uid, plotId, burialId, paymentData) {
    const docRef = await addDoc(collection(db, "payments"), {
        user_id: uid,
        plot_id: plotId ?? "",
        burial_id: burialId ?? null,
        total: paymentData.total ?? 0,
        balance: paymentData.balance ?? 0,
        payment_status: paymentData.paymentStatus ?? "pending",
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
    });
    return docRef.id;
}

/**
 * Writes an entry to the "payment_history" collection.
 * Automatically generates a CHM receipt number if none was provided.
 *
 * @param {string} paymentId - ID of the parent payment document
 * @param {Object} historyData - { receipt, amount, paymentDate, paymentMethod, notes }
 * @returns {Promise<Object>} { id, receipt }
 */
export async function createPaymentHistoryDocument(paymentId, historyData) {
    const receiptNumber = historyData?.receipt?.trim() || generateReceiptNumber();

    const docRef = await addDoc(collection(db, "payment_history"), {
        pay_id: paymentId,
        receipt: receiptNumber,
        amount: Number(historyData?.amount ?? 0),
        payment_date: historyData?.paymentDate ?? new Date().toISOString().split("T")[0],
        payment_method: historyData?.paymentMethod ?? "Cash",
        notes: historyData?.notes ?? "",
        created_at: serverTimestamp(),
    });

    return {
        id: docRef.id,
        receipt: receiptNumber,
    };
}

/**
 * Fetch all payments
 */
export async function getPayments() {
    const snap = await getDocs(collection(db, "payments"));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch a payment record by ID
 */
export async function getPaymentById(paymentId) {
    const snap = await getDoc(doc(db, "payments", paymentId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
}

/**
 * Fetch payment history entries for a specific payment ID.
 * Uses query by pay_id with resilient in-memory sorting to prevent composite index requirement errors.
 */
export async function getPaymentHistoryByPaymentId(paymentId) {
    const q = query(
        collection(db, "payment_history"),
        where("pay_id", "==", paymentId)
    );
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    return list.sort((a, b) => {
        const timeA = a.created_at?.toMillis ? a.created_at.toMillis() : new Date(a.payment_date || 0).getTime();
        const timeB = b.created_at?.toMillis ? b.created_at.toMillis() : new Date(b.payment_date || 0).getTime();
        return timeB - timeA;
    });
}

/**
 * Fetch all payments for a specific user
 */
export async function getPaymentsByUserId(userId) {
    const q = query(
        collection(db, "payments"),
        where("user_id", "==", userId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Fetch all payments for a specific plot
 */
export async function getPaymentsByPlotId(plotId) {
    const q = query(
        collection(db, "payments"),
        where("plot_id", "==", plotId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Update an existing payment document (e.g. when installment payments reduce balance)
 */
export async function updatePayment(paymentId, updatedData) {
    const docRef = doc(db, "payments", paymentId);
    await updateDoc(docRef, {
        ...updatedData,
        updated_at: serverTimestamp(),
    });
    return true;
}

/**
 * Record an installment payment:
 * - Validates amount against remaining balance
 * - Deducts balance and advances next due date
 * - Sets status to 'paid' if balance reaches 0
 * - Records entry in payment_history
 * - Logs audit event
 */
export async function recordInstallmentPayment({
    paymentId,
    amount,
    paymentMethod = "Cash",
    paymentDate,
    receipt,
    notes = "",
    performedBy = null,
    currentDueDate = null,
    monthlyAmount = null
}) {
    const payment = await getPaymentById(paymentId);
    if (!payment) throw new Error("Payment record not found.");

    const payAmount = Number(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
        throw new Error("Payment amount must be greater than zero.");
    }
    const currentBalance = Number(payment.balance || 0);
    if (payAmount > currentBalance) {
        throw new Error(`Amount (₱${payAmount.toLocaleString()}) exceeds remaining balance of ₱${currentBalance.toLocaleString()}.`);
    }

    const newBalance = Math.max(0, currentBalance - payAmount);
    const newStatus = newBalance === 0 ? "paid" : "partial";

    // Advance due date by 1 month (or proportional months if paying multiple installments) if balance remains
    let newDueDate = null;
    if (newBalance > 0) {
        let baseDate = null;
        const activeDue = currentDueDate || payment.due_date || payment.next_due_date;
        if (activeDue) {
            baseDate = new Date(activeDue);
        }

        if (!baseDate || isNaN(baseDate.getTime())) {
            const initialBase = payment.created_at?.toDate
                ? payment.created_at.toDate()
                : (payment.last_payment_date ? new Date(payment.last_payment_date) : new Date(paymentDate || new Date()));
            baseDate = new Date(initialBase);
            baseDate.setMonth(baseDate.getMonth() + 1);
        }

        // Calculate months to advance (at least 1 month per installment payment)
        const mAmount = Number(monthlyAmount || payment.monthly_amount || payment.monthly_installment || 0);
        let monthsToAdvance = 1;
        if (mAmount > 0 && payAmount >= mAmount * 1.8) {
            monthsToAdvance = Math.max(1, Math.round(payAmount / mAmount));
        }

        baseDate.setMonth(baseDate.getMonth() + monthsToAdvance);
        const y = baseDate.getFullYear();
        const m = String(baseDate.getMonth() + 1).padStart(2, "0");
        const d = String(baseDate.getDate()).padStart(2, "0");
        newDueDate = `${y}-${m}-${d}`;
    }

    // 1. Update payment document
    await updatePayment(paymentId, {
        balance: newBalance,
        payment_status: newStatus,
        last_payment_date: paymentDate || new Date().toISOString().split("T")[0],
        due_date: newDueDate,
        next_due_date: newDueDate,
    });

    // 2. Add payment history document
    const historyRes = await createPaymentHistoryDocument(paymentId, {
        receipt,
        amount: payAmount,
        paymentDate: paymentDate || new Date().toISOString().split("T")[0],
        paymentMethod,
        notes,
    });

    // 3. Log audit event
    try {
        await logAuditEvent({
            module: 'Payments',
            actionType: 'INSTALLMENT_COLLECTION',
            description: `Recorded payment of ₱${payAmount.toLocaleString()} (${historyRes.receipt}). New balance: ₱${newBalance.toLocaleString()}.`,
            targetItem: historyRes.receipt,
            details: {
                paymentId,
                receipt: historyRes.receipt,
                amount: payAmount,
                previousBalance: currentBalance,
                newBalance,
                paymentMethod,
                paymentStatus: newStatus,
            },
            performedBy
        });
    } catch (auditErr) {
        console.warn("Could not log audit event:", auditErr);
    }

    // 4. Create Notification
    try {
        const isFull = newBalance === 0;
        await createNotification({
            type: isFull ? "info" : "medium",
            category: "installment",
            title: isFull ? `Account Fully Paid (${historyRes.receipt})` : `Installment Payment: ${historyRes.receipt}`,
            message: isFull
                ? `Installment balance settled in full with payment of ₱${payAmount.toLocaleString()}. Balance is now ₱0.00.`
                : `Recorded ₱${payAmount.toLocaleString()} installment collection. Remaining balance: ₱${newBalance.toLocaleString()}. Next due: ${newDueDate || "N/A"}.`,
            action_link: "/staff/payments",
            user_id: "staff",
        });
    } catch (notifErr) {
        console.warn("Could not create notification for installment payment:", notifErr);
    }

    return {
        success: true,
        receipt: historyRes.receipt,
        newBalance,
        newStatus,
        newDueDate,
    };
}
