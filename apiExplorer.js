/**
 * API EXPLORER - Find what payment endpoints exist and how they work
 */

require('dotenv').config();

const BASE_URL = "https://hackathon-backend-326152168.us-east4.run.app";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================================================
// BRUTE FORCE CAPTCHA
// ============================================================================

async function bruteForceCaptcha(purpose) {
    const challengeRes = await fetch(`${BASE_URL}/captcha/challenge?challenge_type=logos`);
    const challengeData = await challengeRes.json();
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
            const p = fetch(`${BASE_URL}/captcha/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ selected_urls: selectedUrls, encrypted_answer: encryptedAnswer, purpose })
            }).then(async res => res.ok ? (await res.json()).captcha_solved_token : false).catch(() => false);
            batchPromises.push(p);
        }
        const results = await Promise.all(batchPromises);
        const token = results.find(r => r && r !== false);
        if (token) return token;
    }
    return null;
}

// ============================================================================
// QUICK LOGIN
// ============================================================================

async function quickLogin(username, password) {
    // Prep token
    const prepRes = await fetch(`${BASE_URL}/form/prepare/public/login`);
    const prepData = await prepRes.json();
    await sleep(3000);

    // Captcha
    const captchaToken = await bruteForceCaptcha("auth");

    // Login
    const loginRes = await fetch(`${BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username, password,
            captcha_solved_token: captchaToken,
            form_prep_token: prepData.form_prep_token,
            mouse_movement_count: 200,
            mouse_total_distance: 4000
        })
    });
    const loginData = await loginRes.json();

    // MFA
    const mfaInitRes = await fetch(`${BASE_URL}/mfa/initiate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${loginData.mfa_required_auth_token}` }
    });
    const mfaData = await mfaInitRes.json();

    const mfaSubmitRes = await fetch(`${BASE_URL}/mfa/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${loginData.mfa_required_auth_token}` },
        body: JSON.stringify({
            encrypted_mfa_code_token: mfaData.encrypted_mfa_code_token,
            code: mfaData.otp_code
        })
    });
    const auth = await mfaSubmitRes.json();
    return auth.auth_token;
}

// ============================================================================
// EXPLORE PAYMENT ENDPOINTS
// ============================================================================

async function explorePayment(authToken, balance) {
    console.log("\n=== EXPLORING PAYMENT OPTIONS ===\n");

    // Test 1: Try /payment without form_prep_token
    console.log("1. /payment without prep token:");
    let res = await fetch(`${BASE_URL}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ payment_method_last_4: "4242", amount: balance })
    });
    console.log(`   ${res.status}:`, await res.text());

    // Test 2: Try /payment/checkout-session
    console.log("\n2. /payment/checkout-session:");
    res = await fetch(`${BASE_URL}/payment/checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ amount: balance, currency: "CAD" })
    });
    const checkoutData = await res.json();
    console.log(`   ${res.status}:`, JSON.stringify(checkoutData).substring(0, 200));

    // Test 3: If checkout worked, try to use the token
    if (checkoutData.checkout_session_token) {
        console.log("\n3. /payment with checkout_session_token:");
        res = await fetch(`${BASE_URL}/payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ checkout_session_token: checkoutData.checkout_session_token })
        });
        console.log(`   ${res.status}:`, await res.text());

        console.log("\n4. /payment/process:");
        res = await fetch(`${BASE_URL}/payment/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ checkout_session_token: checkoutData.checkout_session_token })
        });
        console.log(`   ${res.status}:`, await res.text());

        console.log("\n5. /payment/confirm:");
        res = await fetch(`${BASE_URL}/payment/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({
                checkout_session_token: checkoutData.checkout_session_token,
                card_number: "4242424242424242",
                cvv: "424",
                expiry: "12/26"
            })
        });
        console.log(`   ${res.status}:`, await res.text());
    }

    // Test 4: Try different prep token endpoints
    console.log("\n6. Available form/prepare endpoints:");
    for (const ep of ['payment', 'add-card', 'payment-method', 'checkout']) {
        res = await fetch(`${BASE_URL}/form/prepare/public/${ep}`);
        console.log(`   /form/prepare/public/${ep}: ${res.status}`);
    }

    // Test 5: Try authenticated prep
    console.log("\n7. Authenticated form/prepare:");
    for (const ep of ['payment', 'add-card', 'payment-method']) {
        res = await fetch(`${BASE_URL}/form/prepare/${ep}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        console.log(`   /form/prepare/${ep}: ${res.status}`);
        if (res.ok) console.log(`      `, await res.json());
    }

    // Test 6: List all available endpoints (if there's a docs endpoint)
    console.log("\n8. OpenAPI/Docs:");
    res = await fetch(`${BASE_URL}/openapi.json`);
    if (res.ok) {
        const api = await res.json();
        console.log("   Endpoints found:", Object.keys(api.paths || {}).join(', '));
    } else {
        console.log(`   ${res.status}`);
    }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
    // Use an existing account or register new
    console.log("=== API EXPLORER ===\n");

    // Register
    console.log("Registering...");
    const username = 'test' + Math.random().toString(36).substring(7);
    const password = "Aa1!Test1234";

    const prepRes = await fetch(`${BASE_URL}/form/prepare/public/register`);
    const prepData = await prepRes.json();
    await sleep(10000);

    await fetch(`${BASE_URL}/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username, email: username + "@test.com", password, full_name: "Test",
            form_prep_token: prepData.form_prep_token,
            mouse_movement_count: 200, mouse_total_distance: 4000, recaptcha_token: ''
        })
    });
    console.log(`Registered: ${username} / ${password}`);

    // Login
    console.log("\nLogging in...");
    const authToken = await quickLogin(username, password);
    console.log("Got auth token!");

    // Get balance
    const userRes = await fetch(`${BASE_URL}/user-info`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const userData = await userRes.json();
    console.log("Balance:", userData.finance?.balance);

    // Explore payment
    await explorePayment(authToken, userData.finance?.balance || 100);
}

main().catch(console.error);
