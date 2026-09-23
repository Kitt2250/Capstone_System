import { archiveUser, createUser, updateUser } from "../services/userServices";

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
    return await createUser(userData);
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

        return {
            success: true,
            message: "User archived successfully.",
        };
    } catch (error) {
        console.error("Archive user controller error:", error);
        throw error;
    }
};