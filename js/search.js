function getSearchPageState() {
    const params = new URLSearchParams(window.location.search);
    return {
        q: params.get("q") || "",
        priceMax: Number(params.get("priceMax") || 5000),
        ratingMin: Number(params.get("ratingMin") || 0),
        discountMin: Number(params.get("discountMin") || 0),
        sort: params.get("sort") || "relevance",
        freeDelivery: params.get("freeDelivery") === "1",
        inStock: params.get("inStock") !== "0"
    };
}

function applyFilters(products, state) {
    let results = state.q ? window.searchProducts(state.q, products) : [...products];

    results = results.filter((product) => product.price <= state.priceMax);
    results = results.filter((product) => product.ratingValue >= state.ratingMin);
    results = results.filter((product) => product.discount >= state.discountMin);
    if (state.freeDelivery) results = results.filter((product) => product.freeDelivery);
    if (state.inStock) results = results.filter((product) => product.inStock);

    switch (state.sort) {
        case "price-asc":
            results.sort((a, b) => a.price - b.price);
            break;
        case "price-desc":
            results.sort((a, b) => b.price - a.price);
            break;
        case "rating-desc":
            results.sort((a, b) => b.ratingValue - a.ratingValue);
            break;
        case "discount-desc":
            results.sort((a, b) => b.discount - a.discount);
            break;
        default:
            break;
    }

    return results;
}

function syncFilterForm(state, products) {
    const typeBadge = document.getElementById("searchTypeBadge");
    const detectedType = window.detectSearchType ? window.detectSearchType(state.q, products) : null;
    if (typeBadge) {
        typeBadge.textContent = detectedType
            ? `${detectedType.charAt(0).toUpperCase() + detectedType.slice(1)} products only`
            : "Mixed catalog search";
    }

    document.getElementById("priceMax").value = state.priceMax;
    document.getElementById("priceOutput").textContent = window.formatPrice(state.priceMax);
    document.getElementById("ratingMin").value = state.ratingMin;
    document.getElementById("discountMin").value = state.discountMin;
    document.getElementById("sortBy").value = state.sort;
    document.getElementById("freeDelivery").checked = state.freeDelivery;
    document.getElementById("inStock").checked = state.inStock;
    document.getElementById("resultSearchInput").value = state.q;

    const mobileSearch = document.getElementById("resultSearchInputMobile");
    if (mobileSearch) {
        document.getElementById("priceMaxMobile").value = state.priceMax;
        document.getElementById("priceOutputMobile").textContent = window.formatPrice(state.priceMax);
        document.getElementById("ratingMinMobile").value = state.ratingMin;
        document.getElementById("discountMinMobile").value = state.discountMin;
        document.getElementById("sortByMobile").value = state.sort;
        document.getElementById("freeDeliveryMobile").checked = state.freeDelivery;
        document.getElementById("inStockMobile").checked = state.inStock;
        mobileSearch.value = state.q;
    }
}

function renderSearchResults() {
    const allProducts = window.getCatalogProducts();
    const state = getSearchPageState();
    syncFilterForm(state, allProducts);

    const results = applyFilters(allProducts, state);
    const resultsGrid = document.getElementById("resultsGrid");
    const resultCount = document.getElementById("resultCount");
    const appliedQuery = document.getElementById("appliedQuery");

    resultCount.textContent = `${results.length} products`;
    appliedQuery.textContent = state.q ? `Results for "${state.q}"` : "Browse all products";

    if (!results.length) {
        resultsGrid.innerHTML = `
            <div class="no-results">
                <h3>No products matched your filters</h3>
                <p>Try widening the price range, removing a filter, or searching another keyword.</p>
            </div>
        `;
        return;
    }

    resultsGrid.innerHTML = results.map((product) => window.buildProductCardHTML(product)).join("");
}

function buildSearchUrlFromForm(form) {
    const getValue = (primaryId, fallbackId) => {
        return form.querySelector(`#${primaryId}`)?.value ?? form.querySelector(`#${fallbackId}`)?.value ?? "";
    };

    const getChecked = (primaryId, fallbackId) => {
        return form.querySelector(`#${primaryId}`)?.checked ?? form.querySelector(`#${fallbackId}`)?.checked ?? false;
    };

    const params = new URLSearchParams();
    const query = getValue("resultSearchInput", "resultSearchInputMobile").trim();
    if (query) params.set("q", query);

    params.set("priceMax", getValue("priceMax", "priceMaxMobile"));
    params.set("ratingMin", getValue("ratingMin", "ratingMinMobile"));
    params.set("discountMin", getValue("discountMin", "discountMinMobile"));
    params.set("sort", getValue("sortBy", "sortByMobile"));
    if (getChecked("freeDelivery", "freeDeliveryMobile")) params.set("freeDelivery", "1");
    if (!getChecked("inStock", "inStockMobile")) params.set("inStock", "0");
    return `search.html?${params.toString()}`;
}

document.addEventListener("DOMContentLoaded", () => {
    const filterForm = document.getElementById("searchFilterForm");
    const mobileFilterForm = document.getElementById("searchFilterFormMobile");
    if (!filterForm) return;

    renderSearchResults();

    const handleSubmit = (form) => (event) => {
        event.preventDefault();
        window.location.href = buildSearchUrlFromForm(form);
    };

    filterForm.addEventListener("submit", handleSubmit(filterForm));
    mobileFilterForm?.addEventListener("submit", handleSubmit(mobileFilterForm));

    document.getElementById("priceMax")?.addEventListener("input", (event) => {
        document.getElementById("priceOutput").textContent = window.formatPrice(event.target.value);
    });

    document.getElementById("priceMaxMobile")?.addEventListener("input", (event) => {
        document.getElementById("priceOutputMobile").textContent = window.formatPrice(event.target.value);
    });

    document.getElementById("resetFilters")?.addEventListener("click", () => {
        window.location.href = "search.html";
    });

    document.getElementById("resetFiltersMobile")?.addEventListener("click", () => {
        window.location.href = "search.html";
    });
});

