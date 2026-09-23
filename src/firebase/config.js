// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyCtT2TZ__Mmbvuzj9g0cuu4YPql7x4wrvQ",
  authDomain: "practices-1b8cf.firebaseapp.com",
  projectId: "practices-1b8cf",
  storageBucket: "practices-1b8cf.firebasestorage.app",
  messagingSenderId: "143619982574",
  appId: "1:143619982574:web:733097e9e9e395c5ac1fff"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app)
export const db = getFirestore(app)