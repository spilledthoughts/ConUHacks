/**
 * Deckathon Dropout Script
 * 
 * This script handles login and dropout for existing accounts.
 * Accepts command-line arguments for credentials and configuration.
 * 
 * Usage:
 *   node deckathonDropout.js --netname=user123 --password=Pass!word1 [--apiKey=...] [--chromePath=...]
 */

const { connect } = require('puppeteer-real-browser');
const { GoogleGenAI } = require('@google/genai');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ============================================================================
// PARSE COMMAND LINE ARGUMENTS
// ============================================================================

const args = process.argv.slice(2).reduce((acc, arg) => {
    const [key, value] = arg.replace('--', '').split('=');
    acc[key] = value;
    return acc;
}, {});

const CONFIG = {
    LOGIN_URL: 'https://deckathon-concordia.com/login',
    CHROME_PATH: args.chromePath || process.env.CHROME_PATH,
    GEMINI_API_KEY: args.apiKey || process.env.GEMINI_API_KEY,
    NETNAME: args.netname,
    PASSWORD: args.password
};

// Validate required arguments
if (!CONFIG.NETNAME || !CONFIG.PASSWORD) {
    console.error('Error: --netname and --password are required');
    process.exit(1);
}

// Initialize Gemini AI for CAPTCHA solving
const ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fastType = async (page, selector, text) => {
    await page.click(selector);
    await page.type(selector, text, { delay: 5 });
};

// ============================================================================
// MOUSE MOVEMENT (Anti-Bot Detection)
// ============================================================================

async function naturalMouseMove(page) {
    console.log('Moving mouse naturally...');
    let currentX = 500;
    let currentY = 400;

    for (let i = 0; i < 25; i++) {
        const targetX = Math.floor(Math.random() * 700) + 150;
        const targetY = Math.floor(Math.random() * 500) + 150;

        const steps = Math.floor(Math.random() * 3) + 2;
        for (let s = 0; s < steps; s++) {
            const progress = (s + 1) / steps;
            const eased = 1 - Math.pow(1 - progress, 2);
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

async function solveCaptcha(page) {
    console.log('Detecting CAPTCHA...');

    const hasCaptcha = await page.evaluate(() => {
        return document.body.innerText.includes("Verify You're Human") ||
            document.body.innerText.includes("Select all");
    });

    if (!hasCaptcha) {
        console.log('No CAPTCHA detected');
        return true;
    }

    console.log('CAPTCHA detected! Solving with pixel detection...');

    const category = await page.evaluate(() => {
        const strongEl = document.querySelector('.bg-primary-50 strong');
        return strongEl ? strongEl.textContent.trim() : 'logos';
    });
    console.log(`Category: Select all "${category}"`);

    const imageContainers = await page.$$('.grid.grid-cols-3 > div');

    const screenshotPromises = imageContainers.map(async (container, i) => {
        const img = await container.$('img');
        if (!img) return { index: i, isMatch: false };

        try {
            const screenshotData = await img.screenshot();
            const { data, info } = await sharp(Buffer.from(screenshotData))
                .raw()
                .toBuffer({ resolveWithObject: true });

            const centerX = Math.floor(info.width / 2);
            const centerY = Math.floor(info.height / 2);
            const pixelIndex = (centerY * info.width + centerX) * info.channels;
            const r = data[pixelIndex];
            const g = data[pixelIndex + 1];
            const b = data[pixelIndex + 2];

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

    for (const num of selectedImages) {
        if (imageContainers[num - 1]) {
            await imageContainers[num - 1].click();
            await sleep(50);
        }
    }

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

async function solveWhiteCaptcha(page) {
    const hasCaptcha = await page.evaluate(() =>
        document.body.innerText.includes("Verify You're Human")
    );
    if (!hasCaptcha) return;

    console.log('Final CAPTCHA detected! Solving with individual image analysis...');

    const referenceDir = path.join(__dirname, 'reference_images');
    const referenceImages = [];

    const allRefFiles = fs.readdirSync(referenceDir).filter(f =>
        f.endsWith('.jpeg') || f.endsWith('.jpg') || f.endsWith('.png')
    );

    for (const file of allRefFiles) {
        const imagePath = path.join(referenceDir, file);
        try {
            const imageBuffer = fs.readFileSync(imagePath);
            const base64Image = imageBuffer.toString('base64');
            const mimeType = file.endsWith('.png') ? 'image/png' : 'image/jpeg';

            const namePart = file.split('_')[1] || 'Reference';
            const name = namePart.split('.')[0].split('_')[0];
            referenceImages.push({ name, data: base64Image, mimeType });
        } catch (err) {
            console.log(`Warning: Could not load image: ${file}`);
        }
    }

    console.log(`Loaded ${referenceImages.length} reference images from reference_images folder`);

    const imageContainers = await page.$$('.grid.grid-cols-3 > div');
    if (imageContainers.length === 0) {
        console.log('No CAPTCHA images found');
        return;
    }

    console.log(`Found ${imageContainers.length} CAPTCHA images, analyzing each...`);

    const prompt = `I have provided 10 REFERENCE IMAGES of specific people (Andrei, Franco, Laurent, Mark, Sunwoong), followed by a SINGLE TEST IMAGE from a CAPTCHA.

Your task: Determine if the TEST IMAGE shows the SAME PERSON as ANY of the 10 reference images.

IMPORTANT:
- Compare facial features carefully (face shape, glasses, beard, skin tone, hair style, etc.)
- The test image may have different lighting, angles, or backgrounds
- The test image may be ROTATED - account for this when comparing
- If it matches ANY reference person, respond with ONLY: "MATCH: [name]"
- If it does NOT match any reference person, respond with ONLY: "NO MATCH"
- Make sure not to make mistake and be extra careful!!!!!
- Make sure to choose an image only if you are very sure about it!!!!!!

Example responses:
- "MATCH: Franco"
- "MATCH: Andrei"
- "NO MATCH"`;

    const matchingImages = [];

    for (let i = 0; i < imageContainers.length; i++) {
        const img = await imageContainers[i].$('img');
        if (!img) {
            console.log(`Image ${i + 1}: No img element found`);
            continue;
        }

        try {
            const screenshotBuffer = await img.screenshot({ encoding: 'base64' });

            const contents = [];

            for (const ref of referenceImages) {
                contents.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
                contents.push({ text: `Reference: ${ref.name}` });
            }

            contents.push({ inlineData: { mimeType: 'image/png', data: screenshotBuffer } });
            contents.push({ text: `TEST IMAGE (Image ${i + 1} from CAPTCHA grid)\n\n${prompt}` });

            const result = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: contents,
            });

            const responseText = result.text.trim();

            if (responseText.toUpperCase().includes('MATCH') && !responseText.toUpperCase().includes('NO MATCH')) {
                console.log(`Image ${i + 1}: ${responseText} ✓`);
                matchingImages.push(i);
            } else {
                console.log(`Image ${i + 1}: ${responseText}`);
            }
        } catch (err) {
            console.log(`Image ${i + 1}: Error - ${err.message}`);
        }
    }

    if (matchingImages.length === 0) {
        console.log('No matches found, retrying with relaxed criteria...');

        const captchaElement = await page.$('.bg-white.rounded-lg.shadow-2xl');
        if (captchaElement) {
            const captchaScreenshot = await captchaElement.screenshot({ encoding: 'base64' });

            const contents = [];
            for (const ref of referenceImages) {
                contents.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
                contents.push({ text: `Reference: ${ref.name}` });
            }
            contents.push({ inlineData: { mimeType: 'image/png', data: captchaScreenshot } });
            contents.push({
                text: `This is a 3x3 CAPTCHA grid (images numbered 1-9, left to right, top to bottom).
There is DEFINITELY at least one match. Find the images MOST LIKELY to be one of the 5 reference people.
The images may be rotated. Look for similar facial features even if not 100% certain.
Return ONLY the numbers separated by commas. Example: 2,5,7` });

            try {
                const result = await ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: contents,
                });

                const responseText = result.text.trim();
                console.log(`Retry response: ${responseText}`);

                const numbers = responseText.split(',')
                    .map(n => parseInt(n.trim()))
                    .filter(n => n >= 1 && n <= 9);

                for (const num of numbers) {
                    if (!matchingImages.includes(num - 1)) {
                        matchingImages.push(num - 1);
                    }
                }
            } catch (err) {
                console.log(`Retry error: ${err.message}`);
            }
        }
    }

    if (matchingImages.length > 0) {
        console.log(`Selecting ${matchingImages.length} images: ${matchingImages.map(i => i + 1).join(', ')}`);
        for (const idx of matchingImages) {
            if (imageContainers[idx]) {
                await imageContainers[idx].click();
                await sleep(50);
            }
        }
    } else {
        console.log('No matches to select');
    }

    await sleep(200);
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes('Verify'));
        if (btn && !btn.disabled) btn.click();
    });
    console.log('Clicked Verify');
    await sleep(1500);
}

async function solveGeminiCaptcha(newPage) {
    const hasCaptcha = await newPage.evaluate(() =>
        document.body.innerText.includes("Verify You're Human")
    );
    if (!hasCaptcha) return;

    console.log('CAPTCHA detected! Solving with Gemini...');
    const captchaElement = await newPage.$('.bg-white.rounded-lg.shadow-2xl');
    if (!captchaElement) return;

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

        const numbers = responseText.split(',')
            .map(n => parseInt(n.trim()))
            .filter(n => n >= 1 && n <= 9);
        console.log(`Selecting images: ${numbers.join(', ')}`);

        const imageContainers = await newPage.$$('.grid.grid-cols-3 > div');
        for (const num of numbers) {
            if (imageContainers[num - 1]) {
                await imageContainers[num - 1].click();
                await sleep(50);
            }
        }

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
// MAIN DROPOUT FLOW
// ============================================================================

async function dropoutFromDeckathon() {
    let browser;

    try {
        console.log('Starting Deckathon Dropout Script\n');
        console.log(`Using credentials: ${CONFIG.NETNAME}`);

        // ====================================================================
        // STEP 1: Connect to browser
        // ====================================================================
        console.log('STEP 1: Connecting to browser...');
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
        // STEP 2: Login with provided credentials
        // ====================================================================
        console.log('STEP 2: Navigating to login page...');
        await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForSelector('#netname', { timeout: 10000 });
        console.log('On login page');

        console.log('STEP 3: Filling login form...');
        await fastType(page, '#netname', CONFIG.NETNAME);
        await fastType(page, '#password', CONFIG.PASSWORD);

        console.log('STEP 4: Submitting login...');
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
            console.log('STEP 5: OTP verification detected...');
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
        console.log('Login complete. Current URL:', await page.url());

        // ====================================================================
        // STEP 6: Drop all enrolled/waitlisted classes
        // ====================================================================
        console.log('STEP 6: Navigating to courses page...');

        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            buttons.find(btn => btn.textContent.includes('Enrollment'))?.click();
        });
        console.log('Clicked Enrollment button');
        await sleep(300);

        await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            links.find(link => link.textContent.includes('Drop Classes'))?.click();
        });
        console.log('Clicked Drop Classes link');
        await sleep(500);

        console.log('STEP 7: Selecting courses...');
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
        // STEP 8: Make payment
        // ====================================================================
        console.log('STEP 8: Navigating to Finance...');
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

        console.log('STEP 9: Looking for balance...');
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

            await page.evaluate((amt) => {
                const input = document.querySelector('#amount');
                if (input) {
                    input.disabled = false;
                    input.value = amt;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, balance);
            console.log(`Entered amount: ${balance}`);

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

            const pagesBefore = await browser.pages();
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                buttons.find(b => b.textContent.trim() === 'Continue' && !b.disabled)?.click();
            });
            console.log('Clicked Continue');
            await sleep(1500);

            // ================================================================
            // STEP 10: Handle payment in new tab
            // ================================================================
            const pagesAfter = await browser.pages();
            if (pagesAfter.length > pagesBefore.length) {
                const newPage = pagesAfter[pagesAfter.length - 1];
                await newPage.bringToFront();
                console.log('STEP 10: Switched to payment tab:', await newPage.url());
                await sleep(1000);

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

                await solveGeminiCaptcha(newPage);
                console.log('Payment flow complete');

                // ============================================================
                // STEP 11: Complete student dropout
                // ============================================================
                console.log('STEP 11: Switching back to main tab...');
                await page.bringToFront();
                await sleep(500);

                console.log('STEP 12: Navigating to Student Dropout...');
                await page.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a'));
                    links.find(l => l.textContent.includes('Student Dropout'))?.click();
                });
                await sleep(500);

                const startClicked = await page.evaluate(() => {
                    const shadowContainer = document.querySelector('.shadow-container');
                    if (shadowContainer?.shadowRoot) {
                        const btn = shadowContainer.shadowRoot.querySelector('.real-dropout-btn');
                        if (btn) { btn.click(); return true; }
                    }
                    const btn = document.querySelector('.real-dropout-btn');
                    if (btn) { btn.click(); return true; }
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const textBtn = buttons.find(b => b.textContent.includes('Start Dropout'));
                    if (textBtn) { textBtn.click(); return true; }
                    return false;
                });
                console.log(startClicked ? 'Clicked Start Dropout Process' : 'Start Dropout button not found');
                await sleep(500);

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

                await naturalMouseMove(page);

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

                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    buttons.find(b => b.textContent.includes('Confirm Dropout'))?.click();
                });
                console.log('STEP 13: Clicked Confirm Dropout');
                await sleep(1000);

                await solveWhiteCaptcha(page);
                console.log('Student Dropout complete');
            }
        }

        await sleep(500);
        console.log('COMPLETE: Dropout process finished successfully!');

    } catch (error) {
        console.error('ERROR:', error.message);
    }

    console.log('Browser kept open for debugging');
}

// Run the script
dropoutFromDeckathon();
