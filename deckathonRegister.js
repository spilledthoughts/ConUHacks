const { connect } = require('puppeteer-real-browser');
const { GoogleGenAI } = require('@google/genai');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    REGISTER_URL: 'https://deckathon-concordia.com/register',
    LOGIN_URL: 'https://deckathon-concordia.com/login',
    CHROME_PATH: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    GEMINI_API_KEY: 'AIzaSyAlFp5vOqtClBReZ5ZoT-fTuKEexYUanWs'
};

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Generate random string for usernames
const generateRandomString = (length = 8) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Generate random full name
const generateRandomName = () => {
    const firstNames = ['John', 'Jane', 'Alex', 'Sam', 'Chris', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Drew', 'Jamie', 'Quinn', 'Skyler'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Thomas', 'Jackson', 'White'];

    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

    return `${firstName} ${lastName}`;
};

// Generate random email
const generateRandomEmail = () => {
    const username = generateRandomString(10) + Math.floor(Math.random() * 999);
    const domains = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com'];
    const domain = domains[Math.floor(Math.random() * domains.length)];
    return `${username}@${domain}`;
};

// Generate random password
const generateRandomPassword = () => {
    const length = 12;
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';

    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    const allChars = uppercase + lowercase + numbers + special;
    for (let i = password.length; i < length; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    return password.split('').sort(() => Math.random() - 0.5).join('');
};

// Fast typing
const fastType = async (page, selector, text) => {
    await page.click(selector);
    await page.type(selector, text, { delay: 5 });
};

// Solve CAPTCHA using center pixel color detection
async function solveCaptcha(page) {
    console.log('🔍 Detecting CAPTCHA...');

    // Check if captcha modal is present
    const hasCaptcha = await page.evaluate(() => {
        return document.body.innerText.includes("Verify You're Human") ||
            document.body.innerText.includes("Select all");
    });

    if (!hasCaptcha) {
        console.log('No CAPTCHA detected');
        return true;
    }

    console.log('🧩 CAPTCHA detected! Solving with pixel detection...');

    // Get the category (what to select)
    const category = await page.evaluate(() => {
        const strongEl = document.querySelector('.bg-primary-50 strong');
        return strongEl ? strongEl.textContent.trim() : 'logos';
    });

    console.log(`📋 Category: Select all "${category}"`);

    // Get all captcha images and check center pixel using screenshots
    const imageContainers = await page.$$('.grid.grid-cols-3 > div');

    // Take all screenshots in parallel for speed
    const screenshotPromises = imageContainers.map(async (container, i) => {
        const img = await container.$('img');
        if (!img) return { index: i, isGrayscale: false };

        try {
            const screenshotData = await img.screenshot();
            const screenshotBuffer = Buffer.from(screenshotData);

            // Use sharp to decode PNG and get actual pixel data
            const { data, info } = await sharp(screenshotBuffer)
                .raw()
                .toBuffer({ resolveWithObject: true });

            // Get center pixel
            const centerX = Math.floor(info.width / 2);
            const centerY = Math.floor(info.height / 2);
            const pixelIndex = (centerY * info.width + centerX) * info.channels;

            const r = data[pixelIndex];
            const g = data[pixelIndex + 1];
            const b = data[pixelIndex + 2];

            // Check if center pixel is very light (white) or very dark (black)
            // Logos typically have white backgrounds or black imagery
            const isVeryLight = r > 220 && g > 220 && b > 220;
            const isVeryDark = r < 50 && g < 50 && b < 50;
            const isLogo = isVeryLight || isVeryDark;

            console.log(`Image ${i + 1}: RGB(${r},${g},${b}) -> ${isLogo ? 'SELECT' : 'skip'}`);
            return { index: i, isGrayscale: isLogo };
        } catch (err) {
            console.log(`Image ${i + 1}: Error - ${err.message}`);
            return { index: i, isGrayscale: false };
        }
    });

    const results = await Promise.all(screenshotPromises);
    const selectedImages = results.filter(r => r.isGrayscale).map(r => r.index + 1);

    console.log(`🎯 Selecting images (grayscale center): ${selectedImages.join(', ') || 'none'}`);

    // Click on the matching images
    for (const num of selectedImages) {
        const index = num - 1;
        if (imageContainers[index]) {
            await imageContainers[index].click();
            await sleep(50);
            console.log(`Clicked image ${num}`);
        }
    }

    // Click verify button
    await sleep(200);
    const verifyBtn = await page.$('button:not([disabled])');
    if (verifyBtn) {
        const btnText = await page.evaluate(el => el.textContent, verifyBtn);
        if (btnText.includes('Verify')) {
            await verifyBtn.click();
            console.log('✅ Clicked Verify button');
            await sleep(500);
            return true;
        }
    }

    return true;
}

/* GEMINI 3 FLASH APPROACH (COMMENTED OUT)
async function solveCaptchaGemini(page) {
    console.log('🔍 Detecting CAPTCHA...');

    const hasCaptcha = await page.evaluate(() => {
        return document.body.innerText.includes("Verify You're Human") ||
            document.body.innerText.includes("Select all");
    });

    if (!hasCaptcha) {
        console.log('No CAPTCHA detected');
        return true;
    }

    console.log('🧩 CAPTCHA detected! Solving with Gemini 3 Flash...');

    const category = await page.evaluate(() => {
        const strongEl = document.querySelector('.bg-primary-50 strong');
        return strongEl ? strongEl.textContent.trim() : 'logos';
    });

    console.log(`📋 Category: Select all "${category}"`);

    const captchaElement = await page.$('.bg-white.rounded-lg.shadow-2xl');
    if (!captchaElement) {
        console.log('Could not find CAPTCHA element');
        return false;
    }

    const screenshotBuffer = await captchaElement.screenshot({ encoding: 'base64' });

    console.log('🤖 Sending to Gemini 3 Flash...');

    const prompt = `You are looking at a CAPTCHA with a 3x3 grid of images (9 images total).
The images are numbered 1-9 from left to right, top to bottom:
1 2 3
4 5 6
7 8 9

The task is: Select all "${category}"

Look at each image and determine which ones match the category "${category}".
Return ONLY the numbers of the matching images, separated by commas.
For example: 1,3,5 or 2,4,6,8

If no images match, return: none
If you're unsure, give your best guess.

IMPORTANT: Return ONLY the numbers, nothing else.`;

    try {
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
                {
                    inlineData: {
                        mimeType: 'image/png',
                        data: screenshotBuffer,
                    },
                },
                { text: prompt }
            ],
        });

        const responseText = result.text.trim();
        console.log(`🤖 Gemini response: ${responseText}`);

        if (responseText.toLowerCase() === 'none') {
            console.log('Gemini says no matches');
            return false;
        }

        const numbers = responseText.split(',').map(n => parseInt(n.trim())).filter(n => n >= 1 && n <= 9);
        console.log(`🎯 Selecting images: ${numbers.join(', ')}`);

        const imageContainers = await page.$$('.grid.grid-cols-3 > div');

        for (const num of numbers) {
            const index = num - 1;
            if (imageContainers[index]) {
                await imageContainers[index].click();
                await sleep(50);
                console.log(`Clicked image ${num}`);
            }
        }

        await sleep(200);
        const verifyBtn = await page.$('button:not([disabled])');
        if (verifyBtn) {
            const btnText = await page.evaluate(el => el.textContent, verifyBtn);
            if (btnText.includes('Verify')) {
                await verifyBtn.click();
                console.log('✅ Clicked Verify button');
                await sleep(500);
                return true;
            }
        }

        return true;
    } catch (error) {
        console.error('Gemini API error:', error.message);
        return false;
    }
}
*/

async function registerOnDeckathon() {
    let browser;

    try {
        console.log('🚀 Starting Deckathon Registration Script\n');

        // Generate random credentials
        const username = generateRandomString(8) + Math.floor(Math.random() * 999);
        const fullName = generateRandomName();
        const email = generateRandomEmail();
        const password = generateRandomPassword();

        console.log('📝 Credentials:', username, '|', fullName, '|', email, '|', password);

        // Connect
        console.log('🌐 Connecting...');
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
            customConfig: {
                chromePath: CONFIG.CHROME_PATH
            },
            connectOption: {
                defaultViewport: { width: 1920, height: 1080 }
            }
        });

        browser = connection.browser;
        const page = connection.page;

        // STEP 1: Go to login page
        console.log('📍 Going to login...');
        await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await sleep(200);

        // STEP 2: Click register link
        console.log('📍 Clicking register link...');
        await sleep(500);
        await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const registerLink = links.find(link =>
                link.href.includes('/register') ||
                link.textContent.toLowerCase().includes('create')
            );
            if (registerLink) registerLink.click();
        });

        // Wait for register page with retry
        try {
            await page.waitForSelector('#username', { timeout: 5000 });
        } catch (e) {
            console.log('⚠️ Retry clicking register link...');
            await page.goto('https://deckathon-concordia.com/register', { waitUntil: 'domcontentloaded', timeout: 10000 });
            await page.waitForSelector('#username', { timeout: 10000 });
        }
        console.log('📍 On register page');

        // STEP 3: Fill registration form
        console.log('📝 Filling registration form...');
        await fastType(page, '#username', username);
        await fastType(page, '#fullName', fullName);
        await fastType(page, '#email', email);
        await fastType(page, '#password', password);
        await fastType(page, '#confirmPassword', password);

        // STEP 4: Submit registration
        console.log('🔘 Submitting registration...');
        await page.evaluate(() => {
            const btn = document.querySelector('button[type="submit"]');
            if (btn) btn.click();
        });

        // Wait and check for CAPTCHA
        await sleep(500);

        // STEP 5: Solve CAPTCHA if present
        await solveCaptcha(page);

        // Wait a moment
        await sleep(500);

        // STEP 6: Navigate to login page
        console.log('📍 Navigating to login page...');
        await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Wait for login form
        await page.waitForSelector('#netname', { timeout: 10000 });
        console.log('📍 On login page');

        // STEP 7: Fill login form
        console.log('📝 Filling login form...');
        await fastType(page, '#netname', username);
        await fastType(page, '#password', password);

        // STEP 8: Submit login
        console.log('🔘 Submitting login...');
        await page.evaluate(() => {
            const btn = document.querySelector('button[type="submit"]');
            if (btn) btn.click();
        });

        // Wait and solve CAPTCHA if present again
        await sleep(500);
        await solveCaptcha(page);

        // STEP 9: Handle OTP verification if present
        await sleep(300);
        const hasOtp = await page.evaluate(() => {
            return document.body.innerText.includes('verification code') ||
                document.querySelector('#otp') !== null;
        });

        if (hasOtp) {
            console.log('🔐 OTP verification detected...');

            // Read the verification code displayed on screen
            const otpCode = await page.evaluate(() => {
                const codeEl = document.querySelector('.text-3xl.font-mono.font-bold');
                return codeEl ? codeEl.textContent.trim() : null;
            });

            if (otpCode) {
                console.log(`🔢 Found OTP code: ${otpCode}`);

                // Enter the code
                await fastType(page, '#otp', otpCode);
                await sleep(100);

                // Click Verify Code button
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const verifyBtn = buttons.find(btn => btn.textContent.includes('Verify Code'));
                    if (verifyBtn && !verifyBtn.disabled) verifyBtn.click();
                });

                console.log('✅ Submitted OTP');
                await sleep(500);
            }
        }

        // Wait for login to complete
        await sleep(300);

        console.log('📍 Final URL:', await page.url());

        // STEP 10: Navigate to courses via Enrollment menu
        console.log('📍 Navigating to courses page via menu...');

        // Click the Enrollment button to expand the menu
        const enrollmentClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const enrollmentBtn = buttons.find(btn => btn.textContent.includes('Enrollment'));
            if (enrollmentBtn) {
                enrollmentBtn.click();
                return true;
            }
            return false;
        });

        if (enrollmentClicked) {
            console.log('✅ Clicked Enrollment button');
            await sleep(300);

            // Click "Enrollment: Drop Classes" link
            const dropClicked = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const dropLink = links.find(link => link.textContent.includes('Drop Classes'));
                if (dropLink) {
                    dropLink.click();
                    return true;
                }
                return false;
            });

            if (dropClicked) {
                console.log('✅ Clicked Drop Classes link');
                await sleep(500);
            }
        } else {
            // Fallback: direct navigation
            await page.goto('https://deckathon-concordia.com/courses', { waitUntil: 'domcontentloaded', timeout: 15000 });
            await sleep(500);
        }

        // Select all enrolled (green) and waitlist (yellow) courses
        console.log('📋 Selecting enrolled and waitlist courses...');
        const selectedCount = await page.evaluate(() => {
            const rows = document.querySelectorAll('tbody tr');
            let count = 0;

            rows.forEach(row => {
                // Check if row has green (enrolled) or yellow (waitlist) icon
                const hasGreen = row.querySelector('.text-green-600');
                const hasYellow = row.querySelector('.text-yellow-600');

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

        console.log(`✅ Selected ${selectedCount} courses`);

        // Click Drop Selected Classes button
        await sleep(1500);
        const dropClicked = await page.evaluate(() => {
            const dropBtn = document.querySelector('button[id^="btn-drop"]');
            if (dropBtn && !dropBtn.disabled) {
                dropBtn.click();
                return true;
            }
            return false;
        });

        if (dropClicked) {
            console.log('🗑️ Clicked Drop Selected Classes');
            await sleep(500);

            // STEP 11: Extract confirmation word and type it
            const confirmWord = await page.evaluate(() => {
                const input = document.querySelector('input[placeholder*="Type"]');
                if (input) {
                    // Extract word from placeholder like "Type 'CONFIRM' here" or "Type 'PROCEED' here"
                    const match = input.placeholder.match(/'([A-Z]+)'/);
                    return match ? match[1] : null;
                }
                return null;
            });

            if (confirmWord) {
                console.log(`📝 Typing ${confirmWord}...`);
                const confirmInput = await page.$('input[placeholder*="Type"]');
                if (confirmInput) {
                    await confirmInput.type(confirmWord, { delay: 5 });
                    await sleep(300);

                    // Click Confirm and Drop button
                    const confirmClicked = await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button'));
                        const confirmBtn = buttons.find(btn => btn.textContent.includes('Confirm and Drop'));
                        if (confirmBtn && !confirmBtn.disabled) {
                            confirmBtn.click();
                            return true;
                        }
                        return false;
                    });

                    if (confirmClicked) {
                        console.log('✅ Clicked Confirm and Drop');
                        await sleep(1000);
                    } else {
                        console.log('⚠️ Confirm button not available');
                    }
                }
            }
        } else {
            console.log('⚠️ Drop button not available');
        }

        // STEP 12: Navigate to Finance -> Make a Payment
        console.log('📍 Navigating to Finance...');
        const financeClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const financeBtn = buttons.find(btn => btn.textContent.includes('Finance'));
            if (financeBtn) {
                financeBtn.click();
                return true;
            }
            return false;
        });

        if (financeClicked) {
            console.log('✅ Clicked Finance button');
            await sleep(300);

            // Click Make a Payment link
            const paymentClicked = await page.evaluate(() => {
                const links = Array.from(document.querySelectorAll('a'));
                const paymentLink = links.find(link => link.textContent.includes('Make a Payment'));
                if (paymentLink) {
                    paymentLink.click();
                    return true;
                }
                return false;
            });

            if (paymentClicked) {
                console.log('✅ Clicked Make a Payment');
                await sleep(500);

                // Click Continue to Payment button
                const continuePaymentClicked = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const btn = buttons.find(b => b.textContent.includes('Continue to Payment'));
                    if (btn && !btn.disabled) {
                        btn.click();
                        return true;
                    }
                    return false;
                });

                if (continuePaymentClicked) {
                    console.log('✅ Clicked Continue to Payment');
                    await sleep(500);

                    // STEP 13: Solve verification sequence (1 → 3 → 8)
                    const sequence = await page.evaluate(() => {
                        const seqEl = document.querySelector('.sequence-display');
                        if (seqEl) {
                            // Extract numbers from "1 → 3 → 8"
                            const text = seqEl.textContent;
                            return text.split('→').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                        }
                        return [];
                    });

                    if (sequence.length > 0) {
                        console.log(`🔢 Clicking sequence: ${sequence.join(' → ')}`);

                        for (const num of sequence) {
                            await page.evaluate((n) => {
                                const buttons = Array.from(document.querySelectorAll('.grid.grid-cols-3 button'));
                                const btn = buttons.find(b => b.textContent.trim() === String(n));
                                if (btn) btn.click();
                            }, num);
                            await sleep(100);
                        }

                        console.log('✅ Sequence completed');
                        await sleep(1000);
                    }

                    // STEP 14: Get balance and enter amount
                    console.log('💰 Looking for balance...');
                    const balance = await page.evaluate(() => {
                        // Try multiple approaches to find the balance

                        // Approach 1: Find by looking for Remaining Balance text
                        const allSpans = document.querySelectorAll('span');
                        for (const span of allSpans) {
                            if (span.textContent.includes('Remaining Balance')) {
                                // Get the next sibling or parent's next element
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

                        // Approach 2: Look for the specific class
                        const balanceEl = document.querySelector('.text-primary-600.font-bold');
                        if (balanceEl) {
                            const match = balanceEl.textContent.match(/\$([\d.]+)/);
                            if (match) return match[1];
                        }

                        // Approach 3: Any element with dollar amount in primary color
                        const primaryEls = document.querySelectorAll('[class*="primary"]');
                        for (const el of primaryEls) {
                            const match = el.textContent.match(/\$([\d.]+)/);
                            if (match && parseFloat(match[1]) > 0) return match[1];
                        }

                        return null;
                    });

                    console.log(`💰 Found balance: ${balance || 'NOT FOUND'}`);

                    if (balance) {
                        console.log(`💰 Balance: $${balance}`);

                        // Enter amount
                        await page.evaluate((amt) => {
                            const input = document.querySelector('#amount');
                            if (input) {
                                input.disabled = false;
                                input.value = amt;
                                input.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        }, balance);

                        console.log(`📝 Entered amount: ${balance}`);

                        // Select CAD from dropdown
                        await page.evaluate(() => {
                            const select = document.querySelector('#currency');
                            if (select) {
                                select.disabled = false;
                                select.value = 'CAD';
                                select.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        });

                        console.log('✅ Selected CAD');
                        await sleep(300);

                        // Click Continue button - may open new tab
                        const pagesBefore = await browser.pages();

                        const continueClicked = await page.evaluate(() => {
                            const buttons = Array.from(document.querySelectorAll('button'));
                            const btn = buttons.find(b => b.textContent.trim() === 'Continue');
                            if (btn && !btn.disabled) {
                                btn.click();
                                return true;
                            }
                            return false;
                        });

                        if (continueClicked) {
                            console.log('✅ Clicked Continue');
                            await sleep(1500);

                            // Check if a new tab was opened
                            const pagesAfter = await browser.pages();
                            if (pagesAfter.length > pagesBefore.length) {
                                // Switch to the new tab
                                const newPage = pagesAfter[pagesAfter.length - 1];
                                await newPage.bringToFront();
                                console.log('📑 Switched to new tab:', await newPage.url());
                                await sleep(1000);

                                // STEP 15: Fill fake card info
                                console.log('💳 Filling card info...');
                                await newPage.type('#card-number', '4532 1234 5678 9012', { delay: 5 });
                                await newPage.type('#cvv', '123', { delay: 5 });
                                await newPage.type('#expiry', '12/28', { delay: 5 });

                                // Click Save Card
                                await newPage.evaluate(() => {
                                    const buttons = Array.from(document.querySelectorAll('button'));
                                    const btn = buttons.find(b => b.textContent.includes('Save Card'));
                                    if (btn) btn.click();
                                });
                                console.log('✅ Clicked Save Card');
                                await sleep(800);

                                // Click Continue
                                await newPage.evaluate(() => {
                                    const buttons = Array.from(document.querySelectorAll('button'));
                                    const btn = buttons.find(b => b.textContent.trim() === 'Continue');
                                    if (btn && !btn.disabled) btn.click();
                                });
                                console.log('✅ Clicked Continue');
                                await sleep(800);

                                // Click Process Payment
                                await newPage.evaluate(() => {
                                    const buttons = Array.from(document.querySelectorAll('button'));
                                    const btn = buttons.find(b => b.textContent.includes('Process Payment'));
                                    if (btn && !btn.disabled) btn.click();
                                });
                                console.log('✅ Clicked Process Payment');
                                await sleep(1000);

                                // STEP 16: Solve CAPTCHA with Gemini (looking for HUMANS, not the misleading prompt)
                                const hasCaptcha = await newPage.evaluate(() => {
                                    return document.body.innerText.includes("Verify You're Human");
                                });

                                if (hasCaptcha) {
                                    console.log('🧩 CAPTCHA detected! Solving with Gemini...');

                                    // Take screenshot of CAPTCHA
                                    const captchaElement = await newPage.$('.bg-white.rounded-lg.shadow-2xl');
                                    if (captchaElement) {
                                        const screenshotBuffer = await captchaElement.screenshot({ encoding: 'base64' });

                                        // Use Gemini to find HUMANS (the prompt is misleading - says sun but wants humans)
                                        const prompt = `You are looking at a CAPTCHA with a 3x3 grid of images (9 images total).
The images are numbered 1-9 from left to right, top to bottom:
1 2 3
4 5 6
7 8 9

IMPORTANT: The CAPTCHA prompt is MISLEADING. It may say "sun" but it actually wants you to find HUMAN BEINGS (people, faces, human figures).

Look at each image and find which ones contain HUMANS or PEOPLE (not the sun).
Return ONLY the numbers of images with humans, separated by commas.
For example: 1,3,5 or 2,4,6,8

IMPORTANT: Return ONLY the numbers, nothing else.`;

                                        try {
                                            const result = await ai.models.generateContent({
                                                model: 'gemini-3-flash-preview',
                                                contents: [
                                                    {
                                                        inlineData: {
                                                            mimeType: 'image/png',
                                                            data: screenshotBuffer,
                                                        },
                                                    },
                                                    { text: prompt }
                                                ],
                                            });

                                            const responseText = result.text.trim();
                                            console.log(`🤖 Gemini response: ${responseText}`);

                                            const numbers = responseText.split(',').map(n => parseInt(n.trim())).filter(n => n >= 1 && n <= 9);
                                            console.log(`🎯 Selecting images: ${numbers.join(', ')}`);

                                            const imageContainers = await newPage.$$('.grid.grid-cols-3 > div');
                                            for (const num of numbers) {
                                                const index = num - 1;
                                                if (imageContainers[index]) {
                                                    await imageContainers[index].click();
                                                    await sleep(50);
                                                }
                                            }

                                            // Click Verify
                                            await sleep(200);
                                            await newPage.evaluate(() => {
                                                const buttons = Array.from(document.querySelectorAll('button'));
                                                const btn = buttons.find(b => b.textContent.includes('Verify'));
                                                if (btn && !btn.disabled) btn.click();
                                            });
                                            console.log('✅ Clicked Verify');
                                            await sleep(1500);

                                        } catch (err) {
                                            console.log('⚠️ Gemini error:', err.message);
                                        }
                                    }
                                }

                                console.log('📑 Payment flow complete');

                                // STEP 17: Switch back to original tab for Student Dropout
                                console.log('📍 Switching back to main tab...');
                                await page.bringToFront();
                                await sleep(500);

                                // Click Student Dropout
                                console.log('📍 Navigating to Student Dropout...');
                                await page.evaluate(() => {
                                    const links = Array.from(document.querySelectorAll('a'));
                                    const link = links.find(l => l.textContent.includes('Student Dropout'));
                                    if (link) link.click();
                                });
                                await sleep(500);

                                // Click Start Dropout Process (may be in shadow DOM)
                                const startClicked = await page.evaluate(() => {
                                    // Try shadow DOM first
                                    const shadowContainer = document.querySelector('.shadow-container');
                                    if (shadowContainer && shadowContainer.shadowRoot) {
                                        const btn = shadowContainer.shadowRoot.querySelector('.real-dropout-btn');
                                        if (btn) {
                                            btn.click();
                                            return true;
                                        }
                                    }
                                    // Fallback to regular DOM
                                    const btn = document.querySelector('.real-dropout-btn');
                                    if (btn) {
                                        btn.click();
                                        return true;
                                    }
                                    // Try finding by text
                                    const buttons = Array.from(document.querySelectorAll('button'));
                                    const textBtn = buttons.find(b => b.textContent.includes('Start Dropout'));
                                    if (textBtn) {
                                        textBtn.click();
                                        return true;
                                    }
                                    return false;
                                });
                                console.log(startClicked ? '✅ Clicked Start Dropout Process' : '⚠️ Start Dropout button not found');
                                await sleep(500);

                                // Select "Academic program not a good fit"
                                await page.evaluate(() => {
                                    const radios = document.querySelectorAll('input[type="radio"]');
                                    for (const radio of radios) {
                                        if (radio.value.includes('Academic program')) {
                                            radio.click();
                                            break;
                                        }
                                    }
                                });
                                console.log('✅ Selected dropout reason');
                                await sleep(300);

                                // Move mouse around naturally like a human for 1s (anti-bot bypass)
                                console.log('🖱️ Moving mouse around naturally...');
                                let currentX = 500, currentY = 400;
                                for (let i = 0; i < 25; i++) {
                                    // Generate smooth movement with some randomness
                                    const targetX = Math.floor(Math.random() * 700) + 150;
                                    const targetY = Math.floor(Math.random() * 500) + 150;

                                    // Move in small steps toward target (bezier-like)
                                    const steps = Math.floor(Math.random() * 3) + 2;
                                    for (let s = 0; s < steps; s++) {
                                        const progress = (s + 1) / steps;
                                        // Ease out curve
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

                                // Click Next button using puppeteer native click
                                console.log('🔍 Looking for Next button...');
                                const nextBtn = await page.$('button.bg-primary-600');
                                if (nextBtn) {
                                    await nextBtn.click();
                                    console.log('✅ Clicked Next');
                                } else {
                                    // Fallback: try via evaluate
                                    await page.evaluate(() => {
                                        const buttons = Array.from(document.querySelectorAll('button'));
                                        const btn = buttons.find(b => {
                                            const span = b.querySelector('span');
                                            return span && span.textContent.trim() === 'Next';
                                        });
                                        if (btn) btn.click();
                                    });
                                    console.log('✅ Clicked Next (fallback)');
                                }
                                await sleep(1000);  // Wait longer for page transition

                                // Check the iframe checkbox
                                console.log('🔍 Looking for iframe checkbox...');
                                const iframeHandle = await page.$('iframe');
                                if (iframeHandle) {
                                    console.log('📋 Found iframe, accessing content...');
                                    const frame = await iframeHandle.contentFrame();
                                    if (frame) {
                                        await frame.evaluate(() => {
                                            const checkbox = document.querySelector('#final-agree');
                                            if (checkbox) checkbox.click();
                                        });
                                        console.log('✅ Checked confirmation checkbox');
                                    } else {
                                        console.log('⚠️ Could not access iframe content');
                                    }
                                } else {
                                    console.log('⚠️ No iframe found');
                                }
                                await sleep(300);

                                // Click Confirm Dropout
                                await page.evaluate(() => {
                                    const buttons = Array.from(document.querySelectorAll('button'));
                                    const btn = buttons.find(b => b.textContent.includes('Confirm Dropout'));
                                    if (btn) btn.click();
                                });
                                console.log('✅ Clicked Confirm Dropout');
                                await sleep(1000);

                                // STEP 18: Final CAPTCHA - select pure white images
                                const hasFinalCaptcha = await page.evaluate(() => {
                                    return document.body.innerText.includes("Verify You're Human");
                                });

                                if (hasFinalCaptcha) {
                                    console.log('🧩 Final CAPTCHA detected! Selecting white images...');

                                    const imageContainers = await page.$$('.grid.grid-cols-3 > div');
                                    const selectedImages = [];

                                    // Check each image for pure white center
                                    for (let i = 0; i < imageContainers.length; i++) {
                                        const container = imageContainers[i];
                                        const img = await container.$('img');

                                        if (img) {
                                            try {
                                                const screenshotData = await img.screenshot();
                                                const screenshotBuffer = Buffer.from(screenshotData);

                                                const { data, info } = await sharp(screenshotBuffer)
                                                    .raw()
                                                    .toBuffer({ resolveWithObject: true });

                                                const centerX = Math.floor(info.width / 2);
                                                const centerY = Math.floor(info.height / 2);
                                                const pixelIndex = (centerY * info.width + centerX) * info.channels;

                                                const r = data[pixelIndex];
                                                const g = data[pixelIndex + 1];
                                                const b = data[pixelIndex + 2];

                                                // Pure white check (all > 240)
                                                const isPureWhite = r > 240 && g > 240 && b > 240;

                                                console.log(`Image ${i + 1}: RGB(${r},${g},${b}) -> ${isPureWhite ? 'SELECT' : 'skip'}`);

                                                if (isPureWhite) {
                                                    selectedImages.push(i);
                                                }
                                            } catch (err) {
                                                console.log(`Image ${i + 1}: Error`);
                                            }
                                        }
                                    }

                                    // Click selected images
                                    for (const idx of selectedImages) {
                                        if (imageContainers[idx]) {
                                            await imageContainers[idx].click();
                                            await sleep(50);
                                        }
                                    }

                                    console.log(`🎯 Selected ${selectedImages.length} white images`);

                                    // Click Verify
                                    await sleep(200);
                                    await page.evaluate(() => {
                                        const buttons = Array.from(document.querySelectorAll('button'));
                                        const btn = buttons.find(b => b.textContent.includes('Verify'));
                                        if (btn && !btn.disabled) btn.click();
                                    });
                                    console.log('✅ Clicked Verify');
                                    await sleep(1500);
                                }

                                console.log('🎓 Student Dropout complete');
                            }
                        } else {
                            console.log('⚠️ Continue button not available');
                        }
                    } else {
                        console.log('⚠️ Balance not found on page');
                    }
                } else {
                    console.log('⚠️ Continue to Payment button not available');
                }
            } else {
                console.log('⚠️ Make a Payment link not found');
            }
        } else {
            console.log('⚠️ Finance button not found');
        }

        // Save credentials
        const credentialsPath = path.join(__dirname, 'data', 'deckathon_credentials.json');
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

        let credentials = [];
        if (fs.existsSync(credentialsPath)) {
            try { credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8')); } catch (e) { }
        }

        credentials.push({ username, fullName, email, password, timestamp: new Date().toISOString() });
        fs.writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2));
        console.log('💾 Saved credentials');

        // Brief pause to see result
        await sleep(500);

        console.log('✅ Done!');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        // Keep browser open for debugging
        console.log('� Browser kept open for debugging');
    }
}

// Run
registerOnDeckathon();

module.exports = registerOnDeckathon;
