import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { StatsigProvider } from '@statsig/react-bindings';
import StatsigAutoCapturePlugin from '@statsig/web-analytics';
import StatsigSessionReplayPlugin from '@statsig/session-replay';

const statsigKey = "client-blbKUmq95C4narM5nZscSqSAG3d6UVO1oBs9BvkeL8v";

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

const RootComponent: React.FC = () => {
    // The StatsigProvider can handle initialization directly by passing sdkKey, user, and options as props.
    // This avoids using the useClientAsyncInit hook which is not available in the current version.
    return (
        <StatsigProvider
            sdkKey={statsigKey!}
            user={{ userID: 'user_12345' }} // Using a stable user ID.
            // Fix: Instantiate the imported plugin classes using the 'new' keyword.
            options={{ plugins: [ new StatsigAutoCapturePlugin(), new StatsigSessionReplayPlugin() ] }}
            loadingComponent={<div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif'}}>Loading Statsig...</div>}
        >
            <App />
        </StatsigProvider>
    );
};

if (!statsigKey) {
    // Display a helpful error if the Statsig key is not configured.
    root.render(
        <div style={{ padding: '2rem', color: '#ef4444', textAlign: 'center', fontFamily: 'sans-serif', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', margin: '2rem' }}>
            <h2 style={{fontSize: '1.5rem', fontWeight: 'bold'}}>Statsig Configuration Error</h2>
            <p style={{marginTop: '0.5rem'}}>The Statsig Client Key is missing. Please create a <code>.env.local</code> file and set the <code>NEXT_PUBLIC_STATSIG_CLIENT_KEY</code> environment variable.</p>
        </div>
    );
} else {
    root.render(
      <React.StrictMode>
        <RootComponent />
      </React.StrictMode>
    );
}