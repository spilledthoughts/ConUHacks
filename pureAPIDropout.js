/**
 * PURE API DROPOUT SCRIPT - v9 (PARALLEL OPTIMIZED)
 * 
 * Key Optimizations:
 * 1. Prefetch Login Token during Registration Wait (Saves 2s)
 * 2. Parallel Class Dropping & Payment Token Fetching (Saves ~0.5s)
 * 3. Overlapped Payment Wait (Saves ~1s)
 */

require('dotenv').config();

const BASE_URL = "https://hackathon-backend-326152168.us-east4.run.app";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================================================
// BRUTE FORCE CAPTCHA
// ============================================================================

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

// ============================================================================
// MAIN FLOW
// ============================================================================

async function main() {
    const startTime = Date.now();
    console.log("=".repeat(60));
    console.log("🚀 PURE API DROPOUT v9 - PARALLEL OPTIMIZED");
    console.log("=".repeat(60));

    try {
        let account = {};

        // ---------------------------------------------------------
        // 1. REGISTER & PREFETCH LOGIN (Parallel)
        // ---------------------------------------------------------

        // Start fetching login token immediately!
        console.log("⚡️ Prefetching Login Token (Background)...");
        const loginTokenPromise = fetch(`${BASE_URL}/form/prepare/public/login`).then(async r => {
            const data = await r.json();
            console.log("   ✅ Login token ready (Waiting for registration...)");
            return data.form_prep_token;
        });

        // Register
        if (process.argv[2] && process.argv[3]) {
            console.log("ℹ️  Using provided credentials (Skipping Registration)");
            account = { username: process.argv[2], password: process.argv[3] };
        } else {
            console.log("\n📝 REGISTERING (API)...");
            account.username = Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('') + Math.floor(Math.random() * 999);
            account.email = account.username + "@outlook.com";
            account.password = "Aa1!" + Array.from({ length: 8 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 62)]).join('');
            console.log(`   ${account.username} / ${account.password}`);

            const regPrepRes = await fetch(`${BASE_URL}/form/prepare/public/register`);
            const regPrepData = await regPrepRes.json();

            console.log("   Got reg token, waiting 10s...");
            await sleep(10000); // Strict mandatory wait

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
            console.log("   ✅ Registered!");
        }

        // ---------------------------------------------------------
        // 2. LOGIN (Immediate - using prefetched token)
        // ---------------------------------------------------------
        console.log("\n🔑 LOGGING IN (API)...");

        // Wait for login token (should be ready already)
        const loginFormToken = await loginTokenPromise;

        // No wait needed here because >2s passed during usage/registration!

        const loginCaptcha = await bruteForceCaptcha("logos", "auth");
        if (!loginCaptcha) throw new Error("Login CAPTCHA failed");

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
        if (!mfaToken) throw new Error("No MFA token");

        // MFA
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
        console.log("   ✅ Logged in!");

        // ---------------------------------------------------------
        // 3. PARALLEL OPERATIONS (Drop Classes + Payment Prep)
        // ---------------------------------------------------------
        console.log("\n⚡️ PARALLEL: Dropping Classes + Prepping Payment...");

        const authHeader = { 'Authorization': `Bearer ${authToken}` };

        // A. Start Payment Prep Timer (Promise)
        const paymentPrepPromise = (async () => {
            console.log("   [Pay] Getting prep tokens...");
            const [payPrep, cardPrep] = await Promise.all([
                fetch(`${BASE_URL}/form/prepare/payment`, { headers: authHeader }).then(r => r.json()),
                fetch(`${BASE_URL}/form/prepare/payment_method`, { headers: authHeader }).then(r => r.json())
            ]);
            console.log("   [Pay] Tokens acquired. Waiting 10s...");
            await sleep(10000); // 10s mandatory wait
            return { payToken: payPrep.form_prep_token, cardToken: cardPrep.form_prep_token };
        })();

        // B. Drop Classes (Promise)
        const dropClassesPromise = (async () => {
            console.log("   [Drop] Fetching classes...");
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
                console.log(`   [Drop] ✅ ${classes.length} classes dropped`);
            } else {
                console.log("   [Drop] No classes to drop");
            }
        })();

        // Wait for BOTH to finish (Payment wait is longest)
        const [tokens] = await Promise.all([paymentPrepPromise, dropClassesPromise]);

        // ---------------------------------------------------------
        // 4. CHECKOUT & PAY
        // ---------------------------------------------------------
        console.log("\n💳 PAYING (API)...");

        // Check balance (it should be updated now)
        const userRes = await fetch(`${BASE_URL}/user-info`, { headers: authHeader });
        const userData = await userRes.json();
        const balance = userData.finance?.balance || 0;
        console.log(`   Balance: $${balance}`);

        if (balance > 0) {
            // Get checkout session
            const checkoutRes = await fetch(`${BASE_URL}/payment/checkout-session`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader },
                body: JSON.stringify({ amount: balance, currency: "CAD" })
            });
            const session = await checkoutRes.json();

            // Add Card
            const addCardRes = await fetch(`${BASE_URL}/payment-method`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader },
                body: JSON.stringify({
                    credit_card_number: "4242424242424242", cvv: "424", expiry: "12/26",
                    form_prep_token: tokens.cardToken,
                    mouse_movement_count: 200, mouse_total_distance: 4000
                })
            });
            if (!addCardRes.ok) console.log("   Add Card Issue:", await addCardRes.json());
            else console.log("   ✅ Card Added");

            // Solve Captcha
            const payCaptcha = await bruteForceCaptcha("sun", "payment", authToken);

            // Pay
            const payRes = await fetch(`${BASE_URL}/payment`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader },
                body: JSON.stringify({
                    checkout_session_token: session.checkout_session_token,
                    captcha_solved_token: payCaptcha,
                    payment_method_last_4: "4242", amount: balance, form_prep_token: tokens.payToken,
                    mouse_movement_count: 200, mouse_total_distance: 4000
                })
            });
            console.log(`   Payment Status: ${payRes.status}`);
        } else {
            console.log("   ✅ No payment needed");
        }

        // ---------------------------------------------------------
        // 5. DROPOUT
        // ---------------------------------------------------------
        console.log("\n🚪 DROPOUT (API)...");
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
        console.log(success ? "✅ SUCCESS!" : "❌ FAILED");
        console.log(`   Username: ${account.username}`);
        console.log(`   Password: ${account.password}`);
        console.log(`   ⏱️  Total time: ${duration}s`);
        console.log("=".repeat(60));

    } catch (err) {
        console.error("\n❌ Error:", err.message);
    }
}

main().catch(console.error);
