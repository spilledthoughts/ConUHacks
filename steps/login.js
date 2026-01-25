/**
 * Login step - handles authentication and OTP verification
 */

const { sleep, fastType } = require('./utils');

/**
 * Perform login with human-like mouse movements and typing
 */
async function performLogin(page, username, password, CONFIG) {
    console.log('Navigating to login page...');
    await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('#netname', { timeout: 10000 });
    console.log('On login page');

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
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
        const btnBox = await submitBtn.boundingBox();
        await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2, { steps: 10 });
        await sleep(200);
    }
    await page.evaluate(() => document.querySelector('button[type="submit"]')?.click());
    await sleep(200);
    await page.evaluate(() => document.querySelector('button[type="submit"]')?.click());
    await sleep(200);
}

/**
 * Handle OTP verification if detected
 */
async function handleOTP(page) {
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
}

module.exports = { performLogin, handleOTP };
