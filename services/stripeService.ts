import { UserDetails, SubscriptionPlan } from '../types';

// This is a mock service to simulate Stripe interactions.
// In a real application, these would be API calls to your backend,
// which would then interact with the Stripe API.

export const stripeService = {
  async upgradeSubscription(
    currentUser: UserDetails,
    newPlan: SubscriptionPlan
  ): Promise<UserDetails> {
    console.log(`Simulating upgrade for user ${currentUser.id} to ${newPlan} plan...`);

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // In a real scenario, you'd get the new renewal date and API quota
    // from your backend after a successful payment via Stripe.
    const oneMonthFromNow = new Date();
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);

    const getQuotaForPlan = (plan: SubscriptionPlan) => {
        switch(plan) {
            case 'pro': return 10000;
            case 'enterprise': return 100000;
            default: return 0;
        }
    }

    const updatedUser: UserDetails = {
      ...currentUser,
      plan: newPlan,
      subscriptionEndDate: oneMonthFromNow.toISOString(),
      usage: {
        ...currentUser.usage,
        callsThisMonth: 0, // Reset usage on upgrade
        quota: getQuotaForPlan(newPlan),
        resetDate: oneMonthFromNow.toISOString(),
      },
    };

    console.log('Upgrade simulation successful.');
    return updatedUser;
  },
};
