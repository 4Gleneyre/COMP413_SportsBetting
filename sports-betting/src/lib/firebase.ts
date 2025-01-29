import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
    apiKey: "AIzaSyDD16swP5Z6GHaQm-uCuUaaLBSuTDhQ80g",
    authDomain: "sportsbetting-d01f2.firebaseapp.com",
    projectId: "sportsbetting-d01f2",
    storageBucket: "sportsbetting-d01f2.firebasestorage.app",
    messagingSenderId: "554821099261",
    appId: "1:554821099261:web:b0fd1897406f75e7f7a894"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider(); 