import './App.css'
import concordiaLogo from '/concordia.png'

function App() {
  return (
    <div className="app">
      {/* Red Banner Header */}
      <header className="header">
        <img src={concordiaLogo} alt="Concordia University" className="logo" />
        <span className="header-text">DROP'ED</span>
      </header>

      {/* Hero Section */}
      <main className="hero">
        <h1 className="title">
          Welcome to <span className="title-accent">Drop'ed</span>!
        </h1>

        <p className="subtitle">
          Get ready to drop out and become a great success!
        </p>

        {/* Buttons */}
        <div className="button-container">
          <a
            href="#download"
            className="btn btn-primary"
          >
            Download
          </a>
          <a
            href="https://github.com/spilledthoughts/ConUHacks"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            GitHub
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>Made at ConUHacks 2026</p>
      </footer>
    </div>
  )
}

export default App
