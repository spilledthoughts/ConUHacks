# Drop'ed

A desktop application for automating Deckathon registration and dropout processes. Built with Electron and React, featuring a Concordia University themed interface.

![Concordia Theme](https://img.shields.io/badge/Theme-Concordia%20University-912338)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-blue)

---

## 📋 Prerequisites

Before running this application, make sure you have:

1. **Node.js** (v18 or later) - [Download here](https://nodejs.org/)
2. **Google Chrome** installed
3. The parent directory contains `deckathonRegister.js` and a `.env` file with your Gemini API key

---

## 🔧 .env File Setup

Create a `.env` file in the **parent directory** (not in frontend/) with:

### Windows
```env
GEMINI_API_KEY=your_gemini_api_key_here
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

### macOS
```env
GEMINI_API_KEY=your_gemini_api_key_here
CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

---

## 🔍 Finding Your Chrome Path

### Windows

**Option 1: Default Location**
```
C:\Program Files\Google\Chrome\Application\chrome.exe
```

**Option 2: Find via Command Prompt**
```cmd
where chrome
```

**Option 3: Find via Chrome**
1. Open Chrome
2. Type `chrome://version` in the address bar
3. Look for "Executable Path"

---

### macOS

**Option 1: Default Location**
```
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

**Option 2: Find via Terminal**
```bash
mdfind "kMDItemCFBundleIdentifier == 'com.google.Chrome'" | head -1
# Then append: /Contents/MacOS/Google Chrome
```

**Option 3: Find via Chrome**
1. Open Chrome
2. Type `chrome://version` in the address bar
3. Look for "Executable Path"

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Run the Application (Development)

```bash
npm run dev
```

This will:
- Start the Vite development server
- Launch the Electron desktop window

---

## 📦 Building the App

### Windows
```bash
npm run build:win    # Build to directory
npm run pack:win     # Create portable .exe
```

### macOS
```bash
npm run build:mac    # Build to .app directory
npm run pack:mac     # Create .dmg installer
```

### Run Built App

**Windows:**
```
dist\win-unpacked\Dropped.exe
```

**macOS:**
```bash
open dist/mac-arm64/Dropped.app
```

---

## 🎮 How to Use

### Step 1: Select Account Mode

| Mode | Description |
|------|-------------|
| **Create New Account** | Generates random credentials, registers a new account, and drops all classes |
| **Use Existing Account** | Enter your netname and password to drop classes on an existing account |

### Step 2: Configure Options (Optional)

- **Gemini API Key**: Use the built-in key from `.env` or enter your own
- **Chrome Path**: Use the default Chrome location or specify a custom path

### Step 3: Click START

Click the **START AUTOMATION** button and watch the live status console for progress updates.

---

## 🛠️ Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Run in development mode |
| `npm run build` | Build for current platform |
| `npm run build:win` | Build for Windows |
| `npm run build:mac` | Build for macOS |
| `npm run pack:win` | Package Windows portable |
| `npm run pack:mac` | Package macOS DMG |

---

## ⚠️ Troubleshooting

### "Port 5173 is already in use"

**Windows:**
```powershell
npx kill-port 5173
```

**macOS:**
```bash
npx kill-port 5173
# or
lsof -ti:5173 | xargs kill
```

### Chrome doesn't launch

Make sure `CHROME_PATH` in your `.env` file points to the correct Chrome executable.

**Windows default:** `C:\Program Files\Google\Chrome\Application\chrome.exe`

**macOS default:** `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

### Automation fails at CAPTCHA

The app uses Gemini AI to solve CAPTCHAs. Ensure your `GEMINI_API_KEY` is valid and has available quota.

---

## 🎨 Theme

The app uses Concordia University's official colors:
- **Burgundy**: `#912338`
- **Red Accent**: `#D6001C`
- **Background**: Dark mode (`#1a1a1a`)

---

## 📄 License

This project is for educational purposes only. Use responsibly.
