/**
 * VISION-FIRST AI Browser Automation
 * 
 * This script works on ANY site by:
 * 1. Annotating all clickable elements with numbered labels
 * 2. Taking a screenshot showing the labels
 * 3. AI picks which label number to interact with
 * 
 * The flow is defined at high level, AI figures out execution on any UI.
 */

const { connect } = require('puppeteer-real-browser');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CONFIG = {
    START_URL: 'https://deckathon-concordia.com/login',
    CHROME_PATH: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
};

const ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// ANNOTATION SYSTEM - Overlay numbers on all interactive elements
// ============================================================================

/**
 * Add numbered labels to all interactive elements on the page
 * Returns array of element info with their assigned numbers
 */
async function annotateElements(page) {
    return await page.evaluate(() => {
        // Remove any existing annotations
        document.querySelectorAll('.ai-annotation').forEach(el => el.remove());

        const elements = [];
        const selectors = 'button, a, input, select, textarea, [role="button"], [onclick], img[onclick], .cursor-pointer';

        document.querySelectorAll(selectors).forEach((el, index) => {
            const rect = el.getBoundingClientRect();

            // Skip invisible or tiny elements
            if (rect.width < 10 || rect.height < 10 || rect.top < 0 || rect.left < 0) return;
            if (el.offsetParent === null && el.tagName !== 'BODY') return;

            const num = elements.length + 1;

            // Create annotation label
            const label = document.createElement('div');
            label.className = 'ai-annotation';
            label.textContent = num;
            label.style.cssText = `
                position: fixed;
                left: ${Math.max(0, rect.left - 5)}px;
                top: ${Math.max(0, rect.top - 5)}px;
                background: #ff0000;
                color: white;
                font-size: 12px;
                font-weight: bold;
                padding: 2px 5px;
                border-radius: 3px;
                z-index: 999999;
                pointer-events: none;
                font-family: Arial, sans-serif;
            `;
            document.body.appendChild(label);

            // Collect element info
            elements.push({
                num,
                tag: el.tagName.toLowerCase(),
                type: el.type || '',
                text: (el.textContent || el.value || el.placeholder || el.alt || '').trim().substring(0, 50),
                id: el.id,
                checked: el.type === 'checkbox' ? el.checked : undefined,
                rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
            });
        });

        return elements;
    });
}

/**
 * Remove all annotation labels
 */
async function clearAnnotations(page) {
    await page.evaluate(() => {
        document.querySelectorAll('.ai-annotation').forEach(el => el.remove());
    });
}

/**
 * Click element by its annotation number
 */
async function clickAnnotatedElement(page, num, elements) {
    const element = elements.find(e => e.num === num);
    if (!element) {
        console.log(`Element ${num} not found`);
        return false;
    }

    // Click at center of element
    const x = element.rect.x + element.rect.width / 2;
    const y = element.rect.y + element.rect.height / 2;

    await clearAnnotations(page);
    await page.mouse.click(x, y);
    console.log(`Clicked element ${num} at (${x}, ${y})`);
    return true;
}

/**
 * Type into element by annotation number
 */
async function typeInAnnotatedElement(page, num, text, elements) {
    const element = elements.find(e => e.num === num);
    if (!element) {
        console.log(`Element ${num} not found`);
        return false;
    }

    const x = element.rect.x + element.rect.width / 2;
    const y = element.rect.y + element.rect.height / 2;

    await clearAnnotations(page);
    await page.mouse.click(x, y);
    await sleep(100);

    // Clear existing value and type new one
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.type(text, { delay: 20 });

    console.log(`Typed "${text}" into element ${num}`);
    return true;
}

// ============================================================================
// AI DECISION ENGINE
// ============================================================================

async function askAI(screenshot, prompt) {
    try {
        const result = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [
                { inlineData: { mimeType: 'image/png', data: screenshot } },
                { text: prompt }
            ],
        });
        return result.text.trim();
    } catch (err) {
        console.log('AI error:', err.message);
        return null;
    }
}

async function aiDecide(page, goal, context = {}, previousActions = []) {
    // Add annotations to page
    const elements = await annotateElements(page);
    await sleep(200);

    // Take screenshot WITH annotations visible
    const screenshot = await page.screenshot({ encoding: 'base64' });

    const actionsNote = previousActions.length > 0
        ? `\nPREVIOUS ACTIONS (do not repeat):\n${previousActions.map(a => `- ${a}`).join('\n')}`
        : '';

    const elementsInfo = elements.map(e =>
        `[${e.num}] ${e.tag}${e.type ? `(${e.type})` : ''}: "${e.text}"${e.checked !== undefined ? ` checked=${e.checked}` : ''}`
    ).join('\n');

    const prompt = `You are an AI browser automation agent. Look at this screenshot - each interactive element has a RED numbered label.

CURRENT GOAL: ${goal}
${actionsNote}

CONTEXT: ${JSON.stringify(context)}

ANNOTATED ELEMENTS ON SCREEN:
${elementsInfo}

Based on what you SEE in the screenshot (the numbered red labels), decide the next action.

Return a JSON object with ONE of these actions:
- { "action": "click", "element": N, "reason": "why" } - click element with label N
- { "action": "type", "element": N, "text": "value", "reason": "why" } - type into element N
- { "action": "done", "reason": "goal achieved" } - goal is complete
- { "action": "scroll", "direction": "down" or "up", "reason": "why" } - scroll to see more

RULES:
1. LOOK at the screenshot to understand the page visually
2. Match what you see with the numbered labels
3. If goal is already achieved, return "done"
4. Don't click already-checked checkboxes to select them
5. If you can't find what you need, try scrolling

Return ONLY valid JSON, no markdown.`;

    const response = await askAI(screenshot, prompt);

    // Clear annotations after screenshot
    await clearAnnotations(page);

    if (!response) return null;

    try {
        let json = response;
        if (json.startsWith('```')) {
            json = json.replace(/```json?\n?/g, '').replace(/```/g, '');
        }
        const action = JSON.parse(json);
        action.elements = elements; // Attach for execution
        return action;
    } catch (err) {
        console.log('Failed to parse:', response);
        return null;
    }
}

// ============================================================================
// ACTION EXECUTOR
// ============================================================================

async function executeAction(page, action) {
    console.log(`Action: ${action.action} - ${action.reason || ''}`);

    switch (action.action) {
        case 'click':
            await clickAnnotatedElement(page, action.element, action.elements);
            break;

        case 'type':
            await typeInAnnotatedElement(page, action.element, action.text, action.elements);
            break;

        case 'scroll':
            const scrollAmount = action.direction === 'up' ? -400 : 400;
            await page.evaluate((y) => window.scrollBy(0, y), scrollAmount);
            console.log(`Scrolled ${action.direction}`);
            break;

        case 'done':
            return 'done';
    }

    await sleep(500);
    return 'continue';
}

// ============================================================================
// TASK DEFINITIONS - High level flow that works on any similar site
// ============================================================================

const TASKS = [
    {
        name: 'Go to Registration',
        goal: 'Find and click any "register", "create account", or "sign up" link/button',
        maxActions: 5
    },
    {
        name: 'Fill Registration',
        goal: 'Fill in the registration form with: username=${credentials.username}, full name=${credentials.fullName}, email=${credentials.email}, password=${credentials.password}, confirm password=${credentials.password}. Then submit.',
        maxActions: 12,
        useCredentials: true
    },
    {
        name: 'Handle CAPTCHA/Verification',
        goal: 'If there is any image CAPTCHA, select appropriate images and verify. If there is a verification code displayed, copy it to the input. If neither, mark done.',
        maxActions: 10
    },
    {
        name: 'Login',
        goal: 'If not logged in, fill login form with username=${credentials.username} and password=${credentials.password}, then submit. If already logged in (see dashboard/menu), mark done.',
        maxActions: 8,
        useCredentials: true
    },
    {
        name: 'Handle Post-Login Verification',
        goal: 'Handle any CAPTCHA, OTP, or verification required after login. If none, mark done.',
        maxActions: 10
    },
    {
        name: 'Navigate to Drop Classes',
        goal: 'Find and access the course dropping/enrollment modification section. Look for Enrollment, Drop, Classes, Courses menus.',
        maxActions: 6
    },
    {
        name: 'Drop All Courses',
        goal: 'Select ALL courses/classes available for dropping by clicking their checkboxes (only unchecked ones). Then click Drop/Remove button.',
        maxActions: 15
    },
    {
        name: 'Confirm Course Drop',
        goal: 'If there is a confirmation dialog, type any required confirmation text and confirm. If no confirmation needed, mark done.',
        maxActions: 5
    },
    {
        name: 'Navigate to Payment',
        goal: 'Find and access the payment/finance section. Look for Finance, Payment, Pay, Balance menus.',
        maxActions: 6
    },
    {
        name: 'Initiate Payment',
        goal: 'Click any "Continue to Payment", "Pay Now", "Make Payment" buttons. Enter amount if required (use balance shown).',
        maxActions: 8
    },
    {
        name: 'Complete Number Verification',
        goal: 'If there is a number sequence to click (like 1->3->8), click them in order. If no such verification, mark done.',
        maxActions: 10
    },
    {
        name: 'Enter Card Details',
        goal: 'Fill payment form: card number=4532123456789012, CVV=123, expiry=12/28. Click Save/Continue/Submit buttons.',
        maxActions: 12
    },
    {
        name: 'Handle Payment CAPTCHA',
        goal: 'If there is a CAPTCHA, solve it (for "humans" CAPTCHA, select images with people). If none, mark done.',
        maxActions: 10
    },
    {
        name: 'Navigate to Dropout',
        goal: 'Find and access the student dropout/withdrawal section in the menu.',
        maxActions: 6
    },
    {
        name: 'Start Dropout Process',
        goal: 'Click "Start Dropout", "Begin Withdrawal", or similar button to start the process.',
        maxActions: 3
    },
    {
        name: 'Complete Dropout Form',
        goal: 'Select a dropout reason (prefer "Academic program not a good fit" or similar), click Next/Continue, check any confirmation checkboxes, and confirm dropout.',
        maxActions: 10
    },
    {
        name: 'Handle Final Verification',
        goal: 'If there is a final CAPTCHA (select white images, or other), solve it and verify. If none, mark done.',
        maxActions: 10
    }
];

// ============================================================================
// CREDENTIAL GENERATOR
// ============================================================================

function generateCredentials() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const randomStr = (len) => Array(len).fill().map(() => chars[Math.floor(Math.random() * chars.length)]).join('');

    const firstNames = ['John', 'Jane', 'Alex', 'Sam', 'Chris', 'Jordan', 'Taylor', 'Riley', 'Morgan', 'Skyler'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson'];
    const domains = ['gmail.com', 'outlook.com', 'yahoo.com', 'hotmail.com'];

    return {
        username: randomStr(8) + Math.floor(Math.random() * 999),
        fullName: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
        email: `${randomStr(10)}${Math.floor(Math.random() * 999)}@${domains[Math.floor(Math.random() * domains.length)]}`,
        password: randomStr(4).toUpperCase() + randomStr(4) + Math.floor(Math.random() * 99) + '!@'
    };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runVisionAutomation() {
    console.log('='.repeat(60));
    console.log('VISION-FIRST AI AUTOMATION');
    console.log('Works on ANY site with similar flow');
    console.log('='.repeat(60));

    const credentials = generateCredentials();
    console.log('\nCredentials:', credentials);

    const connection = await connect({
        headless: false,
        fingerprint: false,
        turnstile: true,
        tf: true,
        args: ['--window-size=1400,900', '--disable-blink-features=AutomationControlled'],
        customConfig: { chromePath: CONFIG.CHROME_PATH },
        connectOption: { defaultViewport: { width: 1400, height: 900 } }
    });

    const browser = connection.browser;
    let page = connection.page;

    await page.goto(CONFIG.START_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(1500);

    for (const task of TASKS) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`TASK: ${task.name}`);
        console.log('='.repeat(60));

        // Replace credential placeholders in goal
        let goal = task.goal;
        if (task.useCredentials) {
            goal = goal.replace(/\$\{credentials\.(\w+)\}/g, (match, key) => credentials[key] || match);
        }
        console.log(`Goal: ${goal}\n`);

        const context = { credentials };
        let previousActions = [];
        let actionCount = 0;

        while (actionCount < task.maxActions) {
            // Switch to most recent tab
            const pages = await browser.pages();
            page = pages[pages.length - 1];
            await page.bringToFront();

            const action = await aiDecide(page, goal, context, previousActions);

            if (!action) {
                console.log('No action returned, moving on');
                break;
            }

            console.log(`[${actionCount + 1}] ${action.action}: element ${action.element || ''} - ${action.reason}`);

            const result = await executeAction(page, action);
            previousActions.push(`${action.action} element ${action.element || ''}: ${action.reason}`);

            if (result === 'done') {
                console.log('Task complete!');
                break;
            }

            actionCount++;
            await sleep(400);
        }

        if (actionCount >= task.maxActions) {
            console.log('Max actions reached');
        }

        await sleep(600);
    }

    // Save credentials
    const credPath = path.join(__dirname, 'data', 'vision_credentials.json');
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    let saved = [];
    if (fs.existsSync(credPath)) {
        try { saved = JSON.parse(fs.readFileSync(credPath, 'utf8')); } catch (e) { }
    }
    saved.push({ ...credentials, timestamp: new Date().toISOString() });
    fs.writeFileSync(credPath, JSON.stringify(saved, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('AUTOMATION COMPLETE');
    console.log('='.repeat(60));
}

runVisionAutomation().catch(console.error);
