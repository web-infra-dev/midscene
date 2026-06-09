/**
 * Offline scripted agents for the reference demo. They simulate a plausible
 * shop journey (login → greeting → add to cart → totals → coupon) with a tiny
 * state machine — no browser, no model API. The same shape as the test fakes
 * in tests/unit-test/helpers, but behavior-driven instead of queue-driven so
 * all three authoring modes can run against one simulation.
 */
import type {
  GeneralAgentAdapter,
  GeneralAgentInput,
  GeneralAgentResult,
} from '../../src/general-agent/types';
import type { UiAgentLike } from '../../src/types';

const PRICE = 129.0;

class ShopSimulation {
  role: string | null = null;
  inCart = false;
  couponApplied = false;

  get greeting(): string {
    if (!this.role) return '(not signed in)';
    return `Hello, ${this.role[0].toUpperCase()}${this.role.slice(1)}!`;
  }

  get total(): number {
    if (!this.inCart) return 0;
    return this.couponApplied ? PRICE * 0.9 : PRICE;
  }
}

export class ScriptedUiAgent implements UiAgentLike {
  private readonly sim = new ShopSimulation();

  async aiAct(instruction: string): Promise<string> {
    const signIn = /sign in as the "([^"]+)" user/i.exec(instruction);
    if (signIn) {
      this.sim.role = signIn[1];
      return `Signed in as ${signIn[1]}; the dashboard is shown.`;
    }
    if (/add .*to the cart/i.test(instruction)) {
      this.sim.inCart = true;
      return 'Added "Trail Backpack" to the cart and opened the cart view.';
    }
    if (/apply the coupon code/i.test(instruction)) {
      this.sim.couponApplied = true;
      return `Applied the coupon; the total is now $${this.sim.total.toFixed(2)}.`;
    }
    if (/login page/i.test(instruction)) {
      return 'The login page is open.';
    }
    if (/home page/i.test(instruction)) {
      return 'The shop home page is open.';
    }
    return `Done: ${instruction}`;
  }

  async aiAsk(_prompt: string): Promise<string> {
    return 'The requested action was completed on the simulated page.';
  }

  async aiString(prompt: string): Promise<string> {
    if (/greeting/i.test(prompt)) return this.sim.greeting;
    if (/price/i.test(prompt)) return `$${PRICE.toFixed(2)}`;
    if (/badge|count/i.test(prompt)) return this.sim.inCart ? '1' : '0';
    return '(no value found on the simulated page)';
  }

  interface = {
    screenshotBase64: async () => 'data:image/png;base64,SIMULATED',
  };

  describeState(): string {
    return `role=${this.sim.role ?? 'anonymous'}, cart=${this.sim.inCart ? 'Trail Backpack' : 'empty'}, total=$${this.sim.total.toFixed(2)}`;
  }
}

export class ScriptedGeneralAgent implements GeneralAgentAdapter {
  async run(input: GeneralAgentInput): Promise<GeneralAgentResult> {
    const i = input.instruction;
    // The simulated shop has no promo banner — the @soft scenario warns.
    if (/promo banner/i.test(i)) {
      return {
        text: 'I looked at the top of the page and found no promo banner.',
        verdict: {
          pass: false,
          reason: 'No promo banner is present on the simulated shop page.',
        },
      };
    }
    if (/coupon discount/i.test(i)) {
      return {
        text: 'The cart shows the discounted total.',
        verdict: {
          pass: true,
          reason: `$${(PRICE * 0.9).toFixed(2)} equals $${PRICE.toFixed(2)} minus the 10% coupon.`,
        },
      };
    }
    if (/cart total/i.test(i)) {
      return {
        text: 'The cart total matches the captured price.',
        verdict: {
          pass: true,
          reason: `The cart shows $${PRICE.toFixed(2)}, matching the remembered price.`,
        },
      };
    }
    return {
      text: 'Confirmed against the simulated screen.',
      verdict: { pass: true, reason: 'Confirmed on the simulated screen.' },
    };
  }
}
