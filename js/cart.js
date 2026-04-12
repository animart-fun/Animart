const CART_STORAGE_KEY = "animartCart";
const CHECKOUT_STORAGE_KEY = "animartCheckout";

function getCurrencyText(value) {
    return `\u20B9${Number(value || 0).toLocaleString("en-IN")}`;
}

function normalizeCartItem(item) {
    return {
        id: item.id,
        quantity: Number(item.quantity || 1),
        selected: item.selected !== false,
        snapshot: item.snapshot || null
    };
}

function getCart() {
    try {
        const parsed = JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || [];
        return Array.isArray(parsed) ? parsed.map(normalizeCartItem) : [];
    } catch (error) {
        return [];
    }
}

function saveCart(cart) {
    const normalizedCart = cart.map(normalizeCartItem);
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(normalizedCart));
    const syncPromise = window.animartFirebase?.writeCartToDatabase?.(normalizedCart);
    if (syncPromise && typeof syncPromise.catch === "function") {
        syncPromise.catch(() => {});
    }
}

function buildCartSnapshot(productId) {
    const rawProduct = window.products?.[productId];
    const normalized = rawProduct && typeof window.normalizeProduct === "function"
        ? window.normalizeProduct(rawProduct)
        : rawProduct;

    if (!normalized) return null;

    return {
        id: normalized.id,
        name: normalized.name,
        image: normalized.image,
        price: Number(normalized.price || 0),
        realPrice: Number(normalized.realPrice || normalized.price || 0),
        discount: Number(normalized.discount || 0),
        storeName: normalized.storeName || normalized.author || "Animart",
        freeDelivery: !!normalized.freeDelivery
    };
}

function ensureCartToast() {
    let toast = document.getElementById("cartToast");
    if (toast) return toast;

    toast = document.createElement("div");
    toast.id = "cartToast";
    toast.className = "cart-toast";
    document.body.appendChild(toast);
    return toast;
}

function showCartToast(message) {
    const toast = ensureCartToast();
    toast.textContent = message;
    toast.classList.add("show");

    window.clearTimeout(showCartToast.timeoutId);
    showCartToast.timeoutId = window.setTimeout(() => {
        toast.classList.remove("show");
    }, 2400);
}

function addToCart(productId, quantity = 1, options = {}) {
    if (!productId) return;

    const cart = getCart();
    const existingItem = cart.find((item) => item.id === productId);
    const selected = options.selected !== false;
    const snapshot = buildCartSnapshot(productId);

    if (existingItem) {
        existingItem.quantity += quantity;
        existingItem.selected = selected;
        if (snapshot) existingItem.snapshot = snapshot;
    } else {
        cart.push({ id: productId, quantity, selected, snapshot });
    }

    saveCart(cart);
    window.dispatchEvent(new CustomEvent("animart:cart-updated", { detail: cart }));
    if (options.silent !== true) {
        showCartToast("Added to cart");
    }
}

function removeFromCart(productId) {
    saveCart(getCart().filter((item) => item.id !== productId));
}

function changeCartQuantity(productId, nextQuantity) {
    const cart = getCart();
    const item = cart.find((entry) => entry.id === productId);
    if (!item) return;

    if (nextQuantity <= 0) {
        removeFromCart(productId);
        return;
    }

    item.quantity = nextQuantity;
    saveCart(cart);
}

function toggleCartSelection(productId, selected) {
    const cart = getCart();
    const item = cart.find((entry) => entry.id === productId);
    if (!item) return;
    item.selected = selected;
    saveCart(cart);
}

function toggleSelectAll(selected) {
    const cart = getCart().map((item) => ({ ...item, selected }));
    saveCart(cart);
}

function getCheckoutState() {
    try {
        return JSON.parse(localStorage.getItem(CHECKOUT_STORAGE_KEY));
    } catch (error) {
        return null;
    }
}

function setCheckoutState(payload) {
    localStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(payload));
}

function startDirectCheckout(productId, quantity = 1) {
    setCheckoutState({
        source: "buyNow",
        items: [{ id: productId, quantity }]
    });
    window.location.href = "checkout.html";
}

function startCheckoutFromCart() {
    const selectedItems = getCart().filter((item) => item.selected);
    if (!selectedItems.length) {
        alert("Please select at least one product to continue.");
        return;
    }

    setCheckoutState({
        source: "cart",
        items: selectedItems
    });
    window.location.href = "checkout.html";
}

function hydrateCartProducts() {
    return getCart()
        .map((item) => {
            const product = window.products?.[item.id];
            const normalized = product && typeof window.normalizeProduct === "function"
                ? window.normalizeProduct(product)
                : product;

            const hydratedProduct = normalized || item.snapshot || {
                id: item.id,
                name: item.id,
                image: "assets/logo.png",
                price: 0,
                realPrice: 0,
                discount: 0,
                storeName: "Animart",
                freeDelivery: false
            };

            return { ...item, product: hydratedProduct };
        })
        .filter((entry) => !!entry.product);
}

function renderCartPage() {
    const cartItemsContainer = document.getElementById("cartItems");
    if (!cartItemsContainer) return;

    const selectAllInput = document.getElementById("selectAllCart");
    const cartCount = document.getElementById("cartCount");
    const selectedSummary = document.getElementById("selectedSummary");
    const subtotalAmount = document.getElementById("subtotalAmount");
    const shippingAmount = document.getElementById("shippingAmount");
    const discountAmount = document.getElementById("discountAmount");
    const totalAmount = document.getElementById("totalAmount");

    const items = hydrateCartProducts();
    const selectedItems = items.filter((item) => item.selected);
    const selectedQty = selectedItems.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = selectedItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const originalTotal = selectedItems.reduce((sum, item) => sum + item.product.realPrice * item.quantity, 0);
    const discount = Math.max(originalTotal - subtotal, 0);
    const shipping = subtotal > 799 || subtotal === 0 ? 0 : 79;
    const total = subtotal + shipping;

    if (cartCount) cartCount.textContent = `${items.reduce((sum, item) => sum + item.quantity, 0)} items`;
    if (selectedSummary) selectedSummary.textContent = `${selectedQty} selected`;
    if (subtotalAmount) subtotalAmount.textContent = window.formatPrice ? window.formatPrice(subtotal) : getCurrencyText(subtotal);
    if (shippingAmount) shippingAmount.textContent = shipping === 0 ? "Free" : (window.formatPrice ? window.formatPrice(shipping) : getCurrencyText(shipping));
    if (discountAmount) discountAmount.textContent = window.formatPrice ? window.formatPrice(discount) : getCurrencyText(discount);
    if (totalAmount) totalAmount.textContent = window.formatPrice ? window.formatPrice(total) : getCurrencyText(total);
    if (selectAllInput) selectAllInput.checked = !!items.length && items.every((item) => item.selected);

    if (!items.length) {
        cartItemsContainer.innerHTML = `
            <div class="empty-cart">
                <h3>Your cart is waiting</h3>
                <p>Pick out a figure, candle, or merch drop to see it here.</p>
                <a href="index.html" class="cta-link">Continue Shopping</a>
            </div>
        `;
        return;
    }

    cartItemsContainer.innerHTML = items.map((item) => `
        <article class="cart-item">
            <label class="cart-select-wrap">
                <input type="checkbox" data-cart-select="${item.id}" ${item.selected ? "checked" : ""}>
            </label>
            <img class="cart-item-image" src="${item.product.image}" alt="${item.product.name}">
            <div class="cart-item-info">
                <h3>${item.product.name}</h3>
                <p class="cart-store">${item.product.storeName}</p>
                <div class="cart-meta">
                    <span class="price-now">${window.formatPrice(item.product.price)}</span>
                    <span class="price-old">${window.formatPrice(item.product.realPrice)}</span>
                    <span class="discount-tag">${item.product.discount}% OFF</span>
                    <span class="delivery-tag">${item.product.freeDelivery ? "Free delivery" : "Fast delivery"}</span>
                </div>
            </div>
            <div class="cart-item-actions">
                <div class="qty-box">
                    <button class="qty-btn" type="button" data-action="decrease" data-id="${item.id}">-</button>
                    <span>Qty ${item.quantity}</span>
                    <button class="qty-btn" type="button" data-action="increase" data-id="${item.id}">+</button>
                </div>
                <div class="item-total">${window.formatPrice(item.product.price * item.quantity)}</div>
                <div class="cart-line-actions">
                    <button class="remove-btn" type="button" data-action="remove" data-id="${item.id}">Remove</button>
                    <button class="remove-btn alt" type="button" data-action="buy-item" data-id="${item.id}">Buy This Now</button>
                </div>
            </div>
        </article>
    `).join("");
}

document.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-cart-select]");
    if (!checkbox) return;
    toggleCartSelection(checkbox.dataset.cartSelect, checkbox.checked);
    renderCartPage();
});

document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const productId = button.dataset.id;
    const action = button.dataset.action;
    const item = getCart().find((entry) => entry.id === productId);

    if (action === "increase" && item) changeCartQuantity(productId, item.quantity + 1);
    if (action === "decrease" && item) changeCartQuantity(productId, item.quantity - 1);
    if (action === "remove") removeFromCart(productId);
    if (action === "buy-item") startDirectCheckout(productId, item?.quantity || 1);

    if (["increase", "decrease", "remove"].includes(action)) {
        renderCartPage();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    const selectAllInput = document.getElementById("selectAllCart");
    const checkoutButton = document.getElementById("checkoutSelectedBtn");

    if (selectAllInput) {
        selectAllInput.addEventListener("change", () => {
            toggleSelectAll(selectAllInput.checked);
            renderCartPage();
        });
    }

    if (checkoutButton) {
        checkoutButton.addEventListener("click", startCheckoutFromCart);
    }

    renderCartPage();
});

window.addEventListener("animart:cart-synced", renderCartPage);
window.addEventListener("animart:cart-updated", renderCartPage);

window.getCart = getCart;
window.saveCart = saveCart;
window.addToCart = addToCart;
window.startDirectCheckout = startDirectCheckout;
window.startCheckoutFromCart = startCheckoutFromCart;
window.getCheckoutState = getCheckoutState;
window.setCheckoutState = setCheckoutState;
