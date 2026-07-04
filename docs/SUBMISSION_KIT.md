# Submission Kit — video script + X thread

## 3-minute video script (real-person pitch — record yourself, no AI voice)

Film: screen recording of the live app + your webcam/voice. Rehearse once; keep total under 3:00.

**[0:00–0:25] Hook (face to camera or voiceover on the landing page)**
> "Last year I built NovaPay — a batch payroll dApp. Upload a CSV, pay your whole team in one
> transaction. It worked. It had one fatal flaw: every salary was public, on-chain, forever.
> Anyone could read my users' cap table off Etherscan. BlindDrop is what NovaPay should have
> been — confidential token distribution where amounts are encrypted end-to-end and the
> recipient list never touches the chain. Built on the TokenOps SDK and Zama's FHE protocol."

**[0:20–0:40] The 5-second pitch of how (landing page, hover the redacted bars)**
> "Amounts are encrypted in my browser before they ever leave it. On-chain, they're FHE ciphertexts —
> only each recipient can decrypt their own. Let me show you the whole thing, live on Sepolia."

**[0:40–1:30] Admin flow (Create page)**
- Upload the CSV template (or type recipients manually — show the X-remove and the live total).
- Point out the token picker: "any ERC-7984 confidential token — here's cUSDT from Zama's registry;
  I'll use the test token." Show the token identity card verifying name/symbol/ERC-7984 badge and
  the decrypt-your-balance row.
- Deploy → approve → fund (narrate: "the campaign is a clone of TokenOps' OpenZeppelin-audited
  contract — BlindDrop adds zero trust assumptions").
- Generate claim packets: "encryption runs in parallel; each packet is bound to its recipient's
  address — stolen packets are useless. And notice what's NOT happening: no list is uploaded
  anywhere. There is no backend."

**[1:30–2:15] Recipient flow (switch wallet, Claim & Verify page)**
- Load the claim packet (drag & drop), claim, show the stepper advancing.
- The reveal: decrypt the balance with the EIP-712 signature — linger one beat on the unseal
  animation. "That decryption happened in my browser. The admin can't do this. Etherscan can't.
  Only me."
- Quick cut to Etherscan: show the claim tx — "here's the same transfer on-chain: the amount is a
  ciphertext handle."

**[2:15–2:40] Breadth (fast cuts)**
- Disperse page: "push-based payouts for teams and investors — same confidentiality, no claim step."
- Faucet section + Archivist guide widget: "judges can self-serve test tokens and be walked through
  the whole journey."
- Registry: "campaigns are indexed by our own on-chain registry contract — reload-safe, and it
  stores only what's already public."

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
Built for @zama_fhe's Developer Program Special Bounty with the @tokenops SDK — every on-chain
operation runs on TokenOps' OpenZeppelin-audited contracts. We added one contract of our own: a
minimal on-chain campaign registry (stores only public metadata).

**6/**
Try it yourself on Sepolia — faucet included, takes ~3 minutes:
🌐 [live app URL]
🧑‍💻 [github repo URL]
🎬 [video URL]

Guided by "The Archivist" — our in-app walkthrough. Feedback welcome. 🕵️
