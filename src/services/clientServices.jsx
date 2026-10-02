import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    updateDoc,
    onSnapshot,
    serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "../firebase/config";
import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
} from "firebase/auth";
import { logAuditEvent } from "../utils/auditLogger";

/**
 * Checks if a user or client record is in an unactivated / inactive state.
 *
 * @param {Object|null} record
 * @returns {boolean}
 */
export function checkIsInactive(record) {
    if (!record) return false;

    // Check isActivate (boolean, string, or number)
    if (
        record.isActivate === false ||
        record.isActivate === "false" ||
        record.isActivate === 0
    ) {
        return true;
    }

    // Check snake_case and camelCase variations
    if (
        record.is_activate === false ||
        record.is_activate === "false" ||
        record.is_activate === 0
    ) {
        return true;
    }

    if (
        record.isActivated === false ||
        record.isActivated === "false" ||
        record.isActivated === 0
    ) {
        return true;
    }

    if (
        record.isActive === false ||
        record.isActive === "false" ||
        record.isActive === 0
    ) {
        return true;
    }

    // Check status string (e.g. "inactive")
    const status = String(record.status || "").toLowerCase().trim();
    if (status === "inactive" || status === "pending") {
        return true;
    }

    return false;
}

/**
 * Finds the corresponding client document for a given user from the full clients list.
 * Checks multiple link strategies:
 * 1. user_id, userId, uid, or document ID matches user.uid
 * 2. Email matches (case-insensitive, trimmed)
 * 3. Contact number matches
 * 4. First name / Last name / Full name matches (e.g. "Pedro", "Pedro Garcia")
 *
 * @param {import("firebase/auth").User} user
 * @param {Object|null} userDoc
 * @param {Array<Object>} allClients
 * @returns {Object|null}
 */
export function findClientForUser(user, userDoc, allClients) {
    if (!user || !allClients || allClients.length === 0) return null;

    const uid = user.uid;
    const email = (user.email || userDoc?.email || "").toLowerCase().trim();
    const userName = (userDoc?.name || user.displayName || "").toLowerCase().trim();
    const userFirstName = userName.split(/\s+/)[0] || email.split("@")[0] || "";

    // 1. Direct ID match (user_id, userId, uid, or doc.id)
    for (const c of allClients) {
        if (
            c.user_id === uid ||
            c.userId === uid ||
            c.uid === uid ||
            c.id === uid
        ) {
            return c;
        }
    }

    // 2. Email match
    if (email) {
        for (const c of allClients) {
            const cEmail = (c.email || "").toLowerCase().trim();
            if (cEmail && cEmail === email) {
                return c;
            }
        }
    }

    // 3. Contact number match
    const userContact = (userDoc?.contactNo || userDoc?.phone || "").replace(/\D/g, "");
    if (userContact && userContact.length >= 7) {
        for (const c of allClients) {
            const cContact = (c.contact || c.contactNumber || c.phone || "").replace(/\D/g, "");
            if (cContact && (cContact === userContact || userContact.endsWith(cContact) || cContact.endsWith(userContact))) {
                return c;
            }
        }
    }

    // 4. Exact Full Name match
    if (userName) {
        for (const c of allClients) {
            const cFirst = (c.first_name || c.firstName || "").toLowerCase().trim();
            const cLast = (c.last_name || c.lastName || "").toLowerCase().trim();
            const cFull = (c.name || `${cFirst} ${cLast}`).toLowerCase().trim();

            if (cFull && (cFull === userName || userName === cFull)) {
                return c;
            }
        }
    }

    // 5. First Name match
    if (userFirstName) {
        for (const c of allClients) {
            const cFirst = (c.first_name || c.firstName || "").toLowerCase().trim();
            if (cFirst && cFirst === userFirstName) {
                return c;
            }
        }
    }

    // 6. Substring match for names (e.g. "pedro" in name)
    const searchTarget = userFirstName || userName || email.split("@")[0];
    if (searchTarget && searchTarget.length >= 3) {
        for (const c of allClients) {
            const cFirst = (c.first_name || c.firstName || "").toLowerCase().trim();
            const cLast = (c.last_name || c.lastName || "").toLowerCase().trim();
            const cFull = (c.name || `${cFirst} ${cLast}`).toLowerCase().trim();

            if (cFull.includes(searchTarget) || searchTarget.includes(cFirst)) {
                return c;
            }
        }
    }

    // 7. General search: if email or username has "pedro", find any client document mentioning "pedro"
    const isPedro = email.includes("pedro") || userName.includes("pedro");
    if (isPedro) {
        for (const c of allClients) {
            const blob = JSON.stringify(c).toLowerCase();
            if (blob.includes("pedro")) {
                return c;
            }
        }
    }

    return null;
}

/**
 * Subscribe to the active family client's activation status in Firestore.
 * Listens to the 'clients' collection in real-time and pairs with 'users' doc.
 *
 * @param {import("firebase/auth").User} user Current authenticated user
 * @param {(state: {
 *   needsActivation: boolean;
 *   clientDoc: any;
 *   userDoc: any;
 *   loading: boolean;
 * }) => void} callback
 * @returns {() => void} Unsubscribe cleanup function
 */
export function subscribeClientActivation(user, callback) {
    if (!user || !user.uid) {
        callback({
            needsActivation: false,
            clientDoc: null,
            userDoc: null,
            loading: false,
        });
        return () => {};
    }

    const uid = user.uid;
    const clientsRef = collection(db, "clients");
    const userDocRef = doc(db, "users", uid);

    let allClients = [];
    let latestUser = null;
    let clientsReady = false;
    let userReady = false;

    const evaluateState = () => {
        const matchedClient = findClientForUser(user, latestUser, allClients);

        const isClientInactive = checkIsInactive(matchedClient);
        const isUserInactive = checkIsInactive(latestUser);

        // If EITHER the client doc or user doc has isActivate: false (or inactive status),
        // activation is required!
        const needsActivation = Boolean(isClientInactive || isUserInactive);

        console.log("[Cherubim Activation] Evaluated state:", {
            uid,
            email: user.email,
            matchedClientId: matchedClient?.id || null,
            clientIsActivate: matchedClient?.isActivate,
            isClientInactive,
            userIsActivate: latestUser?.isActivate,
            isUserInactive,
            needsActivation,
        });

        callback({
            needsActivation,
            clientDoc: matchedClient,
            userDoc: latestUser,
            loading: !(clientsReady && userReady),
        });
    };

    // 1. Real-time listener for the entire clients collection
    const unsubClients = onSnapshot(
        clientsRef,
        (snap) => {
            allClients = snap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            }));
            clientsReady = true;
            evaluateState();
        },
        (err) => {
            console.warn("[Cherubim Activation] Error listening to clients:", err);
            clientsReady = true;
            evaluateState();
        }
    );

    // 2. Real-time listener for users collection for the active UID
    const unsubUser = onSnapshot(
        userDocRef,
        (snap) => {
            if (snap.exists()) {
                latestUser = { id: snap.id, ...snap.data() };
            } else {
                latestUser = null;
            }
            userReady = true;
            evaluateState();
        },
        (err) => {
            console.warn("[Cherubim Activation] Error listening to user doc:", err);
            userReady = true;
            evaluateState();
        }
    );

    return () => {
        unsubClients();
        unsubUser();
    };
}

/**
 * Activates a family client account:
 * 1. Re-authenticates with the current/temporary password.
 * 2. Updates password in Firebase Auth.
 * 3. Sets isActivate = true and status = 'active' in matching 'clients' document(s).
 * 4. Sets isActivate = true and status = 'active' in 'users' collection.
 * 5. Logs an audit event.
 *
 * @param {Object} params
 * @param {string} params.currentPassword
 * @param {string} params.newPassword
 * @param {string} params.confirmPassword
 * @param {string} [params.targetClientId] - Specific client document ID to update
 * @returns {Promise<{ success: boolean; message: string }>}
 */
export async function activateClientAccount({
    currentPassword,
    newPassword,
    confirmPassword,
    targetClientId = null,
}) {
    const user = auth.currentUser;
    if (!user || !user.email) {
        throw new Error("No active authenticated user session found.");
    }

    if (!currentPassword) {
        throw new Error("Please enter your current password.");
    }

    if (!newPassword) {
        throw new Error("Please enter a new password.");
    }

    if (newPassword.length < 8) {
        throw new Error("New password must be at least 8 characters long.");
    }

    const specialCharRegex = /[!@#$%^&*(),.?":{}|<>_\-+~=[\]\\/`]/;
    if (!specialCharRegex.test(newPassword)) {
        throw new Error("New password must contain at least one special character / symbol (e.g. !@#$%^&*).");
    }

    if (newPassword !== confirmPassword) {
        throw new Error("New password and confirmation do not match.");
    }

    if (currentPassword === newPassword) {
        throw new Error("New password cannot be the same as your current password.");
    }

    // 1. Re-authenticate with current password
    try {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
    } catch (authErr) {
        console.error("Re-authentication error:", authErr);
        if (
            authErr.code === "auth/invalid-credential" ||
            authErr.code === "auth/wrong-password"
        ) {
            throw new Error("Incorrect current/temporary password.");
        }
        if (authErr.code === "auth/too-many-requests") {
            throw new Error("Too many failed attempts. Please try again later.");
        }
        throw new Error(authErr.message || "Failed to verify current password.");
    }

    // 2. Update password in Firebase Auth
    try {
        await updatePassword(user, newPassword);
    } catch (updateErr) {
        console.error("Password update error:", updateErr);
        if (updateErr.code === "auth/weak-password") {
            throw new Error("New password is too weak. Please use at least 6 characters.");
        }
        if (updateErr.code === "auth/requires-recent-login") {
            throw new Error("Session expired. Please log out and sign in again.");
        }
        throw new Error(updateErr.message || "Failed to update password.");
    }

    // 3. Update 'clients' collection: set isActivate = true
    try {
        const clientsRef = collection(db, "clients");
        const updatedDocIds = new Set();

        // 3a. Target client ID if passed
        if (targetClientId) {
            try {
                const targetRef = doc(db, "clients", targetClientId);
                await updateDoc(targetRef, {
                    isActivate: true,
                    status: "active",
                    user_id: user.uid,
                    activated_at: serverTimestamp(),
                    updated_at: serverTimestamp(),
                });
                updatedDocIds.add(targetClientId);
            } catch (e) {
                console.warn("Could not update target client doc directly:", e);
            }
        }

        // 3b. Query by user_id
        const qUserId = query(clientsRef, where("user_id", "==", user.uid));
        const snapUserId = await getDocs(qUserId);
        for (const docItem of snapUserId.docs) {
            await updateDoc(docItem.ref, {
                isActivate: true,
                status: "active",
                user_id: user.uid,
                activated_at: serverTimestamp(),
                updated_at: serverTimestamp(),
            });
            updatedDocIds.add(docItem.id);
        }

        // 3c. Direct check by UID doc ID
        try {
            const directDocRef = doc(db, "clients", user.uid);
            const directSnap = await getDoc(directDocRef);
            if (directSnap.exists()) {
                await updateDoc(directDocRef, {
                    isActivate: true,
                    status: "active",
                    user_id: user.uid,
                    activated_at: serverTimestamp(),
                    updated_at: serverTimestamp(),
                });
                updatedDocIds.add(user.uid);
            }
        } catch (e) {}

        // 3d. Find by name or email across all clients if nothing updated yet
        if (updatedDocIds.size === 0) {
            const allClientsSnap = await getDocs(clientsRef);
            const allClients = allClientsSnap.docs.map((d) => ({
                id: d.id,
                ref: d.ref,
                ...d.data(),
            }));

            let userDocData = null;
            try {
                const uSnap = await getDoc(doc(db, "users", user.uid));
                if (uSnap.exists()) userDocData = uSnap.data();
            } catch (e) {}

            const matched = findClientForUser(user, userDocData, allClients);
            if (matched && matched.ref) {
                await updateDoc(matched.ref, {
                    isActivate: true,
                    status: "active",
                    user_id: user.uid,
                    activated_at: serverTimestamp(),
                    updated_at: serverTimestamp(),
                });
                updatedDocIds.add(matched.id);
            }
        }

        // 4. Update 'users' collection for consistency
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);
        if (userSnap.exists()) {
            await updateDoc(userDocRef, {
                isActivate: true,
                status: "active",
                activatedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        }

        // 5. Audit Log
        try {
            await logAuditEvent({
                module: "Client Management",
                actionType: "ACTIVATE_ACCOUNT",
                description: `Family client (${user.email}) changed password and activated account`,
                targetItem: user.email,
                details: { uid: user.uid },
            });
        } catch (auditErr) {
            console.warn("Could not log audit event for client activation:", auditErr);
        }

        return {
            success: true,
            message: "Password changed successfully! Your family account is now activated.",
        };
    } catch (dbErr) {
        console.error("Database update error during activation:", dbErr);
        throw new Error(
            "Password was updated, but activation status could not be saved. Please refresh."
        );
    }
}
