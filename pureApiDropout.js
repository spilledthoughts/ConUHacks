/**
 * PURE API DROPOUT - Parallel Optimized
 * 
 * A high-speed dropout automation that bypasses browser-based anti-bot detection
 * by making direct API calls. Uses parallel operations and captcha brute-forcing
 * to minimize total execution time.
 * 
 * Flow: Register/Login → MFA → Drop Classes (parallel) → Payment → Dropout → Verify
 */

require('dotenv').config();
const readline = require('readline');
const { connect } = require('puppeteer-real-browser');

// =============================================================================
// CONFIGURATION
// =============================================================================
const CONFIG = {
    // API Settings
    BASE_URL: "https://hackathon-backend-326152168.us-east4.run.app",
    FRONTEND_URL: "https://deckathon-concordia.com",
    
    // Anti-bot delays (minimum required by server)
    DELAYS: {
        REGISTRATION: 10000,    // 10s - required after form/prepare for registration
        LOGIN: 2000,           // 2s - required after form/prepare for login
        PAYMENT: 10000,        // 10s - rate limit before payment submission
    },
    
    // Captcha brute-force settings
    CAPTCHA: {
        TOTAL_COMBINATIONS: 512,  // 2^9 = 512 possible combinations
        BATCH_SIZE: 50,           // Concurrent requests per batch
    },
    
    // Mouse/keyboard simulation values (spoofed for anti-bot)
    SPOOF: {
        MOUSE_MOVEMENT_COUNT: 200,
        MOUSE_TOTAL_DISTANCE: 4000,
        KEYSTROKE_COUNT: 310,
        UNIQUE_CHARS_COUNT: 45,
        CHECKBOX_ENTROPY: 150.5,
        CONFIRM_BUTTON_ENTROPY: 150.0,
        CAPTCHA_ENTROPY: 750.0,
        TIME_ON_PAGE: 2500.0,
    },
    
    // Retry settings
    RETRY: {
        MAX_ATTEMPTS: 3,
        BASE_DELAY: 1000,       // 1s base delay
        MAX_DELAY: 10000,       // 10s max delay
    },
    
    // Test payment card
    CARD: {
        NUMBER: "4242424242424242",
        CVV: "424",
        EXPIRY: "12/26",
        LAST_4: "4242",
    },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Prompt user for input via readline
 */
function prompt(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

/**
 * Retry wrapper with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {string} name - Name for logging
 * @param {number} maxAttempts - Max retry attempts
 * @returns {Promise<any>} - Result of fn
 */
async function withRetry(fn, name, maxAttempts = CONFIG.RETRY.MAX_ATTEMPTS) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            
            if (attempt === maxAttempts) {
                console.log(`   [${name}] Failed after ${maxAttempts} attempts: ${err.message}`);
                throw err;
            }
            
            // Exponential backoff: 1s, 2s, 4s... capped at MAX_DELAY
            const delay = Math.min(
                CONFIG.RETRY.BASE_DELAY * Math.pow(2, attempt - 1),
                CONFIG.RETRY.MAX_DELAY
            );
            console.log(`   [${name}] Attempt ${attempt} failed, retrying in ${delay/1000}s...`);
            await sleep(delay);
        }
    }
    
    throw lastError;
}

/**
 * Make an API request with automatic retry
 */
async function apiRequest(endpoint, options = {}, name = "API") {
    return withRetry(async () => {
        const url = endpoint.startsWith('http') ? endpoint : `${CONFIG.BASE_URL}${endpoint}`;
        const res = await fetch(url, options);
        
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`HTTP ${res.status}: ${body}`);
        }
        
        return res.json();
    }, name);
}

// =============================================================================
// CAPTCHA BRUTE-FORCE
// =============================================================================

/**
 * Brute-force solve a captcha by trying all 512 possible image combinations
 * Uses parallel batches for speed optimization
 * 
 * @param {string} challengeType - Type of captcha (logos, sun, pretty_faces)
 * @param {string} purpose - Purpose token (auth, payment, dropout)
 * @param {string|null} authToken - Bearer token for authenticated requests
 * @returns {Promise<string|null>} - Solved captcha token or null
 */
async function bruteForceCaptcha(challengeType, purpose, authToken = null) {
    if (authToken) console.log(`   Solving ${challengeType} captcha...`);

    const headers = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = "Bearer " + authToken;

    // Get captcha challenge
    const challengeRes = await fetch(`${CONFIG.BASE_URL}/captcha/challenge?challenge_type=${challengeType}`, { headers });
    const challengeData = await challengeRes.json();
    if (!challengeRes.ok) return null;

    const encryptedAnswer = challengeData.encrypted_answer;
    const allUrls = challengeData.images.map(img => img.url);

    // Try all 512 combinations in parallel batches
    const { TOTAL_COMBINATIONS, BATCH_SIZE } = CONFIG.CAPTCHA;
    
    for (let i = 0; i < TOTAL_COMBINATIONS; i += BATCH_SIZE) {
        const batchPromises = [];
        
        for (let j = 0; j < BATCH_SIZE && (i + j) < TOTAL_COMBINATIONS; j++) {
            const val = i + j;
            const selectedUrls = [];
            
            // Convert number to binary selection of 9 images
            for (let bit = 0; bit < 9; bit++) {
                if ((val >> bit) & 1) selectedUrls.push(allUrls[bit]);
            }

            batchPromises.push(
                fetch(`${CONFIG.BASE_URL}/captcha/submit`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        selected_urls: selectedUrls, 
                        encrypted_answer: encryptedAnswer, 
                        purpose 
                    })
                })
                .then(res => res.ok ? res.json().then(d => d.captcha_solved_token) : false)
                .catch(() => false)
            );
        }

        const results = await Promise.all(batchPromises);
        const token = results.find(r => r);
        if (token) return token;
    }
    
    return null;
}

// =============================================================================
// MAIN DROPOUT FLOW
// =============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("PURE API DROPOUT");
    console.log("=".repeat(60));

    try {
        let account = {};

        // Prompt for mode: Register new account or Login with existing
        const mode = await prompt("\n[R]egister new account or [L]ogin existing? ");
        
        if (mode.toLowerCase() === 'l') {
            const creds = await prompt("Enter credentials (username:password): ");
            const [username, password] = creds.split(':');
            if (!username || !password) throw new Error("Invalid format. Use username:password");
            account = { username, password };
            console.log(`\nUsing: ${account.username}`);
        }

        // Start timer AFTER user input (don't count typing time)
        const startTime = Date.now();
        
        // ---------------------------------------------------------------------
        // PHASE 1: Prefetch login token (runs in background during registration)
        // ---------------------------------------------------------------------
        console.log("\nPrefetching login token...");
        const loginTokenPromise = fetch(`${CONFIG.BASE_URL}/form/prepare/public/login`).then(async r => {
            const data = await r.json();
            console.log("   Login token ready");
            return data.form_prep_token;
        });

        // ---------------------------------------------------------------------
        // PHASE 2: Registration (if not using existing account)
        // ---------------------------------------------------------------------
        if (mode.toLowerCase() !== 'l') {
            console.log("\nRegistering...");
            
            // Generate random credentials
            account.username = Array.from({ length: 8 }, () => 
                'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]
            ).join('') + Math.floor(Math.random() * 999);
            account.email = account.username + "@outlook.com";
            account.password = "Aa1!" + Array.from({ length: 8 }, () => 
                'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]
            ).join('');
            console.log(`   ${account.username} / ${account.password}`);

            // Get registration form token
            const regPrepData = await apiRequest("/form/prepare/public/register", {}, "RegPrep");

            // Required anti-bot delay
            console.log(`   Waiting ${CONFIG.DELAYS.REGISTRATION/1000}s (anti-bot)...`);
            await sleep(CONFIG.DELAYS.REGISTRATION);

            // Submit registration
            await withRetry(async () => {
                const res = await fetch(`${CONFIG.BASE_URL}/user`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: account.username,
                        email: account.email,
                        password: account.password,
                        full_name: "Test User",
                        form_prep_token: regPrepData.form_prep_token || '',
                        mouse_movement_count: CONFIG.SPOOF.MOUSE_MOVEMENT_COUNT,
                        mouse_total_distance: CONFIG.SPOOF.MOUSE_TOTAL_DISTANCE,
                        recaptcha_token: ''
                    })
                });
                if (!res.ok) throw new Error("Registration failed: " + JSON.stringify(await res.json()));
                return res.json();
            }, "Register");
            
            console.log("   Registered");
        }

        // ---------------------------------------------------------------------
        // PHASE 3: Login + MFA
        // ---------------------------------------------------------------------
        console.log("\nLogging in...");
        const loginFormToken = await loginTokenPromise;

        // Wait for anti-bot if we skipped registration (registration wait covers this otherwise)
        if (mode.toLowerCase() === 'l') {
            console.log(`   Waiting ${CONFIG.DELAYS.LOGIN/1000}s (anti-bot)...`);
            await sleep(CONFIG.DELAYS.LOGIN);
        }

        // Solve login captcha
        const loginCaptcha = await bruteForceCaptcha("logos", "auth");
        if (!loginCaptcha) throw new Error("Login captcha failed");

        // Submit login
        const loginData = await withRetry(async () => {
            const res = await fetch(`${CONFIG.BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: account.username,
                    password: account.password,
                    captcha_solved_token: loginCaptcha,
                    form_prep_token: loginFormToken,
                    mouse_movement_count: CONFIG.SPOOF.MOUSE_MOVEMENT_COUNT,
                    mouse_total_distance: CONFIG.SPOOF.MOUSE_TOTAL_DISTANCE
                })
            });
            if (!res.ok) throw new Error("Login request failed");
            return res.json();
        }, "Login");

        const mfaToken = loginData.mfa_required_auth_token;
        if (!mfaToken) throw new Error("No MFA token: " + JSON.stringify(loginData));

        // Handle MFA (initiate + submit)
        const mfaInit = await apiRequest("/mfa/initiate", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mfaToken}` }
        }, "MFA-Init");

        console.log(`   OTP: ${mfaInit.otp_code}`);

        const mfaSubmit = await apiRequest("/mfa/submit", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mfaToken}` },
            body: JSON.stringify({ 
                encrypted_mfa_code_token: mfaInit.encrypted_mfa_code_token, 
                code: mfaInit.otp_code 
            })
        }, "MFA-Submit");

        const authToken = mfaSubmit.auth_token;
        if (!authToken) throw new Error("Login failed");
        console.log("   Logged in");

        // ---------------------------------------------------------------------
        // PHASE 4: Drop Classes + Payment Prep (PARALLEL)
        // ---------------------------------------------------------------------
        console.log("\nDropping classes + prepping payment (parallel)...");
        const authHeader = { 'Authorization': `Bearer ${authToken}` };

        // Start payment prep (has 10s wait, so start early)
        const paymentPrepPromise = (async () => {
            const [payPrep, cardPrep] = await Promise.all([
                apiRequest("/form/prepare/payment", { headers: authHeader }, "PayPrep"),
                apiRequest("/form/prepare/payment_method", { headers: authHeader }, "CardPrep")
            ]);
            console.log(`   [Pay] Tokens acquired, waiting ${CONFIG.DELAYS.PAYMENT/1000}s...`);
            await sleep(CONFIG.DELAYS.PAYMENT);
            return { payToken: payPrep.form_prep_token, cardToken: cardPrep.form_prep_token };
        })();

        // Drop all enrolled classes in parallel
        const dropClassesPromise = (async () => {
            const userData = await apiRequest("/user-info", { headers: authHeader }, "UserInfo");
            const classes = userData.classes || [];

            if (classes.length > 0) {
                await Promise.all(classes.map(c =>
                    fetch(`${CONFIG.BASE_URL}/class`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', ...authHeader },
                        body: JSON.stringify({ class_id: c.class_id })
                    })
                ));
                console.log(`   [Drop] ${classes.length} classes dropped`);
            } else {
                console.log("   [Drop] No classes to drop");
            }
        })();

        // Wait for both to complete
        const [tokens] = await Promise.all([paymentPrepPromise, dropClassesPromise]);

        // ---------------------------------------------------------------------
        // PHASE 5: Payment (if balance > 0)
        // ---------------------------------------------------------------------
        console.log("\nPayment...");
        const userData = await apiRequest("/user-info", { headers: authHeader }, "UserInfo");
        const balance = userData.finance?.balance || 0;
        console.log(`   Balance: $${balance}`);

        if (balance > 0) {
            // Create checkout session
            const session = await apiRequest("/payment/checkout-session", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeader },
                body: JSON.stringify({ amount: balance, currency: "CAD" })
            }, "Checkout");

            // Add payment card
            await withRetry(async () => {
                const res = await fetch(`${CONFIG.BASE_URL}/payment-method`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeader },
                    body: JSON.stringify({
                        credit_card_number: CONFIG.CARD.NUMBER,
                        cvv: CONFIG.CARD.CVV,
                        expiry: CONFIG.CARD.EXPIRY,
                        form_prep_token: tokens.cardToken,
                        mouse_movement_count: CONFIG.SPOOF.MOUSE_MOVEMENT_COUNT,
                        mouse_total_distance: CONFIG.SPOOF.MOUSE_TOTAL_DISTANCE
                    })
                });
                if (!res.ok) throw new Error("Add card failed: " + await res.text());
                return res.json();
            }, "AddCard");
            console.log("   Card added");

            // Solve payment captcha
            const payCaptcha = await bruteForceCaptcha("sun", "payment", authToken);

            // Submit payment
            const payRes = await fetch(`${CONFIG.BASE_URL}/payment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeader },
                body: JSON.stringify({
                    checkout_session_token: session.checkout_session_token,
                    captcha_solved_token: payCaptcha,
                    payment_method_last_4: CONFIG.CARD.LAST_4,
                    amount: balance,
                    form_prep_token: tokens.payToken,
                    mouse_movement_count: CONFIG.SPOOF.MOUSE_MOVEMENT_COUNT,
                    mouse_total_distance: CONFIG.SPOOF.MOUSE_TOTAL_DISTANCE
                })
            });
            console.log(`   Payment: ${payRes.status}`);
        } else {
            console.log("   No payment needed");
        }

        // ---------------------------------------------------------------------
        // PHASE 6: Dropout
        // ---------------------------------------------------------------------
        console.log("\nDropout...");
        const dropoutCaptcha = await bruteForceCaptcha("pretty_faces", "dropout", authToken);

        const dropoutRes = await fetch(`${CONFIG.BASE_URL}/dropout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({
                captcha_solved_token: dropoutCaptcha,
                keystroke_count: CONFIG.SPOOF.KEYSTROKE_COUNT,
                unique_chars_count: CONFIG.SPOOF.UNIQUE_CHARS_COUNT,
                checkbox_entropy: CONFIG.SPOOF.CHECKBOX_ENTROPY,
                confirm_button_entropy: CONFIG.SPOOF.CONFIRM_BUTTON_ENTROPY,
                captcha_entropy: CONFIG.SPOOF.CAPTCHA_ENTROPY,
                time_on_page: CONFIG.SPOOF.TIME_ON_PAGE
            })
        });

        // ---------------------------------------------------------------------
        // RESULTS
        // ---------------------------------------------------------------------
        const success = dropoutRes.ok;
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        console.log("\n" + "=".repeat(60));
        console.log(success ? "SUCCESS" : "FAILED");
        console.log(`   Username: ${account.username}`);
        console.log(`   Password: ${account.password}`);
        console.log(`   Time: ${duration}s`);
        console.log("=".repeat(60));

        // Browser verification (not counted in time)
        await verifyWithBrowserLogin(account.username, account.password);

    } catch (err) {
        console.error("\nError:", err.message);
    }
}

// =============================================================================
// BROWSER VERIFICATION
// =============================================================================

/**
 * Verify dropout status by logging in via browser
 * This opens a real browser for manual verification that the account is withdrawn
 * (Not counted in timing - this is just for confirmation)
 */
async function verifyWithBrowserLogin(username, password) {
    console.log("\nVerifying with browser login...");
    console.log(`   Credentials: ${username} / ${password}`);

    const { performLogin, handleOTP, solveCaptcha } = require('./steps');

    const connection = await connect({
        headless: false,
        fingerprint: false,
        turnstile: true,
        args: ['--window-size=1920,1080'],
        customConfig: { chromePath: process.env.CHROME_PATH },
        connectOption: { defaultViewport: { width: 1920, height: 1080 } }
    });

    const page = connection.page;
    const browserConfig = {
        LOGIN_URL: `${CONFIG.FRONTEND_URL}/login`,
        BACKEND_URL: CONFIG.BASE_URL,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY
    };

    try {
        await performLogin(page, username, password, browserConfig);
        await solveCaptcha(page);
        await handleOTP(page);
        
        console.log("   Browser login successful - check browser to verify dropout status");
        console.log("   Browser will stay open for manual verification...");
        
        return { page, browser: connection.browser };
    } catch (err) {
        console.log("   Browser login failed:", err.message);
        console.log("   This likely means the account was successfully dropped out");
        return { page, browser: connection.browser };
    }
}

// =============================================================================
// ENTRY POINT
// =============================================================================

main().catch(console.error);
