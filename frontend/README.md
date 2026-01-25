# Deckathon Automation GUI

A JavaFX desktop application for running the Deckathon automation scripts.

## Prerequisites

- **Java 21** or later (with JavaFX)
- **Maven** 3.6+
- **Node.js** installed and in PATH

## Running the Application

```powershell
cd frontend
mvn clean javafx:run
```

## Features

| Feature | Description |
|---------|-------------|
| **Create Account** | Runs full registration flow with auto-generated credentials |
| **Dropout** | Login with existing credentials, then drop classes + payment + dropout |
| **API Key Options** | Use built-in key from `.env` or enter custom key |
| **Chrome Path** | Use default path or specify custom Chrome location |
| **Live Stage Tracking** | Shows current automation step in real-time |
| **Credentials Display** | Copy generated account credentials after creation |

## Usage

1. Select operation mode:
   - **Create New Account** - Generates random credentials and runs full flow
   - **Dropout** - Enter existing netname/password

2. Choose API key option:
   - **Built-in** - Uses key from `.env` file
   - **Custom** - Enter your own Gemini API key

3. Click **START** to run the automation

4. Monitor progress in the log area and stage indicator

5. Copy generated credentials using the copy buttons (Create Account mode)
