import { loginUser } from "../services/authServices";
import { getAuthErrorMessage, validateLogin } from "../util/authError";

export async function handleLogin(email, password) {

    // 1. Validate input
    validateLogin(email, password);

    try {
        // 2. Call Firebase service
        const user = await loginUser(email, password);

        // 3. Return authenticated user
        return user;
        

    } catch (error) {
        // 4. Convert Firebase error
        throw new Error(getAuthErrorMessage(error.code));
    }
}