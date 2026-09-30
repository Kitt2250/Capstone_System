import { collection, doc, getDocs, updateDoc, setDoc, addDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";

export function generateNextGraveTypeId(existingTypes = []) {
    let maxNum = 0;
    const prefix = "GT";

    existingTypes.forEach((t) => {
        const idStr = String(t.grave_type_id || t.id || "").trim().toUpperCase();
        const match = idStr.match(/^GT(\d+)$/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
        }
    });

    const nextNum = maxNum + 1;
    const padded = String(nextNum).padStart(3, "0");
    return `${prefix}${padded}`;
}

export async function createGraveType(data) {
    try {
        const allTypes = await getGraveTypes();
        const nextId = generateNextGraveTypeId(allTypes);
        const docRef = doc(db, "grave_type", nextId);
        await setDoc(docRef, {
            ...data,
            grave_type_id: nextId
        });
        return nextId;
    } catch (error) {
        console.error("Error creating grave_type:", error);
        throw error;
    }
}

export async function getGraveTypes() {
    try {
        let graveTypeRef = collection(db, "grave_type");
        let snap = await getDocs(graveTypeRef);

        if (snap.empty) {
            const fallbackRef = collection(db, "gravelot_type");
            const fallbackSnap = await getDocs(fallbackRef);
            if (!fallbackSnap.empty) {
                snap = fallbackSnap;
            }
        }

        return snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Error fetching grave_type:", error);
        throw error;
    }
}

export function subscribeGraveTypes(onData, onError) {
    return onSnapshot(
        collection(db, "grave_type"),
        async (snap) => {
            if (!snap.empty) {
                const types = snap.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data()
                }));
                if (onData) onData(types);
            } else {
                try {
                    const fallbackSnap = await getDocs(collection(db, "gravelot_type"));
                    const types = fallbackSnap.docs.map((doc) => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    if (onData) onData(types);
                } catch {
                    if (onData) onData([]);
                }
            }
        },
        (error) => {
            console.error("Error in grave_type subscription:", error);
            if (onError) onError(error);
        }
    );
}

export async function getIntermentFees() {
    try {
        const intermentRef = collection(db, "interment_fee");
        const snap = await getDocs(intermentRef);

        return snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        console.error("Error fetching interment_fee:", error);
        throw error;
    }
}

export function subscribeIntermentFees(onData, onError) {
    return onSnapshot(
        collection(db, "interment_fee"),
        (snap) => {
            const fees = snap.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));
            if (onData) onData(fees);
        },
        (error) => {
            console.error("Error subscribing to interment_fee:", error);
            if (onError) onError(error);
        }
    );
}

export async function updateGraveType(id, updatedData) {
    try {
        const docRef = doc(db, "grave_type", id);
        await updateDoc(docRef, updatedData);
        return true;
    } catch (error) {
        console.error("Error updating grave_type:", error);
        throw error;
    }
}

export function generateNextIntermentFeeId(existingFees = []) {
    let maxNum = 0;
    let detectedPrefix = "IF";

    existingFees.forEach((f) => {
        const idStr = String(f.interment_fee_id || f.id || "").trim();
        const match = idStr.match(/^([A-Za-z0-9_-]+?)(\d+)$/);
        if (match) {
            detectedPrefix = match[1];
            const num = parseInt(match[2], 10);
            if (num > maxNum) {
                maxNum = num;
            }
        }
    });

    const nextNum = maxNum + 1;
    const padded = String(nextNum).padStart(3, "0");
    return `${detectedPrefix}${padded}`;
}

export async function createIntermentFee(feeData) {
    try {
        let nextId = feeData.interment_fee_id;

        if (!nextId) {
            const allFees = await getIntermentFees();
            nextId = generateNextIntermentFeeId(allFees);
        }

        const docRef = doc(db, "interment_fee", nextId);
        await setDoc(docRef, {
            fee: Number(feeData.fee),
            graveLot_type: feeData.graveLot_type || feeData.grave_type_id || "",
            grave_type_id: feeData.grave_type_id || feeData.graveLot_type || "",
            grave_type: feeData.grave_type || "",
            interment_fee_id: nextId,
            interment_type: feeData.interment_type
        });

        return nextId;
    } catch (error) {
        console.error("Error creating interment_fee:", error);
        throw error;
    }
}

export async function updateIntermentFee(id, updatedData) {
    try {
        const docRef = doc(db, "interment_fee", id);
        await updateDoc(docRef, {
            fee: Number(updatedData.fee),
            interment_type: updatedData.interment_type
        });
        return true;
    } catch (error) {
        console.error("Error updating interment_fee:", error);
        throw error;
    }
}

