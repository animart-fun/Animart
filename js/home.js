const SEARCH_PAGE = "search.html";
const LOGIN_PAGE = "login.html";
const CART_PAGE = "cart.html";
const CURRENT_USER_KEY = "animartCurrentUser";

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
    try {
        return JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
    } catch (error) {
        return null;
    }
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

function syncHeaderAccount() {
    const accountItem = document.querySelector(".nav-right .nav-item");
    if (!accountItem) return;

    const currentUser = getCurrentUser();
    const firstName = currentUser?.name ? currentUser.name.split(" ")[0] : null;
    const topText = currentUser ? `Hello, ${firstName}` : "Hello, Sign in";
    const bottomText = currentUser ? "My Account" : "Account";

    accountItem.innerHTML = `<span>${escapeHtml(topText)}</span><strong>${escapeHtml(bottomText)}</strong>`;
    accountItem.addEventListener("click", () => {
        window.location.href = LOGIN_PAGE;
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
    syncHeaderAccount();
    setupSearchBar();
    setupSlider();
    renderHomeFeatured();
    setupCategoryLinks();
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



