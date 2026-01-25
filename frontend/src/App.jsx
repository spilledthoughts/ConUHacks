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
            <span className="info-icon">ℹ️</span>
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
                chromePath: chromeMode === 'custom' ? customChromePath.trim() : undefined
            };

            const result = await window.electronAPI.runAutomation(config);
            setResult(result);

            if (result.success) {
                setLogs(prev => [...prev, { type: 'log', message: '✓ Automation completed successfully!', success: true }]);
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
                <img src="./concordia.png" alt="Concordia" className="header-logo" />
                <div>
                    <h1>DROP'ED</h1>
                    <p className="header-subtitle">Concordia University Registration Tool</p>
                </div>
            </header>

            <main className="main-container">
                {/* Account Mode Section */}
                <section className="section">
                    <h2 className="section-title">
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
                            <span className="radio-label">🆕 Create New Account</span>
                        </label>
                        <label className="radio-option">
                            <input
                                type="radio"
                                name="accountMode"
                                checked={accountMode === 'existing'}
                                onChange={() => setAccountMode('existing')}
                                disabled={isRunning}
                            />
                            <span className="radio-label">👤 Use Existing</span>
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

                {/* API Key Section */}
                <section className="section">
                    <h2 className="section-title">
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
                            <span className="radio-label">🔐 Use Built-in {!defaults.hasBuiltInKey && '(Not Available)'}</span>
                        </label>
                        <label className="radio-option">
                            <input
                                type="radio"
                                name="apiKeyMode"
                                checked={apiKeyMode === 'custom'}
                                onChange={() => setApiKeyMode('custom')}
                                disabled={isRunning}
                            />
                            <span className="radio-label">✏️ Custom Key</span>
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
                            <span className="radio-label">🌐 Use Default {!defaults.hasBuiltInChrome && '(Not Set)'}</span>
                        </label>
                        <label className="radio-option">
                            <input
                                type="radio"
                                name="chromeMode"
                                checked={chromeMode === 'custom'}
                                onChange={() => setChromeMode('custom')}
                                disabled={isRunning}
                            />
                            <span className="radio-label">📁 Custom Path</span>
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
                        <>⏳ Running...</>
                    ) : (
                        <>▶ START AUTOMATION</>
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
                            {result.success ? '✓ Success' : '✕ Failed'}
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
