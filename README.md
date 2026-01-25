# DROP'ED

<p align="center">
  <img src="frontend/concordia.png" alt="Concordia Mock Logo" width="150" />
</p>

# Drop'ed - Concordia Deckathon Automation Tool

**Drop'ed** is a sophisticated automation suite built for the Concordia Deckathon 2026. It is designed to navigate the complex "Concordia Deckathon" student portal, solving over 12 unique anti-bot challenges and CAPTCHAs to automate the student dropout process.

The project consists of three main components:
1.  **Automation Core**: A high-performance pure API script (`pureApiDropout.js`).
2.  **Desktop Application**: A user-friendly Electron app for easy execution (`frontend/`).
3.  **Landing Page**: A marketing website for the tool (`website/`).

---

## 🚀 Quick Start (Script)

For the fastest exection, run the file **pureApiDropout.js** directly. This script uses a direct API approach, using only the browser for showing the completed drop out message.

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Configure Environment**
    Create a `.env` file in the root directory (copy from `env_example.env`):
    ```ini
    GEMINI_API_KEY=your_gemini_api_key_here
    CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
    ```
    *Note: A valid Gemini API key is required for solving the Face CAPTCHA modules.*

3.  **Run the Script**
    ```bash
    node pureApiDropout.js
    ```

---

## 🖥️ Electron Desktop App

We provide a standalone desktop application for a simpler user experience.

**Location**: `/frontend`

### Running within VS Code (Development)
```bash
cd frontend
npm install
npm run dev
```

### Building the Portable Executable
To create a standalone `.exe` file that you can share:
```bash
cd frontend
npm run pack
```
This generates `frontend/dist/Dropped 1.0.0.exe`.

---

## 🌐 Website

The project includes a promotional landing page.

**Location**: `/website`

```bash
cd website
npm install
npm run dev
```

---

## 🧠 How It Works

This tool automates the entire student lifecycle in the challenge environment:

1.  **Account Creation**: Generates random credentials and registers via API.
2.  **Authentication**:
    *   **Login**: Bypasses logic puzzles and CAPTCHAs.
    *   **MFA**: Intercepts OTP codes sent to the user's email.
3.  **Class Management**: Identifies enrolled classes and drops them via API.
4.  **Financials**: Checks balance and performs credit card payments if there are outstanding fees.
5.  **Dropout**: Finalizes the dropout process after solving the "Pretty Faces" verification.

### 🛡️ Anti-Bot Countermeasures Solved

The script successfully navigates 12 distinct verification modules:

| Module | Method | Description |
| :--- | :--- | :--- |
| **Verify Email** | `API` | Automates the "VERIFY" typing challenge. |
| **Please Wait** | `API` | Detects progress bar completion serverside. |
| **Keyboard Test** | `API` | Simulates randomized human keypress events. |
| **Bot Detection** | `API` | Identifies the correct button vs. bait checkboxes. |
| **System Update** | `API` | Simulates hover events on the "X" button. |
| **Select Location** | `API` | Hierarchical selection (Canada -> QC -> Montreal). |
| **Hidden Button** | `DOM` | Locates 0-opacity elements and triggers click events. |
| **Identity Check** | `Gen` | Generates valid-format SSN strings. |
| **Newsletter** | `API` | Types "UNSUBSCRIBE" confirmation. |
| **Terms & Cond.** | `API` | Simulates scroll-to-bottom event before accepting. |

### 🤖 CAPTCHA Solving Strategy

We employ a multi-modal approach to solving the varied CAPTCHAs:

*   **Pixel Analysis (Logos)**: We use `sharp` to analyze pixel brightness histograms to detect white/black center pixels in logo grids.
*   **Generative AI (Crowds)**: We utilize Google's **Gemini Flash 1.5** to visually identify humans in the "Select all images with people" challenges.
*   **Brute Force (Final)**: For the final challenge, we use a parallelized batching strategy to brute-force the 512 possible combinations (2^9) in seconds.

---

## 🛠️ Technologies

*   **Node.js**: Core runtime.
*   **Electron**: Desktop GUI framework.
*   **Puppeteer Real Browser**: For mimicking human fingerprints and evading detection.
*   **Google Gemini AI**: For vision-based CAPTCHA solving.
*   **Sharp**: High-performance image processing.
*   **React + Vite**: Frontend framework for the website and electron app.

---

<p align="center">
  Made with ❤️ for ConUHacks 2026
</p>
