# DROP'ED

## User Guide

This is very simple as there are only a few things that you have to concern yourself with.
If you've installed this version of DROP'ED, that means you're trying to access our codebase!
In which case, good luck my friend! :)

### Automation Script

The main automation script is `/deckathonRegister.js`

To run it:
```bash
npm install
node deckathonRegister.js
```

If you're trying to test reliability, run `node run10.js`
It'll run 10 consecutive times and print out the results (success or failure)

### Electron Frontend

The Electron app is in `/frontend`
If you're trying to run the frontend, navigate to the `/frontend` directory
Then run `npm install`
And then run `npm run dev`
That'll run the development build

If you're trying to build the .exe file, navigate to the `/frontend` directory and run `npm run build`

### Website

There's also a website in `/website`
To run it: `cd website && npm install && npm run dev`

### Environment Variables

If you pulled from the repository, you should be missing a .env file in the root directory, in which case you'll need to create one.
Using the env_example.env as a template, create a .env file and fill in the values

Example:
```
GEMINI_API_KEY=uaishdIAWGBLIGYR#yuta7tdAIUWYG
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```
(the gemini key was me mashing my forehead into my keyboard)

## What the Bot Does

The script automates the entire dropout flow:

1. **Account Registration** - Creates a new account via API with random credentials
2. **Login** - Logs in with human-like mouse movements and typing patterns
3. **OTP Verification** - Finds and enters the OTP code shown on screen
4. **Drop Classes** - Navigates to enrollment, selects all enrolled/waitlisted courses, drops them
5. **Payment** - Goes to Finance, enters the balance amount, fills card details in the payment popup
6. **Logo CAPTCHA** - Uses pixel detection to identify logos (white/black center pixels)
7. **Human Face CAPTCHA** - Sends images to Gemini AI to identify which contain humans
8. **Student Dropout** - Navigates to dropout page, fills out the form, moves mouse around
9. **Anti-Bot Modules** - Solves 12 different verification challenges (see table below)
10. **Final CAPTCHA** - Brute-forces the last captcha by trying all 512 combinations in parallel
11. **Confirmation** - Clicks the final checkbox and confirm button, verifies "User has dropped out!"

### Anti-Bot Modules

| Module | What We Do |
|--------|------------|
| Verify Email | Types "VERIFY" and clicks the button |
| Please Wait | Waits for progress bar, clicks Continue |
| Keyboard Test | Presses 5 random keys |
| Bot Detection | Clicks Verify (ignores the bait checkbox) |
| System Update | Hovers the red X three times |
| Select Location | Picks Canada, then a region, then a city |
| Terms & Conditions | Scrolls to bottom, checks the box, clicks Accept |
| Hidden Button | Finds the hidden button and clicks it 5 times |
| Browser Update | Checks "I understand", clicks Continue Anyway |
| Newsletter | Types "UNSUBSCRIBE", clicks Continue |
| Identity Verification | Enters a fake SSN |
| Quick Survey | Clicks a star rating, submits |

### CAPTCHA Solving

- **Logo CAPTCHA**: Pixel detection - screenshots each image, checks if center pixel is very light or very dark
- **Human Face CAPTCHA**: Gemini AI vision - sends all 9 images to Gemini and asks which contain humans
- **Final CAPTCHA**: Brute force - tries all 512 possible combinations in parallel batches of 50

## Technologies Used

- Puppeteer-real-browser for browser automation and potential cloudflare bypass
- Gemini AI for vision-based CAPTCHA solving
- Sharp for image processing
- Electron for the desktop app

## Performance

Success rate is high. Execution time is around 2 minutes from login to withdrawn.

Built for ConUHacks 2026 - Deckathon Challenge
