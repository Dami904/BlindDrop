# Submission Kit — video script + X thread

## 3-minute video script (real-person pitch — record yourself, no AI voice)

Film: screen recording of the live app + your webcam/voice. Rehearse once; keep total under 3:00.

**[0:00–0:25] Hook (face to camera or voiceover on the landing page)**
> "Last year I built NovaPay — a batch payroll dApp. Upload a CSV, pay your whole team in one
> transaction. It worked. It had one fatal flaw: every salary was public, on-chain, forever.
> Anyone could read my users' cap table off Etherscan. BlindDrop is what NovaPay should have
> been — confidential token distribution where amounts are encrypted end-to-end and the
> recipient list never touches the chain. Built on the TokenOps SDK and Zama's FHE protocol."

**[0:25–0:40] The 5-second pitch of how (landing page, hover/tap the redacted bars)**
> "Amounts are encrypted in my browser before they ever leave it. On-chain, they're FHE ciphertexts —
> only each recipient can decrypt their own. Let me show you the whole thing, live on Sepolia."

**[0:40–1:35] Admin flow (Create page)**
- Upload the CSV template with the email column (or type recipients manually — show the live total
  and inline row validation).
- Token picker: "any ERC-7984 confidential token — here's cUSDT from Zama's registry; I'll use the
  test token." Show the identity card (name/symbol/ERC-7984 ✓) and the decrypt-your-balance check.
- Deploy → name the campaign → approve → fund (narrate: "the campaign is a clone of TokenOps'
  OpenZeppelin-audited contract — BlindDrop adds zero trust assumptions").
- Seal packets (parallel encryption), then the delivery moment: flip the email toggle → **"Send
  all"** → "every recipient just got their private claim link. No list was uploaded anywhere.
  There is no backend." Show the claim-status chips ("this is how I'll watch claims come in") and
  the report download.

**[1:35–2:20] Recipient flow (switch wallet, open the emailed claim link)**
- Click the link from the email — packet loads itself.
- **The money shot:** "Reveal amount" on the allocation row — one small transaction, one
  signature, and the sealed bar unseals to the exact figure. "I can see exactly what I was sent —
  before I even claim it. The admin can't see my balance. Etherscan can't. Only me."
- Claim (stepper advances), then quick cut to Etherscan: "the same transfer on-chain — the amount
  is a ciphertext handle."

**[2:20–2:45] Breadth (fast cuts)**
- Selective disclosure (on the claim page): "need your accountant to see it? Grant exactly them —
  with an expiry, revocable anytime. Other approaches bake an auditor into the contract; here,
  disclosure belongs to the person whose money it is. Enforced by the FHE access-control layer,
  not by us."
- Disperse: "the push model — payroll for any list size in one transaction, nothing to claim."
- Campaigns page: "a control room for all my distributions — search, sort, pause, sweep unclaimed
  funds. Where other apps print totals and recipient counts on the card, ours stays sealed — the
  amounts aren't on-chain to leak. I can see who's claimed, from my own records; nobody else can
  see anything."
- Faucet + Archivist guide widget: "judges can self-serve tokens and be walked through everything."

**[2:40–3:00] Close (face to camera)**
> "BlindDrop: airdrops, investor distributions, and payouts — private at scale, on the audited
> TokenOps contracts, through the TokenOps SDK. Live on Sepolia, link below. Thanks for watching."

**Shot checklist:** light theme OR dark theme consistently (pick one; dark demos better on video) ·
1080p+ · hide bookmarks bar · both wallets pre-funded · pre-mint faucet tokens so Test 1 is instant.

## X thread draft (post from your account)

**1/**
Airdrops leak your cap table. Every amount, every recipient — public forever on Etherscan.

We built BlindDrop: confidential token distribution where amounts are encrypted end-to-end and the
recipient list never touches the chain.

Live demo 👇 @zama_fhe

**2/**
How it works:
🔒 Amounts encrypted in the admin's browser (Zama FHE, ERC-7984)
📦 Each recipient gets a sealed "claim packet" bound to their wallet
✍️ Claims verified on-chain against admin-signed authorizations
👁️ Only the recipient can decrypt their own allocation — not even the admin can

**3/**
What never leaves the admin's browser: the recipient list. There's no backend. No database. No
server that could leak it.

What's on-chain: ciphertext handles. Here's a real transfer on Sepolia — try reading the amount. 🧾
[screenshot of Etherscan tx]

**4/**
Two distribution models in one app:
🎯 Airdrop campaigns — recipients claim within a window (unclaimed funds recoverable)
💸 Disperse — push payouts straight to wallets, for teams & investors

Works with any ERC-7984 confidential token, including cUSDT.

**5/**
The part FHE uniquely unlocks: selective disclosure.

A recipient can grant one address — an accountant, an auditor — the right to decrypt *their* amount.
Time-limited. Revocable. Enforced by the on-chain access-control layer, not by us.

Other tools bake a fixed auditor into the contract. Here, disclosure belongs to whoever's money it is.

**6/**
Built for @zama_fhe's Developer Program Special Bounty with the @tokenops SDK — every on-chain
operation runs on TokenOps' OpenZeppelin-audited contracts. We added one of our own: a minimal,
verified campaign registry (stores only already-public metadata).

**7/**
Try it yourself on Sepolia — faucet included, takes ~3 minutes:
🌐 [live app URL]
🧑‍💻 [github repo URL]
🎬 [video URL]

Guided by "The Archivist" — our in-app walkthrough. Feedback welcome. 🕵️
