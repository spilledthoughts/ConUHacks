/**
 * CAPTCHA solving functions - pixel detection and Gemini AI
 */

const { sleep, getSharp } = require('./utils');

// Lazy AI initialization
let _ai = null;
const getAI = (apiKey) => {
    if (!_ai) {
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY is not set.');
        }
        const { GoogleGenAI } = require('@google/genai');
        _ai = new GoogleGenAI({ apiKey });
    }
    return _ai;
};

/**
 * Solve login CAPTCHA using center pixel color detection
 * Identifies logos by checking if center pixel is very light (white) or very dark (black)
 */
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
            const { data, info } = await getSharp()(Buffer.from(screenshotData))
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
            await sleep(20);
        }
    }

    await sleep(100);
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes('Verify'));
        if (btn && !btn.disabled) btn.click();
    });
    console.log('Clicked Verify button');
    await sleep(200);
    return true;
}

/**
 * Solve payment CAPTCHA using Gemini AI vision
 */
async function solveGeminiCaptcha(newPage, apiKey) {
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
        const ai = getAI(apiKey);
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
                { inlineData: { mimeType: 'image/png', data: screenshotBuffer } },
                { text: prompt }
            ],
        });

        const responseText = result.text.trim();
        console.log(`Gemini response: ${responseText}`);

        const lines = responseText.split('\n').filter(l => l.trim());
        const lastLine = lines[lines.length - 1] || '';
        let numbers = lastLine.match(/\d+/g)?.map(n => parseInt(n)).filter(n => n >= 1 && n <= 9) || [];

        if (numbers.length === 0) {
            const matches = responseText.match(/\b([1-9])\b/g);
            if (matches) {
                numbers = [...new Set(matches.map(n => parseInt(n)))];
            }
        }

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

module.exports = { solveCaptcha, solveGeminiCaptcha };
