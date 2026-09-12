export  function validateLogin(email, password) {
    if (!email.trim()) {
        throw new Error("Email is required");
    }

    if (!password) {
        throw new Error("Password is required");
    }

    if (!email.includes("@")) {
        throw new Error("Invalid email format");
    }
}

export  function getAuthErrorMessage(code) {
    switch (code) {
        case "auth/invalid-credential":
            return "Invalid email or password.";

        case "auth/too-many-requests":
            return "Too many attempts. Please try again later.";

        case "auth/network-request-failed":
            return "Network error. Please check your connection.";

        default:
            return "Unable to log in. Please try again.";
    }
}