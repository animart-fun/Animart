document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get("id");
    const rawProduct = window.products?.[productId];
    const product = rawProduct && window.normalizeProduct ? window.normalizeProduct(rawProduct) : rawProduct;

    if (!product) {
        alert("Product not found");
        window.location.href = "home.html";
        return;
    }

    const store = window.getStoreByProduct ? window.getStoreByProduct(product) : null;

    document.title = `${product.name} | Animart`;
    document.querySelector(".title").textContent = product.name;
    document.querySelector(".rating").textContent = `★ ${product.ratingValue.toFixed(1)} rating`;
    document.querySelector(".desc").textContent = product.description;
    document.querySelector(".para").textContent = product.aboutText;
    document.querySelector(".policy").textContent = product.freeDelivery ? "Free delivery available. Secure checkout and protected packaging included." : "Fast shipping and secure checkout included.";

    const authorElement = document.querySelector(".author-link");
    if (authorElement) {
        authorElement.textContent = store ? `Visit ${store.name} Store` : product.storeName;
        authorElement.href = store ? `store.html?store=${store.id}` : "#";
    }

    document.querySelector(".real_price").innerHTML = `${window.formatPrice(product.price)} <span class="discount">-${product.discount}% OFF</span>`;
    document.querySelector(".old").textContent = `M.R.P ${window.formatPrice(product.realPrice)}`;

    const mainImage = document.querySelector(".main-img img");
    const thumbsContainer = document.querySelector(".thumbs");
    thumbsContainer.innerHTML = "";

    product.images.forEach((src, index) => {
        const thumb = document.createElement("img");
        thumb.src = src;
        thumb.alt = `${product.name} view ${index + 1}`;
        thumb.addEventListener("click", () => {
            mainImage.src = src;
            mainImage.style.transform = "scale(1)";
        });
        thumbsContainer.appendChild(thumb);
    });

    mainImage.src = product.images[0] || product.image;
    mainImage.alt = product.name;

    const featuresList = document.querySelector(".features");
    featuresList.innerHTML = (product.features || []).map((feature) => `<li>${feature}</li>`).join("");

    const offersContainer = document.querySelector(".offers");
    offersContainer.innerHTML = (product.offers || []).map((offer) => `
        <div class="offer">
            <div class="offer_heading">${offer.title}</div>
            <div class="offer_desc">${offer.desc}</div>
            <div class="apply">Apply Now</div>
        </div>
    `).join("");

    const relatedContainer = document.getElementById("relatedProducts");
    const relatedProducts = window.getCatalogProducts()
        .filter((entry) => entry.id !== product.id)
        .filter((entry) => entry.category === product.category || entry.storeName === product.storeName)
        .slice(0, 6);
    relatedContainer.innerHTML = relatedProducts.map((entry) => window.buildProductCardHTML(entry)).join("");

    document.querySelector(".btn.cart")?.addEventListener("click", () => {
        window.addToCart(product.id, 1, { selected: true });
        window.location.href = "cart.html";
    });

    document.querySelector(".btn.buy")?.addEventListener("click", () => {
        window.startDirectCheckout(product.id, 1);
    });

    const imageWrap = document.querySelector(".main-img");
    let zoomLevel = 1;
    let zoomActive = false;

    imageWrap.addEventListener("click", () => {
        zoomActive = !zoomActive;
        if (!zoomActive) {
            zoomLevel = 1;
            mainImage.style.transform = "scale(1)";
            imageWrap.style.cursor = "zoom-in";
        } else {
            imageWrap.style.cursor = "zoom-out";
        }
    });

    imageWrap.addEventListener("wheel", (event) => {
        if (!zoomActive) return;
        event.preventDefault();
        zoomLevel += event.deltaY < 0 ? 0.2 : -0.2;
        zoomLevel = Math.min(Math.max(zoomLevel, 1), 4);
        mainImage.style.transform = `scale(${zoomLevel})`;
    });

    imageWrap.addEventListener("mousemove", (event) => {
        if (!zoomActive) return;
        const rect = imageWrap.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        mainImage.style.transformOrigin = `${x}% ${y}%`;
    });
});
