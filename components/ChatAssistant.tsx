import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SalesCallAnalysisReport, ChatMessage, SubscriptionPlan, AppFeature } from '../types';
import { geminiService } from '../services/geminiService';

interface ChatAssistantProps {
  analysisContext: SalesCallAnalysisReport | null;
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
  userPlan: SubscriptionPlan;
  setActiveFeature: (feature: 'billing') => void;
}

const suggestionChips = [
    "Summarize my last call",
    "What were my strengths?",
    "Compare my last 3 calls" // Pro feature
];

const ChatAssistant: React.FC<ChatAssistantProps> = ({ analysisContext, messages, setMessages, userPlan, setActiveFeature }) => {
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    if (messages.length === 0) {
        const intro = analysisContext
          ? "Hello! I've loaded the latest sales call analysis. Ask me anything about the summary, transcript, or coaching points."
          : "Hello! I'm your AI sales coaching assistant. You can ask me general sales questions. For specific call analysis, please upload a call on the Dashboard page first.";
        setMessages([{ role: 'model', text: intro }]);
    }
  }, [analysisContext, messages, setMessages]);

  const handleSend = async (messageText: string) => {
    if (!messageText.trim()) return;
    
    // Plan-based feature check
    if (userPlan === 'free' && messageText.toLowerCase().includes('compare')) {
      const proFeatureMessage: ChatMessage = { role: 'model', text: "Comparing multiple calls is a Pro feature. It allows you to track your progress and identify trends over time. Would you like to upgrade to unlock this and other advanced features?" };
      setMessages([...messages, {role: 'user', text: messageText}, proFeatureMessage]);
      return;
    }

    const newUserMessage: ChatMessage = { role: 'user', text: messageText };
    const currentMessages = [...messages, newUserMessage];
    setMessages(currentMessages);
    setUserInput('');
    setIsLoading(true);

    try {
      const history = messages.filter(m => m.role !== 'model' || m.text.includes('sales call analysis') === false);
      const modelResponse = await geminiService.getChatResponse(history, messageText, analysisContext);
      setMessages([...currentMessages, { role: 'model', text: modelResponse }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages([...currentMessages, { role: 'model', text: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8 h-full flex flex-col" style={{maxHeight: 'calc(100vh - 5rem)'}}>
      <div className="flex-grow bg-white dark:bg-slate-800 rounded-lg shadow-xl flex flex-col overflow-hidden">
        <div className="flex-grow p-6 space-y-6 overflow-y-auto custom-scrollbar">
          <AnimatePresence>
            {messages.map((msg, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className={`flex items-start gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}
              >
                {msg.role === 'model' && (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 flex-shrink-0 shadow-md"></div>
                )}
                <div
                  className={`max-w-xl p-4 rounded-2xl shadow-md ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                   {msg.text.includes('Would you like to upgrade') && (
                        <button onClick={() => setActiveFeature('billing')} className="mt-3 px-4 py-1.5 bg-emerald-500 text-white font-semibold rounded-lg shadow-md hover:bg-emerald-600 transition">Upgrade to Pro</button>
                    )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {isLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 flex-shrink-0 shadow-md"></div>
              <div className="max-w-xl p-4 rounded-2xl bg-slate-200 dark:bg-slate-700 rounded-bl-none shadow-md">
                <div className="flex space-x-1">
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce"></span>
                </div>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-4 bg-slate-100 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700">
           <div className="flex items-center gap-2 mb-2">
                {suggestionChips.map(suggestion => {
                  const isProFeature = suggestion.toLowerCase().includes('compare');
                  const disabled = isLoading || (!analysisContext && suggestion.includes('call')) || (isProFeature && userPlan === 'free');
                  return (
                    <button key={suggestion} onClick={() => handleSend(suggestion)} disabled={disabled} className="px-3 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-full text-sm hover:bg-slate-300 dark:hover:bg-slate-600 transition disabled:opacity-50 disabled:cursor-not-allowed relative group">
                        {suggestion}
                        {isProFeature && <span className="absolute -top-2 -right-2 text-xs font-bold bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-full">PRO</span>}
                    </button>
                )})}
            </div>
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSend(userInput)}
              placeholder="Ask about the call summary or general sales questions..."
              className="flex-grow bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              disabled={isLoading}
            />
            <button
              onClick={() => handleSend(userInput)}
              disabled={isLoading || !userInput.trim()}
              className="p-3 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatAssistant;
