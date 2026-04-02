document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const storeId = params.get("store");
    const store = window.stores?.[storeId];

    if (!store) {
        alert("Store not found");
        window.location.href = "home.html";
        return;
    }

    document.title = `${store.name} | Animart`;

    const slidesContainer = document.getElementById("slides");
    slidesContainer.innerHTML = "";
    store.banners.forEach((banner) => {
        const slide = document.createElement("div");
        slide.className = "slide";
        slide.style.backgroundImage = `linear-gradient(rgba(8, 22, 42, 0.35), rgba(8, 22, 42, 0.65)), url(${banner.image})`;
        slide.textContent = banner.text;
        slide.style.color = banner.textColor || "#ffffff";
        slidesContainer.appendChild(slide);
    });

    window.setupSlider?.();

    const featuredProducts = (store.featured || [])
        .map((id) => window.products?.[id])
        .filter(Boolean)
        .map((product) => window.normalizeProduct(product));

    const container = document.getElementById("product_row");
    container.innerHTML = featuredProducts.length
        ? featuredProducts.map((product) => window.buildProductCardHTML(product)).join("")
        : "<p>No products are available for this store yet.</p>";
});
