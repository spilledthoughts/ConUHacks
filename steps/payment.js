/**
 * Payment step - navigate to finance, fill card details, process payment
 */

const { sleep, bezierMoveAndClick, closePaymentTabs, checkRemainingBalance } = require('./utils');
const { solveGeminiCaptcha } = require('./captcha');

/**
 * Navigate to finance and click Make a Payment
 */
async function navigateToPayment(page) {
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
    await sleep(250);
}

/**
 * Handle the slide-to-confirm modal
 */
async function handleSliderModal(page) {
    console.log('Looking for slide to confirm modal...');
    const sliderHandle = await page.$('.slider-handle');
    if (sliderHandle) {
        console.log('Found slider - dragging...');
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                const sliderContainer = await page.$('.slider-container');
                if (sliderContainer) {
                    const containerBox = await sliderContainer.boundingBox();
                    const handleBox = await sliderHandle.boundingBox();
                    if (containerBox && handleBox) {
                        const startX = handleBox.x + handleBox.width / 2;
                        const startY = handleBox.y + handleBox.height / 2;
                        const endX = containerBox.x + containerBox.width - 10;

                        await page.mouse.move(startX, startY);
                        await page.mouse.down();
                        await sleep(50);
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
}

/**
 * Solve number sequence verification
 */
async function handleSequenceVerification(page) {
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
}

/**
 * Fill card details and process payment in new tab
 */
async function fillCardAndProcess(browser, page, newPage, apiKey) {
    console.log('Filling card info (slowly to avoid bot detection)...');

    // Wait before starting to fill form
    await sleep(2000);

    // Card number field
    const cardNumField = await newPage.$('#card-number');
    if (cardNumField) {
        const box = await cardNumField.boundingBox();
        await newPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });
        await sleep(500);
        await cardNumField.click();
        await sleep(800);
        // Type slower - 80-120ms per character
        for (const char of '4532 1234 5678 9012') {
            await newPage.keyboard.type(char, { delay: 80 + Math.random() * 40 });
        }
    }
    await sleep(1500);  // Wait between fields

    // CVV field - move mouse naturally
    const cvvField = await newPage.$('#cvv');
    if (cvvField) {
        const box = await cvvField.boundingBox();
        await newPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
        await sleep(400);
        await cvvField.click();
        await sleep(600);
        for (const char of '123') {
            await newPage.keyboard.type(char, { delay: 100 + Math.random() * 50 });
        }
    }
    await sleep(1500);

    // Expiry field
    const expiryField = await newPage.$('#expiry');
    if (expiryField) {
        const box = await expiryField.boundingBox();
        await newPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
        await sleep(400);
        await expiryField.click();
        await sleep(600);
        for (const char of '12/28') {
            await newPage.keyboard.type(char, { delay: 90 + Math.random() * 40 });
        }
    }

    // Wait before clicking Save Card
    console.log('Waiting before Save Card...');
    await sleep(3000);

    // Mouse wander before Save Card
    for (let i = 0; i < 3; i++) {
        await newPage.mouse.move(300 + Math.random() * 300, 350 + Math.random() * 100, { steps: 8 });
        await sleep(500);
    }

    // Click Save Card with bezier movement
    const allBtns = await newPage.$$('button');
    for (const btn of allBtns) {
        const text = await newPage.evaluate(el => el.textContent, btn);
        if (text.includes('Save Card')) {
            const box = await btn.boundingBox();
            await newPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });
            await sleep(500);
            break;
        }
    }

    await newPage.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        buttons.find(b => b.textContent.includes('Save Card'))?.click();
    });
    console.log('Clicked Save Card');

    // Wait with mouse movements
    for (let i = 0; i < 6; i++) {
        await sleep(1000);
        await newPage.mouse.move(400 + Math.random() * 200, 300 + Math.random() * 100, { steps: 5 });
    }

    // Click Save Card again
    await newPage.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        buttons.find(b => b.textContent.includes('Save Card'))?.click();
    });
    console.log('Clicked Save Card again');
    await sleep(300);

    // Click Continue
    console.log('Looking for Continue button...');
    const continueClicked = await newPage.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const btn = buttons.find(b => b.textContent.includes('Continue') && !b.disabled);
        if (btn) { btn.click(); return true; }
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

    // Wait longer and do mouse movements before Process Payment (anti-bot)
    console.log('Waiting before Process Payment...');
    await sleep(2000);
    for (let i = 0; i < 5; i++) {
        await newPage.mouse.move(300 + Math.random() * 400, 200 + Math.random() * 300, { steps: 8 });
        await sleep(400 + Math.random() * 300);
    }

    // Process Payment - first click
    await bezierMoveAndClick(newPage, 'Process Payment');
    console.log('Clicked Process Payment');
    await sleep(10000);  // Increased from 8200ms

    // More mouse movement before second click
    for (let i = 0; i < 3; i++) {
        await newPage.mouse.move(400 + Math.random() * 300, 300 + Math.random() * 200, { steps: 5 });
        await sleep(500);
    }

    await bezierMoveAndClick(newPage, 'Process Payment');
    console.log('Clicked Process Payment again');
    await sleep(2000);  // Increased from 1000ms

    // Check for CAPTCHA
    let hasCaptcha = await newPage.evaluate(() =>
        document.body.innerText.includes("Verify You're Human")
    );
    if (!hasCaptcha) {
        console.log('CAPTCHA not detected, waiting more...');
        await sleep(8000);  // Increased from 7500ms

        // More mouse movement
        for (let i = 0; i < 3; i++) {
            await newPage.mouse.move(350 + Math.random() * 300, 250 + Math.random() * 200, { steps: 5 });
            await sleep(400);
        }

        await bezierMoveAndClick(newPage, 'Process Payment');
        console.log('Clicked Process Payment (third attempt)');
        await sleep(2000);
    }

    // Solve payment CAPTCHA
    await solveGeminiCaptcha(newPage, apiKey);
    console.log('Payment flow complete');
}

/**
 * Full payment flow with retry loop
 */
async function handlePaymentFlow(browser, page, apiKey, maxRetries = 3) {
    await navigateToPayment(page);
    await handleSliderModal(page);
    await handleSequenceVerification(page);

    let paymentVerified = false;

    for (let attempt = 1; attempt <= maxRetries && !paymentVerified; attempt++) {
        if (attempt > 1) {
            console.log(`\nPAYMENT RETRY (Attempt ${attempt}/${maxRetries})`);
            await closePaymentTabs(browser, page);

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

        // Get balance and enter payment amount
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

            // Click Continue (opens new tab)
            const pagesBefore = await browser.pages();
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                buttons.find(b => b.textContent.trim() === 'Continue' && !b.disabled)?.click();
            });
            console.log('Clicked Continue');
            await sleep(1500);

            const pagesAfter = await browser.pages();
            if (pagesAfter.length > pagesBefore.length) {
                const newPage = pagesAfter[pagesAfter.length - 1];
                await newPage.bringToFront();
                console.log('Switched to new tab:', await newPage.url());
                await sleep(1000);

                await fillCardAndProcess(browser, page, newPage, apiKey);

                // Switch back and verify
                console.log('Switching back to main tab...');
                await page.bringToFront();
                await sleep(500);

                console.log('Navigating to Student Dropout...');
                await page.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a'));
                    links.find(l => l.textContent.includes('Student Dropout'))?.click();
                });
                await sleep(1000);

                const hasUnpaidBalance = await checkRemainingBalance(page);
                if (hasUnpaidBalance) {
                    console.log('⚠️ Payment not completed - balance still unpaid');
                    if (attempt < maxRetries) {
                        console.log('Will retry payment...');
                        continue;
                    } else {
                        console.log('❌ Max payment attempts reached - proceeding anyway');
                    }
                } else {
                    console.log('✅ Payment verified - proceeding with dropout');
                }

                paymentVerified = true;
                break;
            }
        }
    }

    return paymentVerified;
}

module.exports = {
    navigateToPayment,
    handleSliderModal,
    handleSequenceVerification,
    fillCardAndProcess,
    handlePaymentFlow
};
