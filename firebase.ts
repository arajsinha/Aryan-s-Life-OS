// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBv2qhVZTKgFmNpRiBbnCxcTEGYX8U1b6g",
  authDomain: "lifeosgit-74377190-3dc16.firebaseapp.com",
  projectId: "lifeosgit-74377190-3dc16",
  storageBucket: "lifeosgit-74377190-3dc16.firebasestorage.app",
  messagingSenderId: "134542809564",
  appId: "1:134542809564:web:07c554228d7d1d727b5719"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const db = getFirestore(app);
