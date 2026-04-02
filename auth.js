const USERS_STORAGE_KEY = "animartUsers";
const CURRENT_USER_STORAGE_KEY = "animartCurrentUser";

function getUsers() {
    try {
        const parsed = JSON.parse(localStorage.getItem(USERS_STORAGE_KEY)) || [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        return [];
    }
}

function saveUsers(users) {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function setCurrentUser(user) {
    localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
}

function clearCurrentUser() {
    localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
}

function showMessage(target, message, type) {
    if (!target) return;
    target.textContent = message;
    target.className = `auth-message ${type}`;
}

function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setupSignupForm() {
    const form = document.getElementById("signupForm");
    if (!form) return;

    const messageBox = document.getElementById("authMessage");

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const formData = new FormData(form);
        const name = String(formData.get("name") || "").trim();
        const email = String(formData.get("email") || "").trim().toLowerCase();
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

        if (password.length < 6) {
            showMessage(messageBox, "Password should be at least 6 characters.", "error");
            return;
        }

        if (password !== confirmPassword) {
            showMessage(messageBox, "Passwords do not match.", "error");
            return;
        }

        const users = getUsers();
        if (users.some((user) => user.email === email)) {
            showMessage(messageBox, "An account with this email already exists.", "error");
            return;
        }

        const user = {
            id: Date.now(),
            name,
            email,
            password
        };

        users.push(user);
        saveUsers(users);
        setCurrentUser({ id: user.id, name: user.name, email: user.email });
        showMessage(messageBox, "Account created successfully. Redirecting to home page...", "success");
        window.setTimeout(() => {
            window.location.href = "home.html";
        }, 900);
    });
}

function setupLoginForm() {
    const form = document.getElementById("loginForm");
    if (!form) return;

    const messageBox = document.getElementById("authMessage");
    const signedInState = document.getElementById("signedInState");
    const currentUser = JSON.parse(localStorage.getItem(CURRENT_USER_STORAGE_KEY) || "null");

    if (currentUser && signedInState) {
        signedInState.innerHTML = `
            <p>You are currently signed in as <strong>${currentUser.name}</strong>.</p>
            <button type="button" class="btn secondary-btn" id="signOutBtn">Sign Out</button>
        `;

        const signOutBtn = document.getElementById("signOutBtn");
        signOutBtn?.addEventListener("click", () => {
            clearCurrentUser();
            window.location.reload();
        });
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const formData = new FormData(form);
        const email = String(formData.get("email") || "").trim().toLowerCase();
        const password = String(formData.get("password") || "");

        if (!validateEmail(email)) {
            showMessage(messageBox, "Please enter a valid email address.", "error");
            return;
        }

        const user = getUsers().find((entry) => entry.email === email && entry.password === password);
        if (!user) {
            showMessage(messageBox, "Incorrect email or password.", "error");
            return;
        }

        setCurrentUser({ id: user.id, name: user.name, email: user.email });
        showMessage(messageBox, "Signed in successfully. Redirecting...", "success");
        window.setTimeout(() => {
            window.location.href = "home.html";
        }, 800);
    });
}

document.addEventListener("DOMContentLoaded", () => {
    setupSignupForm();
    setupLoginForm();
});
