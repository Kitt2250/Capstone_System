import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";


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