import {
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    query,
    where
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

/**
 * Recalculate and update a plot's occupiedCount and status based on existing burials in Firestore.
 * Useful when a burial record is deleted, added, or modified.
 *
 * Rules:
 *   - options.needType === "pre-need"            → reserved
 *   - burialCount === 0                          → reserved (if plot is reserved) or available
 *   - burialCount >= maxCapacity                 → occupied
 *   - 0 < burialCount < maxCapacity              → partial
 *
 * @param {string} plotId - ID of the plot
 * @param {Object} [options] - Optional config { needType, forceStatus }
 * @returns {Promise<{ plotId: string, occupiedCount: number, status: string, maxCapacity: number } | null>}
 */
export async function updatePlotOccupancy(plotId, options = {}) {
    if (!plotId) {
        console.warn("updatePlotOccupancy: plotId is required.");
        return null;
    }

    try {
        const plotRef = doc(db, PLOTS_COLLECTION, plotId);
        const plotSnap = await getDoc(plotRef);

        if (!plotSnap.exists()) {
            console.warn(`updatePlotOccupancy: Plot ${plotId} not found.`);
            return null;
        }

        const plotData = plotSnap.data();
        const maxCapacity = Number(plotData.maxCapacity ?? plotData.capacity ?? 1);

        // Fetch all burial records currently associated with this plot
        const burialSnap = await getDocs(
            query(collection(db, "burials"), where("plot_id", "==", plotId))
        );
        const burialCount = burialSnap.size;

        // Determine updated status
        let newStatus;
        if (options.forceStatus) {
            newStatus = options.forceStatus;
        } else if (options.needType === "pre-need") {
            newStatus = "reserved";
        } else if (burialCount === 0) {
            newStatus = (plotData.status === "reserved" && options.needType !== "actual") ? "reserved" : "available";
        } else if (maxCapacity > 0 && burialCount >= maxCapacity) {
            newStatus = "occupied";
        } else {
            newStatus = "partial";
        }

        const updatedData = {
            occupiedCount: burialCount,
            status: newStatus,
            updatedAt: new Date().toISOString()
        };

        if (options.userId !== undefined) {
            updatedData.user_id = options.userId;
        }

        await updateDoc(plotRef, updatedData);

        return {
            plotId,
            occupiedCount: burialCount,
            status: newStatus,
            maxCapacity
        };
    } catch (error) {
        console.error(`Error updating plot occupancy for plot ${plotId}:`, error);
        throw error;
    }
}

// Alias to safeguard against user typo
export const upadatePlotOccupancy = updatePlotOccupancy;

/**
 * Delete a burial record from Firestore and immediately recalculate its plot's occupancy
 *
 * @param {string} burialId - ID of the burial record to delete
 * @param {string} [plotId] - Plot ID if already known (otherwise looked up from burial record)
 */
export async function deleteBurialAndUpdatePlot(burialId, plotId = null) {
    if (!burialId) throw new Error("Burial ID is required.");

    let targetPlotId = plotId;
    if (!targetPlotId) {
        const burialSnap = await getDoc(doc(db, "burials", burialId));
        if (burialSnap.exists()) {
            targetPlotId = burialSnap.data()?.plot_id;
        }
    }

    await deleteDoc(doc(db, "burials", burialId));

    if (targetPlotId) {
        await updatePlotOccupancy(targetPlotId);
    }

    return { success: true, burialId, plotId: targetPlotId };
}

/**
 * Scan all plots in Firestore and synchronize their occupiedCount and status
 * with actual burial records found in the burials collection.
 * Heals any orphan or stale occupied statuses (e.g. if burial records were deleted manually in Firebase Console).
 */
export async function syncAllPlotsOccupancy() {
    try {
        const [plotsSnap, burialsSnap] = await Promise.all([
            getDocs(collection(db, PLOTS_COLLECTION)),
            getDocs(collection(db, "burials"))
        ]);

        // Map plot_id -> count of burials
        const burialCountMap = {};
        burialsSnap.docs.forEach((d) => {
            const data = d.data();
            const pid = data.plot_id;
            if (pid) {
                burialCountMap[pid] = (burialCountMap[pid] || 0) + 1;
            }
        });

        const updates = [];
        let updatedCount = 0;

        for (const plotDoc of plotsSnap.docs) {
            const plotData = plotDoc.data();
            const plotId = plotDoc.id;
            const actualCount = burialCountMap[plotId] || 0;
            const maxCap = Number(plotData.maxCapacity ?? plotData.capacity ?? 1);

            let expectedStatus;
            if (actualCount === 0) {
                expectedStatus = plotData.status === "reserved" ? "reserved" : "available";
            } else if (actualCount >= maxCap) {
                expectedStatus = "occupied";
            } else {
                expectedStatus = "partial";
            }

            const currentOccupiedCount = Number(plotData.occupiedCount ?? 0);
            const currentStatus = (plotData.status || "").toLowerCase().trim();

            if (currentOccupiedCount !== actualCount || currentStatus !== expectedStatus) {
                updates.push(
                    updateDoc(doc(db, PLOTS_COLLECTION, plotId), {
                        occupiedCount: actualCount,
                        status: expectedStatus,
                        updatedAt: new Date().toISOString()
                    })
                );
                updatedCount++;
            }
        }

        if (updates.length > 0) {
            await Promise.all(updates);
            console.log(`[syncAllPlotsOccupancy] Synchronized ${updatedCount} stale plot(s).`);
        }

        return { success: true, syncedCount: updatedCount };
    } catch (err) {
        console.error("Error in syncAllPlotsOccupancy:", err);
        return { success: false, error: err.message };
    }
}

/**
 * Returns a 12-plot slice centered around the target plot.
 * E.g., if target plot is plot #6, result is:
 * [plot 1, 2, 3, 4, 5, (plot 6: navigate), 7, 8, 9, 10, 11, 12]
 * 5 plots before, navigated plot in the middle (index 5 of 12), and 6 plots after.
 */
export function getCentered12Plots(plotsList = [], targetPlot = null) {
    if (!plotsList || plotsList.length === 0) return [];
    if (!targetPlot) return plotsList.slice(0, 12);
    if (plotsList.length <= 12) return plotsList;

    const targetId = String(targetPlot.id || targetPlot.plot_id || "");
    const targetCode = String(
        targetPlot.plotCode || targetPlot.plotcode || targetPlot.plot_code || targetPlot.name || ""
    ).toLowerCase().trim();

    let targetIdx = plotsList.findIndex((p) => {
        if (targetId && String(p.id || p.plot_id || "") === targetId) return true;
        if (targetCode) {
            const code = String(
                p.plotCode || p.plotcode || p.plot_code || p.name || ""
            ).toLowerCase().trim();
            if (code === targetCode) return true;
        }
        return false;
    });

    if (targetIdx === -1) {
        return plotsList.slice(0, 12);
    }

    // 5 items before target (targetIdx - 5), target at position 6 (0-indexed 5), 6 items after (targetIdx + 6)
    let startIdx = targetIdx - 5;
    let endIdx = startIdx + 12;

    if (startIdx < 0) {
        startIdx = 0;
        endIdx = 12;
    } else if (endIdx > plotsList.length) {
        endIdx = plotsList.length;
        startIdx = Math.max(0, endIdx - 12);
    }

    return plotsList.slice(startIdx, endIdx);
}
