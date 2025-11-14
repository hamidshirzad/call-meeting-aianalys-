import React, { useState } from 'react';
import { UserDetails, PlanDetails, SubscriptionPlan } from '../types';
import { stripeService } from '../services/stripeService';
import { motion } from 'framer-motion';

interface BillingPageProps {
  user: UserDetails;
  setUser: (user: UserDetails) => void;
}

const plans: Record<SubscriptionPlan, PlanDetails> = {
  free: {
    name: 'Free',
    price: '$0 / month',
    features: ['5 call analyses per week', 'Basic coaching insights', 'Limited chatbot summaries', 'No API access'],
    analysisLimit: 5,
    apiQuota: 0,
  },
  pro: {
    name: 'Pro',
    price: '$49 / month',
    features: ['Unlimited analyses', 'Advanced coaching insights', 'Full chatbot access', 'Developer API access (10k calls/mo)', 'Priority support'],
    analysisLimit: 'unlimited',
    apiQuota: 10000,
  },
  enterprise: {
    name: 'Enterprise',
    price: 'Contact Us',
    features: ['All Pro features', 'Team analytics dashboard', 'Sentiment benchmarking', 'Bulk API limits (100k+ calls/mo)', 'Dedicated account manager'],
    analysisLimit: 'unlimited',
    apiQuota: 100000,
  },
};

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
);

interface PricingCardProps {
    plan: SubscriptionPlan;
    isCurrentPlan: boolean;
    isLoading: SubscriptionPlan | null;
    onUpgrade: (plan: SubscriptionPlan) => void;
}

// Fix: Moved PricingCard outside of BillingPage component to resolve parsing errors.
const PricingCard: React.FC<PricingCardProps> = ({ plan, isCurrentPlan, isLoading, onUpgrade }) => {
    const planDetails = plans[plan];

    return (
        <motion.div 
            whileHover={{ y: -5, scale: 1.02 }}
            className={`border rounded-xl p-6 flex flex-col ${isCurrentPlan ? 'border-indigo-500 ring-2 ring-indigo-500' : 'border-slate-200 dark:border-slate-700'} bg-white dark:bg-slate-800 shadow-lg`}
        >
            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">{planDetails.name}</h3>
            {isCurrentPlan && <p className="text-sm font-semibold text-indigo-500 mt-1">Current Plan</p>}
            <p className="text-4xl font-bold my-4 text-slate-900 dark:text-slate-100">{planDetails.price}</p>
            <ul className="space-y-3 mb-6 text-slate-600 dark:text-slate-400 flex-grow">
                {planDetails.features.map((feature, i) => (
                    <li key={i} className="flex items-start">
                        <CheckIcon />
                        <span className="ml-2">{feature}</span>
                    </li>
                ))}
            </ul>
            {plan === 'pro' && !isCurrentPlan ? (
                <a
                    <script async
  src="https://js.stripe.com/v3/buy-button.js">
</script>

<stripe-buy-button
  buy-button-id="buy_btn_1STB1EFFlyQJmhYsE1AjKBE4"
  publishable-key="pk_live_51OfDuBFFlyQJmhYsiSrtcyTp1AIdjTSkBtToM3xaoa95YDnSE1LGmtYpd9IBLv0ESCKnVAuMhXscb2M3g9CGPs8J00Sfg64306"
>
</stripe-buy-button>"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full mt-auto py-3 px-6 font-semibold rounded-lg transition-colors duration-200 text-center bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                    Upgrade
                </a>
            ) : (
                <button
                    onClick={() => onUpgrade(plan)}
                    disabled={isCurrentPlan || plan === 'enterprise' || isLoading === plan}
                    className={`w-full mt-auto py-3 px-6 font-semibold rounded-lg transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50
                        ${isCurrentPlan 
                            ? 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                            : plan === 'pro' 
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                : 'bg-slate-800 dark:bg-slate-200 hover:bg-slate-700 dark:hover:bg-slate-300 text-white dark:text-slate-800'
                        }`}
                >
                    {isLoading === plan ? 'Upgrading...' : isCurrentPlan ? 'Current Plan' : (plan === 'enterprise' ? 'Contact Sales' : 'Upgrade')}
                </button>
            )}
        </motion.div>
    );
};


const BillingPage: React.FC<BillingPageProps> = ({ user, setUser }) => {
    const [isLoading, setIsLoading] = useState<SubscriptionPlan | null>(null);

    const handleUpgrade = async (newPlan: SubscriptionPlan) => {
        if (newPlan === user.plan || newPlan === 'enterprise') return;
        setIsLoading(newPlan);
        try {
            const updatedUser = await stripeService.upgradeSubscription(user, newPlan);
            setUser(updatedUser);
        } catch (error) {
            console.error("Upgrade failed:", error);
            // Handle error state in UI
        } finally {
            setIsLoading(null);
        }
    };

    return (
    <div>
      <h2 className="text-3xl font-bold mb-2 text-slate-800 dark:text-slate-200">Billing & Plans</h2>
      <p className="text-slate-500 dark:text-slate-400 mb-8">Choose the plan that's right for you and your team.</p>

      {/* Current Plan Status */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg mb-8">
        <h3 className="text-xl font-semibold mb-2 text-gray-800 dark:text-slate-200">Your Current Plan</h3>
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4">
            <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 capitalize">{user.plan}</span>
            <p className="text-slate-500 dark:text-slate-400">
                {user.plan !== 'free' ? `Renews on ${new Date(user.subscriptionEndDate).toLocaleDateString()}` : "Upgrade to unlock premium features."}
            </p>
        </div>
      </div>
      
      {/* Pricing Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <PricingCard plan="free" isCurrentPlan={user.plan === 'free'} isLoading={isLoading} onUpgrade={handleUpgrade} />
        <PricingCard plan="pro" isCurrentPlan={user.plan === 'pro'} isLoading={isLoading} onUpgrade={handleUpgrade} />
        <PricingCard plan="enterprise" isCurrentPlan={user.plan === 'enterprise'} isLoading={isLoading} onUpgrade={handleUpgrade} />
      </div>
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
export default BillingPage;