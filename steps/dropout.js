/**
 * Dropout step - start dropout, fill forms, solve final CAPTCHA
 */

const { sleep, naturalMouseMove, wildMouseMovement } = require('./utils');

const BACKEND_URL = 'https://hackathon-backend-326152168.us-east4.run.app';

/**
 * Navigate to student dropout and start the process
 */
async function startDropout(page, browser) {
    console.log('Ensuring we are on Student Dropout page...');
    await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a'));
        links.find(l => l.textContent.includes('Student Dropout'))?.click();
    });
    await sleep(500);

    // Click Start Dropout (may be in shadow DOM)
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
}

/**
 * Fill dropout reason form with anti-bot bypass movements
 */
async function selectDropoutReason(page, browser) {
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

    // Natural mouse movement
    await naturalMouseMove(page);

    // Wild mouse movements for anti-bot
    await wildMouseMovement(page, 2000);

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

    const otherInput = await page.$('input[placeholder*="specify"], input[placeholder*="Please"], textarea');
    if (otherInput) {
        await otherInput.click();
        const randomText = Array.from({ length: 50 }, () =>
            String.fromCharCode(97 + Math.floor(Math.random() * 26))
        ).join('');
        await otherInput.type(randomText, { delay: 10 });
    }

    // Open blank tab, wait 11s, return (anti-bot timing check)
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
}

/**
 * Get auth token from page for API calls
 */
async function getAuthToken(page) {
    let authToken = await page.evaluate(() => {
        const match = document.cookie.match(/auth_token=([^;]+)/);
        if (match) return match[1];
        const lsToken = localStorage.getItem('auth_token') || localStorage.getItem('token');
        if (lsToken) return lsToken;
        return null;
    });

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
    }

    return authToken;
}

/**
 * Complete final steps: iframe checkbox, confirm dropout, brute force CAPTCHA
 */
async function completeFinalDropout(page, authToken) {
    // Click iframe checkbox
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

    // Click Confirm Dropout
    await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.textContent.includes('Confirm Dropout'));
        if (btn) btn.click();
    });
    console.log('Clicked Confirm Dropout');
    await sleep(1000);

    if (!authToken) {
        return { success: false, error: 'No auth token' };
    }

    // Brute force CAPTCHA attack
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

        // Brute force all 512 combinations
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
    } else {
        console.log('Dropout failed:', result.error);
        if (result.data) console.log('Details:', JSON.stringify(result.data));
    }

    // Refresh page
    await page.reload({ waitUntil: 'domcontentloaded' });
    console.log('Page refreshed');

    return result;
}

module.exports = {
    startDropout,
    selectDropoutReason,
    getAuthToken,
    completeFinalDropout
};
