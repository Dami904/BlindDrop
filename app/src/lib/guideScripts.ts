export interface GuideMessage {
  /** Plain text of the Archivist's line. */
  text: string;
}

export interface GuideStep {
  /** Which numbered step (1-5) this route belongs to, or null for side-quests / no step. */
  step: number | null;
  /** Short label for the step chip / page title. */
  label: string;
  messages: GuideMessage[];
  nextHref?: string;
  nextLabel?: string;
}

export const JOURNEY_STEPS: { step: number; label: string; href: string }[] = [
  { step: 1, label: "Fund", href: "/#faucet" },
  { step: 2, label: "Create", href: "/create" },
  { step: 3, label: "Packets", href: "/create" },
  { step: 4, label: "Claim", href: "/claim" },
  { step: 5, label: "Verify", href: "/claim#verify" },
];

/**
 * The Archivist — the dossier's narrator voice. Terse, procedural, treats the
 * user's journey through the airdrop like a case file being walked through
 * step by step. Keyed by pathname; routes with no entry get no widget.
 */
export const GUIDE_SCRIPTS: Record<string, GuideStep> = {
  "/": {
    step: null,
    label: "Welcome",
    messages: [
      { text: "Case file opened. This is BlindDrop — every allocation encrypted end-to-end, sealed until the recipient opens it." },
      { text: "Scroll down for the full five-step walkthrough, or jump straight to minting test tokens in the faucet section below." },
      { text: "Ready to move? Funding is step one — the chips below jump straight to any step in the journey." },
    ],
    nextHref: "/#faucet",
    nextLabel: "Get test tokens",
  },
  "/create": {
    step: 2,
    label: "Create",
    messages: [
      { text: "Steps two and three, one dossier: build the recipient list, deploy the campaign contract, then seal a claim packet for each address." },
      { text: "Enter or import recipients, deploy, and the archive will encrypt an individual allocation for each one." },
      { text: "Cryptographically: each packet carries an encrypted amount and a one-time signature — only the named wallet can ever decrypt or redeem it." },
    ],
    nextHref: "/claim",
    nextLabel: "Recipients can claim",
  },
  "/disperse": {
    step: null,
    label: "Disperse (side-quest)",
    messages: [
      { text: "A side entry in the file: Disperse skips claim packets entirely." },
      { text: "Recipients receive tokens immediately, in one confidential transaction you sign — no separate claim step required." },
      { text: "Under the hood: amounts are still encrypted end-to-end, but delivered directly rather than held in a packet awaiting redemption." },
    ],
    nextHref: "/claim#verify",
    nextLabel: "Recipients can verify their balance",
  },
  "/claim": {
    step: 4,
    label: "Claim & Verify",
    messages: [
      { text: "Steps four and five, on one page: claim, then verify. Someone has sealed a packet with your name on it." },
      { text: "Submit your packet below — your wallet signs it, proving only you can redeem this allocation." },
      { text: "Then scroll to verify: connect your wallet and request a decrypt to reveal your new confidential balance, for your eyes only." },
    ],
    nextHref: "/claim#verify",
    nextLabel: "Jump to verify & decrypt",
  },
};

export function getGuideScript(pathname: string): GuideStep | undefined {
  return GUIDE_SCRIPTS[pathname];
}
