import {
    createFullBackupService,
    restoreFromBackupService,
    getBackupHistoryService,
    deleteBackupRecordService,
    SYSTEM_COLLECTIONS
} from "../services/backupServices";

/**
 * Controller to trigger creating and downloading a full database backup.
 */
export const createBackupController = async () => {
    try {
        const result = await createFullBackupService();
        return {
            success: true,
            message: `Backup successfully created (${result.totalRecords} records, ${result.fileSize}).`,
            data: result
        };
    } catch (error) {
        console.error("Create backup controller error:", error);
        throw new Error(error.message || "Failed to create database backup.");
    }
};

/**
 * Controller to handle restoring database from an uploaded .json backup file.
 *
 * @param {File} file - The .json backup file selected by the user
 */
export const restoreBackupController = async (file) => {
    // 1. Basic file presence check
    if (!file) {
        throw new Error("Please select a backup file to restore.");
    }

    // 2. Validate file extension (.json)
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".json")) {
        throw new Error("Invalid file format. Please upload a valid .json backup file.");
    }

    // 3. Validate file size
    if (file.size === 0) {
        throw new Error("The selected file is empty. Please choose a valid backup file.");
    }

    // Maximum file limit (e.g. 50 MB)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
        throw new Error("The backup file exceeds the maximum allowed size (50 MB).");
    }

    // 4. Read file content as text
    let fileText = "";
    try {
        if (typeof file.text === "function") {
            fileText = await file.text();
        } else {
            // Fallback for older browser environments
            fileText = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = () => reject(new Error("Failed to read the backup file."));
                reader.readAsText(file);
            });
        }
    } catch (readErr) {
        throw new Error("Failed to read the uploaded backup file: " + readErr.message);
    }

    // 5. Parse and validate JSON structure
    let parsedBackup;
    try {
        parsedBackup = JSON.parse(fileText);
    } catch {
        throw new Error("Invalid file content. The file could not be parsed as valid JSON.");
    }

    if (!parsedBackup || typeof parsedBackup !== "object") {
        throw new Error("Invalid backup structure. Expected a JSON object.");
    }

    if (!parsedBackup.collections || typeof parsedBackup.collections !== "object") {
        throw new Error("Invalid backup file: Missing 'collections' property.");
    }

    // 6. Verify that at least one known system collection is present
    const collectionKeys = Object.keys(parsedBackup.collections);
    const hasKnownCollection = collectionKeys.some((key) => SYSTEM_COLLECTIONS.includes(key));
    if (!hasKnownCollection && collectionKeys.length === 0) {
        throw new Error("The backup file does not contain any recognizable cemetery system data.");
    }

    // 7. Execute restoration through service
    try {
        const restoreResult = await restoreFromBackupService(parsedBackup);
        return {
            success: true,
            message: `Successfully restored ${restoreResult.totalRestored} records into the database.`,
            details: restoreResult
        };
    } catch (serviceErr) {
        console.error("Restore backup service error:", serviceErr);
        throw new Error(serviceErr.message || "Failed to restore data into Firestore.");
    }
};

/**
 * Controller to fetch past backup logs for the Backup History table.
 */
export const getBackupHistoryController = async () => {
    try {
        return await getBackupHistoryService();
    } catch (error) {
        console.error("Get backup history controller error:", error);
        throw new Error(error.message || "Failed to load backup history.");
    }
};

/**
 * Controller to delete a backup history log entry.
 */
export const deleteBackupRecordController = async (recordId) => {
    try {
        if (!recordId) {
            throw new Error("Record ID is required.");
        }
        return await deleteBackupRecordService(recordId);
    } catch (error) {
        console.error("Delete backup record controller error:", error);
        throw new Error(error.message || "Failed to delete backup record.");
    }
};
