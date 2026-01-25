/**
 * Deckathon Registration Automation Script
 * 
 * This script automates the full registration, login, course management, 
 * payment, and dropout process for the Deckathon platform.
 * 
 * REFACTORED: Uses step modules in ./steps/ for cleaner, maintainable code
 */

const { connect } = require('puppeteer-real-browser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import step modules
const {
    sleep,
    generateRandomString,
    generateRandomName,
    generateRandomEmail,
    generateRandomPassword,
    performLogin,
    handleOTP,
    dropEnrolledCourses,
    solveCaptcha,
    handlePaymentFlow,
    solveAntiBotModules,
    startDropout,
    selectDropoutReason,
    getAuthToken,
    completeFinalDropout
} = require('./steps');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    REGISTER_URL: 'https://deckathon-concordia.com/register',
    LOGIN_URL: 'https://deckathon-concordia.com/login',
    BACKEND_URL: 'https://hackathon-backend-326152168.us-east4.run.app',
    CHROME_PATH: process.env.CHROME_PATH,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
};

// ============================================================================
// ACCOUNT REGISTRATION (API-only)
// ============================================================================

/**
 * Register a new Deckathon account via API
 */
async function registerDeckathonAccount(options = {}) {
    const { runId } = options;
    const prefix = runId !== undefined ? `[Run ${runId}] ` : '';

    try {
        console.log(`${prefix}Starting Deckathon Account Registration...\n`);

        // Generate random credentials
        const username = generateRandomString(8) + Math.floor(Math.random() * 999);
        const fullName = generateRandomName();
        const email = generateRandomEmail();
        const password = generateRandomPassword();
        console.log('Credentials:', username, '|', fullName, '|', email, '|', password);

        // Get form_prep_token
        console.log('Getting form_prep_token...');
        const prepResponse = await fetch(`${CONFIG.BACKEND_URL}/form/prepare/public/register`);
        const prepData = await prepResponse.json();
        const formPrepToken = prepData.form_prep_token || prepData.token || '';
        console.log('Got form_prep_token, waiting...');

        await sleep(10000);

        // Register via API
        console.log('Registering via API...');
        const registerResponse = await fetch(`${CONFIG.BACKEND_URL}/user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username,
                email,
                password,
                full_name: fullName,
                form_prep_token: formPrepToken,
                mouse_movement_count: 150 + Math.floor(Math.random() * 100),
                mouse_total_distance: 3000 + Math.floor(Math.random() * 2000),
                recaptcha_token: ''
            })
        });

        const registerData = await registerResponse.json();
        if (registerResponse.ok) {
            console.log('Registration successful via API');
            return { success: true, netname: username, password, email, fullName, error: null };
        } else {
            console.log('Registration response:', registerData);
            return { success: false, netname: username, password, email, fullName, error: registerData.message || 'Registration failed' };
        }
    } catch (error) {
        console.error('Registration error:', error.message);
        return { success: false, netname: null, password: null, email: null, fullName: null, error: error.message };
    }
}

// ============================================================================
// DROP CLASSES & DROPOUT FLOW (Browser automation)
// ============================================================================

/**
 * Login, drop classes, make payment, and complete dropout
 * Now uses step modules for clean, maintainable code
 */
async function dropClasses(options = {}) {
    const { netname, password, email, fullName, runId } = options;

    if (!netname || !password) {
        return { success: false, username: null, error: 'netname and password are required' };
    }

    let browser;
    const prefix = runId !== undefined ? `[Run ${runId}] ` : '';

    try {
        let isSuccess = false;
        console.log(`${prefix}Starting Drop Classes & Dropout Flow...\n`);
        console.log('Using credentials:', netname, '|', password);

        // ====================================================================
        // STEP 1: Connect to browser
        // ====================================================================
        console.log('Connecting...');
        const connection = await connect({
            headless: false,
            fingerprint: false,
            turnstile: true,
            tf: true,
            args: [
                '--window-size=1920,1080',
                '--disable-blink-features=AutomationControlled',
                '--disable-popup-blocking'
            ],
            customConfig: { chromePath: CONFIG.CHROME_PATH },
            connectOption: { defaultViewport: { width: 1920, height: 1080 } }
        });

        browser = connection.browser;
        const page = connection.page;
        const username = netname;

        // ====================================================================
        // STEP 2: Login
        // ====================================================================
        await performLogin(page, username, password, CONFIG);
        await solveCaptcha(page);
        await handleOTP(page);

        // ====================================================================
        // STEP 3: Drop enrolled courses
        // ====================================================================
        await dropEnrolledCourses(page);

        // ====================================================================
        // STEP 4: Payment flow
        // ====================================================================
        await handlePaymentFlow(browser, page, CONFIG.GEMINI_API_KEY);

        // ====================================================================
        // STEP 5: Dropout process
        // ====================================================================
        await startDropout(page, browser);
        await selectDropoutReason(page, browser);

        // ====================================================================
        // STEP 6: Solve anti-bot modules
        // ====================================================================
        await solveAntiBotModules(page);

        // ====================================================================
        // STEP 7: Final CAPTCHA and complete dropout
        // ====================================================================
        const authToken = await getAuthToken(page);
        const result = await completeFinalDropout(page, authToken);
        isSuccess = result.success;

        // ====================================================================
        // STEP 8: Save credentials
        // ====================================================================
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const credentialsPath = path.join(dataDir, 'deckathon_credentials.json');
        let credentials = [];
        if (fs.existsSync(credentialsPath)) {
            try {
                credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
            } catch (e) { /* Start fresh */ }
        }

        credentials.push({
            username,
            fullName: fullName || 'Unknown',
            email: email || 'Unknown',
            password,
            success: isSuccess,
            timestamp: new Date().toISOString()
        });
        fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
        console.log('Saved credentials');

        await sleep(500);
        console.log('Done!');

        if (runId !== undefined && browser) {
            await browser.close();
        }

        return { success: isSuccess, username, error: null };

    } catch (error) {
        console.error('Error:', error.message);
        if (runId !== undefined && browser) {
            try { await browser.close(); } catch (e) { }
        }
        return { success: false, username: null, error: error.message };
    }
}

// ============================================================================
// WRAPPER FUNCTION (backwards compatible)
// ============================================================================

/**
 * Full registration flow - creates account then drops classes
 */
async function registerOnDeckathon(options = {}) {
    const { runId } = options;
    const prefix = runId !== undefined ? `[Run ${runId}] ` : '';

    console.log(`${prefix}Starting Full Deckathon Registration Flow\n`);

    // Step 1: Register account
    const accountResult = await registerDeckathonAccount({ runId });

    if (!accountResult.success) {
        console.log('Account registration failed:', accountResult.error);
        return { success: false, username: accountResult.netname, error: accountResult.error };
    }

    // Step 2: Drop classes and complete dropout
    const dropResult = await dropClasses({
        netname: accountResult.netname,
        password: accountResult.password,
        email: accountResult.email,
        fullName: accountResult.fullName,
        runId
    });

    return dropResult;
}

// Export for use in run10.js
module.exports = { registerOnDeckathon, registerDeckathonAccount, dropClasses };

// Run directly if this file is executed (NOT when imported by Electron)
const isElectron = process.versions && process.versions.electron;
if (require.main === module && !isElectron) {
    registerOnDeckathon();
}
