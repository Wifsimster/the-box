/**
 * Maps Better Auth error messages to i18n translation keys
 */

interface BetterAuthError {
    message?: string;
    code?: string;
    status?: number;
}

/**
 * Maps Better Auth error to a translation key
 * @param error - The error object from Better Auth
 * @returns Translation key string
 */
export function mapAuthErrorToTranslationKey(error: unknown): string {
    if (!error) {
        return 'auth.unknownError';
    }

    // Handle Better Auth error objects
    if (typeof error === 'object' && error !== null) {
        const authError = error as BetterAuthError;
        const message = authError.message?.toLowerCase() || '';
        const code = authError.code?.toLowerCase() || '';

        // Email already exists / User already exists
        if (
            message.includes('already exists') ||
            message.includes('already registered') ||
            code.includes('user_exists') ||
            code.includes('email_exists')
        ) {
            return 'auth.errors.userAlreadyExists';
        }

        // User not found
        if (
            message.includes('user not found') ||
            message.includes('no user found') ||
            code.includes('user_not_found')
        ) {
            return 'auth.errors.userNotFound';
        }

        // Invalid credentials / Wrong password
        if (
            message.includes('invalid credentials') ||
            message.includes('invalid password') ||
            message.includes('incorrect password') ||
            message.includes('wrong password') ||
            code.includes('invalid_credentials') ||
            code.includes('invalid_password')
        ) {
            return 'auth.errors.invalidPassword';
        }

        // Email not verified
        if (
            message.includes('email not verified') ||
            message.includes('verify your email') ||
            code.includes('email_not_verified')
        ) {
            return 'auth.errors.emailNotVerified';
        }

        // Weak password
        if (
            message.includes('password is too weak') ||
            message.includes('weak password') ||
            message.includes('password must be') ||
            code.includes('weak_password')
        ) {
            return 'auth.errors.weakPassword';
        }

        // Invalid email format
        if (
            message.includes('invalid email') ||
            message.includes('email is invalid') ||
            code.includes('invalid_email')
        ) {
            return 'auth.emailInvalid';
        }

        // Username issues
        if (
            message.includes('username') &&
            (message.includes('taken') || message.includes('exists'))
        ) {
            return 'auth.errors.usernameTaken';
        }

        // Rate limiting
        if (
            message.includes('too many') ||
            message.includes('rate limit') ||
            code.includes('rate_limit') ||
            authError.status === 429
        ) {
            return 'auth.errors.tooManyAttempts';
        }

        // Network errors
        if (
            message.includes('network') ||
            message.includes('fetch failed') ||
            code.includes('network_error')
        ) {
            return 'auth.errors.networkError';
        }

        // Server errors
        if (authError.status && authError.status >= 500) {
            return 'auth.errors.serverError';
        }
    }

    // Handle string errors
    if (typeof error === 'string') {
        const errorStr = error.toLowerCase();

        if (errorStr.includes('already exists')) {
            return 'auth.errors.userAlreadyExists';
        }
        if (errorStr.includes('not found')) {
            return 'auth.errors.userNotFound';
        }
        if (errorStr.includes('invalid credentials') || errorStr.includes('invalid password')) {
            return 'auth.errors.invalidPassword';
        }
        if (errorStr.includes('network')) {
            return 'auth.errors.networkError';
        }
    }

    // Default fallback
    return 'auth.errors.unknownError';
}

/**
 * Maps login-specific errors
 */
export function mapLoginError(error: unknown): string {
    const key = mapAuthErrorToTranslationKey(error);

    // If we got a generic unknown error, use login-specific fallback
    if (key === 'auth.errors.unknownError') {
        return 'auth.loginError';
    }

    return key;
}

/**
 * Maps registration-specific errors
 */
export function mapRegisterError(error: unknown): string {
    const key = mapAuthErrorToTranslationKey(error);

    // If we got a generic unknown error, use register-specific fallback
    if (key === 'auth.errors.unknownError') {
        return 'auth.registerError';
    }

    return key;
}

/**
 * Maps password reset-specific errors
 */
export function mapPasswordResetError(error: unknown): string {
    const key = mapAuthErrorToTranslationKey(error);

    // If we got a generic unknown error, use reset-specific fallback
    if (key === 'auth.errors.unknownError') {
        return 'auth.resetError';
    }

    return key;
}
