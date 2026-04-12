const LOGIN_REDIRECT_PAGE = "index.html";

function showMessage(target, message, type) {
    if (!target) return;
    target.textContent = message;
    target.className = `auth-message ${type}`;
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phoneNumber) {
    return !phoneNumber || /^[0-9+\-\s()]{7,20}$/.test(phoneNumber);
}

function getFriendlyAuthError(error) {
    const code = error?.code || "";
    const hostname = window.location.hostname || "your site domain";

    if (code === "auth/unauthorized-domain") {
        return `Google sign-in is blocked because "${hostname}" is not added in Firebase Authorized Domains. Open Firebase Console > Authentication > Settings > Authorized domains and add this exact domain, then try again.`;
    }

    if (code === "auth/popup-closed-by-user") {
        return "The Google sign-in popup was closed before completion. Please try again.";
    }

    if (code === "auth/popup-blocked") {
        return "Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.";
    }

    if (code === "auth/invalid-login-credentials") {
        return "Incorrect email or password.";
    }

    if (code === "auth/email-already-in-use") {
        return "An account with this email already exists.";
    }

    if (code === "auth/weak-password") {
        return "Password should be at least 6 characters.";
    }

    return error?.message || "Something went wrong. Please try again.";
}

function renderSignedInState() {
    const signedInState = document.getElementById("signedInState");
    if (!signedInState) return;

    const currentUser = window.animartFirebase?.getCurrentUser?.();
    if (!currentUser) {
        signedInState.innerHTML = "";
        return;
    }

    signedInState.innerHTML = `
        <p>You are currently signed in as <strong>${currentUser.name}</strong>.</p>
        <button type="button" class="btn secondary-btn" id="signOutBtn">Sign Out</button>
    `;

    document.getElementById("signOutBtn")?.addEventListener("click", async () => {
        await window.animartFirebase.signOutUser();
        window.location.reload();
    });
}

function attachGoogleAuth(buttonId, messageBox) {
    const googleButton = document.getElementById(buttonId);
    if (!googleButton) return;

    googleButton.addEventListener("click", async () => {
        try {
            googleButton.disabled = true;
            showMessage(messageBox, "Connecting your Google account...", "success");
            await window.animartFirebase.signInWithGoogle();
            showMessage(messageBox, "Google sign in successful. Redirecting...", "success");
            window.setTimeout(() => {
                window.location.href = LOGIN_REDIRECT_PAGE;
            }, 700);
        } catch (error) {
            showMessage(messageBox, getFriendlyAuthError(error), "error");
        } finally {
            googleButton.disabled = false;
        }
    });
}

function setupSignupForm() {
    const form = document.getElementById("signupForm");
    if (!form) return;

    const messageBox = document.getElementById("authMessage");
    attachGoogleAuth("googleSignupBtn", messageBox);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(form);
        const name = String(formData.get("name") || "").trim();
        const email = String(formData.get("email") || "").trim().toLowerCase();
        const phoneNumber = String(formData.get("phoneNumber") || "").trim();
        const dateOfBirth = String(formData.get("dateOfBirth") || "").trim();
        const password = String(formData.get("password") || "");
        const confirmPassword = String(formData.get("confirmPassword") || "");

        if (name.length < 2) {
            showMessage(messageBox, "Please enter your full name.", "error");
            return;
        }

        if (!validateEmail(email)) {
            showMessage(messageBox, "Please enter a valid email address.", "error");
            return;
        }

        if (!validatePhone(phoneNumber)) {
            showMessage(messageBox, "Please enter a valid phone number or leave it blank.", "error");
            return;
        }

        if (!dateOfBirth) {
            showMessage(messageBox, "Please select your date of birth.", "error");
            return;
        }

        if (password.length < 6) {
            showMessage(messageBox, "Password should be at least 6 characters.", "error");
            return;
        }

        if (password !== confirmPassword) {
            showMessage(messageBox, "Passwords do not match.", "error");
            return;
        }

        try {
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true;
            showMessage(messageBox, "Creating your account...", "success");

            await window.animartFirebase.signUpWithEmail({
                name,
                email,
                password,
                phoneNumber,
                dateOfBirth
            });

            showMessage(messageBox, "Account created successfully. Redirecting...", "success");
            window.setTimeout(() => {
                window.location.href = LOGIN_REDIRECT_PAGE;
            }, 900);
        } catch (error) {
            showMessage(messageBox, getFriendlyAuthError(error), "error");
        } finally {
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = false;
        }
    });
}

function setupLoginForm() {
    const form = document.getElementById("loginForm");
    if (!form) return;

    const messageBox = document.getElementById("authMessage");
    renderSignedInState();
    attachGoogleAuth("googleLoginBtn", messageBox);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const formData = new FormData(form);
        const email = String(formData.get("email") || "").trim().toLowerCase();
        const password = String(formData.get("password") || "");

        if (!validateEmail(email)) {
            showMessage(messageBox, "Please enter a valid email address.", "error");
            return;
        }

        try {
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true;
            showMessage(messageBox, "Signing you in...", "success");

            await window.animartFirebase.signInWithEmail({ email, password });

            showMessage(messageBox, "Signed in successfully. Redirecting...", "success");
            window.setTimeout(() => {
                window.location.href = LOGIN_REDIRECT_PAGE;
            }, 800);
        } catch (error) {
            showMessage(messageBox, getFriendlyAuthError(error), "error");
        } finally {
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = false;
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    setupSignupForm();
    setupLoginForm();
});

window.animartFirebase?.onUserChange?.(() => {
    renderSignedInState();
});
