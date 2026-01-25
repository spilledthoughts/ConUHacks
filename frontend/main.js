const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

// Fix for Windows GPU/rendering issues - only apply on Windows
if (process.platform === 'win32') {
    app.disableHardwareAcceleration();
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    app.commandLine.appendSwitch('no-sandbox');
}

// Determine if running in packaged mode
const isDev = !app.isPackaged;

// Set up paths based on environment
const basePath = isDev
    ? path.join(__dirname, '..')
    : path.join(process.resourcesPath, 'app');

let mainWindow;
let isRunning = false;
let automationModule = null;

// Lazy load automation module (only when needed, not at startup)
function getAutomationModule() {
    if (!automationModule) {
        try {
            // Load environment variables first
            require('dotenv').config({ path: path.join(basePath, '.env') });

            const modulePath = isDev
                ? '../deckathonRegister.js'
                : path.join(basePath, 'deckathonRegister.js');

            console.log('Loading automation module from:', modulePath);
            automationModule = require(modulePath);
        } catch (error) {
            console.error('Failed to load automation module:', error);
            throw error;
        }
    }
    return automationModule;
}

function createWindow() {
    console.log('Creating window...');
    console.log('isDev:', isDev);
    console.log('__dirname:', __dirname);

    mainWindow = new BrowserWindow({
        width: 800,
        height: 700,
        minWidth: 600,
        minHeight: 500,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        backgroundColor: '#1a1a1a',
        titleBarStyle: 'default',
        show: true // Show immediately!
    });

    // Open DevTools in packaged mode to debug
    if (!isDev) {
        mainWindow.webContents.openDevTools();
    }

    // Error handling for failed page loads
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error('Failed to load:', errorCode, errorDescription, validatedURL);
        dialog.showErrorBox('Load Error', `Failed to load: ${errorDescription}\nURL: ${validatedURL}`);
    });

    if (isDev) {
        console.log('Loading from dev server...');
        mainWindow.loadURL('http://localhost:5173');
    } else {
        const htmlPath = path.join(__dirname, 'dist-react', 'index.html');
        console.log('Loading HTML from:', htmlPath);

        // Check if file exists
        const fs = require('fs');
        if (fs.existsSync(htmlPath)) {
            console.log('HTML file exists!');
        } else {
            console.error('HTML file NOT FOUND!');
            dialog.showErrorBox('Error', 'HTML file not found at: ' + htmlPath);
        }

        mainWindow.loadFile(htmlPath).catch(err => {
            console.error('Error loading file:', err);
            dialog.showErrorBox('Load Error', err.message);
        });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Intercept console.log and send to renderer
function createLogInterceptor() {
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args) => {
        originalLog.apply(console, args);
        if (mainWindow && !mainWindow.isDestroyed()) {
            const message = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            mainWindow.webContents.send('log-message', { type: 'log', message });
        }
    };

    console.error = (...args) => {
        originalError.apply(console, args);
        if (mainWindow && !mainWindow.isDestroyed()) {
            const message = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            mainWindow.webContents.send('log-message', { type: 'error', message });
        }
    };
}

// Handle automation request from renderer
ipcMain.handle('run-automation', async (event, config) => {
    if (isRunning) {
        return { success: false, error: 'Automation is already running' };
    }

    isRunning = true;

    try {
        // Set environment variables from config
        if (config.geminiKey) {
            process.env.GEMINI_API_KEY = config.geminiKey;
        }
        if (config.chromePath) {
            process.env.CHROME_PATH = config.chromePath;
        }

        // Lazy load the automation module
        const { registerOnDeckathon, dropClasses } = getAutomationModule();

        let result;

        if (config.mode === 'new') {
            console.log('Starting NEW ACCOUNT mode...');
            result = await registerOnDeckathon();
        } else {
            console.log('Starting EXISTING ACCOUNT mode...');
            result = await dropClasses({
                netname: config.netname,
                password: config.password
            });
        }

        isRunning = false;
        return result;

    } catch (error) {
        isRunning = false;
        console.error('Automation error:', error.message);
        return { success: false, error: error.message };
    }
});

// Get default config values
ipcMain.handle('get-defaults', async () => {
    // Load env file if not already loaded
    try {
        require('dotenv').config({ path: path.join(basePath, '.env') });
    } catch (e) {
        console.error('Error loading .env:', e);
    }

    const geminiKey = process.env.GEMINI_API_KEY || '';
    const chromePath = process.env.CHROME_PATH || '';

    return {
        geminiKey,
        chromePath,
        hasBuiltInKey: !!geminiKey,
        hasBuiltInChrome: !!chromePath
    };
});

app.whenReady().then(() => {
    console.log('App is ready!');
    createLogInterceptor();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
}).catch(err => {
    console.error('Error during app ready:', err);
    dialog.showErrorBox('Startup Error', err.message);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Global error handler
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    dialog.showErrorBox('Uncaught Exception', error.message);
});
