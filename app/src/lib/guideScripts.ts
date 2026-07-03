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
  { step: 1, label: "Fund", href: "/faucet" },
  { step: 2, label: "Create", href: "/create" },
  { step: 3, label: "Packets", href: "/create" },
  { step: 4, label: "Claim", href: "/claim" },
  { step: 5, label: "Verify", href: "/verify" },
];

/**
 * The Archivist — the dossier's narrator voice. Terse, procedural, treats the
 * user's journey through the airdrop like a case file being walked through
 * step by step. Keyed by pathname; routes with no entry get no widget.
 */
export const GUIDE_SCRIPTS: Record<string, GuideStep> = {
  "/faucet": {
    step: 1,
    label: "Fund",
    messages: [
      { text: "Case file opened. Step one: every confidential distribution needs a funded, encrypted token balance to draw from." },
      { text: "Mint yourself some test tokens on Sepolia here, then confirm the transaction in your wallet." },
      { text: "Under the hood: your balance is stored as ciphertext on-chain from the moment it's minted — no plaintext amount is ever published." },
    ],
    nextHref: "/create",
    nextLabel: "Create a distribution",
  },
  "/create": {
    step: 2,
    label: "Create",
    messages: [
      { text: "Step two, and three are folded into one dossier: build the recipient list, deploy the airdrop contract, then seal a claim packet for each address." },
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
    nextHref: "/verify",
    nextLabel: "Recipients can verify their balance",
  },
  "/claim": {
    step: 4,
    label: "Claim",
    messages: [
      { text: "Step four: claim. Someone has sealed a packet with your name on it." },
      { text: "Submit your packet below — your wallet signs it, proving only you can redeem this allocation." },
      { text: "Cryptographically: the encrypted amount inside is never revealed on submission, only credited to your confidential balance." },
    ],
    nextHref: "/verify",
    nextLabel: "Verify & decrypt your balance",
  },
  "/verify": {
    step: 5,
    label: "Verify",
    messages: [
      { text: "Final step of the case file: verify." },
      { text: "Connect your wallet and request a decrypt — you'll sign a message authorizing the relayer to reveal just your own balance." },
      { text: "Under the hood: the plaintext number is decrypted for your eyes only and never leaves your browser." },
    ],
  },
};

export function getGuideScript(pathname: string): GuideStep | undefined {
  return GUIDE_SCRIPTS[pathname];
}
