/**
 * Run 10 instances of Deckathon Registration
 * Tests success rate of the full automation flow
 */

const { connect } = require('puppeteer-real-browser');
const { GoogleGenAI } = require('@google/genai');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CONFIG = {
    LOGIN_URL: 'https://deckathon-concordia.com/login',
    CHROME_PATH: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    TOTAL_RUNS: 10
};

const ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Results tracking
const results = [];

// ============================================================================
// UTILITY FUNCTIONS (copied from deckathonRegister.js)
// ============================================================================

const generateRandomString = (length = 8) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const generateRandomName = () => {
    const firstNames = ['John', 'Jane', 'Alex', 'Sam', 'Chris', 'Jordan', 'Taylor', 'Riley', 'Morgan', 'Skyler', 'Quinn', 'Avery', 'Drew'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson', 'Garcia', 'Martinez', 'Anderson'];
    return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
};

const generateRandomEmail = () => {
    const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
    return `${generateRandomString(10)}${Math.floor(Math.random() * 999)}@${domains[Math.floor(Math.random() * domains.length)]}`;
};

const generateRandomPassword = () => {
    const special = '!@#$%^&*';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    let password = special[Math.floor(Math.random() * special.length)] +
        upper[Math.floor(Math.random() * upper.length)] +
        Array.from({ length: 6 }, () => (lower + numbers)[Math.floor(Math.random() * (lower.length + numbers.length))]).join('') +
        special[Math.floor(Math.random() * special.length)];
    return password.split('').sort(() => Math.random() - 0.5).join('');
};

const fastType = async (page, selector, text) => {
    await page.click(selector);
    await page.evaluate((sel, val) => { document.querySelector(sel).value = val; }, selector, text);
    await page.type(selector, ' ', { delay: 5 });
    await page.keyboard.press('Backspace');
};

// ============================================================================
// CAPTCHA SOLVING
// ============================================================================

async function solveCaptcha(page) {
    const hasCaptcha = await page.evaluate(() => document.body.innerText.includes('Select all'));
    if (!hasCaptcha) return;

    const imageContainers = await page.$$('.grid.grid-cols-3 > div');
    const selectedImages = [];

    for (let i = 0; i < imageContainers.length; i++) {
        const img = await imageContainers[i].$('img');
        if (!img) continue;
        try {
            const screenshotData = await img.screenshot();
            const { data, info } = await sharp(Buffer.from(screenshotData)).raw().toBuffer({ resolveWithObject: true });
            const centerX = Math.floor(info.width / 2);
            const centerY = Math.floor(info.height / 2);
            const pixelIndex = (centerY * info.width + centerX) * info.channels;
            const r = data[pixelIndex], g = data[pixelIndex + 1], b = data[pixelIndex + 2];
            const isVeryLight = r > 220 && g > 220 && b > 220;
            const isVeryDark = r < 50 && g < 50 && b < 50;
            if (isVeryLight || isVeryDark) selectedImages.push(i);
        } catch (err) { }
    }

    for (const idx of selectedImages) {
        await imageContainers[idx].click();
        await sleep(50);
    }

    await sleep(200);
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Verify'));
        if (btn && !btn.disabled) btn.click();
    });
    await sleep(1500);
}

async function solveGeminiCaptcha(page) {
    const hasCaptcha = await page.evaluate(() => document.body.innerText.includes('Select all'));
    if (!hasCaptcha) return;

    const imageContainers = await page.$$('.grid.grid-cols-3 > div');
    const imagePromises = imageContainers.map(async (container, i) => {
        const img = await container.$('img');
        if (!img) return null;
        return await img.screenshot({ encoding: 'base64' });
    });
    const screenshots = await Promise.all(imagePromises);

    const contents = screenshots.filter(Boolean).map(data => ({ inlineData: { mimeType: 'image/png', data } }));
    contents.push({ text: 'These are 9 CAPTCHA images in a 3x3 grid. Identify images containing HUMANS (people/faces). Return comma-separated numbers 1-9. Example: 2,5,7' });

    try {
        const result = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents });
        const response = result.text.trim();
        const numbers = response.match(/\d+/g)?.map(n => parseInt(n)).filter(n => n >= 1 && n <= 9) || [];
        for (const num of numbers) {
            if (imageContainers[num - 1]) await imageContainers[num - 1].click();
            await sleep(50);
        }
    } catch (err) { }

    await sleep(200);
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Verify'));
        if (btn && !btn.disabled) btn.click();
    });
    await sleep(1500);
}

async function solveFaceCaptcha(page) {
    const hasCaptcha = await page.evaluate(() => document.body.innerText.includes("Verify You're Human"));
    if (!hasCaptcha) return;

    const prettyFacesDir = path.join(__dirname, 'prettyfaces');
    const referenceFiles = fs.readdirSync(prettyFacesDir).filter(f => f.endsWith('.jpeg') || f.endsWith('.jpg') || f.endsWith('.png'));
    const referenceFaces = referenceFiles.map(file => ({
        name: file.replace(/\.[^.]+$/, ''),
        data: fs.readFileSync(path.join(prettyFacesDir, file)).toString('base64'),
        mimeType: file.endsWith('.png') ? 'image/png' : 'image/jpeg'
    }));

    const imageContainers = await page.$$('.grid.grid-cols-3 > div');
    const captchaImages = [];
    for (let i = 0; i < imageContainers.length; i++) {
        const img = await imageContainers[i].$('img');
        if (!img) continue;
        try {
            const data = await img.screenshot({ encoding: 'base64' });
            captchaImages.push({ index: i + 1, data });
        } catch (err) { }
    }

    const contents = [];
    for (const face of referenceFaces) contents.push({ inlineData: { mimeType: face.mimeType, data: face.data } });
    for (const captcha of captchaImages) contents.push({ inlineData: { mimeType: 'image/png', data: captcha.data } });

    const prompt = `Face recognition: First ${referenceFaces.length} images are reference faces. Next ${captchaImages.length} are CAPTCHA grid (1-${captchaImages.length}).
Which CAPTCHA images match the reference people? They may wear glasses/hats. Focus on facial features.
Return ONLY comma-separated numbers. Example: 2,5,7 or NONE`;
    contents.push({ text: prompt });

    try {
        const result = await ai.models.generateContent({ model: 'gemini-3-pro-preview', contents });
        const response = result.text.trim();
        if (response.toUpperCase() !== 'NONE') {
            const lines = response.split('\n').filter(l => l.trim());
            let lastLine = lines[lines.length - 1].replace(/\*+/g, '').trim();
            const numbers = lastLine.match(/\d+/g)?.map(n => parseInt(n)).filter(n => n >= 1 && n <= captchaImages.length) || [];
            for (const num of numbers) {
                if (imageContainers[num - 1]) await imageContainers[num - 1].click();
                await sleep(100);
            }
        }
    } catch (err) { }

    await sleep(200);
    await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Verify'));
        if (btn && !btn.disabled) btn.click();
    });
    await sleep(1500);
}

// ============================================================================
// SINGLE RUN FUNCTION
// ============================================================================

async function runSingleInstance(runNumber) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`RUN ${runNumber}/${CONFIG.TOTAL_RUNS}`);
    console.log('='.repeat(60));

    const username = generateRandomString(8) + Math.floor(Math.random() * 999);
    const fullName = generateRandomName();
    const email = generateRandomEmail();
    const password = generateRandomPassword();
    console.log(`Credentials: ${username} | ${fullName} | ${email}`);

    let browser, page;
    let success = false;
    let error = null;

    try {
        const connection = await connect({
            headless: false,
            fingerprint: false,
            turnstile: true,
            tf: true,
            args: ['--window-size=1280,800', '--disable-blink-features=AutomationControlled'],
            customConfig: { chromePath: CONFIG.CHROME_PATH },
            connectOption: { defaultViewport: { width: 1280, height: 800 } }
        });
        browser = connection.browser;
        page = connection.page;

        // Registration
        await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(500);
        await page.evaluate(() => document.querySelector('a[href*="register"]')?.click());
        await sleep(800);

        await fastType(page, '#username', username);
        await fastType(page, '#fullName', fullName);
        await fastType(page, '#email', email);
        await fastType(page, '#password', password);
        await fastType(page, '#confirmPassword', password);
        await page.click('button[type="submit"]');
        await sleep(1500);
        await solveCaptcha(page);

        // Login
        await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(500);
        await fastType(page, '#netname', username);
        await fastType(page, '#password', password);
        await page.click('button[type="submit"]');
        await sleep(1500);
        await solveCaptcha(page);

        // OTP
        await sleep(500);
        const otpCode = await page.evaluate(() => {
            const match = document.body.innerText.match(/verification code[:\s]*(\d{6})/i);
            return match ? match[1] : null;
        });
        if (otpCode) {
            await page.type('#otp', otpCode);
            await page.evaluate(() => document.querySelector('button')?.click());
            await sleep(1000);
        }

        // Drop Classes
        await page.goto('https://deckathon-concordia.com/courses', { waitUntil: 'domcontentloaded' });
        await sleep(500);
        await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Enrollment'))?.click());
        await sleep(300);
        await page.evaluate(() => document.querySelector('a[href*="drop"]')?.click());
        await sleep(500);
        await page.evaluate(() => document.querySelectorAll('input[type="checkbox"]').forEach(c => c.click()));
        await sleep(300);
        await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Drop Selected'))?.click());
        await sleep(500);

        const confirmWord = await page.evaluate(() => {
            const input = document.querySelector('input[placeholder*="type"]');
            return input?.placeholder?.match(/type\s+(\w+)/i)?.[1];
        });
        if (confirmWord) {
            await page.type('input[placeholder*="type"]', confirmWord);
            await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Confirm'))?.click());
            await sleep(1000);
        }

        // Finance
        await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Finance'))?.click());
        await sleep(300);
        await page.evaluate(() => document.querySelector('a[href*="payment"]')?.click());
        await sleep(500);
        await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Continue'))?.click());
        await sleep(500);

        // Number sequence
        const sequence = await page.evaluate(() => {
            const match = document.body.innerText.match(/Click.*?(\d).*?(\d).*?(\d)/);
            return match ? [match[1], match[2], match[3]] : null;
        });
        if (sequence) {
            for (const num of sequence) {
                await page.evaluate((n) => Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === n)?.click(), num);
                await sleep(200);
            }
            await sleep(500);
        }

        // Enter amount
        const balance = await page.evaluate(() => {
            const match = document.body.innerText.match(/\$(\d+\.?\d*)/);
            return match ? match[1] : '100';
        });
        await page.type('#amount', balance);
        await page.select('select', 'CAD');
        await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Continue'))?.click());
        await sleep(1000);

        // New tab for payment
        const pages = await browser.pages();
        const newPage = pages[pages.length - 1];
        await newPage.bringToFront();
        await sleep(500);

        await newPage.type('#card-number', '4532123456789012');
        await newPage.type('#cvv', '123');
        await newPage.type('#expiry', '12/28');
        await newPage.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Save'))?.click());
        await sleep(300);
        await newPage.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Continue'))?.click());
        await sleep(300);
        await newPage.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Process'))?.click());
        await sleep(1000);
        await solveGeminiCaptcha(newPage);

        // Back to main tab for dropout
        await page.bringToFront();
        await sleep(300);
        await page.evaluate(() => document.querySelector('a[href*="dropout"]')?.click());
        await sleep(500);

        // Dropout flow
        await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Start'))?.click());
        await sleep(500);
        await page.evaluate(() => document.querySelector('input[type="radio"][value*="Academic"]')?.click());
        await sleep(200);
        await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Next'))?.click());
        await sleep(500);

        // Iframe checkbox
        const iframe = await page.$('iframe');
        if (iframe) {
            const frame = await iframe.contentFrame();
            if (frame) await frame.evaluate(() => document.querySelector('#final-agree')?.click());
        }
        await sleep(200);
        await page.evaluate(() => Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Confirm Dropout'))?.click());
        await sleep(1000);

        // Final face CAPTCHA
        await solveFaceCaptcha(page);

        // Check for success after 3 seconds
        await sleep(3000);
        const pageText = await page.evaluate(() => document.body.innerText);
        success = pageText.includes('Congratulations') || pageText.includes('🎓') || pageText.includes('successfully');
        console.log(`Result: ${success ? 'SUCCESS ✅' : 'FAILED ❌'}`);

    } catch (err) {
        error = err.message;
        console.log(`Error: ${err.message}`);
    } finally {
        if (browser) await browser.close();
    }

    return { runNumber, username, success, error };
}

// ============================================================================
// MAIN - RUN 10 INSTANCES
// ============================================================================

async function runAll() {
    console.log('='.repeat(60));
    console.log('DECKATHON REGISTRATION - 10 INSTANCE TEST');
    console.log('='.repeat(60));
    console.log(`Starting at: ${new Date().toISOString()}\n`);

    for (let i = 1; i <= CONFIG.TOTAL_RUNS; i++) {
        const result = await runSingleInstance(i);
        results.push(result);
        await sleep(2000);  // Brief pause between runs
    }

    // Summary
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log('\n' + '='.repeat(60));
    console.log('FINAL RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Runs: ${CONFIG.TOTAL_RUNS}`);
    console.log(`Successes: ${successCount} ✅`);
    console.log(`Failures: ${failCount} ❌`);
    console.log(`Success Rate: ${((successCount / CONFIG.TOTAL_RUNS) * 100).toFixed(1)}%`);
    console.log('\nDetailed Results:');
    results.forEach(r => {
        console.log(`  Run ${r.runNumber}: ${r.success ? '✅' : '❌'} ${r.username} ${r.error ? `(${r.error})` : ''}`);
    });

    // Save results to file
    const resultsPath = path.join(__dirname, 'data', 'run10_results.json');
    fs.writeFileSync(resultsPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        totalRuns: CONFIG.TOTAL_RUNS,
        successCount,
        failCount,
        successRate: `${((successCount / CONFIG.TOTAL_RUNS) * 100).toFixed(1)}%`,
        results
    }, null, 2));
    console.log(`\nResults saved to: ${resultsPath}`);
}

runAll().catch(console.error);
