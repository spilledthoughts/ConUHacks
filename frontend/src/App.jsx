import { useState, useEffect, useRef } from 'react';

// Info tooltip component
function InfoTooltip({ text }) {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <span
            className="info-tooltip-container"
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
        >
            <span className="info-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4" />
                    <path d="M12 8h.01" />
                </svg>
            </span>
            {isVisible && (
                <span className="info-tooltip">{text}</span>
            )}
        </span>
    );
}

function App() {
    // Form state
    const [accountMode, setAccountMode] = useState('new'); // 'new' or 'existing'
    const [netname, setNetname] = useState('');
    const [password, setPassword] = useState('');
    const [apiKeyMode, setApiKeyMode] = useState('builtin'); // 'builtin' or 'custom'
    const [customApiKey, setCustomApiKey] = useState('');
    const [chromeMode, setChromeMode] = useState('default'); // 'default' or 'custom'
    const [customChromePath, setCustomChromePath] = useState('');
    const [headlessMode, setHeadlessMode] = useState(false); // false = headful (show browser), true = headless

    // Runtime state
    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState([]);
    const [result, setResult] = useState(null);
    const [defaults, setDefaults] = useState({ geminiKey: '', chromePath: '' });

    const consoleRef = useRef(null);

    // Load defaults and setup log listener on mount
    useEffect(() => {
        // Get default values from .env
        if (window.electronAPI) {
            window.electronAPI.getDefaults().then((data) => {
                setDefaults(data);

                // Force custom mode if built-in values are missing
                if (!data.hasBuiltInKey) {
                    setApiKeyMode('custom');
                }
                if (!data.hasBuiltInChrome) {
                    setChromeMode('custom');
                }
            });

            // Listen for log messages
            window.electronAPI.onLogMessage((data) => {
                setLogs(prev => [...prev, data]);
            });

            return () => {
                window.electronAPI.removeLogListener();
            };
        }
    }, []);

    // Auto-scroll console to bottom
    useEffect(() => {
        if (consoleRef.current) {
            consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
    }, [logs]);

    const handleStart = async () => {
        if (isRunning) return;

        // Validation for existing account mode
        if (accountMode === 'existing' && (!netname.trim() || !password.trim())) {
            alert('Please enter both netname and password');
            return;
        }

        setIsRunning(true);
        setResult(null);
        setLogs([{ type: 'log', message: 'Starting automation...' }]);

        try {
            const config = {
                mode: accountMode,
                netname: accountMode === 'existing' ? netname.trim() : undefined,
                password: accountMode === 'existing' ? password.trim() : undefined,
                geminiKey: apiKeyMode === 'custom' ? customApiKey.trim() : undefined,
                chromePath: chromeMode === 'custom' ? customChromePath.trim() : undefined,
                headless: headlessMode
            };

            const result = await window.electronAPI.runAutomation(config);
            setResult(result);

            if (result.success) {
                setLogs(prev => [...prev, { type: 'log', message: 'Automation completed successfully', success: true }]);
            } else {
                setLogs(prev => [...prev, { type: 'error', message: `Error: ${result.error}` }]);
            }
        } catch (error) {
            setResult({ success: false, error: error.message });
            setLogs(prev => [...prev, { type: 'error', message: `Error: ${error.message}` }]);
        } finally {
            setIsRunning(false);
        }
    };

    const clearLogs = () => {
        setLogs([]);
        setResult(null);
    };

    const getStatusClass = () => {
        if (isRunning) return 'running';
        if (result?.success) return 'success';
        if (result?.success === false) return 'error';
        return '';
    };

    return (
        <>
            {/* Header */}
            <header className="header">
                <img src="/concordia.png" alt="Concordia" className="header-logo" />
                <div>
                    <h1>DROP'ED</h1>
                    <p className="header-subtitle">Concordia University Registration Tool</p>
                </div>
            </header>

            <main className="main-container">
                {/* Account Mode Section */}
                <section className="section">
                    <h2 className="section-title">
                        <svg className="section-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                        Account Mode
                        <InfoTooltip text="Create New Account: Generates random credentials, registers on Deckathon, enrolls in classes, then drops them all and completes dropout. Use Existing: Login with your own credentials to drop classes on an existing account." />
                    </h2>
                    <div className="radio-group">
                        <label className="radio-option">
                            <input
                                type="radio"
                                name="accountMode"
                                checked={accountMode === 'new'}
                                onChange={() => setAccountMode('new')}
                                disabled={isRunning}
                            />
                            <span className="radio-label">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                    <circle cx="9" cy="7" r="4" />
                                    <line x1="19" y1="8" x2="19" y2="14" />
                                    <line x1="22" y1="11" x2="16" y2="11" />
                                </svg>
                                Create New Account
                            </span>
                        </label>
                        <label className="radio-option">
                            <input
                                type="radio"
                                name="accountMode"
                                checked={accountMode === 'existing'}
                                onChange={() => setAccountMode('existing')}
                                disabled={isRunning}
                            />
                            <span className="radio-label">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                                Use Existing
                            </span>
                        </label>
                    </div>

                    {accountMode === 'existing' && (
                        <div className="input-group">
                            <div className="input-row">
                                <div>
                                    <label className="input-label">Netname</label>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="Enter netname"
                                        value={netname}
                                        onChange={(e) => setNetname(e.target.value)}
                                        disabled={isRunning}
                                    />
                                </div>
                                <div>
                                    <label className="input-label">Password</label>
                                    <input
                                        type="password"
                                        className="input-field"
                                        placeholder="Enter password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        disabled={isRunning}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </section>

                {/* Browser Mode Section */}
                <section className="section">
                    <h2 className="section-title">
                        <svg className="section-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                            <line x1="8" y1="21" x2="16" y2="21" />
                            <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                        Browser Mode
                        <InfoTooltip text="Headful: Shows the browser window so you can watch the automation. Headless: Runs invisibly in the background for faster execution." />
                    </h2>
                    <div className="radio-group">
                        <label className="radio-option">
                            <input
                                type="radio"
                                name="headlessMode"
                                checked={!headlessMode}
                                onChange={() => setHeadlessMode(false)}
                                disabled={isRunning}
                            />
                            <span className="radio-label">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                </svg>
                                Visible (Headful)
                            </span>
                        </label>
                        <label className="radio-option">
                            <input
                                type="radio"
                                name="headlessMode"
                                checked={headlessMode}
                                onChange={() => setHeadlessMode(true)}
                                disabled={isRunning}
                            />
                            <span className="radio-label">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                    <line x1="1" y1="1" x2="23" y2="23" />
                                </svg>
                                Hidden (Headless)
                            </span>
                        </label>
                    </div>
                </section>

                {/* API Key Section */}
                <section className="section">
                    <h2 className="section-title">
                        <svg className="section-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                        </svg>
                        Gemini API Key
                        <InfoTooltip text="The Gemini API key is used to solve CAPTCHAs using AI vision. Built-in uses the key from the .env file. Custom lets you provide your own key if the built-in one has quota issues." />
                    </h2>
                    <div className="radio-group">
                        <label className={`radio-option ${!defaults.hasBuiltInKey ? 'disabled' : ''}`}>
                            <input
                                type="radio"
                                name="apiKeyMode"
                                checked={apiKeyMode === 'builtin'}
                                onChange={() => setApiKeyMode('builtin')}
                                disabled={isRunning || !defaults.hasBuiltInKey}
                            />
                            <span className="radio-label">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                Use Built-in {!defaults.hasBuiltInKey && '(Not Available)'}
                            </span>
                        </label>
                        <label className="radio-option">
                            <input
                                type="radio"
                                name="apiKeyMode"
                                checked={apiKeyMode === 'custom'}
                                onChange={() => setApiKeyMode('custom')}
                                disabled={isRunning}
                            />
                            <span className="radio-label">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                Custom Key
                            </span>
                        </label>
                    </div>

                    {apiKeyMode === 'custom' && (
                        <div className="input-group">
                            <label className="input-label">API Key</label>
                            <input
                                type="password"
                                className="input-field"
                                placeholder="Enter your Gemini API key"
                                value={customApiKey}
                                onChange={(e) => setCustomApiKey(e.target.value)}
                                disabled={isRunning}
                            />
                        </div>
                    )}
                </section>

                {/* Chrome Path Section */}
                <section className="section">
                    <h2 className="section-title">
                        <svg className="section-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <circle cx="12" cy="12" r="4" />
                            <line x1="21.17" y1="8" x2="12" y2="8" />
                            <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
                            <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
                        </svg>
                        Chrome Path
                        <InfoTooltip text="The path to your Chrome browser executable. Default uses the standard Windows installation location. Use Custom if Chrome is installed elsewhere on your system." />
                    </h2>
                    <div className="radio-group">
                        <label className={`radio-option ${!defaults.hasBuiltInChrome ? 'disabled' : ''}`}>
                            <input
                                type="radio"
                                name="chromeMode"
                                checked={chromeMode === 'default'}
                                onChange={() => setChromeMode('default')}
                                disabled={isRunning || !defaults.hasBuiltInChrome}
                            />
                            <span className="radio-label">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                </svg>
                                Use Default {!defaults.hasBuiltInChrome && '(Not Set)'}
                            </span>
                        </label>
                        <label className="radio-option">
                            <input
                                type="radio"
                                name="chromeMode"
                                checked={chromeMode === 'custom'}
                                onChange={() => setChromeMode('custom')}
                                disabled={isRunning}
                            />
                            <span className="radio-label">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                </svg>
                                Custom Path
                            </span>
                        </label>
                    </div>

                    {chromeMode === 'custom' && (
                        <div className="input-group">
                            <label className="input-label">Chrome Executable Path</label>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="C:\Program Files\Google\Chrome\Application\chrome.exe"
                                value={customChromePath}
                                onChange={(e) => setCustomChromePath(e.target.value)}
                                disabled={isRunning}
                            />
                        </div>
                    )}
                </section>

                {/* Start Button */}
                <button
                    className={`start-button ${isRunning ? 'running' : ''}`}
                    onClick={handleStart}
                    disabled={isRunning}
                >
                    {isRunning ? (
                        <>
                            <svg className="spinner" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                            </svg>
                            Running...
                        </>
                    ) : (
                        <>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            START AUTOMATION
                        </>
                    )}
                </button>

                {/* Console Output */}
                <section className="console-section">
                    <div className="console-header">
                        <span className="console-title">
                            <span className={`status-indicator ${getStatusClass()}`}></span>
                            Live Status
                        </span>
                        <button className="clear-button" onClick={clearLogs}>
                            Clear
                        </button>
                    </div>
                    <div className="console-body" ref={consoleRef}>
                        {logs.length === 0 ? (
                            <div className="log-entry" style={{ color: 'var(--text-muted)' }}>
                                Waiting to start...
                            </div>
                        ) : (
                            logs.map((log, index) => (
                                <div
                                    key={index}
                                    className={`log-entry ${log.type === 'error' ? 'error' : ''} ${log.success ? 'success' : ''}`}
                                >
                                    {log.message}
                                </div>
                            ))
                        )}
                    </div>
                </section>

                {/* Result Card */}
                {result && (
                    <div className={`result-card ${result.success ? 'success' : 'error'}`}>
                        <div className="result-title">
                            {result.success ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            )}
                            {result.success ? 'Success' : 'Failed'}
                        </div>
                        <div className="result-message">
                            {result.success
                                ? `Automation completed for: ${result.username || 'account'}`
                                : result.error
                            }
                        </div>
                    </div>
                )}
            </main>
        </>
    );
}

export default App;
