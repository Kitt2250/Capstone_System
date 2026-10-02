import { archiveUser, createUser, updateUser, updateUserProfile, getUserData, changeUserPassword } from "../services/userServices";
import { activateClientAccount } from "../services/clientServices";
import { logAuditEvent } from "../utils/auditLogger";

export const createUserController = async (userData) => {

    // Basic validation
    if (!userData.name?.trim()) {
        throw new Error("Name is required.");
    }

    if (!userData.email?.trim()) {
        throw new Error("Email is required.");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email.trim())) {
        throw new Error("Please enter a valid email address.");
    }

    if (!userData.password) {
        throw new Error("Password is required.");
    }

    if (!userData.role) {
        throw new Error("Role is required.");
    }

    // Password validation
    if (userData.password.length < 8) {
        throw new Error("Password must be at least 8 characters.");
    }

    // Call the service
    const created = await createUser(userData);

    // Audit Log
    try {
        await logAuditEvent({
            module: "User Management",
            actionType: "CREATE_USER",
            description: `Created user account for ${userData.name} (${userData.role})`,
            targetItem: userData.email,
            details: { name: userData.name, email: userData.email, role: userData.role }
        });
    } catch (auditErr) {
        console.warn("Could not log audit event for user creation:", auditErr);
    }

    return created;
};


export const updateUserController = async (userId, formData) => {
    if (!userId) {
        throw new Error("User ID is required.");
    }

    if (!formData.name?.trim()) {
        throw new Error("Name is required.");
    }

    if (!formData.email?.trim()) {
        throw new Error("Email is required.");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email.trim())) {
        throw new Error("Please enter a valid email address.");
    }

    if (!formData.contactNo?.trim()) {
        throw new Error("Contact number is required.");
    }

    if (!formData.role) {
        throw new Error("Role is required.");
    }

    if (!formData.status) {
        throw new Error("Status is required.");
    }

    await updateUser(userId, {
        name: formData.name.trim(),
        email: formData.email.trim(),
        contactNo: formData.contactNo.trim(),
        role: formData.role,
        status: formData.status,
    });

    // Audit Log
    try {
        await logAuditEvent({
            module: "User Management",
            actionType: "UPDATE_USER",
            description: `Updated user details for ${formData.name}`,
            targetItem: formData.email || userId,
            details: { userId, ...formData }
        });
    } catch (auditErr) {
        console.warn("Could not log audit event for user update:", auditErr);
    }

    return {
        success: true,
        message: "User updated successfully.",
    };
};

export const archiveUserController = async (userId) => {
    try {
        if (!userId) {
            throw new Error("User ID is required.");
        }

        await archiveUser(userId);

        // Audit Log
        try {
            await logAuditEvent({
                module: "User Management",
                actionType: "ARCHIVE_USER",
                description: `Archived user account (ID: ${userId})`,
                targetItem: userId,
                details: { userId }
            });
        } catch (auditErr) {
            console.warn("Could not log audit event for user archive:", auditErr);
        }

        return {
            success: true,
            message: "User archived successfully.",
        };
    } catch (error) {
        console.error("Archive user controller error:", error);
        throw error;
    }
};

export const getUserProfileController = async (userId) => {
    if (!userId) {
        throw new Error("User ID is required.");
    }
    return await getUserData(userId);
};

export const updateUserProfileController = async (userId, profileData) => {
    if (!userId) {
        throw new Error("User ID is required.");
    }

    const name = (profileData.fullName || profileData.name || "").trim();
    if (!name) {
        throw new Error("Full name is required.");
    }

    const email = (profileData.email || "").trim();
    if (!email) {
        throw new Error("Email address is required.");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new Error("Please enter a valid email address.");
    }

    const phone = (profileData.phone || profileData.contactNo || "").trim();
    if (!phone) {
        throw new Error("Phone number is required.");
    }

    await updateUserProfile(userId, {
        name,
        email,
        contactNo: phone,
        address: (profileData.address || "").trim(),
    });

    // Audit Log
    try {
        await logAuditEvent({
            module: "User Management",
            actionType: "UPDATE_PROFILE",
            description: `Updated profile details for ${name}`,
            targetItem: email || userId,
            details: { userId, name, email, phone }
        });
    } catch (auditErr) {
        console.warn("Could not log audit event for profile update:", auditErr);
    }

    return {
        success: true,
        message: "Profile updated successfully.",
    };
};

export const changePasswordController = async ({ currentPassword, newPassword, confirmPassword }) => {
    if (!currentPassword) {
        throw new Error("Please enter your current password.");
    }

    if (!newPassword) {
        throw new Error("Please enter a new password.");
    }

    if (newPassword.length < 8) {
        throw new Error("New password must be at least 8 characters long.");
    }

    const specialCharRegex = /[!@#$%^&*(),.?":{}|<>_\-+~=[\]\\/`]/;
    if (!specialCharRegex.test(newPassword)) {
        throw new Error("New password must contain at least one special character.");
    }

    if (!confirmPassword) {
        throw new Error("Please confirm your new password.");
    }

    if (newPassword !== confirmPassword) {
        throw new Error("New password and confirm password do not match.");
    }

    if (currentPassword === newPassword) {
        throw new Error("New password cannot be the same as your current password.");
    }

    await changeUserPassword(currentPassword, newPassword);

    // Audit Log
    try {
        await logAuditEvent({
            module: "User Management",
            actionType: "CHANGE_PASSWORD",
            description: `User successfully changed account password`,
            targetItem: "Account Password",
            details: {}
        });
    } catch (auditErr) {
        console.warn("Could not log audit event for password change:", auditErr);
    }

    return {
        success: true,
        message: "Password updated successfully.",
    };
};

export const activateFamilyAccountController = async ({
    currentPassword,
    newPassword,
    confirmPassword,
    targetClientId = null,
}) => {
    if (!currentPassword) {
        throw new Error("Please enter your current password.");
    }

    if (!newPassword) {
        throw new Error("Please enter a new password.");
    }

    if (newPassword.length < 8) {
        throw new Error("New password must be at least 8 characters long.");
    }

    const specialCharRegex = /[!@#$%^&*(),.?":{}|<>_\-+~=[\]\\/`]/;
    if (!specialCharRegex.test(newPassword)) {
        throw new Error("New password must contain at least one special character / symbol (e.g. !@#$%^&*).");
    }

    if (!confirmPassword) {
        throw new Error("Please confirm your new password.");
    }

    if (newPassword !== confirmPassword) {
        throw new Error("New password and confirm password do not match.");
    }

    if (currentPassword === newPassword) {
        throw new Error("New password cannot be the same as your current password.");
    }

    return await activateClientAccount({
        currentPassword,
        newPassword,
        confirmPassword,
        targetClientId,
    });
};