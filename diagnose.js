/**
 * DIAGNOSE PAYMENT-METHOD PREP TOKEN
 */

require('dotenv').config();
const BASE_URL = "https://hackathon-backend-326152168.us-east4.run.app";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function solveCaptcha(type, purpose) {
    const res = await fetch(`${BASE_URL}/captcha/challenge?challenge_type=${type}`);
    const data = await res.json();
    const urls = data.images.map(i => i.url);
    for (let i = 0; i < 512; i += 50) {
        const batch = [];
        for (let j = 0; j < 50 && (i + j) < 512; j++) {
            const val = i + j;
            const selected = [];
            for (let bit = 0; bit < 9; bit++) if ((val >> bit) & 1) selected.push(urls[bit]);
            batch.push(fetch(`${BASE_URL}/captcha/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ selected_urls: selected, encrypted_answer: data.encrypted_answer, purpose })
            }).then(async r => r.ok ? (await r.json()).captcha_solved_token : null).catch(() => null));
        }
        const results = await Promise.all(batch);
        const token = results.find(r => r);
        if (token) return token;
    }
    return null;
}

async function getAuth() {
    const u = 'test' + Math.random().toString(36).slice(2, 10);
    const p = "Aa1!Test1234";

    const prep = await fetch(`${BASE_URL}/form/prepare/public/register`).then(r => r.json());
    console.log("Waiting 10s for registration...");
    await sleep(10000);

    await fetch(`${BASE_URL}/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: u, email: u + "@test.com", password: p, full_name: "Test",
            form_prep_token: prep.form_prep_token,
            mouse_movement_count: 200, mouse_total_distance: 4000, recaptcha_token: ''
        })
    });
    console.log(`Registered: ${u}`);

    const loginPrep = await fetch(`${BASE_URL}/form/prepare/public/login`).then(r => r.json());
    await sleep(3000);
    const captcha = await solveCaptcha("logos", "auth");

    const loginRes = await fetch(`${BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: u, password: p, captcha_solved_token: captcha,
            form_prep_token: loginPrep.form_prep_token,
            mouse_movement_count: 200, mouse_total_distance: 4000
        })
    }).then(r => r.json());

    const mfaInit = await fetch(`${BASE_URL}/mfa/initiate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${loginRes.mfa_required_auth_token}` }
    }).then(r => r.json());

    const mfaSubmit = await fetch(`${BASE_URL}/mfa/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${loginRes.mfa_required_auth_token}` },
        body: JSON.stringify({ encrypted_mfa_code_token: mfaInit.encrypted_mfa_code_token, code: mfaInit.otp_code })
    }).then(r => r.json());

    console.log("Logged in!\n");
    return mfaSubmit.auth_token;
}

async function main() {
    const authToken = await getAuth();
    const authHeaders = { 'Authorization': `Bearer ${authToken}` };
    const fullHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` };

    console.log("=== FINDING PAYMENT_METHOD PREP TOKEN ===\n");

    // Test various endpoints to get payment_method type token
    const endpoints = [
        { method: 'GET', url: '/form/prepare/payment_method' },
        { method: 'GET', url: '/form/prepare/payment-method' },
        { method: 'GET', url: '/form/prepare/add-payment-method' },
        { method: 'GET', url: '/form/prepare/add_payment_method' },
        { method: 'GET', url: '/form/prepare/card' },
        { method: 'GET', url: '/form/prepare/add-card' },
        { method: 'POST', url: '/form/prepare/payment_method', body: {} },
        { method: 'POST', url: '/form/prepare/payment-method', body: {} },
        { method: 'POST', url: '/form/prepare/payment_method', body: { form_type: 'payment_method' } },
    ];

    for (const ep of endpoints) {
        let res;
        if (ep.method === 'GET') {
            res = await fetch(`${BASE_URL}${ep.url}`, { headers: authHeaders });
        } else {
            res = await fetch(`${BASE_URL}${ep.url}`, {
                method: 'POST',
                headers: fullHeaders,
                body: JSON.stringify(ep.body)
            });
        }
        const text = await res.text();
        console.log(`${ep.method} ${ep.url}: ${res.status}`);
        if (res.status === 200) {
            console.log(`   FOUND! Response: ${text}`);
        } else if (res.status !== 404 && res.status !== 422) {
            console.log(`   ${text.substring(0, 150)}`);
        }
    }

    // Try public endpoints with form_type parameter
    console.log("\n=== TRYING PUBLIC WITH FORM_TYPE ===\n");

    const publicEndpoints = [
        '/form/prepare/public/payment_method',
        '/form/prepare/public/payment-method',
        '/form/prepare/public/add-payment-method',
    ];

    for (const url of publicEndpoints) {
        const res = await fetch(`${BASE_URL}${url}`);
        console.log(`GET ${url}: ${res.status}`);
        if (res.ok) {
            const data = await res.json();
            console.log(`   Response:`, data);
        }
    }

    // Try the working /form/prepare/payment endpoint and examine its form_type
    console.log("\n=== EXAMINING WORKING ENDPOINTS ===\n");

    const paymentRes = await fetch(`${BASE_URL}/form/prepare/payment`, { headers: authHeaders });
    const paymentData = await paymentRes.json();
    console.log("/form/prepare/payment response:", JSON.stringify(paymentData, null, 2));

    // Maybe we need to use dynamic endpoint
    console.log("\n=== TRYING DYNAMIC ENDPOINT ===\n");

    const dynamicEndpoints = [
        '/form/prepare?form_type=payment_method',
        '/form/prepare?type=payment_method',
    ];

    for (const url of dynamicEndpoints) {
        const res = await fetch(`${BASE_URL}${url}`, { headers: authHeaders });
        console.log(`GET ${url}: ${res.status}`);
        if (res.ok) console.log(`   `, await res.json());
    }

    console.log("\n=== DONE ===");
}

main().catch(console.error);
