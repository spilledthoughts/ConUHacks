const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Run automation with given config
    runAutomation: (config) => ipcRenderer.invoke('run-automation', config),

    // Get default values from .env
    getDefaults: () => ipcRenderer.invoke('get-defaults'),

    // Listen for log messages
    onLogMessage: (callback) => {
        ipcRenderer.on('log-message', (event, data) => callback(data));
    },

    // Remove log listener
    removeLogListener: () => {
        ipcRenderer.removeAllListeners('log-message');
    }
});
