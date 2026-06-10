/**
 * Offline scripted agents for the reference demo. They simulate a plausible
 * shop journey (login → greeting → add to cart → quantities → totals →
 * coupon) with a tiny state machine — no browser, no model API. The same
 * shape as the test fakes in tests/unit-test/helpers, but behavior-driven
 * instead of queue-driven so all three authoring styles can run against one
 * simulation.
 */
import type {
  GeneralAgentAdapter,
  GeneralAgentInput,
  GeneralAgentResult,
} from '../../src/general-agent/types';
import type { UiAgentLike } from '../../src/types';

/** Mirrors the catalog in example/demo-app/index.html. */
const PRICES: Record<string, number> = {
  'Trail Backpack': 129.0,
  'Camp Mug': 24.5,
};

const money = (n: number) => `$${n.toFixed(2)}`;

class ShopSimulation {
  role: string | null = null;
  readonly items = new Map<string, number>();
  couponApplied = false;

  get greeting(): string {
    if (!this.role) return '(not signed in)';
    return `Hello, ${this.role[0].toUpperCase()}${this.role.slice(1)}!`;
  }

  get itemCount(): number {
    let count = 0;
    for (const qty of this.items.values()) count += qty;
    return count;
  }

  get total(): number {
    let subtotal = 0;
    for (const [name, qty] of this.items) {
      subtotal += (PRICES[name] ?? 0) * qty;
    }
    return this.couponApplied ? subtotal * 0.9 : subtotal;
  }

  describe(): string {
    const cart =
      [...this.items.entries()].map(([n, q]) => `${n}×${q}`).join(', ') ||
      'empty';
    return `role=${this.role ?? 'anonymous'}, cart=${cart}, total=${money(this.total)}`;
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
    const add = /add the "([^"]+)" to the cart/i.exec(instruction);
    if (add) {
      this.sim.items.set(add[1], (this.sim.items.get(add[1]) ?? 0) + 1);
      return `Added "${add[1]}" to the cart and opened the cart view.`;
    }
    const setQty = /increase the "([^"]+)" quantity in the cart to (\d+)/i.exec(
      instruction,
    );
    if (setQty) {
      this.sim.items.set(setQty[1], Number(setQty[2]));
      return `Increased "${setQty[1]}" to quantity ${setQty[2]}; the cart total is now ${money(this.sim.total)}.`;
    }
    if (/apply the coupon code/i.test(instruction)) {
      this.sim.couponApplied = true;
      return `Applied the coupon; the total is now ${money(this.sim.total)}.`;
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
    const price = /price of the "([^"]+)" product/i.exec(prompt);
    if (price) {
      const unit = PRICES[price[1]];
      return unit === undefined
        ? '(no value found on the simulated page)'
        : money(unit);
    }
    if (/badge|count/i.test(prompt)) return String(this.sim.itemCount);
    return '(no value found on the simulated page)';
  }

  interface = {
    screenshotBase64: async () => 'data:image/png;base64,SIMULATED',
  };

  describeState(): string {
    return this.sim.describe();
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
    const twice = /total equals twice \$([\d.]+)/i.exec(i);
    if (twice) {
      const unit = Number(twice[1]);
      return {
        text: 'The cart total doubled with the quantity.',
        verdict: {
          pass: true,
          reason: `${money(unit * 2)} is exactly twice the unit price ${money(unit)}.`,
        },
      };
    }
    const coupon = /equals \$([\d.]+) minus .*coupon/i.exec(i);
    if (coupon) {
      const base = Number(coupon[1]);
      return {
        text: 'The cart shows the discounted total.',
        verdict: {
          pass: true,
          reason: `${money(base * 0.9)} equals ${money(base)} minus the 10% coupon.`,
        },
      };
    }
    const lists = /lists "([^"]+)" with quantity (\d+) at \$([\d.]+)/i.exec(i);
    if (lists) {
      return {
        text: 'The cart line matches.',
        verdict: {
          pass: true,
          reason: `The cart shows "${lists[1]}" with quantity ${lists[2]} priced at $${lists[3]}.`,
        },
      };
    }
    const badge = /badge .*shows (\d+) item/i.exec(i);
    if (badge) {
      return {
        text: 'The header badge matches the cart contents.',
        verdict: {
          pass: true,
          reason: `The header badge reads "${badge[1]} item${badge[1] === '1' ? '' : 's'}".`,
        },
      };
    }
    const total = /cart total equals \$([\d.]+)/i.exec(i);
    if (total) {
      return {
        text: 'The cart total matches the captured price.',
        verdict: {
          pass: true,
          reason: `The cart shows $${total[1]}, matching the remembered price.`,
        },
      };
    }
    return {
      text: 'Confirmed against the simulated screen.',
      verdict: { pass: true, reason: 'Confirmed on the simulated screen.' },
    };
  }
}
