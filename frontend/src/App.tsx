import { useState, useEffect } from 'react';
import './App.css';

interface SolanaProvider {
  isPhantom?: boolean;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>;
  disconnect: () => Promise<void>;
  signMessage: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
  publicKey: { toString: () => string } | null;
}

declare global {
  interface Window {
    solana?: SolanaProvider;
  }
}

function App() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Load token and address from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedAddress = localStorage.getItem('wallet_address');
    if (savedToken && savedAddress) {
      setToken(savedToken);
      setWalletAddress(savedAddress);
    }
  }, []);

  const connectWallet = async () => {
    setError(null);
    setStatusMessage(null);
    setIsConnecting(true);

    try {
      const provider = window.solana;
      if (!provider || !provider.isPhantom) {
        throw new Error('Solana Phantom Wallet is not installed. Please install it to continue.');
      }

      // 1. Connect to wallet
      const resp = await provider.connect();
      const pubKeyStr = resp.publicKey.toString();
      setWalletAddress(pubKeyStr);
      setStatusMessage('Wallet connected. Fetching nonce from backend...');

      // 2. Fetch nonce from backend
      const backendUrl = 'http://localhost:3000';
      const nonceResp = await fetch(`${backendUrl}/auth/nonce?walletAddress=${pubKeyStr}`);
      if (!nonceResp.ok) {
        const errorData = await nonceResp.json();
        throw new Error(errorData.error || 'Failed to fetch auth challenge (nonce).');
      }
      const { nonce } = await nonceResp.json();
      setStatusMessage('Challenge received. Please sign the message in your wallet...');

      // 3. Sign the challenge message
      const messageText = `Sign this message to authenticate with Prediction Market: ${nonce}`;
      const encodedMessage = new TextEncoder().encode(messageText);
      const { signature } = await provider.signMessage(encodedMessage, 'utf8');

      // Convert signature Uint8Array to hex string
      const signatureHex = Array.from(signature)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      setStatusMessage('Verifying signature on backend...');

      // 4. Submit to backend /auth/login
      const loginResp = await fetch(`${backendUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: pubKeyStr,
          signature: signatureHex,
          message: messageText
        })
      });

      if (!loginResp.ok) {
        const errorData = await loginResp.json();
        throw new Error(errorData.error || 'Authentication signature verification failed.');
      }

      const loginData = await loginResp.json();
      
      // Save session
      localStorage.setItem('auth_token', loginData.token);
      localStorage.setItem('wallet_address', pubKeyStr);
      setToken(loginData.token);
      
      setStatusMessage('Authentication successful! Wallet connected and session established.');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during wallet connection.');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      if (window.solana) {
        await window.solana.disconnect();
      }
    } catch (e) {
      console.error(e);
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('wallet_address');
    setWalletAddress(null);
    setToken(null);
    setApiResponse(null);
    setStatusMessage('Logged out successfully.');
    setError(null);
  };

  const testProtectedEndpoint = async (endpoint: string, method: 'GET' | 'POST' = 'GET') => {
    setError(null);
    setApiResponse(null);

    if (!token) {
      setError('You must authenticate first by connecting and signing in.');
      return;
    }

    try {
      const backendUrl = 'http://localhost:3000';
      const options: RequestInit = {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      if (method === 'POST') {
        options.body = JSON.stringify({ amount: 10, option: 'YES' });
      }

      const response = await fetch(`${backendUrl}${endpoint}`, options);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      setApiResponse({ endpoint, status: response.status, data });
    } catch (err: any) {
      setError(`API Error: ${err.message}`);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-container">
          <span className="logo-badge">SOLANA</span>
          <h1 className="app-logo">Prediction Market</h1>
        </div>
        <div className="auth-action">
          {walletAddress ? (
            <div className="connected-btn-group">
              <span className="wallet-pill" title={walletAddress}>
                🟢 {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
              </span>
              <button className="btn btn-secondary" onClick={disconnectWallet}>
                Disconnect
              </button>
            </div>
          ) : (
            <button 
              className="btn btn-primary" 
              onClick={connectWallet} 
              disabled={isConnecting}
            >
              {isConnecting ? 'Signing In...' : 'Connect Solana Wallet'}
            </button>
          )}
        </div>
      </header>

      <main className="app-content">
        {error && (
          <div className="alert alert-error">
            <span className="alert-icon">⚠️</span>
            <div className="alert-body">
              <strong>Error:</strong> {error}
            </div>
          </div>
        )}

        {statusMessage && (
          <div className="alert alert-info">
            <span className="alert-icon">ℹ️</span>
            <div className="alert-body">{statusMessage}</div>
          </div>
        )}

        <section className="hero-section">
          <h2>Decentralized Web3 Prediction Market</h2>
          <p>
            Verify positions, buy or sell shares, and manage your portfolio with secure Solana wallet signatures.
          </p>
        </section>

        {token ? (
          <div className="dashboard-grid">
            <div className="card control-panel">
              <h3>Authenticated Operations</h3>
              <p className="card-subtitle">Test protected backend API routes using JWT Authorization headers.</p>
              
              <div className="button-group">
                <button className="btn btn-accent" onClick={() => testProtectedEndpoint('/balance')}>
                  Check Balance (GET)
                </button>
                <button className="btn btn-accent" onClick={() => testProtectedEndpoint('/positions')}>
                  Get Positions (GET)
                </button>
                <button className="btn btn-accent" onClick={() => testProtectedEndpoint('/history')}>
                  Get History (GET)
                </button>
                <button className="btn btn-action" onClick={() => testProtectedEndpoint('/buy', 'POST')}>
                  Buy Position (POST)
                </button>
                <button className="btn btn-action" onClick={() => testProtectedEndpoint('/sell', 'POST')}>
                  Sell Position (POST)
                </button>
                <button className="btn btn-action" onClick={() => testProtectedEndpoint('/split', 'POST')}>
                  Split (POST)
                </button>
                <button className="btn btn-action" onClick={() => testProtectedEndpoint('/merge', 'POST')}>
                  Merge (POST)
                </button>
              </div>
            </div>

            <div className="card console-panel">
              <h3>Backend API Console</h3>
              <p className="card-subtitle">JSON output returned from the authenticated server endpoints.</p>
              
              <div className="console-wrapper">
                {apiResponse ? (
                  <pre className="console-output">
                    <code>
                      {`// Endpoint: ${apiResponse.endpoint}\n// Status: ${apiResponse.status}\n`}
                      {JSON.stringify(apiResponse.data, null, 2)}
                    </code>
                  </pre>
                ) : (
                  <div className="console-placeholder">
                    Click any action in the control panel to view API response.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="welcome-card">
            <h3>Wallet Connection Required</h3>
            <p>
              Please connect your Solana wallet (Phantom) and sign the secure cryptographic challenge to access market trades and balance parameters.
            </p>
            <button className="btn btn-primary btn-large" onClick={connectWallet}>
              Connect Phantom Wallet
            </button>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>Built with React + Express + Bun + Supabase + Solana Web3</p>
      </footer>
    </div>
  );
}

export default App;
