const CURRENT_USER_STORAGE_KEY = "animartCurrentUser";
const CART_STORAGE_KEY = "animartCart";

const firebaseConfig = {
    apiKey: "AIzaSyCZs96ObK28j4gWhSbDfkrEsphDHUGVGH8",
    authDomain: "animart-8dcbb.firebaseapp.com",
    projectId: "animart-8dcbb",
    storageBucket: "animart-8dcbb.firebasestorage.app",
    messagingSenderId: "158608291444",
    appId: "1:158608291444:web:3fd88210010269ca738321",
    measurementId: "G-QQKLK5H64R",
    databaseURL: "https://animart-8dcbb-default-rtdb.firebaseio.com"
};

if (!window.firebase?.apps?.length) {
    window.firebase.initializeApp(firebaseConfig);
}

const app = window.firebase.app();
const auth = window.firebase.auth();
const db = window.firebase.database();
const googleProvider = new window.firebase.auth.GoogleAuthProvider();

let currentProfile = null;
let remoteCartLoadedForUid = null;

function readStoredUser() {
    try {
        return JSON.parse(localStorage.getItem(CURRENT_USER_STORAGE_KEY));
    } catch (error) {
        return null;
    }
}

function writeStoredUser(user) {
    if (!user) {
        localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
        return;
    }

    localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
}

function readLocalCart() {
    try {
        const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY));
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function normalizeCartItem(item) {
    return {
        id: String(item?.id || ""),
        quantity: Math.max(1, Number(item?.quantity || 1)),
        selected: item?.selected !== false
    };
}

function mergeCartItems(localCart, remoteCart) {
    const merged = new Map();

    [...remoteCart, ...localCart].forEach((entry) => {
        const item = normalizeCartItem(entry);
        if (!item.id) return;

        const existing = merged.get(item.id);
        if (!existing) {
            merged.set(item.id, item);
            return;
        }

        existing.quantity = Math.max(existing.quantity, item.quantity);
        existing.selected = existing.selected || item.selected;
    });

    return [...merged.values()];
}

function mapUser(authUser, profile = {}) {
    if (!authUser) return null;

    return {
        uid: authUser.uid,
        id: authUser.uid,
        name: profile.name || authUser.displayName || "Animart User",
        email: authUser.email || profile.email || "",
        phoneNumber: profile.phoneNumber || authUser.phoneNumber || "",
        dateOfBirth: profile.dateOfBirth || "",
        photoURL: authUser.photoURL || profile.photoURL || "",
        provider: profile.provider || authUser.providerData?.[0]?.providerId || "password",
        createdAt: profile.createdAt || authUser.metadata?.creationTime || "",
        lastLoginAt: profile.lastLoginAt || authUser.metadata?.lastSignInTime || ""
    };
}

async function getUserProfile(uid) {
    if (!uid) return null;

    const snapshot = await db.ref(`users/${uid}`).once("value");
    return snapshot.val();
}

async function persistUserProfile(authUser, extraProfile = {}) {
    if (!authUser) return null;

    const existingProfile = await getUserProfile(authUser.uid);
    const payload = {
        uid: authUser.uid,
        email: authUser.email || existingProfile?.email || "",
        name: extraProfile.name || authUser.displayName || existingProfile?.name || "Animart User",
        phoneNumber: extraProfile.phoneNumber ?? existingProfile?.phoneNumber ?? authUser.phoneNumber ?? "",
        dateOfBirth: extraProfile.dateOfBirth ?? existingProfile?.dateOfBirth ?? "",
        photoURL: authUser.photoURL || existingProfile?.photoURL || "",
        provider: extraProfile.provider || authUser.providerData?.[0]?.providerId || existingProfile?.provider || "password",
        createdAt: existingProfile?.createdAt || authUser.metadata?.creationTime || new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
    };

    await db.ref(`users/${authUser.uid}`).update(payload);
    currentProfile = payload;
    const mappedUser = mapUser(authUser, payload);
    writeStoredUser(mappedUser);
    window.dispatchEvent(new CustomEvent("animart:user-changed", { detail: mappedUser }));
    return mappedUser;
}

async function writeCartToDatabase(cart, uid = auth.currentUser?.uid) {
    if (!uid) return;

    const normalizedCart = cart.map(normalizeCartItem).filter((item) => item.id);
    const itemMap = normalizedCart.reduce((acc, item) => {
        acc[item.id] = {
            productId: item.id,
            quantity: item.quantity,
            selected: item.selected,
            updatedAt: new Date().toISOString()
        };
        return acc;
    }, {});

    await db.ref(`carts/${uid}`).set({
        uid,
        items: itemMap,
        updatedAt: new Date().toISOString()
    });
}

async function loadRemoteCart(uid = auth.currentUser?.uid) {
    if (!uid) return [];

    const snapshot = await db.ref(`carts/${uid}/items`).once("value");
    const cartItems = Object.values(snapshot.val() || {}).map((item) => ({
        id: item.productId,
        quantity: item.quantity,
        selected: item.selected
    }));

    return cartItems.map(normalizeCartItem);
}

async function syncCartAfterAuth(authUser) {
    if (!authUser) {
        remoteCartLoadedForUid = null;
        return;
    }

    if (remoteCartLoadedForUid === authUser.uid) {
        return;
    }

    const remoteCart = await loadRemoteCart(authUser.uid);
    const mergedCart = mergeCartItems(readLocalCart(), remoteCart);
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(mergedCart));
    await writeCartToDatabase(mergedCart, authUser.uid);
    remoteCartLoadedForUid = authUser.uid;
    window.dispatchEvent(new CustomEvent("animart:cart-synced", { detail: mergedCart }));
}

async function signUpWithEmail({ name, email, password, phoneNumber, dateOfBirth }) {
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    if (name) {
        await credential.user.updateProfile({ displayName: name });
    }

    return persistUserProfile(credential.user, {
        name,
        email,
        phoneNumber,
        dateOfBirth,
        provider: "password"
    });
}

async function signInWithEmail({ email, password }) {
    const credential = await auth.signInWithEmailAndPassword(email, password);
    return persistUserProfile(credential.user, { provider: "password" });
}

async function signInWithGoogle() {
    const credential = await auth.signInWithPopup(googleProvider);
    return persistUserProfile(credential.user, { provider: "google.com" });
}

async function signOutUser() {
    await auth.signOut();
    currentProfile = null;
    writeStoredUser(null);
    window.dispatchEvent(new CustomEvent("animart:user-changed", { detail: null }));
}

function onUserChange(callback) {
    if (typeof callback !== "function") return () => {};

    callback(readStoredUser());
    const listener = (event) => callback(event.detail || null);
    window.addEventListener("animart:user-changed", listener);
    return () => window.removeEventListener("animart:user-changed", listener);
}

auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

auth.onAuthStateChanged(async (authUser) => {
    if (!authUser) {
        currentProfile = null;
        remoteCartLoadedForUid = null;
        writeStoredUser(null);
        window.dispatchEvent(new CustomEvent("animart:user-changed", { detail: null }));
        return;
    }

    const profile = await persistUserProfile(authUser, currentProfile || {});
    await syncCartAfterAuth(authUser);
    window.dispatchEvent(new CustomEvent("animart:user-ready", { detail: profile }));
});

window.animartFirebase = {
    app,
    auth,
    db,
    getCurrentUser: readStoredUser,
    onUserChange,
    signUpWithEmail,
    signInWithEmail,
    signInWithGoogle,
    signOutUser,
    persistUserProfile,
    writeCartToDatabase,
    loadRemoteCart,
    syncCartAfterAuth
};
