const SEARCH_PAGE = "search.html";
const LOGIN_PAGE = "login.html";
const CART_PAGE = "cart.html";
const CURRENT_USER_STORAGE_KEY = "animartCurrentUser";
const CART_STORAGE_KEY = "animartCart";
const ACCOUNT_LINKS = [
    { label: "Orders", href: "orders.html" },
    { label: "Returns & Refunds", href: "returns.html" },
    { label: "Settings", href: "settings.html" }
];

function createFirebaseFallback() {
    if (window.animartFirebase) return window.animartFirebase;

    const getCurrentUser = () => {
        try {
            return JSON.parse(localStorage.getItem(CURRENT_USER_STORAGE_KEY));
        } catch (error) {
            return null;
        }
    };

    const noopAsync = async () => {
        throw new Error("Firebase failed to load. Please refresh the page.");
    };

    window.animartFirebase = {
        getCurrentUser,
        onUserChange(callback) {
            if (typeof callback === "function") callback(getCurrentUser());
            return () => {};
        },
        signUpWithEmail: noopAsync,
        signInWithEmail: noopAsync,
        signInWithGoogle: noopAsync,
        signOutUser: async () => {
            localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
            window.dispatchEvent(new CustomEvent("animart:user-changed", { detail: null }));
        },
        writeCartToDatabase: async () => {}
    };

    return window.animartFirebase;
}

function setupFirebaseClient() {
    if (window.animartFirebase || !window.firebase) {
        return createFirebaseFallback();
    }

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

    if (!window.firebase.apps.length) {
        window.firebase.initializeApp(firebaseConfig);
    }

    const auth = window.firebase.auth();
    const db = window.firebase.database();
    const googleProvider = new window.firebase.auth.GoogleAuthProvider();
    let currentProfile = null;
    let remoteCartLoadedForUid = null;

    function writeStoredUser(user) {
        if (!user) {
            localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
            return;
        }

        localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
    }

    function readStoredUser() {
        try {
            return JSON.parse(localStorage.getItem(CURRENT_USER_STORAGE_KEY));
        } catch (error) {
            return null;
        }
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

        if (remoteCartLoadedForUid === authUser.uid) return;

        const remoteCart = await loadRemoteCart(authUser.uid);
        const mergedCart = mergeCartItems(readLocalCart(), remoteCart);
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(mergedCart));
        await writeCartToDatabase(mergedCart, authUser.uid);
        remoteCartLoadedForUid = authUser.uid;
        window.dispatchEvent(new CustomEvent("animart:cart-synced", { detail: mergedCart }));
    }

    const api = {
        auth,
        db,
        getCurrentUser: readStoredUser,
        onUserChange(callback) {
            if (typeof callback !== "function") return () => {};
            callback(readStoredUser());
            const listener = (event) => callback(event.detail || null);
            window.addEventListener("animart:user-changed", listener);
            return () => window.removeEventListener("animart:user-changed", listener);
        },
        async signUpWithEmail({ name, email, password, phoneNumber, dateOfBirth }) {
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
        },
        async signInWithEmail({ email, password }) {
            const credential = await auth.signInWithEmailAndPassword(email, password);
            return persistUserProfile(credential.user, { provider: "password" });
        },
        async signInWithGoogle() {
            const credential = await auth.signInWithPopup(googleProvider);
            return persistUserProfile(credential.user, { provider: "google.com" });
        },
        async signOutUser() {
            await auth.signOut();
            currentProfile = null;
            writeStoredUser(null);
            window.dispatchEvent(new CustomEvent("animart:user-changed", { detail: null }));
        },
        persistUserProfile,
        writeCartToDatabase,
        loadRemoteCart,
        syncCartAfterAuth
    };

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

    window.animartFirebase = api;
    return api;
}

setupFirebaseClient();

let sliderState = {
    slides: null,
    dots: [],
    index: 0,
    intervalId: null
};

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatPrice(value) {
    return `\u20B9${Number(value || 0).toLocaleString("en-IN")}`;
}

function parseRating(value) {
    const match = String(value || "").match(/[\d.]+/);
    return match ? Number(match[0]) : 0;
}

function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function getCurrentUser() {
    return window.animartFirebase?.getCurrentUser?.() || null;
}

function getAllStores() {
    return Object.values(window.stores || {});
}

function getStoreByProduct(product) {
    if (!product) return null;

    return getAllStores().find((store) => {
        return store.id === product.author || store.name === product.author || slugify(store.name) === slugify(product.author);
    }) || null;
}

function inferColor(product) {
    const text = `${product.name} ${(product.keywords || []).join(" ")}`.toLowerCase();
    const colors = ["red", "orange", "white", "black", "silver", "purple", "green", "blue", "pink", "gold"];
    return colors.find((color) => text.includes(color)) || (product.category === "candles" ? "warm-toned" : "character-inspired");
}

function inferShape(product) {
    const text = `${product.name} ${(product.keywords || []).join(" ")}`.toLowerCase();
    const shapePairs = [
        ["teddy", "bear-shaped"],
        ["heart", "heart-shaped"],
        ["shell", "shell-inspired"],
        ["cake", "layered dessert-style"],
        ["flower", "flower-detailed"],
        ["figure", "posed"],
        ["anime", "posed"]
    ];

    const match = shapePairs.find(([keyword]) => text.includes(keyword));
    if (match) return match[1];
    return product.category === "candles" ? "hand-sculpted" : "display-ready";
}

function buildProductAbout(product) {
    const color = inferColor(product);
    const shape = inferShape(product);
    const store = getStoreByProduct(product);
    const sourceName = store ? store.name : product.author || "Animart";

    if (product.category === "candles") {
        return `${product.name} is a ${shape} handcrafted candle with a ${color} finish that makes it feel giftable, decorative, and cozy at the same time. The form factor is designed to stand out on a desk, side table, or celebration setup, while the detailing keeps it looking polished even before it is lit. Created by ${sourceName}, it works especially well for hamper gifting, room styling, and special-occasion decor.`;
    }

    return `${product.name} is a ${shape} collectible built around a ${color} visual palette, making it a strong shelf centerpiece for anime fans and collectors. The sculpt focuses on character presence, costume detailing, and a balanced silhouette so it looks premium from multiple angles. Crafted for displays by ${sourceName}, it suits desks, gaming setups, and collector cabinets that need a more expressive hero piece.`;
}

function normalizeProduct(product) {
    if (!product) return null;

    const store = getStoreByProduct(product);
    const images = product.images && product.images.length ? product.images : [product.image].filter(Boolean);
    const ratingValue = parseRating(product.rating);
    const normalized = {
        ...product,
        store,
        storeName: store?.name || product.author || "Animart",
        images,
        ratingValue,
        price: Number(product.price || 0),
        realPrice: Number(product.realPrice || product.price || 0),
        discount: Number(product.discount || 0),
        description: product.description || "A quality product curated for Animart shoppers.",
        aboutText: product.aboutText || buildProductAbout(product),
        freeDelivery: Number(product.price || 0) >= 299,
        inStock: true
    };

    normalized.searchBlob = [
        normalized.name,
        normalized.category,
        normalized.storeName,
        normalized.description,
        normalized.aboutText,
        ...(normalized.keywords || [])
    ].join(" ").toLowerCase();

    return normalized;
}

function getCatalogProducts() {
    return Object.values(window.products || {})
        .map(normalizeProduct)
        .filter(Boolean);
}

function detectSearchType(query, products) {
    const tokens = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;

    const typeAliases = {
        anime: ["anime", "figure", "figures", "collectible", "collector", "statue", "character"],
        candles: ["candle", "candles", "wax", "gift", "decor", "decorative", "aroma", "handmade"]
    };

    const directMatch = Object.entries(typeAliases).find(([, aliases]) => {
        return aliases.some((alias) => tokens.includes(alias));
    });

    if (directMatch) return directMatch[0];

    const counts = products.reduce((acc, product) => {
        const matched = tokens.some((token) => {
            return product.name.toLowerCase().includes(token)
                || (product.keywords || []).some((keyword) => keyword.toLowerCase().includes(token));
        });

        if (matched) {
            acc[product.category] = (acc[product.category] || 0) + 1;
        }

        return acc;
    }, {});

    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return ranked[0]?.[0] || null;
}

function searchProducts(query, sourceProducts) {
    const products = sourceProducts || getCatalogProducts();
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const detectedType = detectSearchType(normalizedQuery, products);
    const scopedProducts = detectedType
        ? products.filter((product) => product.category === detectedType)
        : products;

    const scored = scopedProducts.map((product) => {
        let score = 0;

        if (!tokens.length) {
            score = 1;
        } else {
            tokens.forEach((token) => {
                if (product.name.toLowerCase().includes(token)) score += 5;
                if ((product.keywords || []).some((keyword) => keyword.toLowerCase().includes(token))) score += 4;
                if (product.storeName.toLowerCase().includes(token)) score += 2;
                if (product.searchBlob.includes(token)) score += 1;
            });
        }

        return { product, score };
    });

    return scored
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || b.product.ratingValue - a.product.ratingValue)
        .map((entry) => entry.product);
}

function getSuggestionTags(query, products) {
    const tokens = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];

    const tagMap = new Map();

    products.forEach((product) => {
        (product.keywords || []).forEach((keyword) => {
            const normalizedKeyword = keyword.toLowerCase();
            const matched = tokens.some((token) => normalizedKeyword.includes(token) || token.includes(normalizedKeyword));
            if (!matched) return;

            const current = tagMap.get(normalizedKeyword) || 0;
            tagMap.set(normalizedKeyword, current + 1);
        });
    });

    return [...tagMap.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([tag]) => tag)
        .slice(0, 8);
}

function buildProductCardHTML(product, options = {}) {
    const showActions = options.showActions !== false;
    return `
        <article class="catalog-card" data-product-id="${escapeHtml(product.id)}">
            <div class="catalog-media">
                <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" class="catalog-image">
            </div>
            <div class="catalog-body">
                <p class="catalog-store">${escapeHtml(product.storeName)}</p>
                <h3 class="catalog-title">${escapeHtml(product.name)}</h3>
                <p class="catalog-desc">${escapeHtml(product.description)}</p>
                <div class="catalog-meta">
                    <span class="catalog-rating">&#9733; ${escapeHtml(product.ratingValue.toFixed(1))}</span>
                    <span class="catalog-discount">${escapeHtml(product.discount)}% OFF</span>
                </div>
                <div class="catalog-price-row">
                    <strong class="catalog-price">${escapeHtml(formatPrice(product.price))}</strong>
                    <span class="catalog-old-price">${escapeHtml(formatPrice(product.realPrice))}</span>
                </div>
                ${showActions ? `
                <div class="catalog-actions">
                    <button type="button" class="catalog-btn secondary" data-action="add-to-cart" data-product-id="${escapeHtml(product.id)}">Add to Cart</button>
                    <button type="button" class="catalog-btn primary" data-action="buy-now" data-product-id="${escapeHtml(product.id)}">Buy Now</button>
                </div>` : ""}
            </div>
        </article>
    `;
}

function goToSearch(query) {
    const params = new URLSearchParams();
    if (query) params.set("q", query.trim());
    window.location.href = `${SEARCH_PAGE}${params.toString() ? `?${params.toString()}` : ""}`;
}

function renderSuggestions(tags, suggestionsBox) {
    if (!suggestionsBox) return;

    if (!tags.length) {
        suggestionsBox.innerHTML = "";
        suggestionsBox.style.display = "none";
        return;
    }

    suggestionsBox.innerHTML = tags.map((tag) => `
        <button type="button" class="suggestion-item" data-suggestion-tag="${escapeHtml(tag)}">
            <span>${escapeHtml(tag)}</span>
            <small>Keyword</small>
        </button>
    `).join("");
    suggestionsBox.style.display = "flex";
}

function setupSearchBar() {
    const input = document.getElementById("searchInput");
    const suggestionsBox = document.getElementById("suggestions");
    const searchButton = document.querySelector(".search-bar button");

    if (!input || !suggestionsBox) return;

    const existingQuery = new URLSearchParams(window.location.search).get("q");
    if (existingQuery && !input.value) {
        input.value = existingQuery;
    }

    input.addEventListener("input", () => {
        const query = input.value.trim();
        if (!query) {
            suggestionsBox.style.display = "none";
            suggestionsBox.innerHTML = "";
            return;
        }

        const results = searchProducts(query);
        const tags = getSuggestionTags(query, results);
        renderSuggestions(tags, suggestionsBox);
    });

    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            goToSearch(input.value);
        }
    });

    if (searchButton) {
        searchButton.addEventListener("click", () => goToSearch(input.value));
    }

    suggestionsBox.addEventListener("click", (event) => {
        const button = event.target.closest("[data-suggestion-tag]");
        if (!button) return;
        goToSearch(button.dataset.suggestionTag);
    });

    document.addEventListener("click", (event) => {
        if (!event.target.closest(".nav-center")) {
            suggestionsBox.style.display = "none";
        }
    });
}

function syncFooterLinks() {
    const hrefMap = {
        "Track Order": CART_PAGE,
        "Returns & Refunds": "terms.html",
        "Shipping Info": "privacy.html",
        "Contact Us": "contact.html",
        "Privacy Policy": "privacy.html",
        "Terms of Service": "terms.html",
        "Cookie Policy": "cookies.html"
    };

    document.querySelectorAll("footer a").forEach((link) => {
        const label = link.textContent.trim();
        if (hrefMap[label]) {
            link.href = hrefMap[label];
        }
    });
}

function renderFooterPayments() {
    document.querySelectorAll(".payment-methods").forEach((container) => {
        container.innerHTML = `
            <p class="payment-partner-label">Our payment partner</p>
            <div class="payment-partner-brand">
                <img src="assets/footer_payment/razorpay.png" alt="Razorpay logo">
            </div>
            <p class="payment-method-copy">Card, UPI, Netbanking & Wallet</p>
            <div class="payment-logo-row">
                <img src="assets/footer_payment/amex.png" alt="American Express">
                <img src="assets/footer_payment/mastercard.png" alt="Mastercard">
                <img src="assets/footer_payment/rupay.png" alt="RuPay">
                <img src="assets/footer_payment/upi.png" alt="UPI">
                <img src="assets/footer_payment/visa.png" alt="Visa">
            </div>
        `;
    });
}

function closeAccountMenus() {
    document.querySelectorAll(".account-nav").forEach((item) => item.classList.remove("open"));
}

function syncHeaderAccount() {
    const accountItem = document.querySelector(".nav-right .nav-item");
    if (!accountItem) return;

    const currentUser = getCurrentUser();
    const firstName = currentUser?.name ? currentUser.name.split(" ")[0] : null;
    const topText = currentUser ? `Hello, ${firstName}` : "Hello, Sign in";
    const bottomText = currentUser ? "My Account" : "Account";

    accountItem.classList.add("account-nav");

    if (!currentUser) {
        accountItem.classList.remove("open");
        accountItem.innerHTML = `<span>${escapeHtml(topText)}</span><strong>${escapeHtml(bottomText)}</strong>`;
        accountItem.onclick = () => {
            window.location.href = LOGIN_PAGE;
        };
        return;
    }

    accountItem.innerHTML = `
        <span>${escapeHtml(topText)}</span>
        <strong>${escapeHtml(bottomText)}</strong>
        <div class="account-dropdown">
            ${ACCOUNT_LINKS.map((link) => `
                <a href="${link.href}" class="account-dropdown-link">${escapeHtml(link.label)}</a>
            `).join("")}
            <button type="button" class="account-dropdown-link account-logout-btn" data-account-logout="true">Log Out</button>
        </div>
    `;

    accountItem.onclick = (event) => {
        if (event.target.closest("[data-account-logout]")) return;
        const clickedLink = event.target.closest(".account-dropdown-link");
        if (clickedLink?.tagName === "A") return;
        event.stopPropagation();
        const willOpen = !accountItem.classList.contains("open");
        closeAccountMenus();
        accountItem.classList.toggle("open", willOpen);
    };

    accountItem.querySelector("[data-account-logout]")?.addEventListener("click", async (event) => {
        event.stopPropagation();
        await window.animartFirebase.signOutUser();
        closeAccountMenus();
        if (window.location.pathname.endsWith("/orders.html")
            || window.location.pathname.endsWith("/returns.html")
            || window.location.pathname.endsWith("/settings.html")) {
            window.location.href = LOGIN_PAGE;
            return;
        }
        syncHeaderAccount();
    });
}

function renderHomeFeatured() {
    const featuredGrid = document.getElementById("featuredGrid");
    if (!featuredGrid) return;

    const priorityIds = ["gojo", "naruto", "luffy", "madara", "mocha", "shell", "white_teddy", "heart_hand"];
    const allProducts = getCatalogProducts();
    const ordered = [
        ...priorityIds.map((id) => allProducts.find((product) => product.id === id)).filter(Boolean),
        ...allProducts.filter((product) => !priorityIds.includes(product.id))
    ].slice(0, 8);

    featuredGrid.innerHTML = ordered.map((product) => buildProductCardHTML(product)).join("");
}

function setupCategoryLinks() {
    document.querySelectorAll("[data-category]").forEach((element) => {
        element.addEventListener("click", () => {
            goToSearch(element.dataset.category);
        });
    });
}

function setupSlider() {
    const slides = document.getElementById("slides");
    const dotsContainer = document.getElementById("dots");

    if (!slides || !dotsContainer || !slides.children.length) return;

    sliderState.slides = slides;
    sliderState.index = 0;
    dotsContainer.innerHTML = "";
    sliderState.dots = Array.from(slides.children).map((_, index) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "dot";
        dot.addEventListener("click", () => goToSlide(index));
        dotsContainer.appendChild(dot);
        return dot;
    });

    updateSlider();

    if (sliderState.intervalId) {
        clearInterval(sliderState.intervalId);
    }

    sliderState.intervalId = window.setInterval(() => nextSlide(), 10000);
}

function updateSlider() {
    if (!sliderState.slides) return;
    sliderState.slides.style.transform = `translateX(-${sliderState.index * 100}%)`;
    sliderState.dots.forEach((dot, index) => {
        dot.classList.toggle("active", index === sliderState.index);
    });
}

function nextSlide() {
    if (!sliderState.slides) return;
    sliderState.index = (sliderState.index + 1) % sliderState.slides.children.length;
    updateSlider();
}

function prevSlide() {
    if (!sliderState.slides) return;
    sliderState.index = (sliderState.index - 1 + sliderState.slides.children.length) % sliderState.slides.children.length;
    updateSlider();
}

function goToSlide(index) {
    if (!sliderState.slides) return;
    sliderState.index = index;
    updateSlider();
}

document.addEventListener("click", (event) => {
    const addButton = event.target.closest('[data-action="add-to-cart"]');
    if (addButton && typeof window.addToCart === "function") {
        event.stopPropagation();
        window.addToCart(addButton.dataset.productId, 1, { selected: true });
        window.location.href = CART_PAGE;
        return;
    }

    const buyButton = event.target.closest('[data-action="buy-now"]');
    if (buyButton && typeof window.startDirectCheckout === "function") {
        event.stopPropagation();
        window.startDirectCheckout(buyButton.dataset.productId, 1);
        return;
    }

    const card = event.target.closest("[data-product-id]");
    if (card && !event.target.closest("button")) {
        window.location.href = `product.html?id=${card.dataset.productId}`;
    }
});

document.addEventListener("DOMContentLoaded", () => {
    syncFooterLinks();
    renderFooterPayments();
    syncHeaderAccount();
    setupSearchBar();
    setupSlider();
    renderHomeFeatured();
    setupCategoryLinks();
});

document.addEventListener("click", (event) => {
    if (!event.target.closest(".account-nav")) {
        closeAccountMenus();
    }
});

window.animartFirebase?.onUserChange?.(() => {
    syncHeaderAccount();
});

window.formatPrice = formatPrice;
window.getCatalogProducts = getCatalogProducts;
window.normalizeProduct = normalizeProduct;
window.searchProducts = searchProducts;
window.detectSearchType = detectSearchType;
window.getStoreByProduct = getStoreByProduct;
window.buildProductAbout = buildProductAbout;
window.buildProductCardHTML = buildProductCardHTML;
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
window.goToSlide = goToSlide;
window.setupSlider = setupSlider;



