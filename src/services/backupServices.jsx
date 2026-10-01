import {
    collection,
    doc,
    getDocs,
    setDoc,
    addDoc,
    deleteDoc,
    writeBatch,
    query,
    orderBy,
    Timestamp,
    serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase/config";
import { logAuditEvent } from "../utils/auditLogger";

// ── All system collections that should be backed up and restored ──────────────
export const SYSTEM_COLLECTIONS = [
    "users",
    "clients",
    "burials",
    "plots",
    "payments",
    "payment_history",
    "renewals",
    "wakeSpaceRental",
    "wake_space",
    "notifications",
    "grave_type",
    "gravelot_type",
    "interment_fee"
];

const BACKUPS_METADATA_COLLECTION = "system_backups";

// ── Helper: Serialize Firestore timestamps for JSON compatibility ─────────────
function serializeData(val) {
    if (val === null || val === undefined) return val;
    if (typeof val?.toDate === "function") {
        return {
            _isTimestamp: true,
            iso: val.toDate().toISOString(),
            seconds: val.seconds,
            nanoseconds: val.nanoseconds
        };
    }
    if (Array.isArray(val)) {
        return val.map(serializeData);
    }
    if (typeof val === "object" && !(val instanceof Date)) {
        const serialized = {};
        for (const [k, v] of Object.entries(val)) {
            serialized[k] = serializeData(v);
        }
        return serialized;
    }
    return val;
}

// ── Helper: Reconstruct Firestore Timestamps upon restore ─────────────────────
function deserializeData(val) {
    if (val === null || val === undefined) return val;
    if (typeof val === "object" && val._isTimestamp && typeof val.seconds === "number") {
        return new Timestamp(val.seconds, val.nanoseconds || 0);
    }
    if (Array.isArray(val)) {
        return val.map(deserializeData);
    }
    if (typeof val === "object") {
        const deserialized = {};
        for (const [k, v] of Object.entries(val)) {
            deserialized[k] = deserializeData(v);
        }
        return deserialized;
    }
    return val;
}

// ── Helper: Format bytes into readable string ─────────────────────────────────
function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return "0 KB";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Perform a full database backup across all system collections.
 * Bundles all data into a JSON file, triggers browser download,
 * and saves metadata to the system_backups collection.
 */
export async function createFullBackupService() {
    const collectionsData = {};
    let totalDocsCount = 0;

    // 1. Fetch all documents from each collection
    for (const colName of SYSTEM_COLLECTIONS) {
        try {
            const snap = await getDocs(collection(db, colName));
            collectionsData[colName] = snap.docs.map((docSnap) => ({
                id: docSnap.id,
                ...serializeData(docSnap.data())
            }));
            totalDocsCount += collectionsData[colName].length;
        } catch (err) {
            console.warn(`Could not read collection ${colName}:`, err);
            collectionsData[colName] = [];
        }
    }

    // 2. Prepare timestamp and filename
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, "-");
    const fileName = `cherubim_backup_${dateStr}.json`;

    // 3. Build payload
    const backupPayload = {
        system: "Cherubim Memorial Garden Management System",
        version: "1.0",
        createdAt: now.toISOString(),
        totalDocuments: totalDocsCount,
        collections: collectionsData
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const fileSizeFormatted = formatBytes(blob.size);

    // 4. Trigger download in browser
    const downloadUrl = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement("a");
    downloadAnchor.href = downloadUrl;
    downloadAnchor.download = fileName;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    URL.revokeObjectURL(downloadUrl);

    // 5. Save backup metadata record in Firestore for history tracking
    try {
        await addDoc(collection(db, BACKUPS_METADATA_COLLECTION), {
            fileName,
            fileSize: fileSizeFormatted,
            totalRecords: totalDocsCount,
            status: "Success",
            createdAt: now.toISOString(),
            rawTimestamp: serverTimestamp()
        });
    } catch (metaErr) {
        console.warn("Could not save backup record in Firestore:", metaErr);
    }

    // 6. Audit Log
    try {
        await logAuditEvent({
            module: "Backup & Restore",
            actionType: "CREATE_BACKUP",
            description: `Generated full database backup "${fileName}" (${totalDocsCount} records, ${fileSizeFormatted})`,
            targetItem: fileName,
            details: {
                fileName,
                fileSize: fileSizeFormatted,
                totalRecords: totalDocsCount,
                timestamp: now.toISOString()
            }
        });
    } catch (auditErr) {
        console.warn("Could not log audit event for backup creation:", auditErr);
    }

    return {
        success: true,
        fileName,
        fileSize: fileSizeFormatted,
        totalRecords: totalDocsCount,
        createdAt: now.toISOString()
    };
}

/**
 * Restore database records from a parsed JSON backup object.
 * Restores documents using writeBatch (chunked in batches of 400).
 */
export async function restoreFromBackupService(backupData) {
    if (!backupData || typeof backupData !== "object" || !backupData.collections) {
        throw new Error("Invalid backup data format. 'collections' property is missing.");
    }

    const { collections } = backupData;
    let totalRestored = 0;
    const restoredCollectionsSummary = {};

    // Firestore batch limit is 500 operations per batch
    const BATCH_SIZE = 400;

    for (const [colName, docsList] of Object.entries(collections)) {
        if (!Array.isArray(docsList) || docsList.length === 0) {
            restoredCollectionsSummary[colName] = 0;
            continue;
        }

        let batch = writeBatch(db);
        let currentBatchCount = 0;
        let colRestoredCount = 0;

        for (const item of docsList) {
            if (!item.id) continue;

            const docRef = doc(db, colName, item.id);
            const { id: _, ...rawDocData } = item;
            const restoredData = deserializeData(rawDocData);

            batch.set(docRef, restoredData, { merge: true });
            currentBatchCount++;
            colRestoredCount++;
            totalRestored++;

            // Commit batch when reaching BATCH_SIZE
            if (currentBatchCount >= BATCH_SIZE) {
                await batch.commit();
                batch = writeBatch(db);
                currentBatchCount = 0;
            }
        }

        // Commit remaining batch
        if (currentBatchCount > 0) {
            await batch.commit();
        }

        restoredCollectionsSummary[colName] = colRestoredCount;
    }

    // Audit Log
    try {
        await logAuditEvent({
            module: "Backup & Restore",
            actionType: "RESTORE_BACKUP",
            description: `Restored ${totalRestored} database records across ${Object.keys(restoredCollectionsSummary).length} collections`,
            targetItem: "Database Restore",
            details: {
                totalRestored,
                collections: restoredCollectionsSummary
            }
        });
    } catch (auditErr) {
        console.warn("Could not log audit event for restore:", auditErr);
    }

    return {
        success: true,
        totalRestored,
        collectionsRestored: restoredCollectionsSummary
    };
}

/**
 * Fetch backup history records from system_backups collection.
 */
export async function getBackupHistoryService() {
    try {
        const q = query(
            collection(db, BACKUPS_METADATA_COLLECTION),
            orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({
            id: d.id,
            ...d.data()
        }));
    } catch (err) {
        console.error("Failed to load backup history:", err);
        return [];
    }
}

/**
 * Delete a backup history log entry.
 */
export async function deleteBackupRecordService(recordId) {
    if (!recordId) throw new Error("Record ID is required.");
    const docRef = doc(db, BACKUPS_METADATA_COLLECTION, recordId);
    await deleteDoc(docRef);

    // Audit Log
    try {
        await logAuditEvent({
            module: "Backup & Restore",
            actionType: "DELETE_BACKUP_LOG",
            description: `Removed backup log entry from history (${recordId})`,
            targetItem: recordId,
            details: { recordId }
        });
    } catch (auditErr) {
        console.warn("Could not log audit event for backup deletion:", auditErr);
    }

    return { success: true };
}
