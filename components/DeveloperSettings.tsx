import React, { useState } from 'react';
import { UserDetails, ApiKey } from '../types';

interface DeveloperSettingsProps {
  user: UserDetails;
  setUser: (user: UserDetails) => void;
}

const DeveloperSettings: React.FC<DeveloperSettingsProps> = ({ user, setUser }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [customApiKeyInput, setCustomApiKeyInput] = useState(user.customApiKey || '');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isKeyVisible, setIsKeyVisible] = useState(false);

  const handleSaveApiKey = () => {
    setUser({ ...user, customApiKey: customApiKeyInput });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleClearApiKey = () => {
    if (window.confirm("Are you sure you want to clear your saved API key?")) {
      setCustomApiKeyInput('');
      setUser({ ...user, customApiKey: '' });
    }
  };

  const generateNewKey = () => {
    const newKeyObject: ApiKey = {
      key: `sk_live_${user.plan}_${[...Array(24)].map(() => Math.random().toString(36)[2]).join('')}`,
      label: `Key ${user.apiKeys.length + 1}`,
      createdAt: new Date().toISOString(),
      usage: 0,
      isActive: true,
    };
    setUser({ ...user, apiKeys: [...user.apiKeys, newKeyObject] });
  };

  const toggleKeyStatus = (keyToToggle: string) => {
    setUser({
      ...user,
      apiKeys: user.apiKeys.map(k => k.key === keyToToggle ? { ...k, isActive: !k.isActive } : k),
    });
  };

  const copyToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };
  
  const effectivePlan = user.customApiKey ? 'pro' : user.plan;
  const usagePercentage = user.usage.quota > 0 ? (user.usage.callsThisMonth / user.usage.quota) * 100 : 0;

  return (
    <div>
      <h2 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-200">Developer Settings</h2>

      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8">
        <h3 className="text-xl font-semibold text-gray-800 dark:text-slate-200">Personal API Key</h3>
        <p className="text-slate-500 dark:text-slate-400 my-4 text-sm">
            Use your own Google Gemini API key to bypass the free tier's weekly analysis limits and unlock Pro features. Your key is stored securely in your browser and is never sent to our servers. By using your own key, you are responsible for any costs incurred from Google.
            <br/>
            <a href="https://ai.google.dev/gemini-api/docs/api-key" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
                Get your Gemini API key from Google AI Studio.
            </a>
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="relative flex-grow w-full">
                <input 
                    type={isKeyVisible ? 'text' : 'password'}
                    placeholder="Enter your Google Gemini API Key"
                    value={customApiKeyInput}
                    onChange={(e) => setCustomApiKeyInput(e.target.value)}
                    className="flex-grow shadow-sm appearance-none border border-slate-300 dark:border-slate-600 rounded-lg w-full py-2 px-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
                />
                <button
                    onClick={() => setIsKeyVisible(!isKeyVisible)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    aria-label={isKeyVisible ? 'Hide API key' : 'Show API key'}
                >
                    {isKeyVisible ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542 7z" /></svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    )}
                </button>
            </div>
            <div className="flex items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
                <button onClick={handleSaveApiKey} className="px-4 py-2 bg-emerald-600 text-white font-medium rounded-md shadow-sm text-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 w-1/2 sm:w-auto">
                    {saveSuccess ? 'Saved!' : 'Save'}
                </button>
                {user.customApiKey && (
                    <button onClick={handleClearApiKey} className="px-4 py-2 bg-slate-500 text-white font-medium rounded-md shadow-sm text-sm hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 w-1/2 sm:w-auto">
                        Clear
                    </button>
                )}
            </div>
        </div>
      </div>
      
      {effectivePlan !== 'free' && (
        <>
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8">
            <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">Platform API Usage</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-4 text-sm">This section is for managing API keys for the fourdoorai platform itself, available on Pro plans.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div>
                    <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{user.usage.callsThisMonth.toLocaleString()}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Calls this month</p>
                </div>
                <div>
                    <p className="text-3xl font-bold text-slate-800 dark:text-slate-200">{user.usage.quota.toLocaleString()}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Monthly Quota</p>
                </div>
                <div>
                    <p className="text-3xl font-bold text-slate-800 dark:text-slate-200">{new Date(user.usage.resetDate).toLocaleDateString()}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Next Reset Date</p>
                </div>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mt-4">
                <div className="bg-indigo-600 h-2.5 rounded-full" style={{width: `${usagePercentage}%`}}></div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
                <h3 className="text-xl font-semibold text-gray-800 dark:text-slate-200">Platform API Keys</h3>
                <button onClick={generateNewKey} className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-md shadow-sm text-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all self-start sm:self-center">
                    Generate New Key
                </button>
            </div>
            <p className="text-slate-500 dark:text-slate-400 mb-4 text-sm">Manage your platform API keys for programmatic access. Remember to keep them secure!</p>
            <div className="space-y-4">
                {user.apiKeys.map(apiKey => (
                    <div key={apiKey.key} className={`p-3 rounded-md flex flex-col md:flex-row md:items-center gap-4 ${apiKey.isActive ? 'bg-slate-50 dark:bg-slate-700/50' : 'bg-slate-200 dark:bg-slate-900/50 opacity-60'}`}>
                        <div className="flex-grow">
                            <p className="font-semibold text-slate-800 dark:text-slate-200">{apiKey.label}</p>
                            <pre className="text-sm text-slate-600 dark:text-slate-300 font-mono truncate"><code>{apiKey.isActive ? apiKey.key : 'Key Inactive'}</code></pre>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Created: {new Date(apiKey.createdAt).toLocaleDateString()} | Usage: {apiKey.usage.toLocaleString()} calls</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 self-end md:self-center">
                            <button onClick={() => copyToClipboard(apiKey.key)} disabled={!apiKey.isActive} className="text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition disabled:opacity-50 disabled:cursor-not-allowed p-1">
                                {copiedKey === apiKey.key ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                )}
                            </button>
                            <button onClick={() => toggleKeyStatus(apiKey.key)} className={`px-3 py-1 text-xs font-medium rounded-full ${apiKey.isActive ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}>
                                {apiKey.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
<script async
  src="https://js.stripe.com/v3/buy-button.js">
</script>

<stripe-buy-button
  buy-button-id="buy_btn_1STB1EFFlyQJmhYsE1AjKBE4"
  publishable-key="pk_live_51OfDuBFFlyQJmhYsiSrtcyTp1AIdjTSkBtToM3xaoa95YDnSE1LGmtYpd9IBLv0ESCKnVAuMhXscb2M3g9CGPs8J00Sfg64306"
>
</stripe-buy-button>
export default DeveloperSettings;