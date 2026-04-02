document.addEventListener("DOMContentLoaded", () => {
    const contactForm = document.getElementById("contactForm");
    if (!contactForm) return;

    const status = document.getElementById("contactStatus");
    contactForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const formData = new FormData(contactForm);
        const payload = {
            name: formData.get("name"),
            email: formData.get("email"),
            message: formData.get("message"),
            submittedAt: new Date().toISOString()
        };

        const messages = JSON.parse(localStorage.getItem("animartContacts") || "[]");
        messages.push(payload);
        localStorage.setItem("animartContacts", JSON.stringify(messages));
        contactForm.reset();
        status.textContent = "Thanks for reaching out. Your message has been saved locally for this storefront demo.";
        status.className = "page-status success";
    });
});
