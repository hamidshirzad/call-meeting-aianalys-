import React, { useState } from 'react';
import { UserDetails, ApiKey } from '../types';

interface DeveloperSettingsProps {
  user: UserDetails;
  setUser: (user: UserDetails) => void;
}

const DeveloperSettings: React.FC<DeveloperSettingsProps> = ({ user, setUser }) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
  
  if (user.plan === 'free') {
      return (
          <div className="container mx-auto p-4 sm:p-6 lg:p-8 text-center">
              <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold mb-4 text-slate-800 dark:text-slate-200">Developer API Access</h2>
                <p className="text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
                    Programmatic access to the Sales Coaching Intelligence API is a premium feature. Upgrade to the Pro or Enterprise plan to generate API keys, integrate with your tools, and automate your analysis workflow.
                </p>
                {/* A button to go to billing would be good here, handled by App.tsx */}
              </div>
          </div>
      );
  }

  const usagePercentage = (user.usage.callsThisMonth / user.usage.quota) * 100;

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <h2 className="text-3xl font-bold mb-6 text-slate-800 dark:text-slate-200">Developer Settings</h2>
      
      {/* API Usage */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8">
        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-slate-200">API Usage</h3>
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
      
      {/* API Key Management */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-slate-200">API Keys</h3>
            <button onClick={generateNewKey} className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-md shadow-sm text-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all">
                Generate New Key
            </button>
        </div>
        <p className="text-slate-500 dark:text-slate-400 mb-4 text-sm">Manage your API keys for programmatic access. Remember to keep them secure!</p>
        <div className="space-y-4">
            {user.apiKeys.map(apiKey => (
                <div key={apiKey.key} className={`p-3 rounded-md flex flex-col md:flex-row md:items-center gap-4 ${apiKey.isActive ? 'bg-slate-50 dark:bg-slate-700/50' : 'bg-slate-200 dark:bg-slate-900/50 opacity-60'}`}>
                    <div className="flex-grow">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{apiKey.label}</p>
                        <pre className="text-sm text-slate-600 dark:text-slate-300 font-mono truncate"><code>{apiKey.isActive ? apiKey.key : 'Key Inactive'}</code></pre>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Created: {new Date(apiKey.createdAt).toLocaleDateString()} | Usage: {apiKey.usage.toLocaleString()} calls</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => copyToClipboard(apiKey.key)} disabled={!apiKey.isActive} className="text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition disabled:opacity-50 disabled:cursor-not-allowed">
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
    </div>
  );
};

export default DeveloperSettings;
