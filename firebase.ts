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
  apiKey: "AIzaSyAWwvjrwrFsgBdPXzajgM3jfA7FDzQwV3Q",
  authDomain: "lifeos-34266.firebaseapp.com",
  projectId: "lifeos-34266",
  storageBucket: "lifeos-34266.firebasestorage.app",
  messagingSenderId: "628462276092",
  appId: "1:628462276092:web:8be1b189aefa578861f679",
  measurementId: "G-6XM4NHY51H"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const db = getFirestore(app);
