import {
    collection,
    doc,
    addDoc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    updateDoc,
    serverTimestamp,
} from "firebase/firestore";
import { db, firebaseConfig } from "../firebase/config";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { updatePlotOccupancy } from "./plotServices";
import {
    createPaymentDocument,
    createPaymentHistoryDocument,
    generateReceiptNumber,
    ReceiptGenerator,
} from "./paymentServices";
import { createNotification } from "./notificationServices";
import { logAuditEvent } from "../utils/auditLogger";

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1: Create Firebase Auth account
//   - email  : client email
//   - password: contact number (as raw string)
// Uses a secondary Firebase app so the currently logged-in staff is NOT signed out.
// Returns the new UID.
// ─────────────────────────────────────────────────────────────────────────────
async function createAuthAccount(email, password) {
    const secondaryAppName = `pos-client-${Date.now()}`;
    const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
        const credential = await createUserWithEmailAndPassword(
            secondaryAuth,
            email,
            password
        );
        return credential.user.uid;
    } catch (error) {
        if (error.code === "auth/email-already-in-use") {
            throw new Error("This email is already registered.");
        }
        if (error.code === "auth/invalid-email") {
            throw new Error("Invalid email address.");
        }
        if (error.code === "auth/weak-password") {
            throw new Error("Password (contact number) is too short — must be at least 6 characters.");
        }
        throw new Error("Failed to create client account: " + error.message);
    } finally {
        await secondaryAuth.signOut();
        await deleteApp(secondaryApp);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2: Write Firestore user document  (collection: "users")
// ─────────────────────────────────────────────────────────────────────────────
async function createUserDocument(uid, email) {
    await setDoc(doc(db, "users", uid), {
        email,
        role: "family",          // default for POS-created accounts
        status: "inactive",
        created_at: serverTimestamp(),
        last_login: null,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: Write client document  (collection: "clients")
// ─────────────────────────────────────────────────────────────────────────────
async function createClientDocument(uid, clientData) {
    const docRef = await addDoc(collection(db, "clients"), {
        user_id: uid,
        first_name: clientData.firstName ?? "",
        last_name: clientData.lastName ?? "",
        contact: clientData.contactNumber ?? "",
        address: clientData.address ?? "",
        relationship: clientData.relationship ?? "",
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
    });
    return docRef.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4: Write burial document  (collection: "burials")
// ─────────────────────────────────────────────────────────────────────────────
async function createBurialDocument(uid, plotId, burialData) {
    const docRef = await addDoc(collection(db, "burials"), {
        user_id: uid,
        plot_id: plotId ?? "",
        name: `${burialData.deceasedFirstName ?? ""} ${burialData.deceasedLastName ?? ""}`.trim(),
        date_of_birth: burialData.deceasedDOB ?? "",
        date_of_death: burialData.deceasedDOD ?? "",
        date_buried: burialData.deceasedDateBuried ?? "",
        interment_type: burialData.intermentType ?? "",
        documents: burialData.documents ?? [],
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
    });
    return docRef.id;
}

// STEP 5 & 6 are delegated to paymentServices.jsx
// (createPaymentDocument and createPaymentHistoryDocument)

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7: Recalculate and update plot status based on burial count
// Delegated to centralized updatePlotOccupancy in plotServices.jsx
// ─────────────────────────────────────────────────────────────────────────────
async function updatePlotStatus(plotId, needType, uid) {
    return await updatePlotOccupancy(plotId, { needType, userId: uid });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ORCHESTRATOR
// Runs all 7 steps in sequence and returns all generated IDs.
//
// @param {Object} transactionData
//   clientData     : { firstName, lastName, email, contactNumber, address, relationship }
//   burialData     : { deceasedFirstName, deceasedLastName, deceasedDOB, deceasedDOD,
//                      deceasedDateBuried, intermentType, documents[] }
//   plotId         : string  (selected plot ID)
//   needType       : "actual" | "pre-need"
//   paymentData    : { total, balance, paymentStatus }
//   historyData    : { receipt, amount, paymentDate }
// ─────────────────────────────────────────────────────────────────────────────
export async function processPOSTransaction(transactionData) {
    const { clientData, burialData, plotId, needType, paymentData, historyData } = transactionData;

    // 1. Create Auth account (email + contactNo as password)
    const uid = await createAuthAccount(
        clientData.email,
        clientData.contactNumber
    );

    // 2. Create Firestore user document
    await createUserDocument(uid, clientData.email);

    // 3. Create client record
    const clientId = await createClientDocument(uid, clientData);

    // 4. Create burial record (only for actual burial; skipped for pre-need)
    let burialId = null;
    if (needType !== "pre-need") {
        burialId = await createBurialDocument(uid, plotId, burialData);
    }

    // 5. Create payment record
    const paymentId = await createPaymentDocument(uid, plotId, burialId, paymentData);

    // 6. Create initial payment history entry
    const historyId = await createPaymentHistoryDocument(paymentId, historyData);

    // 7. Recalculate and update plot status & record owner user_id
    await updatePlotStatus(plotId, needType, uid);

    // 8. Create Operational Notification
    try {
        const isInstallment = Number(paymentData?.balance || 0) > 0;
        const clientName = `${clientData?.firstName || ""} ${clientData?.lastName || ""}`.trim() || "Client";
        await createNotification({
            type: isInstallment ? "high" : "medium",
            category: isInstallment ? "installment" : "payments",
            title: isInstallment ? `New Installment Plan: ${historyData.receipt}` : `POS Payment: ${historyData.receipt}`,
            message: isInstallment
                ? `Recorded downpayment of ₱${Number(historyData.amount || 0).toLocaleString()} for ${clientName}. Balance remaining: ₱${Number(paymentData.balance || 0).toLocaleString()}.`
                : `Processed full settlement payment of ₱${Number(historyData.amount || 0).toLocaleString()} for ${clientName}.`,
            action_link: "/staff/payments",
            user_id: "staff",
        });
    } catch (notifErr) {
        console.warn("Could not log notification for POS transaction:", notifErr);
    }

    // 9. Create Audit Log
    try {
        const clientName = `${clientData?.firstName || ""} ${clientData?.lastName || ""}`.trim() || "Client";
        await logAuditEvent({
            module: "Point of Sale",
            actionType: "POS_TRANSACTION",
            description: `Completed POS payment (${historyData.receipt || "Receipt"}) for ${clientName}. Total: ₱${Number(paymentData?.total || 0).toLocaleString()}`,
            targetItem: historyData.receipt || plotId,
            details: {
                receipt: historyData.receipt,
                clientName,
                plotId,
                needType,
                total: paymentData.total,
                balance: paymentData.balance,
                amountPaid: historyData.amount,
            }
        });
    } catch (auditErr) {
        console.warn("Could not log audit event for POS transaction:", auditErr);
    }

    return {
        uid,
        clientId,
        burialId,
        paymentId,
        historyId,
    };
}

export {
    updatePlotOccupancy,
    createPaymentDocument,
    createPaymentHistoryDocument,
    generateReceiptNumber,
    ReceiptGenerator,
};

