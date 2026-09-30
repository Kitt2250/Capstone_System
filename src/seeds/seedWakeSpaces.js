/**
 * Seed script: Populates the Firestore "wake_space" collection
 * with the 3 wake space facilities (A, B, C).
 *
 * Run once from the browser console or via a temporary component.
 * After seeding, you can remove or disable this script.
 */
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

const WAKE_SPACES = [
    {
        id: "WAS-001",
        wake: "A",
        price: 8500,
        status: "active",
    },
    {
        id: "WAS-002",
        wake: "B",
        price: 8500,
        status: "active",
    },
    {
        id: "WAS-003",
        wake: "C",
        price: 8500,
        status: "active",
    },
];

/**
 * Seeds the wake_space collection with the 3 facilities.
 * Uses setDoc with merge so it won't overwrite if already exists.
 */
export async function seedWakeSpaces() {
    const results = [];

    for (const ws of WAKE_SPACES) {
        try {
            await setDoc(
                doc(db, "wake_space", ws.id),
                {
                    wake: ws.wake,
                    price: ws.price,
                    status: ws.status,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
            results.push({ id: ws.id, success: true });
            console.log(`✅ Seeded wake space: ${ws.id} (Wake ${ws.wake})`);
        } catch (err) {
            results.push({ id: ws.id, success: false, error: err.message });
            console.error(`❌ Failed to seed ${ws.id}:`, err);
        }
    }

    console.log("Wake space seeding complete:", results);
    return results;
}

export default seedWakeSpaces;
