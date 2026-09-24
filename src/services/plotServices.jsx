import {
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot
} from "firebase/firestore";
import { db } from "../firebase/config";

const PLOTS_COLLECTION = "plots";

/**
 * Fetch all plots from Firestore
 */
export async function getPlots() {
    try {
        const snap = await getDocs(collection(db, PLOTS_COLLECTION));
        return snap.docs.map((d) => ({
            id: d.id,
            ...d.data()
        }));
    } catch (error) {
        console.error("Error fetching plots:", error);
        throw error;
    }
}

/**
 * Fetch a single plot by ID
 */
export async function getPlotById(plotId) {
    try {
        const docSnap = await getDoc(doc(db, PLOTS_COLLECTION, plotId));
        if (docSnap.exists()) {
            return { id: docSnap.id, ...docSnap.data() };
        }
        return null;
    } catch (error) {
        console.error("Error fetching plot by id:", error);
        throw error;
    }
}

/**
 * Real-time listener for plots collection
 */
export function subscribePlots(onData, onError) {
    return onSnapshot(
        collection(db, PLOTS_COLLECTION),
        (snapshot) => {
            const plotList = snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data()
            }));
            if (onData) onData(plotList);
        },
        (error) => {
            console.error("Error in plots subscription:", error);
            if (onError) onError(error);
        }
    );
}

/**
 * Calculate the next incremental plot number for a given prefix
 */
export async function getNextPlotNumber(prefix) {
    try {
        const snapshot = await getDocs(collection(db, PLOTS_COLLECTION));
        let maxNum = 0;
        const normalizedPrefix = String(prefix || "").trim().toUpperCase();

        snapshot.docs.forEach((d) => {
            const plotData = d.data();
            const plotCode = String(plotData.plotCode || plotData.plotcode || "").trim().toUpperCase();
            if (plotCode.startsWith(normalizedPrefix + "-")) {
                const remainder = plotCode.slice((normalizedPrefix + "-").length);
                const match = remainder.match(/^(\d+)/);
                if (match) {
                    const numPart = parseInt(match[1], 10);
                    if (!isNaN(numPart) && numPart > maxNum) {
                        maxNum = numPart;
                    }
                }
            }
        });

        return maxNum + 1;
    } catch (err) {
        console.error("Error calculating next plot number:", err);
        return 1;
    }
}

/**
 * Create a new plot
 */
export async function createPlot(plotData) {
    try {
        const { graveLotTypeID, ...rest } = plotData;
        const graveTypeId = plotData.grave_type_id || graveLotTypeID;
        const docRef = await addDoc(collection(db, PLOTS_COLLECTION), {
            ...rest,
            grave_type_id: graveTypeId,
            createdAt: plotData.createdAt || new Date().toISOString()
        });
        return docRef.id;
    } catch (error) {
        console.error("Error creating plot:", error);
        throw error;
    }
}

/**
 * Create multiple plots in bulk
 */
export async function createBulkPlots(plotDocs) {
    const saved = [];
    const errors = [];

    for (const plotDoc of plotDocs) {
        try {
            const { graveLotTypeID, ...rest } = plotDoc;
            const graveTypeId = plotDoc.grave_type_id || graveLotTypeID;
            const dataToSave = {
                ...rest,
                grave_type_id: graveTypeId,
                createdAt: plotDoc.createdAt || new Date().toISOString()
            };
            const docRef = await addDoc(collection(db, PLOTS_COLLECTION), dataToSave);
            saved.push({ id: docRef.id, ...dataToSave });
        } catch (err) {
            console.error(`Failed to save plot ${plotDoc.plotCode}:`, err);
            errors.push({ plotDoc, error: err });
        }
    }

    return { saved, errors };
}

/**
 * Update a plot
 */
export async function updatePlot(plotId, updatedData) {
    try {
        const docRef = doc(db, PLOTS_COLLECTION, plotId);
        await updateDoc(docRef, {
            ...updatedData,
            updatedAt: new Date().toISOString()
        });
        return true;
    } catch (error) {
        console.error("Error updating plot:", error);
        throw error;
    }
}

/**
 * Delete a plot
 */
export async function deletePlot(plotId) {
    try {
        await deleteDoc(doc(db, PLOTS_COLLECTION, plotId));
        return true;
    } catch (error) {
        console.error("Error deleting plot:", error);
        throw error;
    }
}
