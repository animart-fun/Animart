function loadCheckoutItems() {
    const checkoutState = window.getCheckoutState ? window.getCheckoutState() : null;
    if (!checkoutState?.items?.length) return null;

    const items = checkoutState.items.map((item) => {
        const product = window.products?.[item.id];
        if (!product) return null;
        return {
            quantity: Number(item.quantity || 1),
            product: window.normalizeProduct(product)
        };
    }).filter(Boolean);

    return items.length ? { ...checkoutState, items } : null;
}

function renderCheckoutPage() {
    const container = document.getElementById("checkoutItems");
    if (!container) return;

    const checkoutState = loadCheckoutItems();
    if (!checkoutState) {
        container.innerHTML = `
            <div class="empty-cart">
                <h3>No items ready for checkout</h3>
                <p>Add products to your cart or use Buy Now from a product page.</p>
                <a href="home.html" class="cta-link">Start Shopping</a>
            </div>
        `;
        document.getElementById("placeOrderBtn").disabled = true;
        return;
    }

    const subtotal = checkoutState.items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
    const originalTotal = checkoutState.items.reduce((sum, item) => sum + item.product.realPrice * item.quantity, 0);
    const discount = Math.max(originalTotal - subtotal, 0);
    const shipping = subtotal > 799 ? 0 : 79;
    const total = subtotal + shipping;

    container.innerHTML = checkoutState.items.map((item) => `
        <article class="checkout-item">
            <img src="${item.product.image}" alt="${item.product.name}" class="checkout-image">
            <div class="checkout-info">
                <h3>${item.product.name}</h3>
                <p>${item.product.storeName}</p>
                <div class="checkout-meta">
                    <span>${window.formatPrice(item.product.price)}</span>
                    <span>Qty ${item.quantity}</span>
                    <span>${item.product.discount}% OFF</span>
                </div>
            </div>
            <strong class="checkout-line-total">${window.formatPrice(item.product.price * item.quantity)}</strong>
        </article>
    `).join("");

    document.getElementById("checkoutSubtotal").textContent = window.formatPrice(subtotal);
    document.getElementById("checkoutDiscount").textContent = window.formatPrice(discount);
    document.getElementById("checkoutShipping").textContent = shipping === 0 ? "Free" : window.formatPrice(shipping);
    document.getElementById("checkoutTotal").textContent = window.formatPrice(total);
}

function clearPurchasedCartItems() {
    const checkoutState = loadCheckoutItems();
    if (!checkoutState || checkoutState.source !== "cart") return;

    const purchasedIds = new Set(checkoutState.items.map((item) => item.product.id));
    const remaining = window.getCart().filter((item) => !purchasedIds.has(item.id));
    window.saveCart(remaining);
}

document.addEventListener("DOMContentLoaded", () => {
    renderCheckoutPage();

    document.getElementById("placeOrderBtn")?.addEventListener("click", () => {
        const name = document.getElementById("customerName")?.value.trim();
        const address = document.getElementById("customerAddress")?.value.trim();
        const payment = document.getElementById("paymentMethod")?.value;
        const status = document.getElementById("checkoutStatus");

        if (!name || !address) {
            status.textContent = "Please add your name and delivery address before placing the order.";
            status.className = "checkout-status error";
            return;
        }

        clearPurchasedCartItems();
        localStorage.removeItem("animartCheckout");
        status.textContent = `Order placed successfully with ${payment}. A confirmation summary is ready on this device.`;
        status.className = "checkout-status success";
        document.getElementById("placeOrderBtn").disabled = true;
    });
});
