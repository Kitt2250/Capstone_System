import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { db, firebaseConfig } from "../firebase/config";
import { createUserWithEmailAndPassword, getAuth } from "firebase/auth";


export async function getUserData(uid) {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        throw new Error("User document not found");
    }

    return {
        id: userSnap.id,
        ...userSnap.data()
    };
}

export async function getUsers() {
    const usersRef = collection(db, "users");
    const usersSnap = await getDocs(usersRef);

    return usersSnap.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
    }));
}


export async function createUser(userData) {

    const { name, email, password, role } = userData;

    // Create a temporary secondary Firebase app
    const secondaryAppName = `secondary-create-${Date.now()}`;

    const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);

    const secondaryAuth = getAuth(secondaryApp);

    try {

        // Create Firebase Authentication account
        let userCredential;
        try {
            userCredential = await createUserWithEmailAndPassword(
                secondaryAuth,
                email,
                password
            );
        } catch (error) {
            if (error.code === "auth/email-already-in-use") {
                throw new Error("This email is already taken.");
            }
            if (error.code === "auth/invalid-email") {
                throw new Error("Invalid email address.");
            }
            if (error.code === "auth/weak-password") {
                throw new Error("Password is too weak.");
            }
            throw new Error("Failed to create account.");
        }

        const uid = userCredential.user.uid;

        // Create Firestore user document
        await setDoc(doc(db, "users", uid), {
            name: name,
            email: email,
            role: role,
            status: "active",
            createdAt: new Date()
        });

        return {
            success: true,
            uid: uid
        };

    } finally {

        await secondaryAuth.signOut();

        await deleteApp(secondaryApp);
    }

};

export const updateUser = async (userId, updatedData) => {
    try {
        const userRef = doc(db, "users", userId);

        await updateDoc(userRef, {
            name: updatedData.name,
            email: updatedData.email,
            contactNo: updatedData.contactNo,
            role: updatedData.role,
            status: updatedData.status,
        });

        return true;
    } catch (error) {
        console.error("Error updating user:", error);
        throw error;
    }
};

export const archiveUser = async (userId) => {
    try {
        const userRef = doc(db, "users", userId);

        await updateDoc(userRef, {
            status: "Archived",
        });

        return true;
    } catch (error) {
        console.error("Error archiving user:", error);
        throw error;
    }
};