# Drop'ed

A desktop application for automating Deckathon registration and dropout processes. Built with Electron and React, featuring a Concordia University themed interface.

![Concordia Theme](https://img.shields.io/badge/Theme-Concordia%20University-912338)
![Platform](https://img.shields.io/badge/Platform-Windows-blue)

---

## 📋 Prerequisites

Before running this application, make sure you have:

1. **Node.js** (v18 or later) - [Download here](https://nodejs.org/)
2. **Google Chrome** installed
3. The parent directory contains `deckathonRegister.js` and a `.env` file with your Gemini API key

### .env File Setup

Create a `.env` file in the **parent directory** (not in frontend/) with:

```env
GEMINI_API_KEY=your_gemini_api_key_here
CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

> **Note:** `CHROME_PATH` is optional if Chrome is installed in the default location.

---

## 🚀 Quick Start

### 1. Install Dependencies

Open a terminal in the `frontend` folder and run:

```powershell
cd frontend
npm install
```

### 2. Run the Application

```powershell
npm run dev
```

This will:
- Start the Vite development server
- Launch the Electron desktop window

> **Tip:** If you see "Port 5173 is already in use", close any other running instances first.

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

The automation will:
1. Open Chrome browser (headful mode - you'll see it)
2. Navigate to the Deckathon website
3. Register/Login as needed
4. Drop all enrolled classes
5. Complete the payment process
6. Finalize the dropout

---

## 📁 Project Structure

```
frontend/
├── main.js           # Electron main process
├── preload.js        # IPC bridge (secure communication)
├── package.json      # Dependencies and scripts
├── vite.config.js    # Vite bundler configuration
├── index.html        # HTML entry point
└── src/
    ├── main.jsx      # React entry point
    ├── App.jsx       # Main UI component
    └── index.css     # Concordia theme styles
```

---

## 🛠️ Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Run in development mode (recommended) |
| `npm run dev:vite` | Start only the Vite dev server |
| `npm run dev:electron` | Start only the Electron app |
| `npm run build` | Build for production |
| `npm start` | Run production build |

---

## ⚠️ Troubleshooting

### "Port 5173 is already in use"
Close any other running instances of the app or kill the process using:
```powershell
npx kill-port 5173
```

### Chrome doesn't launch
Make sure `CHROME_PATH` in your `.env` file points to the correct Chrome executable:
- Default Windows: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Custom install: Check your Chrome installation path

### "Module not found" errors
Run `npm install` again in the frontend folder.

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
