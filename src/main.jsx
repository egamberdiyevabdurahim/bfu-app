import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
// import './index.css'
import App from './App.jsx'
import { LanguageProvider } from './i18n.jsx'
import { initTelegram } from './tg'

initTelegram()

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error, info) {
    console.error('UI crash:', error, info)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100dvh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32,
          textAlign: 'center', background: '#0A0A0F', color: '#F0F0FF',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <div style={{ fontSize: 40 }}>😕</div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Something went wrong</div>
          <div style={{ color: '#9090A8', fontSize: 14, maxWidth: 280 }}>
            Please reopen the app. If it keeps happening, contact support.
          </div>
          <button onClick={() => window.location.reload()} style={{
            marginTop: 8, background: '#7B6FFF', color: '#fff', border: 'none',
            borderRadius: 10, padding: '12px 24px', fontWeight: 600, cursor: 'pointer',
          }}>Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </ErrorBoundary>
  </StrictMode>,
)
