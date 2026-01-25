/**
 * Shared utility functions for step modules
 */

// Lazy-load sharp to avoid breaking if not installed
let _sharp = null;
const getSharp = () => {
    if (!_sharp) _sharp = require('sharp');
    return _sharp;
};

// ============================================================================
// TIMING & HELPERS
// ============================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const fastType = async (page, selector, text) => {
    await page.click(selector);
    await page.type(selector, text, { delay: 5 });
};

// ============================================================================
// RANDOM GENERATORS
// ============================================================================

const generateRandomString = (length = 8) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

const generateRandomName = () => {
    const firstNames = ['John', 'Jane', 'Alex', 'Sam', 'Chris', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Drew', 'Jamie', 'Quinn', 'Skyler'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Thomas', 'Jackson', 'White'];
    return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
};

const generateRandomEmail = () => {
    const username = generateRandomString(10) + Math.floor(Math.random() * 999);
    const domains = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com'];
    return `${username}@${domains[Math.floor(Math.random() * domains.length)]}`;
};

const generateRandomPassword = () => {
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
    for (let i = password.length; i < 12; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    return password.split('').sort(() => Math.random() - 0.5).join('');
};

// ============================================================================
// MOUSE MOVEMENT (Anti-Bot)
// ============================================================================

let lastMouseX = 500;
let lastMouseY = 400;

async function naturalMouseMove(page) {
    console.log('Moving mouse naturally...');
    let currentX = 500, currentY = 400;

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

async function bezierMoveAndClick(page, buttonText) {
    // First check if button exists
    const buttonExists = await page.evaluate((text) => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.some(b => b.textContent.includes(text) && !b.disabled);
    }, buttonText);

    if (!buttonExists) {
        console.log(`Button "${buttonText}" not found`);
        return false;
    }

    // Get the button element
    const button = await page.$(`button:not(:disabled)`);
    const buttons = await page.$$('button');
    let targetBtn = null;

    for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        const disabled = await page.evaluate(el => el.disabled, btn);
        if (text.includes(buttonText) && !disabled) {
            targetBtn = btn;
            break;
        }
    }

    if (!targetBtn) {
        console.log(`Button "${buttonText}" not found (second check)`);
        return false;
    }

    const box = await targetBtn.boundingBox();
    if (!box) {
        console.log(`Button "${buttonText}" has no bounding box`);
        return false;
    }

    const targetX = box.x + box.width / 2;
    const targetY = box.y + box.height / 2;

    // Create bezier curve with random control point
    const ctrlX = (lastMouseX + targetX) / 2 + (Math.random() - 0.5) * 200;
    const ctrlY = (lastMouseY + targetY) / 2 + (Math.random() - 0.5) * 200;

    const steps = 15 + Math.floor(Math.random() * 10);
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.pow(1 - t, 2) * lastMouseX + 2 * (1 - t) * t * ctrlX + Math.pow(t, 2) * targetX;
        const y = Math.pow(1 - t, 2) * lastMouseY + 2 * (1 - t) * t * ctrlY + Math.pow(t, 2) * targetY;
        await page.mouse.move(x, y);
        await sleep(10 + Math.random() * 15);
    }

    lastMouseX = targetX;
    lastMouseY = targetY;
    await sleep(50 + Math.random() * 100);
    await page.mouse.click(targetX, targetY);
    return true;
}

async function wildMouseMovement(page, durationMs = 2000) {
    console.log('Moving mouse wildly...');
    const startTime = Date.now();
    while (Date.now() - startTime < durationMs) {
        await page.mouse.move(
            100 + Math.random() * 1600,
            100 + Math.random() * 800,
            { steps: 3 }
        );
        await sleep(50);
    }
}

// ============================================================================
// BROWSER HELPERS
// ============================================================================

async function closePaymentTabs(browser, mainPage) {
    const pages = await browser.pages();
    let closed = 0;
    for (const p of pages) {
        if (p !== mainPage) {
            const url = await p.url();
            if (url.includes('payment') || url.includes('checkout') || url.includes('stripe')) {
                await p.close();
                closed++;
            }
        }
    }
    if (closed > 0) console.log(`Closed ${closed} payment tabs`);
    return closed;
}

async function checkRemainingBalance(page) {
    const balanceInfo = await page.evaluate(() => {
        const text = document.body.innerText;
        const balanceMatch = text.match(/(?:Remaining Balance|Balance Due)[:\s]*\$?([\d.]+)/i);
        if (balanceMatch) {
            const amount = parseFloat(balanceMatch[1]);
            return { found: true, amount, hasBalance: amount > 0 };
        }
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

module.exports = {
    sleep,
    fastType,
    generateRandomString,
    generateRandomName,
    generateRandomEmail,
    generateRandomPassword,
    naturalMouseMove,
    bezierMoveAndClick,
    wildMouseMovement,
    closePaymentTabs,
    checkRemainingBalance,
    getSharp
};
