/**
 * AI-Driven Browser Automation
 * 
 * This script uses Gemini AI to analyze the page and figure out
 * what elements to interact with. The human provides the high-level
 * steps, but the AI determines HOW to execute each step.
 */

const { connect } = require('puppeteer-real-browser');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const CONFIG = {
    LOGIN_URL: 'https://deckathon-concordia.com/login',
    CHROME_PATH: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY
};

const ai = new GoogleGenAI({ apiKey: CONFIG.GEMINI_API_KEY });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// AI CORE FUNCTIONS
// ============================================================================

/**
 * Ask Gemini to analyze the current page and return a JSON action
 */
async function askGemini(screenshot, prompt) {
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
        console.log('Gemini error:', err.message);
        return null;
    }
}

/**
 * Get page state - what's visible, what can be interacted with
 */
async function getPageState(page) {
    return await page.evaluate(() => {
        const state = {
            url: window.location.href,
            title: document.title,
            text: document.body.innerText.substring(0, 2000),
            inputs: [],
            checkboxes: [],  // Separate list for checkboxes with state
            buttons: [],
            links: []
        };

        // Get regular inputs (excluding checkboxes/radios)
        document.querySelectorAll('input, textarea, select').forEach((el, i) => {
            if (el.type === 'checkbox') {
                // Track checkboxes separately with their checked state
                const label = el.closest('label')?.textContent?.trim() ||
                    el.parentElement?.textContent?.trim() ||
                    el.id || `checkbox-${i}`;
                state.checkboxes.push({
                    index: i,
                    label: label.substring(0, 50),
                    checked: el.checked,
                    visible: el.offsetParent !== null
                });
            }
            state.inputs.push({
                index: i,
                type: el.type || el.tagName.toLowerCase(),
                id: el.id,
                name: el.name,
                placeholder: el.placeholder,
                value: el.value,
                checked: el.type === 'checkbox' ? el.checked : undefined,
                visible: el.offsetParent !== null
            });
        });

        // Get all buttons
        document.querySelectorAll('button, [role="button"], input[type="submit"]').forEach((el, i) => {
            state.buttons.push({
                index: i,
                text: el.textContent?.trim().substring(0, 50),
                id: el.id,
                disabled: el.disabled,
                visible: el.offsetParent !== null
            });
        });

        // Get all links
        document.querySelectorAll('a').forEach((el, i) => {
            state.links.push({
                index: i,
                text: el.textContent?.trim().substring(0, 50),
                href: el.href,
                visible: el.offsetParent !== null
            });
        });

        return state;
    });
}

/**
 * Execute an action returned by Gemini
 */
async function executeAction(page, action) {
    console.log(`Executing: ${action.type} - ${action.description || ''}`);

    switch (action.type) {
        case 'click_button':
            await page.evaluate((index) => {
                const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"]');
                if (buttons[index]) buttons[index].click();
            }, action.index);
            break;

        case 'click_link':
            await page.evaluate((index) => {
                const links = document.querySelectorAll('a');
                if (links[index]) links[index].click();
            }, action.index);
            break;

        case 'type_input':
            await page.evaluate((index, value) => {
                const inputs = document.querySelectorAll('input, textarea, select');
                if (inputs[index]) {
                    inputs[index].focus();
                    inputs[index].value = value;
                    inputs[index].dispatchEvent(new Event('input', { bubbles: true }));
                }
            }, action.index, action.value);
            break;

        case 'select_option':
            await page.evaluate((index, value) => {
                const inputs = document.querySelectorAll('input, textarea, select');
                if (inputs[index]) {
                    inputs[index].value = value;
                    inputs[index].dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, action.index, action.value);
            break;

        case 'click_checkbox':
            await page.evaluate((index) => {
                const inputs = document.querySelectorAll('input[type="checkbox"]');
                if (inputs[index]) inputs[index].click();
            }, action.index);
            break;

        case 'click_radio':
            await page.evaluate((index) => {
                const inputs = document.querySelectorAll('input[type="radio"]');
                if (inputs[index]) inputs[index].click();
            }, action.index);
            break;

        case 'wait':
            await sleep(action.duration || 1000);
            break;

        case 'navigate':
            await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
            break;

        case 'scroll':
            await page.evaluate((y) => window.scrollBy(0, y), action.y || 300);
            break;

        case 'click_element':
            await page.evaluate((selector) => {
                const el = document.querySelector(selector);
                if (el) el.click();
            }, action.selector);
            break;

        case 'click_captcha_images':
            // AI provides array of image numbers 1-9, we click them in the grid
            const imageNumbers = action.images || [];
            console.log(`Clicking CAPTCHA images: ${imageNumbers.join(', ')}`);
            const containers = await page.$$('.grid.grid-cols-3 > div');
            for (const num of imageNumbers) {
                const index = num - 1;
                if (containers[index]) {
                    await containers[index].click();
                    await sleep(100);
                    console.log(`Clicked image ${num}`);
                }
            }
            break;

        case 'click_verify':
            // Click the verify button after CAPTCHA
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const btn = buttons.find(b => b.textContent.includes('Verify') && !b.disabled);
                if (btn) btn.click();
            });
            console.log('Clicked Verify button');
            break;

        case 'done':
            return 'done';

        default:
            console.log('Unknown action type:', action.type);
    }

    await sleep(500);
    return 'continue';
}

/**
 * AI decides what to do next based on current goal and page state
 */
async function aiDecide(page, goal, context = {}, previousActions = []) {
    const screenshot = await page.screenshot({ encoding: 'base64' });
    const state = await getPageState(page);

    const actionsNote = previousActions.length > 0
        ? `\nPREVIOUS ACTIONS ALREADY TAKEN THIS TASK (DO NOT REPEAT ANY OF THESE):\n${previousActions.map((a, i) => `${i + 1}. ${a.type} ${a.index !== undefined ? `index:${a.index}` : ''} - ${a.description}`).join('\n')}`
        : '';

    const prompt = `You are an AI browser automation agent. Analyze this webpage and decide the next action.

CURRENT GOAL: ${goal}
${actionsNote}
CONTEXT: ${JSON.stringify(context)}

PAGE STATE:
- URL: ${state.url}
- Title: ${state.title}
- Visible text (first 2000 chars): ${state.text}

AVAILABLE INPUTS (index, type, id, placeholder):
${state.inputs.filter(i => i.visible && i.type !== 'checkbox').map(i => `${i.index}: ${i.type} | id="${i.id}" | placeholder="${i.placeholder}" | value="${i.value}"`).join('\n')}

CHECKBOXES (index, label, currently checked?):
${state.checkboxes.filter(c => c.visible).map(c => `${c.index}: "${c.label}" | checked=${c.checked}`).join('\n')}
NOTE: Only click UNCHECKED checkboxes if you want to select them. Do NOT click already-checked checkboxes again!

AVAILABLE BUTTONS (index, text, disabled):
${state.buttons.filter(b => b.visible).map(b => `${b.index}: "${b.text}" | disabled=${b.disabled}`).join('\n')}

AVAILABLE LINKS (index, text):
${state.links.filter(l => l.visible).slice(0, 20).map(l => `${l.index}: "${l.text}"`).join('\n')}

Return a JSON object with the next action. Available action types:
- { "type": "click_button", "index": N, "description": "why" }
- { "type": "click_link", "index": N, "description": "why" }
- { "type": "type_input", "index": N, "value": "text to type", "description": "why" }
- { "type": "select_option", "index": N, "value": "option value", "description": "why" }
- { "type": "click_checkbox", "index": N, "description": "why" }
- { "type": "click_radio", "index": N, "description": "why" }
- { "type": "click_element", "selector": "css selector", "description": "why" }
- { "type": "click_captcha_images", "images": [1,3,5], "description": "why" } - FOR CAPTCHA: specify which images 1-9 to click (grid is 1-2-3 / 4-5-6 / 7-8-9)
- { "type": "click_verify", "description": "click verify button after selecting CAPTCHA images" }
- { "type": "wait", "duration": milliseconds, "description": "why" }
- { "type": "scroll", "y": pixels, "description": "why" }
- { "type": "done", "description": "goal achieved" }

CAPTCHA NOTE: If you see a 3x3 image grid CAPTCHA, use click_captcha_images with the image numbers (1-9) that match the category. Then use click_verify.

CRITICAL RULES:
1. If the GOAL is already achieved (e.g., you're already on the right page, form is already filled, no CAPTCHA present), return {"type": "done", "description": "goal already achieved"}
2. NEVER repeat the same action twice in a row. If an action didn't work, try a DIFFERENT approach (different button index, different link, scroll first, etc.)
3. If a menu/dropdown needs to open, check if it's already open before clicking again.
4. Look at the page carefully - the goal may already be complete from a previous step.

IMPORTANT: Return ONLY valid JSON, no markdown, no explanation.`;

    const response = await askGemini(screenshot, prompt);

    if (!response) return null;

    try {
        // Clean markdown if present
        let json = response;
        if (json.startsWith('```')) {
            json = json.replace(/```json?\n?/g, '').replace(/```/g, '');
        }
        return JSON.parse(json);
    } catch (err) {
        console.log('Failed to parse AI response:', response);
        return null;
    }
}

// ============================================================================
// RANDOM DATA GENERATORS
// ============================================================================

const generateCredentials = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const randomStr = (len) => Array(len).fill().map(() => chars[Math.floor(Math.random() * chars.length)]).join('');

    const firstNames = ['John', 'Jane', 'Alex', 'Sam', 'Chris', 'Jordan'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'];
    const domains = ['gmail.com', 'outlook.com', 'yahoo.com'];

    return {
        username: randomStr(8) + Math.floor(Math.random() * 999),
        fullName: `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`,
        email: `${randomStr(10)}${Math.floor(Math.random() * 999)}@${domains[Math.floor(Math.random() * domains.length)]}`,
        password: randomStr(4).toUpperCase() + randomStr(4) + Math.floor(Math.random() * 99) + '!@'
    };
};

// ============================================================================
// HIGH-LEVEL TASK FRAMEWORK
// ============================================================================

const TASKS = [
    {
        name: 'Navigate to Register',
        goal: 'Find and click the register/create account link to go to the registration page',
        maxActions: 5
    },
    {
        name: 'Fill Registration Form',
        goal: 'Fill in all registration form fields (username, full name, email, password, confirm password) and submit',
        maxActions: 10,
        needsCredentials: true
    },
    {
        name: 'Solve CAPTCHA if present',
        goal: 'If there is a CAPTCHA asking to select images, select the appropriate images and click verify. If no CAPTCHA, mark as done.',
        maxActions: 15
    },
    {
        name: 'Navigate to Login',
        goal: 'Go to the login page',
        maxActions: 3
    },
    {
        name: 'Fill Login Form',
        goal: 'Fill in login form with username and password, then submit',
        maxActions: 5,
        needsCredentials: true
    },
    {
        name: 'Solve CAPTCHA if present',
        goal: 'If there is a CAPTCHA, solve it. If no CAPTCHA, mark as done.',
        maxActions: 15
    },
    {
        name: 'Handle OTP',
        goal: 'If there is an OTP/verification code displayed on screen, find it, enter it in the input field, and submit. If no OTP screen, mark as done.',
        maxActions: 5
    },
    {
        name: 'Navigate to Drop Classes',
        goal: 'Find and open the Enrollment menu, then click on Drop Classes',
        maxActions: 5
    },
    {
        name: 'Select and Drop Courses',
        goal: 'Select all enrolled/waitlisted courses checkboxes and click the Drop Selected Classes button',
        maxActions: 10
    },
    {
        name: 'Confirm Drop',
        goal: 'If there is a confirmation dialog, type the required confirmation word and click confirm',
        maxActions: 5
    },
    {
        name: 'Navigate to Finance',
        goal: 'Find and open the Finance menu, then click Make a Payment',
        maxActions: 5
    },
    {
        name: 'Continue to Payment',
        goal: 'Click Continue to Payment button',
        maxActions: 3
    },
    {
        name: 'Solve Number Sequence',
        goal: 'If there is a number sequence to click (like 1->3->8), click the numbers in order',
        maxActions: 10
    },
    {
        name: 'Enter Payment Amount',
        goal: 'Find the remaining balance amount, enter it in the amount field, select CAD currency, and click Continue',
        maxActions: 8
    },
    {
        name: 'Fill Card Details',
        goal: 'In the payment form, fill card number (use 4532123456789012), CVV (123), expiry (12/28), click Save Card, Continue, then Process Payment',
        maxActions: 10
    },
    {
        name: 'Solve Payment CAPTCHA',
        goal: 'If there is a CAPTCHA, identify images with humans/people (ignore the stated category) and verify',
        maxActions: 15
    },
    {
        name: 'Navigate to Student Dropout',
        goal: 'Go back to main page and find Student Dropout in the menu',
        maxActions: 5
    },
    {
        name: 'Start Dropout Process',
        goal: 'Click the Start Dropout Process button',
        maxActions: 3
    },
    {
        name: 'Select Dropout Reason',
        goal: 'Select "Academic program not a good fit" as the reason and click Next',
        maxActions: 5
    },
    {
        name: 'Confirm Dropout',
        goal: 'Check the confirmation checkbox (may be in iframe) and click Confirm Dropout',
        maxActions: 5
    },
    {
        name: 'Solve Final CAPTCHA',
        goal: 'Select all purely white images and click verify',
        maxActions: 15
    }
];

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function runAIAutomation() {
    console.log('Starting AI-Driven Browser Automation\n');

    const credentials = generateCredentials();
    console.log('Generated credentials:', credentials);

    // Connect to browser
    const connection = await connect({
        headless: false,
        fingerprint: false,
        turnstile: true,
        tf: true,
        args: ['--window-size=1920,1080', '--disable-blink-features=AutomationControlled'],
        customConfig: { chromePath: CONFIG.CHROME_PATH },
        connectOption: { defaultViewport: { width: 1920, height: 1080 } }
    });

    const browser = connection.browser;
    let page = connection.page;

    // Start at login page
    await page.goto(CONFIG.LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await sleep(1000);

    // Execute each task
    for (const task of TASKS) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`TASK: ${task.name}`);
        console.log(`GOAL: ${task.goal}`);
        console.log('='.repeat(60));

        const context = task.needsCredentials ? { credentials } : {};
        let actionCount = 0;
        let previousActions = [];  // Track ALL actions taken in this task

        while (actionCount < task.maxActions) {
            // Check if we're on a new tab
            const pages = await browser.pages();
            page = pages[pages.length - 1];
            await page.bringToFront();

            // AI decides next action (pass all previous actions so it doesn't repeat)
            const action = await aiDecide(page, task.goal, context, previousActions);

            if (!action) {
                console.log('AI returned no action, moving to next task');
                break;
            }

            console.log(`Action ${actionCount + 1}:`, JSON.stringify(action));

            // Execute the action
            const result = await executeAction(page, action);
            previousActions.push(action);  // Add to history

            if (result === 'done' || action.type === 'done') {
                console.log('Task completed!');
                break;
            }

            actionCount++;
            await sleep(300);
        }

        if (actionCount >= task.maxActions) {
            console.log('Max actions reached, moving to next task');
        }

        await sleep(500);
    }

    // Save credentials
    const credentialsPath = path.join(__dirname, 'data', 'ai_credentials.json');
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    let savedCreds = [];
    if (fs.existsSync(credentialsPath)) {
        try { savedCreds = JSON.parse(fs.readFileSync(credentialsPath, 'utf8')); } catch (e) { }
    }
    savedCreds.push({ ...credentials, timestamp: new Date().toISOString() });
    fs.writeFileSync(credentialsPath, JSON.stringify(savedCreds, null, 2));

    console.log('\n\nAutomation complete!');
    console.log('Browser kept open for inspection');
}

runAIAutomation().catch(console.error);
