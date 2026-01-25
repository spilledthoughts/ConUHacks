/**
 * Anti-bot module solvers - handles the 12+ anti-bot challenges
 */

const { sleep } = require('./utils');

/**
 * Solve all anti-bot modules that appear before final CAPTCHA
 */
async function solveAntiBotModules(page, maxModules = 20) {
    console.log('Looking for anti-bot modules...');

    let modulesSolved = 0;
    let lastModule = '';
    let sameModuleCount = 0;

    while (modulesSolved < maxModules) {
        await sleep(200);
        const pageText = await page.evaluate(() => document.body.innerText);

        // Check if we've reached the final CAPTCHA
        if (pageText.includes("Verify You're Human") && pageText.includes("Select all")) {
            console.log('Reached final CAPTCHA - stopping');
            break;
        }

        // 1. Verify Email
        if (await handleEmailVerify(page, lastModule, sameModuleCount)) {
            if (lastModule === 'email') {
                sameModuleCount++;
                if (sameModuleCount >= 5) { console.log('Stuck on Verify Email, breaking...'); break; }
            } else { lastModule = 'email'; sameModuleCount = 1; }
            modulesSolved++;
            continue;
        }

        // 2. Please Wait
        if (await handlePleaseWait(page, lastModule, sameModuleCount)) {
            if (lastModule === 'wait') {
                sameModuleCount++;
                if (sameModuleCount >= 5) { console.log('Stuck on Please Wait, breaking...'); break; }
            } else { lastModule = 'wait'; sameModuleCount = 1; }
            modulesSolved++;
            continue;
        }

        // 3. Keyboard Test
        if (await handleKeyboardTest(page)) { modulesSolved++; continue; }

        // 4. Bot Detection
        if (await handleBotDetection(page)) { modulesSolved++; continue; }

        // 5. System Update
        if (await handleSystemUpdate(page)) { modulesSolved++; continue; }

        // 6. Select Location
        if (await handleSelectLocation(page)) { modulesSolved++; continue; }

        // 7. Terms & Conditions
        if (await handleTerms(page)) { modulesSolved++; continue; }

        // 8. Hidden Button
        if (await handleHiddenButton(page, lastModule, sameModuleCount)) {
            if (lastModule === 'hidden') {
                sameModuleCount++;
                if (sameModuleCount >= 5) { console.log('Stuck on Hidden Button, breaking...'); break; }
            } else { lastModule = 'hidden'; sameModuleCount = 1; }
            modulesSolved++;
            continue;
        }

        // 9. Browser Update Required
        if (await handleBrowserUpdate(page)) { modulesSolved++; continue; }

        // 10. Newsletter Subscribe
        if (await handleNewsletter(page)) { modulesSolved++; continue; }

        // 11. Identity Verification
        if (await handleIdentityVerification(page)) { modulesSolved++; continue; }

        // 12. Quick Survey
        if (await handleQuickSurvey(page)) { modulesSolved++; continue; }

        // No module found
        console.log('No known module detected, checking for final CAPTCHA...');
        break;
    }

    console.log(`Solved ${modulesSolved} anti-bot modules`);
    return modulesSolved;
}

// ============================================================================
// Individual module handlers
// ============================================================================

async function handleEmailVerify(page) {
    const hasModule = await page.evaluate(() =>
        document.body.innerText.includes('Verify Your Email') &&
        document.body.innerText.includes('The code is "VERIFY"')
    );
    if (!hasModule) return false;

    console.log('Module: Verify Email');
    await page.evaluate(() => {
        const input = document.querySelector('input[placeholder*="verification"], input[placeholder*="Enter"]');
        if (input) {
            input.value = 'VERIFY';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const btns = Array.from(document.querySelectorAll('button'));
        btns.find(b => b.textContent.includes('Verify') && !b.textContent.includes('Resend'))?.click();
    });
    console.log('Typed VERIFY and clicked button');
    await sleep(500);
    return true;
}

async function handlePleaseWait(page) {
    const hasModule = await page.evaluate(() =>
        document.body.innerText.includes('Please Wait...')
    );
    if (!hasModule) return false;

    console.log('Module: Please Wait...');
    await page.waitForFunction(() => document.body.innerText.includes('100%'), { timeout: 30000 }).catch(() => { });
    await sleep(500);

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
    await sleep(1000);
    return true;
}

async function handleKeyboardTest(page) {
    const hasModule = await page.evaluate(() =>
        document.body.innerText.includes('Keyboard Test') &&
        document.body.innerText.includes('Press any 5 different keys')
    );
    if (!hasModule) return false;

    console.log('Module: Keyboard Test');
    await page.click('.bg-white.border-2.border-green-400');
    await sleep(100);
    for (const key of ['a', 'b', 'c', 'd', 'e']) {
        await page.keyboard.press(key);
        await sleep(100);
    }
    await sleep(300);
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        buttons.find(b => b.textContent.includes('Submit'))?.click();
    });
    await sleep(500);
    return true;
}

async function handleBotDetection(page) {
    const hasModule = await page.evaluate(() =>
        document.body.innerText.includes('Bot Detection') &&
        document.body.innerText.includes('I am a robot')
    );
    if (!hasModule) return false;

    console.log('Module: Bot Detection (NOT checking box)');
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        buttons.find(b => b.textContent.includes('Verify'))?.click();
    });
    await sleep(500);
    return true;
}

async function handleSystemUpdate(page) {
    const hasModule = await page.evaluate(() =>
        document.body.innerText.includes('System Update') &&
        document.body.innerText.includes('Hover:')
    );
    if (!hasModule) return false;

    console.log('Module: System Update (hover game)');
    for (let i = 0; i < 5; i++) {
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
    const redBtn = await page.$('button.bg-red-500');
    if (redBtn) await redBtn.click();
    await sleep(500);
    return true;
}

async function handleSelectLocation(page) {
    const hasModule = await page.evaluate(() =>
        document.body.innerText.includes('Select Your Location') &&
        document.body.innerText.includes('Country')
    );
    if (!hasModule) return false;

    console.log('Module: Select Location');
    await page.select('select:nth-of-type(1)', 'Canada');
    await sleep(500);

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
    await sleep(500);
    return true;
}

async function handleTerms(page) {
    const hasModule = await page.evaluate(() =>
        document.body.innerText.includes('Terms & Conditions') &&
        document.body.innerText.includes('I agree to the terms')
    );
    if (!hasModule) return false;

    console.log('Module: Terms & Conditions');
    await page.evaluate(() => {
        const scrollBox = document.querySelector('.overflow-y-scroll');
        if (scrollBox) scrollBox.scrollTop = scrollBox.scrollHeight;
    });
    await sleep(300);
    await page.evaluate(() => {
        const checkbox = document.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.checked) checkbox.click();
    });
    await sleep(200);
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        buttons.find(b => b.textContent.includes('Accept'))?.click();
    });
    await sleep(500);
    return true;
}

async function handleHiddenButton(page) {
    const hasModule = await page.evaluate(() =>
        document.body.innerText.includes('Important Notice') &&
        document.body.innerText.includes('hidden button')
    );
    if (!hasModule) return false;

    console.log('Module: Hidden Button');
    for (let i = 0; i < 6; i++) {
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            btns.find(b => b.textContent.includes('Hidden'))?.click();
        });
        await sleep(100);
    }
    await sleep(200);
    return true;
}

async function handleBrowserUpdate(page) {
    const hasModule = await page.evaluate(() =>
        document.body.innerText.includes('Browser Update Required') &&
        document.body.innerText.includes('I understand the risks')
    );
    if (!hasModule) return false;

    console.log('Module: Browser Update Required');
    await page.evaluate(() => {
        const checkbox = document.querySelector('input[type="checkbox"]');
        if (checkbox && !checkbox.checked) checkbox.click();
    });
    await sleep(200);
    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        buttons.find(b => b.textContent.includes('Continue Anyway'))?.click();
    });
    await sleep(500);
    return true;
}

async function handleNewsletter(page) {
    const hasModule = await page.evaluate(() =>
        document.body.innerText.includes('Subscribe to Our Newsletter')
    );
    if (!hasModule) return false;

    console.log('Module: Newsletter Subscribe');
    await page.evaluate(() => {
        const input = document.querySelector('input[placeholder*="UNSUBSCRIBE"], input[placeholder*="skip"]');
        if (input) {
            input.value = 'UNSUBSCRIBE';
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const btns = Array.from(document.querySelectorAll('button'));
        btns.find(b => b.textContent.includes('Continue') && !b.textContent.includes('Anyway'))?.click();
    });
    console.log('Typed UNSUBSCRIBE and clicked Continue');
    await sleep(200);
    return true;
}

async function handleIdentityVerification(page) {
    const hasModule = await page.evaluate(() =>
        document.body.innerText.includes('Identity Verification') &&
        document.body.innerText.includes('Social Security')
    );
    if (!hasModule) return false;

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
    await sleep(1000);
    return true;
}

async function handleQuickSurvey(page) {
    const hasModule = await page.evaluate(() =>
        document.body.innerText.includes('Quick Survey') &&
        document.body.innerText.includes('Rate your experience')
    );
    if (!hasModule) return false;

    console.log('Module: Quick Survey');
    const stars = await page.$$('button');
    let starClicked = false;
    for (const star of stars) {
        const text = await page.evaluate(el => el.textContent, star);
        if (text.trim() === '★') {
            await star.click();
            console.log('Clicked star');
            starClicked = true;
            break;
        }
    }
    await sleep(200);
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
    await sleep(300);
    return true;
}

module.exports = { solveAntiBotModules };
