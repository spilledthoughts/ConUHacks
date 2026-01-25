/**
 * PURE API DROPOUT - Parallel Optimized
 */

require('dotenv').config();
const readline = require('readline');
const { connect } = require('puppeteer-real-browser');

const BASE_URL = "https://hackathon-backend-326152168.us-east4.run.app";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function prompt(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

async function bruteForceCaptcha(challengeType, purpose, authToken = null) {
    if (authToken) console.log(`   Solving ${challengeType} captcha...`);

    const headers = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = "Bearer " + authToken;

    const challengeRes = await fetch(`${BASE_URL}/captcha/challenge?challenge_type=${challengeType}`, { headers });
    const challengeData = await challengeRes.json();
    if (!challengeRes.ok) return null;

    const encryptedAnswer = challengeData.encrypted_answer;
    const allUrls = challengeData.images.map(img => img.url);

    for (let i = 0; i < 512; i += 50) {
        const batchPromises = [];
        for (let j = 0; j < 50 && (i + j) < 512; j++) {
            const val = i + j;
            const selectedUrls = [];
            for (let bit = 0; bit < 9; bit++) {
                if ((val >> bit) & 1) selectedUrls.push(allUrls[bit]);
            }

            batchPromises.push(
                fetch(`${BASE_URL}/captcha/submit`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ selected_urls: selectedUrls, encrypted_answer: encryptedAnswer, purpose })
                }).then(res => res.ok ? res.json().then(d => d.captcha_solved_token) : false).catch(() => false)
            );
        }

        const results = await Promise.all(batchPromises);
        const token = results.find(r => r);
        if (token) return token;
    }
    return null;
}

async function main() {
    console.log("=".repeat(60));
    console.log("PURE API DROPOUT");
    console.log("=".repeat(60));

    try {
        let account = {};

        const mode = await prompt("\n[R]egister new account or [L]ogin existing? ");
        
        if (mode.toLowerCase() === 'l') {
            const creds = await prompt("Enter credentials (username:password): ");
            const [username, password] = creds.split(':');
            if (!username || !password) throw new Error("Invalid format. Use username:password");
            account = { username, password };
            console.log(`\nUsing: ${account.username}`);
        }

        // Start timer AFTER user input
        const startTime = Date.now();
        
        console.log("\nPrefetching login token...");
        const loginTokenPromise = fetch(`${BASE_URL}/form/prepare/public/login`).then(async r => {
            const data = await r.json();
            console.log("   Login token ready");
            return data.form_prep_token;
        });

        if (mode.toLowerCase() !== 'l') {
            // Register mode
            console.log("\nRegistering...");
            account.username = Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('') + Math.floor(Math.random() * 999);
            account.email = account.username + "@outlook.com";
            account.password = "Aa1!" + Array.from({ length: 8 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('');
            console.log(`   ${account.username} / ${account.password}`);

            const regPrepRes = await fetch(`${BASE_URL}/form/prepare/public/register`);
            const regPrepData = await regPrepRes.json();

            console.log("   Waiting 10s (anti-bot)...");
            await sleep(10000);

            const regRes = await fetch(`${BASE_URL}/user`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: account.username, email: account.email, password: account.password,
                    full_name: "Test User", form_prep_token: regPrepData.form_prep_token || '',
                    mouse_movement_count: 200, mouse_total_distance: 4000, recaptcha_token: ''
                })
            });
            if (!regRes.ok) throw new Error("Registration failed: " + JSON.stringify(await regRes.json()));
            console.log("   Registered");
        }

        // Login
        console.log("\nLogging in...");
        const loginFormToken = await loginTokenPromise;

        // Need to wait if we didn't register (registration wait covers this otherwise)
        if (mode.toLowerCase() === 'l') {
            console.log("   Waiting 2s (anti-bot)...");
            await sleep(2000);
        }

        const loginCaptcha = await bruteForceCaptcha("logos", "auth");
        if (!loginCaptcha) throw new Error("Login captcha failed");

        const loginRes = await fetch(`${BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: account.username, password: account.password,
                captcha_solved_token: loginCaptcha, form_prep_token: loginFormToken,
                mouse_movement_count: 200, mouse_total_distance: 4000
            })
        });

        const loginData = await loginRes.json();
        const mfaToken = loginData.mfa_required_auth_token;
        if (!mfaToken) throw new Error("No MFA token: " + JSON.stringify(loginData));

        const mfaInit = await fetch(`${BASE_URL}/mfa/initiate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mfaToken}` }
        }).then(r => r.json());

        console.log(`   OTP: ${mfaInit.otp_code}`);

        const mfaSubmit = await fetch(`${BASE_URL}/mfa/submit`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mfaToken}` },
            body: JSON.stringify({ encrypted_mfa_code_token: mfaInit.encrypted_mfa_code_token, code: mfaInit.otp_code })
        }).then(r => r.json());

        const authToken = mfaSubmit.auth_token;
        if (!authToken) throw new Error("Login failed");
        console.log("   Logged in");

        // Parallel: Drop Classes + Payment Prep
        console.log("\nDropping classes + prepping payment (parallel)...");
        const authHeader = { 'Authorization': `Bearer ${authToken}` };

        const paymentPrepPromise = (async () => {
            const [payPrep, cardPrep] = await Promise.all([
                fetch(`${BASE_URL}/form/prepare/payment`, { headers: authHeader }).then(r => r.json()),
                fetch(`${BASE_URL}/form/prepare/payment_method`, { headers: authHeader }).then(r => r.json())
            ]);
            console.log("   [Pay] Tokens acquired, waiting 10s...");
            await sleep(10000);
            return { payToken: payPrep.form_prep_token, cardToken: cardPrep.form_prep_token };
        })();

        const dropClassesPromise = (async () => {
            const userRes = await fetch(`${BASE_URL}/user-info`, { headers: authHeader });
            const userData = await userRes.json();
            const classes = userData.classes || [];

            if (classes.length > 0) {
                await Promise.all(classes.map(c =>
                    fetch(`${BASE_URL}/class`, {
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

        const [tokens] = await Promise.all([paymentPrepPromise, dropClassesPromise]);

        // Payment
        console.log("\nPayment...");
        const userRes = await fetch(`${BASE_URL}/user-info`, { headers: authHeader });
        const userData = await userRes.json();
        const balance = userData.finance?.balance || 0;
        console.log(`   Balance: $${balance}`);

        if (balance > 0) {
            const checkoutRes = await fetch(`${BASE_URL}/payment/checkout-session`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader },
                body: JSON.stringify({ amount: balance, currency: "CAD" })
            });
            const session = await checkoutRes.json();

            const addCardRes = await fetch(`${BASE_URL}/payment-method`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader },
                body: JSON.stringify({
                    credit_card_number: "4242424242424242", cvv: "424", expiry: "12/26",
                    form_prep_token: tokens.cardToken,
                    mouse_movement_count: 200, mouse_total_distance: 4000
                })
            });
            if (!addCardRes.ok) console.log("   Add card failed:", await addCardRes.json());
            else console.log("   Card added");

            const payCaptcha = await bruteForceCaptcha("sun", "payment", authToken);

            const payRes = await fetch(`${BASE_URL}/payment`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader },
                body: JSON.stringify({
                    checkout_session_token: session.checkout_session_token,
                    captcha_solved_token: payCaptcha,
                    payment_method_last_4: "4242", amount: balance, form_prep_token: tokens.payToken,
                    mouse_movement_count: 200, mouse_total_distance: 4000
                })
            });
            console.log(`   Payment: ${payRes.status}`);
        } else {
            console.log("   No payment needed");
        }

        // Dropout
        console.log("\nDropout...");
        const dropoutCaptcha = await bruteForceCaptcha("pretty_faces", "dropout", authToken);

        const dropoutRes = await fetch(`${BASE_URL}/dropout`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({
                captcha_solved_token: dropoutCaptcha,
                keystroke_count: 310, unique_chars_count: 45,
                checkbox_entropy: 150.5, confirm_button_entropy: 150.0,
                captcha_entropy: 750.0, time_on_page: 2500.0
            })
        });

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
    const CONFIG = {
        LOGIN_URL: 'https://deckathon-concordia.com/login',
        BACKEND_URL: BASE_URL,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY
    };

    try {
        await performLogin(page, username, password, CONFIG);
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

main().catch(console.error);
