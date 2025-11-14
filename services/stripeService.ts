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

  // --- New: helpers that call your backend to create Stripe sessions ---
  // These methods assume you have backend endpoints implemented,
  // e.g. POST /api/billing/create-checkout-session and
  // POST /api/billing/create-portal-session which use Stripe server-side SDK.

  async createCheckoutSession(currentUser: UserDetails, plan: SubscriptionPlan) {
    // Frontend-safe: no secret keys here. Backend will create the Checkout session.
    const res = await fetch('/api/billing/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, plan }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to create checkout session: ${text}`);
    }

    const data = await res.json();
    // Expect { url: string } from backend. The frontend should redirect the user to data.url.
    return data;
  },

  async createCustomerPortalSession(currentUser: UserDetails) {
    const res = await fetch('/api/billing/create-portal-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to create portal session: ${text}`);
    }

    const data = await res.json();
    // Expect { url: string } from backend. The frontend should redirect the user to data.url.
    return data;
  },

  // Helpful developer guidance for local testing with the Stripe CLI.
  // NOTE: Do not put secret keys in frontend code. Use the Stripe CLI on your dev machine
  // to forward webhooks to your local backend during development.
  // Example (macOS, Homebrew):
  //   brew install stripe/stripe-cli/stripe
  //   stripe login
  //   stripe listen --forward-to localhost:3000/api/webhooks/stripe
  // Then your local backend endpoint /api/webhooks/stripe should verify the signature
  // using the STRIPE_WEBHOOK_SECRET (provided by `stripe listen`).

  // This helper just returns guidance text for the UI or developer consoles.
  getLocalStripeGuidance() {
    return {
      installCommand: 'brew install stripe/stripe-cli/stripe',
      loginCommand: 'stripe login',
      listenCommand: 'stripe listen --forward-to localhost:3000/api/webhooks/stripe',
      note: 'Run the above on your dev machine. Ensure your local backend verifies webhook signatures using the Stripe SDK with the webhook secret.'
    };
  }
};
<script async
  src="https://js.stripe.com/v3/buy-button.js">
</script>

<stripe-buy-button
  buy-button-id="buy_btn_1STB1EFFlyQJmhYsE1AjKBE4"
  publishable-key="pk_live_51OfDuBFFlyQJmhYsiSrtcyTp1AIdjTSkBtToM3xaoa95YDnSE1LGmtYpd9IBLv0ESCKnVAuMhXscb2M3g9CGPs8J00Sfg64306"
>
</stripe-buy-button>