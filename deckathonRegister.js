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

// Initialize Gemini AI for CAPTCHA solving
const ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });

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

// ============================================================================
// CAPTCHA SOLVING FUNCTIONS
// ============================================================================

/**
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
 */
async function solveWhiteCaptcha(page) {
    const hasCaptcha = await page.evaluate(() =>
        document.body.innerText.includes("Verify You're Human")
    );
    if (!hasCaptcha) return;

    console.log('Final CAPTCHA detected! Solving with Gemini...');

    // Load all farmed face images from captcha_faces folder
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

    console.log(`Loading ${faceFiles.length} farmed face images...`);

    // Wait for all CAPTCHA images to fully load
    console.log('Waiting for CAPTCHA images to load...');
    await page.waitForFunction(() => {
        const imgs = document.querySelectorAll('.grid.grid-cols-3 > div img');
        if (imgs.length < 9) return false;
        return Array.from(imgs).every(img => img.complete && img.naturalWidth > 0);
    }, { timeout: 5000 }).catch(() => {
        console.log('Image load timeout - proceeding anyway');
    });
    await sleep(300); // Extra buffer after load

    // Save screenshot to screenshots folder AFTER images loaded
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

    // Build Gemini request
    const contents = [];

    // Add all farmed faces first WITH LABELS
    contents.push({ text: `KNOWN IMAGES (${faceFiles.length} images numbered 1-${faceFiles.length}):` });
    for (let i = 0; i < faceFiles.length; i++) {
        const file = faceFiles[i];
        const imgPath = path.join(facesDir, file);
        const data = fs.readFileSync(imgPath).toString('base64');
        const mimeType = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
        contents.push({ inlineData: { mimeType, data } });
        contents.push({ text: `Known ${i + 1}` });
    }

    // Add CAPTCHA images
    contents.push({ text: `\nCAPTCHA GRID (9 images numbered 1-9):` });
    for (const img of captchaImages) {
        contents.push({ inlineData: { mimeType: 'image/png', data: img.data } });
        contents.push({ text: `Image ${img.index}` });
    }

    // Prompt
    const prompt = `Compare the CAPTCHA images (1-9) against the KNOWN IMAGES.

Your task: Find which CAPTCHA images are PIXEL-FOR-PIXEL the EXACT SAME photograph as any known image.

BE EXTREMELY STRICT:
- Must be the EXACT SAME photograph, just ROTATED and/or CROPPED
- Same person in a DIFFERENT photo = NO MATCH
- Similar looking scene = NO MATCH  
- Only match if you are 100% CERTAIN it's the exact same source image

For each match, you MUST describe SPECIFIC VISUAL EVIDENCE proving it's the same image:
- Describe the EXACT background details (what objects, textures, colors are behind the person?)
- Describe the EXACT pose (hand positions, body angle, facial expression)
- Describe any text, logos, or unique objects visible
- Describe clothing details and accessories

If you cannot describe specific matching details, it's NOT a match.

The image may be rotated 90°, 180°, 270°, or any angle. It may also be cropped.

IMPORTANT: Be conservative. It's better to miss a match than include a false positive. For example, if the image seems to be the same person wearing the same thing, but one has more of the hoodie with white text, that one is WRONG.

Example:
Image 3 matches Known Image 15: Both show a man in a RED HOODIE with "SUPREME" logo, standing in front of a WHITE BRICK WALL with a green plant in bottom left corner. Same exact hand position making peace sign.

On your FINAL LINE, put ONLY the matching numbers comma-separated.
If no certain matches, return "none".

FINAL WARNING: SOMETIMES THE FAKE IMAGES WILL REPLICATE WHAT THE REAL IMAGES DO BUT STILL AREN'T THE SAME IMAGE. BE EXTREMELY STRICT.

FINAL ANSWER: 3`;

    contents.push({ text: prompt });

    try {
        console.log('Sending 3 parallel Gemini calls for majority voting...');

        // Run 3 parallel calls
        const geminiCall = () => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: contents,
            generationConfig: {
                thinkingConfig: {
                    thinkingLevel: 'HIGH'
                }
            }
        });

        const [result1, result2, result3] = await Promise.all([
            geminiCall().catch(e => ({ text: 'none' })),
            geminiCall().catch(e => ({ text: 'none' })),
            geminiCall().catch(e => ({ text: 'none' }))
        ]);

        // Parse each response for numbers
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

        const votes1 = parseResponse(result1);
        const votes2 = parseResponse(result2);
        const votes3 = parseResponse(result3);

        console.log(`Vote 1: ${votes1.join(',') || 'none'}`);
        console.log(`Vote 2: ${votes2.join(',') || 'none'}`);
        console.log(`Vote 3: ${votes3.join(',') || 'none'}`);

        // Count votes for each number 1-9
        const voteCount = {};
        for (let i = 1; i <= 9; i++) {
            voteCount[i] = 0;
            if (votes1.includes(i)) voteCount[i]++;
            if (votes2.includes(i)) voteCount[i]++;
            if (votes3.includes(i)) voteCount[i]++;
        }

        // Majority = 2 or more votes
        const majorityNumbers = Object.entries(voteCount)
            .filter(([num, count]) => count >= 2)
            .map(([num, count]) => parseInt(num));

        console.log(`Majority consensus: ${majorityNumbers.join(', ') || 'none'}`);

        // Extract matched Known image numbers from all responses
        const allResponses = [result1.text || '', result2.text || '', result3.text || ''].join(' ');
        const knownMatches = allResponses.match(/Known\s*(?:Image\s*)?(\d+)/gi) || [];
        const matchedKnownNumbers = [...new Set(knownMatches.map(m => parseInt(m.match(/\d+/)[0])))];

        // Click majority-agreed images
        for (const num of majorityNumbers) {
            if (imageContainers[num - 1]) {
                await imageContainers[num - 1].click();
                await sleep(50);
            }
        }

        // Store matched known images for tracking
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
 * Farm face images from CAPTCHA - save only NEW unique faces
 * Used by imgcapture.js
 */
async function farmFaceCaptcha(page) {
    const hasCaptcha = await page.evaluate(() =>
        document.body.innerText.includes("Verify You're Human")
    );
    if (!hasCaptcha) {
        console.log('No face CAPTCHA to farm');
        return 0;
    }

    console.log('🎯 Farming face CAPTCHA images...');

    // Ensure captcha_faces directory exists
    const facesDir = path.join(__dirname, 'captcha_faces');
    if (!fs.existsSync(facesDir)) {
        fs.mkdirSync(facesDir, { recursive: true });
    }

    // Get all currently saved faces
    const savedFaceFiles = fs.readdirSync(facesDir)
        .filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'));
    const savedFaces = savedFaceFiles.map(f => ({
        name: f,
        data: fs.readFileSync(path.join(facesDir, f)).toString('base64')
    }));
    console.log(`Currently have ${savedFaces.length} saved faces`);

    // Get all 9 CAPTCHA images individually
    const imageContainers = await page.$$('.grid.grid-cols-3 > div');
    const captchaImages = [];

    for (let i = 0; i < imageContainers.length; i++) {
        const img = await imageContainers[i].$('img');
        if (!img) continue;
        try {
            const data = await img.screenshot({ encoding: 'base64' });
            captchaImages.push({ index: i + 1, data });
        } catch (err) {
            console.log(`Failed to capture image ${i + 1}`);
        }
    }
    console.log(`Got ${captchaImages.length} CAPTCHA images`);

    // Build Gemini request with saved faces + CAPTCHA images
    const contents = [];

    if (savedFaces.length > 0) {
        contents.push({ text: `SAVED IMAGES (${savedFaces.length} already in collection):` });
        for (const face of savedFaces) {
            contents.push({ inlineData: { mimeType: 'image/png', data: face.data } });
        }
    } else {
        contents.push({ text: 'SAVED IMAGES: None yet (empty collection - all faces are new!)' });
    }

    contents.push({ text: `\nCAPTCHA GRID IMAGES (numbered 1-${captchaImages.length}):` });
    for (const img of captchaImages) {
        contents.push({ inlineData: { mimeType: 'image/png', data: img.data } });
        contents.push({ text: `Image ${img.index}` });
    }

    const prompt = `Which CAPTCHA images (1-${captchaImages.length}) show faces/people NOT already in saved collection?
- Images may be rotated at ANY angle or cropped
- Compare the PERSON (face features) not exact image
- Same person in different pose/angle = NOT new
- Non-face images (objects, animals, etc.) = NOT new

Return comma-separated numbers of NEW FACES only. If all are already saved, return "NONE".`;

    contents.push({ text: prompt });

    console.log('Asking Gemini which faces are new...');

    let newImagesFound = 0;

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: contents
        });

        const response = result.text.trim();
        console.log(`Gemini: ${response}`);

        if (response.toUpperCase() !== 'NONE') {
            const newNumbers = response.match(/\d+/g)?.map(n => parseInt(n)).filter(n => n >= 1 && n <= captchaImages.length) || [];

            for (const num of newNumbers) {
                const img = captchaImages.find(i => i.index === num);
                if (img) {
                    const filename = `face_${Date.now()}_${num}.png`;
                    const filepath = path.join(facesDir, filename);
                    fs.writeFileSync(filepath, Buffer.from(img.data, 'base64'));
                    console.log(`  ✅ Saved: ${filename}`);
                    newImagesFound++;
                    await sleep(10); // Prevent same timestamp
                }
            }
        } else {
            console.log('No new faces to save');
        }
    } catch (err) {
        console.log('Gemini error:', err.message);
    }

    return newImagesFound;
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

        // Parse response to get image numbers
        const numbers = responseText.split(',')
            .map(n => parseInt(n.trim()))
            .filter(n => n >= 1 && n <= 9);
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
// MAIN REGISTRATION FLOW
// ============================================================================

async function registerOnDeckathon(options = {}) {
    const { runId, farmMode = false } = options;
    let browser;

    try {
        const prefix = runId !== undefined ? `[Run ${runId}] ` : '';
        console.log(`${prefix}Starting Deckathon Registration Script${farmMode ? ' (FARM MODE)' : ''}\n`);

        // Generate random credentials for new account
        const username = generateRandomString(8) + Math.floor(Math.random() * 999);
        const fullName = generateRandomName();
        const email = generateRandomEmail();
        const password = generateRandomPassword();
        console.log('Credentials:', username, '|', fullName, '|', email, '|', password);

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

        // ====================================================================
        // STEP 2: Navigate to registration
        // ====================================================================
        console.log('Going to login...');
        await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(200);

        console.log('Clicking register link...');
        await sleep(500);
        await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const registerLink = links.find(link =>
                link.href.includes('/register') ||
                link.textContent.toLowerCase().includes('create')
            );
            if (registerLink) registerLink.click();
        });

        // Wait for register page with retry fallback
        try {
            await page.waitForSelector('#username', { timeout: 5000 });
        } catch (e) {
            console.log('Retry clicking register link...');
            await page.goto(CONFIG.REGISTER_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
            await page.waitForSelector('#username', { timeout: 10000 });
        }
        console.log('On register page');

        // ====================================================================
        // STEP 3: Fill and submit registration form
        // ====================================================================
        console.log('Filling registration form...');
        await fastType(page, '#username', username);
        await fastType(page, '#fullName', fullName);
        await fastType(page, '#email', email);
        await fastType(page, '#password', password);
        await fastType(page, '#confirmPassword', password);

        console.log('Submitting registration...');
        await page.evaluate(() => document.querySelector('button[type="submit"]')?.click());
        await sleep(500);
        await solveCaptcha(page);
        await sleep(500);

        // ====================================================================
        // STEP 4: Login with new credentials
        // ====================================================================
        console.log('Navigating to login page...');
        await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForSelector('#netname', { timeout: 10000 });
        console.log('On login page');

        console.log('Filling login form...');
        await fastType(page, '#netname', username);
        await fastType(page, '#password', password);

        console.log('Submitting login...');
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
        // STEP 6: Drop all enrolled/waitlisted classes
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
        // STEP 7: Make payment
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
        await sleep(500);

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
            // STEP 8: Handle payment in new tab
            // ================================================================
            const pagesAfter = await browser.pages();
            if (pagesAfter.length > pagesBefore.length) {
                const newPage = pagesAfter[pagesAfter.length - 1];
                await newPage.bringToFront();
                console.log('Switched to new tab:', await newPage.url());
                await sleep(1000);

                // Fill fake card details
                console.log('Filling card info...');
                await newPage.type('#card-number', '4532 1234 5678 9012', { delay: 5 });
                await newPage.type('#cvv', '123', { delay: 5 });
                await newPage.type('#expiry', '12/28', { delay: 5 });

                await newPage.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    buttons.find(b => b.textContent.includes('Save Card'))?.click();
                });
                console.log('Clicked Save Card');
                await sleep(800);

                await newPage.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    buttons.find(b => b.textContent.trim() === 'Continue' && !b.disabled)?.click();
                });
                console.log('Clicked Continue');
                await sleep(800);

                await newPage.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    buttons.find(b => b.textContent.includes('Process Payment') && !b.disabled)?.click();
                });
                console.log('Clicked Process Payment');
                await sleep(1000);

                // Solve payment CAPTCHA with Gemini
                await solveGeminiCaptcha(newPage);
                console.log('Payment flow complete');

                // ============================================================
                // STEP 9: Complete student dropout
                // ============================================================
                console.log('Switching back to main tab...');
                await page.bringToFront();
                await sleep(500);

                console.log('Navigating to Student Dropout...');
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

                // Check confirmation checkbox in iframe
                console.log('Looking for iframe checkbox...');
                const iframeHandle = await page.$('iframe');
                if (iframeHandle) {
                    console.log('Found iframe, accessing content...');
                    const frame = await iframeHandle.contentFrame();
                    if (frame) {
                        await frame.evaluate(() => document.querySelector('#final-agree')?.click());
                        console.log('Checked confirmation checkbox');
                    }
                }
                await sleep(300);

                // Confirm dropout
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    buttons.find(b => b.textContent.includes('Confirm Dropout'))?.click();
                });
                console.log('Clicked Confirm Dropout');
                await sleep(1000);

                // Solve or farm CAPTCHA depending on mode
                if (farmMode) {
                    const newFaces = await farmFaceCaptcha(page);
                    console.log(`Farming complete. New faces saved: ${newFaces}`);
                } else {
                    await solveWhiteCaptcha(page);
                    console.log('Student Dropout complete');
                }
            }
        }

        // Check for success message after final CAPTCHA
        await sleep(3000);
        const pageText = await page.evaluate(() => document.body.innerText);
        const isSuccess = pageText.includes('Congratulations') || pageText.includes('🎓') || pageText.includes('successfully');

        if (isSuccess) {
            console.log('✅ SUCCESS - Congratulations message found!');

            // Track which known images led to success
            const matchedKnowns = global.lastMatchedKnownImages || [];
            if (matchedKnowns.length > 0) {
                console.log(`Matched Known Images: ${matchedKnowns.join(', ')}`);

                // Update tally file
                const tallyPath = path.join(__dirname, 'data', 'captcha_success_tally.json');
                let tally = {};
                if (fs.existsSync(tallyPath)) {
                    tally = JSON.parse(fs.readFileSync(tallyPath, 'utf8'));
                }
                for (const num of matchedKnowns) {
                    const key = `face_${String(num).padStart(2, '0')}`;
                    tally[key] = (tally[key] || 0) + 1;
                }
                // Sort by face number ascending
                const sortedTally = Object.keys(tally)
                    .sort((a, b) => parseInt(a.match(/\d+/)) - parseInt(b.match(/\d+/)))
                    .reduce((obj, key) => { obj[key] = tally[key]; return obj; }, {});
                fs.writeFileSync(tallyPath, JSON.stringify(sortedTally, null, 2));
                console.log(`Updated tally: ${tallyPath}`);
            }
        } else {
            console.log('❌ FAILED - No success message found');
        }

        // ====================================================================
        // STEP 10: Save credentials to file
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
            fullName,
            email,
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

    console.log('Browser kept open for debugging');
}

// Export for use in run10.js
module.exports = { registerOnDeckathon };

// Run directly if this file is executed
if (require.main === module) {
    registerOnDeckathon();
}
