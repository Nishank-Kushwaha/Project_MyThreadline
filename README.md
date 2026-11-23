# Threadline 🧵

> **A modern, privacy-first, real-time messaging and WebRTC calling platform powered by zero-knowledge End-to-End Encryption (E2EE).**

---

## 📖 Table of Contents

1. [Overview](#-overview)
2. [Key Application Features](#-key-application-features)
3. [End-to-End Application Workflow](#-end-to-end-application-workflow)
   - [1. Authentication & Device Identity Registration](#1-authentication--device-identity-registration)
   - [2. Room Creation & Membership Management](#2-room-creation--membership-management)
   - [3. Messaging & Envelope Encryption Lifecycle](#3-messaging--envelope-encryption-lifecycle)
   - [4. Encrypted Media & Document Pipeline](#4-encrypted-media--document-pipeline)
   - [5. Quoted Replies & Context Binding](#5-quoted-replies--context-binding)
   - [6. Sealed Emoji Reactions (Message Secret & Zero Leakage)](#6-sealed-emoji-reactions-message-secret--zero-leakage)
   - [7. Interactive Encrypted Polls & Voting](#7-interactive-encrypted-polls--voting)
   - [8. Message Edits & Soft Deletion Lifecycle](#8-message-edits--soft-deletion-lifecycle)
   - [9. Safety Numbers & Cryptographic Verification](#9-safety-numbers--cryptographic-verification)
   - [10. Encrypted Key Backup & Multi-Device Recovery](#10-encrypted-key-backup--multi-device-recovery)
   - [11. Web Push Notifications with Service Worker Decryption](#11-web-push-notifications-with-service-worker-decryption)
   - [12. Local Search with Client-Side IndexedDB & Fetch-Around](#12-local-search-with-client-side-indexeddb--fetch-around)
   - [13. WebRTC Voice, Video & Screen Sharing Lifecycle](#13-webrtc-voice-video--screen-sharing-lifecycle)
4. [E2EE Cryptographic Architecture](#-e2ee-cryptographic-architecture)
   - [Cryptographic Primitives](#cryptographic-primitives)
   - [Dual Diffie-Hellman Key Agreement](#dual-diffie-hellman-key-agreement)
   - [Authenticated Additional Data (AAD) & Context Binding](#authenticated-additional-data-aad--context-binding)
   - [Zero-Leakage Fixed-Block Padding](#zero-leakage-fixed-block-padding)
   - [Server-Side Privacy Filtering (`viewForUser`)](#server-side-privacy-filtering-viewforuser)
5. [WebRTC Media & Calling Engine](#-webrtc-media--calling-engine)
   - [Signaling Protocol & Session Lifecycle](#signaling-protocol--session-lifecycle)
   - [Dynamic Metered.ca TURN & Google STUN Fallback](#dynamic-meteredca-turn--google-stun-fallback)
   - [Opus Voice Tuning & Audio Optimization](#opus-voice-tuning--audio-optimization)
   - [Adaptive Network Quality Scaling & Degradation Tiers](#adaptive-network-quality-scaling--degradation-tiers)
   - [Aspect Ratio Engine (Fit vs. Fill) & Ambient Backdrops](#aspect-ratio-engine-fit-vs-fill--ambient-backdrops)
   - [Mid-Call Track Hot-Swapping (Zero Renegotiation)](#mid-call-track-hot-swapping-zero-renegotiation)
   - [Audio Output Routing & Speaker Fallback](#audio-output-routing--speaker-fallback)
   - [Mobile Camera Flipping & Dynamic Un-Mirroring](#mobile-camera-flipping--dynamic-un-mirroring)
   - [Audio Playback Isolation Pipeline](#audio-playback-isolation-pipeline)
   - [Speaking Loudness Detector via Web Audio API](#speaking-loudness-detector-via-web-audio-api)
6. [Project Directory Structure](#-project-directory-structure)
7. [REST API Reference](#-rest-api-reference)
8. [WebSocket Event Reference](#-websocket-event-reference)
9. [Database Schema & Data Models](#-database-schema--data-models)
10. [UI Customization & 20 Built-In Themes](#-ui-customization--20-built-in-themes)
11. [Tech Stack](#-tech-stack)
12. [Environment Configuration](#-environment-configuration)
13. [Getting Started & Development](#-getting-started--development)
14. [Security Model & Threat Defense](#-security-model--threat-defense)

---

## 🌟 Overview

**Threadline** is an encrypted web messaging and real-time communications application engineered to deliver the stringent privacy guarantees of protocols like Signal and WhatsApp within a responsive web application.

The central design principle of Threadline is **zero-knowledge operation**:
* The backend server functions strictly as an **untrusted relay, signaling, and encrypted ciphertext storage coordinator**.
* All plaintext chat messages, media files, documents, search indexes, quoted replies, emoji reactions, and poll questions/votes are encrypted and decrypted **exclusively inside client browsers** using native Web Crypto APIs (`window.crypto.subtle`).
* 1-on-1 voice, video, and screen sharing streams travel peer-to-peer over **DTLS-SRTP** encrypted WebRTC channels, never traversing media servers in cleartext.

---

## 🚀 Key Application Features

* **🔒 Strict 100% Zero-Knowledge E2EE:**
  Hybrid envelope encryption utilizing ECDH (NIST Curve P-256), HKDF-SHA256, and AES-GCM-256 with Dual Diffie-Hellman ($DH_1$ ephemeral for forward secrecy, $DH_2$ static for sender authentication) and strict cryptographic AAD binding.
* **📹 1-on-1 Voice, Video & Screen Sharing (WebRTC):**
  Full-duplex peer-to-peer audio and video calls. Includes dynamic Metered.ca TURN & Google STUN fallback, Opus audio tuning with in-band Forward Error Correction (FEC), real-time adaptive quality scaling (Good/Fair/Poor), mid-call device switching without SDP renegotiation, mobile front/back camera flipping with un-mirroring, screen sharing with detail preservation, ambient frosted backdrops, and an isolated audio playback pipeline.
* **💬 Real-Time Messaging & Sockets:**
  Low-latency bidirectional socket communication powered by Socket.io, featuring per-recipient delivered/seen read receipts (single tick, double tick, blue double ticks), presence tracking (online/offline/last seen), and live typing indicators.
* **📊 Encrypted Interactive Polls:**
  Create single-choice or multi-choice polls. Poll questions, options, and individual votes are end-to-end encrypted with zero length leakage, animated progress bars, voter avatar stacks, and a detailed "View Votes" inspection modal.
* **📎 Two-Tier Encrypted Media & Document Attachments:**
  Transmit photos, videos, voice recordings, PDFs, and files up to 15 MiB. Files are symmetrically encrypted on the client into `.enc` binary blobs before uploading to Cloudinary; keys and IVs are sealed within the message envelope.
* **🎞️ In-Browser Client-Side WebAssembly Video-to-GIF Conversion:**
  Convert video recordings or clips into GIF format directly inside the client browser using `@ffmpeg/ffmpeg` and WebAssembly (`wasmURL` via CDN/blob), offloading server processing and preserving privacy.
* **📄 Integrated In-App PDF Document Viewer:**
  Inspect shared PDF documents directly inside the browser using an embedded `pdfjs-dist` worker with pagination, rotation, and zoom controls.
* **🎙️ Voice Notes Recorder with Live Waveform:**
  Record and preview audio messages directly inside the chat bar with a multi-bar volume visualizer (powered by the Web Audio API `AnalyserNode`) and variable playback speeds (1x, 1.5x, 2x).
* **😄 Sealed Reactions, Emojis & Giphy Integration:**
  React to messages with emoji pills and browse animated GIFs via GIPHY API integration. Reactions derive symmetric keys from message secrets with 64-byte fixed-block zero-leakage padding.
* **↩️ Quoted Replies (Swipe-to-Reply):**
  Reply directly to any message on desktop or mobile with touch swipe gestures. Quoted snippets remain sealed within the encrypted payload.
* **🛡️ Signal-Compatible Safety Numbers & QR Verification:**
  Verify contacts with 60-digit safety numbers (12 blocks of 5 digits) or by scanning dynamic QR codes to guard against Man-in-the-Middle (MITM) attacks.
* **🔑 Encrypted Key Backup & Passphrase Recovery:**
  Export and restore private device keys via a passphrase-derived PBKDF2 (600,000 iterations of SHA-256, adhering to OWASP guidelines) and AES-GCM backup saved to the server.
* **🔔 Web Push Notifications with Background Service Worker Decryption:**
  Receive Web Push notifications when offline or in the background. A dedicated Service Worker (`sw-e2ee.js`) retrieves the device private key from IndexedDB to decrypt message and poll previews client-side.
* **🔍 Client-Side Local Message Search with Context Fetching:**
  Search message histories instantly without leaking plaintext to the server. Decrypted messages are indexed locally in client-side IndexedDB (`threadline-messages-cache`), with automated bidirectional server history loading (`around=<messageId>`).
* **🎨 20 Built-In UI Themes & DiceBear Avatars:**
  Toggle between 20 color themes (System, Light, Dark, Ocean, Mint, Sunset, Rose, Lavender, Forest, Midnight, Coffee, Sky, Sand, Lemon, Slate, Graphite, Crimson, Amethyst, Nord, Abyss) and customize profiles using DiceBear avatar generation or custom photo uploads.

---

## 🔄 End-to-End Application Workflow

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             THREADLINE SYSTEM OVERVIEW                           │
└──────────────────────────────────────────────────────────────────────────────────┘

 [ CLIENT (Browser 1) ]             [ UNTRUSTED SERVER ]            [ CLIENT (Browser 2) ]
        │                                    │                                    │
        │── 1. Register / Login ────────────►│◄─── 1. Register / Login ──────────│
        │   (Publishes ECDH Public Key)      │    (Publishes ECDH Public Key)     │
        │                                    │                                    │
        │── 2. Request Recipient Keys ──────►│                                    │
        │◄─ Returns Bob's Public Key(s) ─────│                                    │
        │                                    │                                    │
        │── 3. Encrypt Envelope (DH1+DH2) ──►│── Broadcasts Encrypted Msg ───────►│
        │   (AES-256-GCM + Ephemeral Key)    │   (Stripped via viewForUser)       │
        │                                    │                                    │
        │── 4. WebRTC Call Signaling ───────►│── Forward SDP Offer / ICE ────────►│
        │◄─ Forward SDP Answer / ICE ────────│◄─ Return SDP Answer / ICE ────────│
        │                                    │                                    │
        │◄═══════════════ P2P DTLS-SRTP Media Stream (Audio/Video/Screen) ═══════►│
        │                                                                         │
```

### 1. Authentication & Device Identity Registration
1. **User Authentication:** The client authenticates via email/password (`POST /api/auth/register` or `POST /api/auth/login`) or Google OAuth 2.0 (`GET /api/auth/google`). Tokens are issued as HTTP-only cookies (`accessToken` and `refreshToken`).
2. **Device Key Initialization:** Upon logging in, `E2EEContext` checks IndexedDB (`threadline-e2ee` -> `deviceKeys`) for an existing device keypair.
3. **Key Generation:** If none exists, `generateDeviceKeyPair()` generates an ECDH NIST P-256 keypair. The private key remains in IndexedDB marked non-extractable.
4. **Directory Publication:** The client exports the uncompressed public key (raw base64url, 65 bytes decoded / 87 chars) and publishes it along with a unique `deviceId` via `PUT /api/keys/device`.

### 2. Room Creation & Membership Management
1. **Direct Chats:** When initiating a 1-on-1 conversation, `POST /api/rooms` creates a `private` room.
2. **Group Chats:** When creating a group, `POST /api/rooms` creates a `group` room with the creator assigned `isAdmin: true`.
3. **Admin Controls:** Room administrators can add members (`POST /api/rooms/:roomId/members`), remove members (`DELETE /api/rooms/:roomId/members/:memberId`), promote admins (`POST /api/rooms/:roomId/admins`), demote admins (`DELETE /api/rooms/:roomId/admins/:memberId`), update group names, or upload group avatars.
4. **System Events:** Membership modifications generate immutable system messages stored in MongoDB (`kind: "member-added"`, `"member-promoted"`, etc.) and broadcast to the room.

### 3. Messaging & Envelope Encryption Lifecycle
1. **Key Discovery:** Before sending, the sender calls `getRoomEncryption(roomId)` to retrieve public keys for all recipient devices in the room.
2. **Envelope Assembly:**
   * A random 32-byte symmetric `MessageKey` is generated (`AES-GCM-256`).
   * The message payload (JSON containing `text`, `media`, `replyTo`, `poll`, or `secret`) is encrypted with `MessageKey`.
   * For each recipient device, a fresh ephemeral keypair (`epk`, `esk`) is generated.
   * Dual Diffie-Hellman is computed: $DH_1 = \text{ECDH}(esk, \text{RecipientKey})$ and $DH_2 = \text{ECDH}(\text{SenderStaticKey}, \text{RecipientKey})$.
   * A wrap key is derived via HKDF-SHA256, which encrypts `MessageKey`.
3. **Transmission:** The client emits `message:send` via Socket.io with the encrypted envelope `{ v: 1, senderDeviceId, spk, iv, ciphertext, keys: [...] }`.
4. **Server Validation & Relay:** The server verifies envelope parameters via `validateEnvelope()`, stores the message in MongoDB, and broadcasts `message:new` to room members.
5. **Decryption:** The recipient device finds its entry in `keys[]`, computes $DH_1$ and $DH_2$, derives the wrap key, unwraps `MessageKey`, and decrypts the ciphertext payload.

### 4. Encrypted Media & Document Pipeline
1. **Client-Side Symmetric Encryption:** When a user attaches an image, video, audio file, or PDF:
   * The browser generates a random 32-byte `MediaKey` and 12-byte `MediaIv`.
   * The raw file `ArrayBuffer` is encrypted with `AES-GCM-256`.
2. **Ciphertext Upload:** The resulting encrypted `.enc` binary blob is uploaded via `POST /api/media/upload` to Cloudinary.
3. **Zero-Knowledge Storage:** Cloudinary and the server only store encrypted binary noise.
4. **Envelope Packaging:** The Cloudinary URL, along with the base64url-encoded `MediaKey`, `MediaIv`, original filename, and MIME type, is sealed inside the encrypted message payload.
5. **Playback & Rendering:** The recipient decrypts the envelope, fetches the encrypted binary from Cloudinary, decrypts the `ArrayBuffer` with `MediaKey`, and instantiates a local blob URL (`URL.createObjectURL(blob)`).
6. **WebAssembly Video-to-GIF Conversion:** When sending animated clips or converting video to GIF, `client/src/features/chat/lib/gifConverter.js` utilizes `@ffmpeg/ffmpeg` to process video in WebAssembly client-side before encrypting.

### 5. Quoted Replies & Context Binding
1. **Quote Capturing:** When swiping or clicking reply on a message, the client captures `{ id, senderName, text, mediaType }`.
2. **Sealed Inside Payload:** This metadata is bundled directly into `payload.replyTo` before envelope encryption.
3. **Database Anonymity:** On the MongoDB `Message` document, `replyTo` remains undefined. Eavesdroppers cannot discover which message was quoted or read quoted snippets.

### 6. Sealed Emoji Reactions (Message Secret & Zero Leakage)
1. **Message Secret:** Every message contains a random 32-byte `secret` generated by the sender and sealed in the payload.
2. **Key Derivation:** Anyone reacting to the message derives a symmetric reaction key:
   $$\text{reactionKey} = \text{HKDF}(\text{IKM}=\text{secret}, \text{info}=\text{"threadline-e2ee/v1/reaction-key|" } \parallel \text{roomId} \parallel \text{"|" } \parallel \text{messageId})$$
3. **Fixed-Block Padding:** Emojis are encoded into a fixed 64-byte block (`REACTION_BLOCK`) where byte 0 indicates length, preventing emoji identification through ciphertext length.
4. **AAD Binding:** Authenticated Additional Data binds the reaction to the room, message, and reacting user ID.
5. **Relay:** Sockets emit `message:react` and broadcast `message:reaction-update`.

### 7. Interactive Encrypted Polls & Voting
1. **Poll Creation:** The creator seals the poll question, options, and settings (`allowMultipleAnswers`) inside `payload.poll`. The server only receives anonymous option ID placeholders (`[{ id: "opt_0" }, { id: "opt_1" }]`).
2. **Encrypted Voting:** Voters derive a `voteKey` using the message `secret`:
   $$\text{voteKey} = \text{HKDF}(\text{IKM}=\text{secret}, \text{info}=\text{"threadline-e2ee/v1/poll-vote-key|" } \parallel \text{roomId} \parallel \text{"|" } \parallel \text{messageId})$$
3. **Fixed-Block Padding:** Option choices are padded into a fixed 128-byte block (`POLL_VOTE_BLOCK`) and encrypted with AES-GCM-256.
4. **Vote Relay:** The client emits `message:poll-vote`. The server updates `message.poll.votes` and broadcasts `message:poll-vote-update`.
5. **Client-Side Aggregation:** Clients decrypt all votes locally using `message.secret` and dynamically compute vote counts, percentages, and voter avatar lists.

### 8. Message Edits & Soft Deletion Lifecycle
1. **15-Minute Edit Window:** Users can edit messages within 15 minutes (`EDIT_WINDOW_MS = 15 * 60 * 1000`). Edits must be re-encrypted with a fresh E2EE envelope and emitted via `message:edit`.
2. **Soft Deletion:** Senders can soft-delete messages at any time via `message:delete`. The server wipes text, poll data, reactions, and the E2EE envelope, sets `deletedAt: new Date()`, and deletes the media asset from Cloudinary (if `mediaPublicId` is provided).

### 9. Safety Numbers & Cryptographic Verification
1. **Algorithm:** Both participants' public keys are sorted lexicographically and hashed with SHA-256.
2. **Format:** The resulting hash is converted into 12 blocks of 5 decimal digits (60 digits total), matching Signal's safety number specification.
3. **Verification:** Users compare safety numbers or scan the QR code (`SafetyNumberDialog.jsx`) to verify identity. When verified, trust states are preserved in IndexedDB.
4. **Key Change Notices:** If a user registers a new device key, `KeyChangeNotice.jsx` alerts conversation partners that the safety number has changed.

### 10. Encrypted Key Backup & Multi-Device Recovery
1. **Passphrase KDF:** A 256-bit AES key is derived from a user passphrase using PBKDF2 with **600,000 iterations** of SHA-256 and a random 16-byte salt (OWASP standard).
2. **Encrypted Key Vault:** Private device keys are encrypted with the derived key and stored on the server (`KeyBackup` model).
3. **Cross-Device Recovery:** Upon logging into a secondary browser, the user supplies their passphrase to unwrap and import existing keys.

### 11. Web Push Notifications with Service Worker Decryption
1. **VAPID Subscription:** The client fetches the server's VAPID public key via `GET /api/push/public-key`, subscribes via `PushManager`, and posts the endpoint via `POST /api/push/subscribe`.
2. **Notification Dispatch:** When a message is sent to an offline or backgrounded user, the server dispatches a push payload containing the encrypted envelope.
3. **Service Worker Decryption (`sw-e2ee.js`):** The Service Worker intercepts the `push` event, loads the device's private key from IndexedDB, derives the wrap key, decrypts the message body, and triggers a native operating system notification with decrypted text.

### 12. Local Search with Client-Side IndexedDB & Fetch-Around
1. **Local Search Indexing:** Decrypted messages are indexed in the browser's IndexedDB database (`threadline-messages-cache`) under the `messages` object store with compound indexes (`room_created: [roomId, createdAt]`).
2. **Zero-Knowledge Search:** Searching across message text executes strictly client-side via `useChatSearch.js`.
3. **Fetch-Around Navigation:** If a search result points to an older message not currently loaded in the React DOM, the client invokes `GET /api/rooms/:roomId/messages?around=<targetMessageId>&limit=30` to load contiguous message history centered around the match.

### 13. WebRTC Voice, Video & Screen Sharing Lifecycle
1. **Signaling Connection:** When a call is initiated, the caller emits `call:initiate` over Socket.io. The server validates room membership, confirms the callee is online, and dispatches `call:incoming`.
2. **ICE Discovery:** Both clients query `GET /api/calls/ice-servers` to receive dynamic Metered.ca TURN credentials or Google STUN fallbacks.
3. **SDP Negotiation:** Callers exchange SDP offers and answers via `call:sdp-offer` and `call:sdp-answer`.
4. **Media Setup:** Once the WebRTC peer connection reaches `connected`, the client emits `call:media-connected`.
5. **In-Call Features:** Participants can mute audio, disable video, flip cameras, share screens, switch hardware devices, and view adaptive connection quality indicators.

---

## 🔒 E2EE Cryptographic Architecture

### Cryptographic Primitives

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Threadline Crypto Stack                         │
├──────────────────────────┬─────────────────────────────────────────────┤
│ Asymmetric Key Agreement │ ECDH with NIST Curve P-256                  │
│ Symmetric Cipher         │ AES-GCM (256-bit key, 12-byte random IV)    │
│ Key Derivation Function  │ HKDF with SHA-256 hash (32-byte zero salt)  │
│ Key Backup KDF           │ PBKDF2 (600,000 iterations, SHA-256, salt)  │
│ Integrity & Authenticity │ AES-GCM 128-bit authentication tag + AAD    │
│ Reaction & Vote Padding  │ Fixed-block size padding (Zero length leak) │
└──────────────────────────┴─────────────────────────────────────────────┘
```

### Dual Diffie-Hellman Key Agreement

Threadline implements Dual Diffie-Hellman to guarantee both **Forward Secrecy** and **Sender Authentication**:

$$\text{DH}_1 = \text{ECDH}(\text{ephemeralPrivateKey}, \text{recipientPublicKey})$$
$$\text{DH}_2 = \text{ECDH}(\text{senderStaticPrivateKey}, \text{recipientPublicKey})$$

The derived wrap key combines both shared secrets:

$$\text{WrapKey} = \text{HKDF-Extract-and-Expand}(\text{IKM} = \text{DH}_1 \parallel \text{DH}_2, \text{salt} = 0^{32}, \text{info} = \text{wrapInfo})$$

* **Forward Secrecy ($DH_1$):** A fresh ephemeral key is generated per envelope. Compromising a user's static identity key does not reveal past session keys.
* **Sender Authentication ($DH_2$):** Only the genuine owner of the sender's static private key could compute $DH_2$. Rogue relays cannot impersonate senders.

### Authenticated Additional Data (AAD) & Context Binding

To prevent ciphertext cut-and-paste, replay, or cross-room injection attacks, AES-GCM enforces strict AAD binding:

$$\text{AAD}_{\text{body}} = \text{"threadline-e2ee/v1/body|" } \parallel \text{roomId} \parallel \text{"|" } \parallel \text{senderUserId} \parallel \text{"|" } \parallel \text{senderDeviceId}$$

$$\text{AAD}_{\text{wrap}} = \text{"threadline-e2ee/v1/wrap|" } \parallel \text{roomId} \parallel \text{"|" } \parallel \text{senderUserId} \parallel \text{"|" } \parallel \text{senderDeviceId} \parallel \text{"|" } \parallel \text{spk} \parallel \text{"|" } \parallel \text{recipientUserId} \parallel \text{"|" } \parallel \text{recipientDeviceId} \parallel \text{"|" } \parallel \text{epk}$$

### Zero-Leakage Fixed-Block Padding

* **Reactions (`REACTION_BLOCK = 64 bytes`):** Emoji strings are written to a 64-byte array. Byte 0 stores the UTF-8 payload length; remaining bytes are zero-padded before encryption.
* **Poll Votes (`POLL_VOTE_BLOCK = 128 bytes`):** Vote selections (`["opt_0", "opt_1"]`) are packed into a 128-byte block.

### Server-Side Privacy Filtering (`viewForUser`)

When returning room messages or broadcasting `message:new`, the server invokes `viewForUser(message, userId)`:
* The server strips away all other recipients' wrapped key entries from `e2ee.keys[]`.
* Each recipient receives an envelope containing **only their own device's wrapped key entry**.
* Participants cannot inspect the device count or public keys of third-party recipients.

---

## 📹 WebRTC Media & Calling Engine

```
                        ┌─────────────────────────┐
                        │    Metered.ca / STUN    │
                        │ (Dynamic ICE Discovery) │
                        └────────────▲────────────┘
                                     │ /api/calls/ice-servers
                                     │
 ┌──────────────────┐         ┌──────┴──────┐         ┌──────────────────┐
 │  Caller Browser  │◄───────►│  Signaling  │◄───────►│  Callee Browser  │
 │  (Window 1)      │ Socket  │ Server (Node│ Socket  │  (Window 2)      │
 └────────▲─────────┘ Events  └─────────────┘ Events  └────────▲─────────┘
          │                                                    │
          └───────────── P2P Encrypted Media Stream ───────────┘
                        (DTLS-SRTP Audio / Video / Screen)
```

### Signaling Protocol & Session Lifecycle
* Handled through authenticated WebSockets (`server/src/sockets/handlers/call.handler.js`).
* **Bound Socket Isolation:** A call session is tied to one specific browser socket ID. Other tabs sharing the account cannot intercept signaling or tear down calls.
* **Resume Tokens:** When an unexpected network drop occurs, a secret 24-byte `rejoinToken` permits only the dropped tab to reconnect during a 10-second grace window (`CALL_RECONNECT_GRACE_MS`).
* **Multi-Tab Dismissal:** Answering or declining a call on one device broadcasts `call:answered-elsewhere` to dismiss ringing across all other devices.

### Dynamic Metered.ca TURN & Google STUN Fallback
* `GET /api/calls/ice-servers` queries the Metered.ca REST API for time-limited TURN credentials.
* **5-Minute In-Memory Cache:** Results are cached in server memory for 5 minutes (`CACHE_TTL_MS = 5 * 60 * 1000`) with `AbortController` timeout fallbacks to Google public STUN (`stun:stun.l.google.com:19302`).

### Opus Voice Tuning & Audio Optimization
The `tuneOpus()` helper inspects and modifies the SDP before negotiation:
* Forces mono audio (`stereo=0;sprop-stereo=0`) for maximum Acoustic Echo Cancellation (AEC) efficiency.
* Enables in-band Forward Error Correction (`useinbandfec=1`) to reconstruct lost packets across jittery networks.
* Caps maximum average bitrate at 32 kbps (`maxaveragebitrate=32000`) for wideband HD voice.

### Adaptive Network Quality Scaling & Degradation Tiers
`useWebRTC.js` runs a WebRTC statistics monitor every 4 seconds (`pc.getStats()`):

| Profile | Trigger Criteria | Camera Bitrate / FPS | Screen Bitrate / FPS | Scale Factor |
| :--- | :--- | :--- | :--- | :--- |
| **Good** | Default / Loss $\le 3\%$, RTT $\le 300\text{ms}$ | 1,500 kbps @ 30 FPS | 2,500 kbps @ 15 FPS | 1.0× (Native) |
| **Fair** | Loss $> 3\%$ or RTT $> 300\text{ms}$ | 800 kbps @ 24 FPS | 1,200 kbps @ 10 FPS | 1.5× Downscale |
| **Poor** | Loss $> 10\%$ or RTT $> 600\text{ms}$ | 300 kbps @ 15 FPS | 500 kbps @ 5 FPS | 2.0× Downscale |

* **Hysteresis Recovery:** Downscales immediately upon network congestion. Recovers to higher tiers only after 3 consecutive clean cycles (`goodStreak >= 3`).
* **Detail Preservation:** Screen share tracks enforce `contentHint = "detail"` and `degradationPreference = "maintain-resolution"`, reducing framerate before resolution.

### Aspect Ratio Engine (Fit vs. Fill) & Ambient Backdrops
* Managed by `VideoGrid.jsx` with viewport math (`FILL_TOLERANCE = 1.2`).
* When video dimensions deviate from viewport aspect ratios, it switches between full-bleed `fill` and letterboxed `fit`. Screen shares are forced to `fit`.
* In `fit` mode, a duplicate blurred video background (`blur-2xl opacity-40`) renders an ambient halo backdrop.

### Mid-Call Track Hot-Swapping (Zero Renegotiation)
* Changing microphones or webcams via `DevicePicker.jsx` replaces tracks directly on active transceivers (`transceiver.sender.replaceTrack(newTrack)`).
* **Zero SDP Renegotiation:** Eliminates call stutter and video freezes when switching inputs mid-call.

### Audio Output Routing & Speaker Fallback
* Uses the HTML5 `setSinkId()` API to route remote call audio across headphones, USB headsets, or external speakers.
* Unplugging an active audio device triggers an automatic fallback to the system default speaker.

### Mobile Camera Flipping & Dynamic Un-Mirroring
* `flipCamera()` cycles through available mobile cameras using `{ facingMode: { exact: "environment" } }`.
* Emits a `"rearcam"` media toggle socket event.
* `VideoGrid.jsx` mirrors front-facing selfie video (`scale-x-[-1]`) but **removes mirroring for rear camera feeds**, ensuring printed text and documents remain readable.

### Audio Playback Isolation Pipeline
* Remote call audio is piped exclusively through a dedicated top-level `<RemoteAudio outputDeviceId={...} />` element.
* All `<video>` elements are permanently forced to `muted={true}` via properties and DOM attributes.
* Minimizing or altering video layouts never interrupts audio playback or creates echo loops.

### Speaking Loudness Detector via Web Audio API
* `useSpeakingDetector.js` connects media streams to an `AudioContext` and `AnalyserNode`.
* Analyzes Root Mean Square (RMS) volume without outputting to the audio destination, displaying animated speaking rings around participant avatars.

---

## 📂 Project Directory Structure

```
Project/
├── client/                                  # Frontend Application (React 19 + Vite 8 + Tailwind CSS v4)
│   ├── public/                              # Static public assets & Service Workers
│   │   ├── apple-touch-icon.png             # Apple touch home screen icon
│   │   ├── favicon.svg                      # Threadline SVG favicon
│   │   ├── icon-192.png / icon-512.png      # PWA application icons
│   │   ├── icon-maskable-512.png            # Android adaptive maskable icon
│   │   ├── logo.svg                         # Threadline brand vector logo
│   │   ├── manifest.webmanifest             # PWA Web App Manifest configuration
│   │   ├── sw.js                            # Main Service Worker (caching & push notifications)
│   │   └── sw-e2ee.js                       # Service Worker background E2EE push decryptor
│   ├── src/
│   │   ├── app/                             # Core Application Shell & Routing
│   │   │   ├── providers/                   # Infrastructure context providers
│   │   │   │   ├── SocketContext.jsx        # Socket.io connection lifecycle manager
│   │   │   │   └── ThemeContext.jsx         # 20-Theme color provider & HTML theme injector
│   │   │   ├── App.jsx                      # App root component
│   │   │   ├── AppProviders.jsx             # Top-level context provider pipeline
│   │   │   ├── AppRoutes.jsx                # React Router v7 declarative route table
│   │   │   └── ProtectedRoute.jsx           # Auth guard wrapper for authenticated views
│   │   ├── assets/                          # Static branding images (hero.png, react.svg)
│   │   ├── components/                      # Shared UI Component Library
│   │   │   ├── common/                      # Compound components (AvatarPicker, ThemePicker, Bubbles)
│   │   │   └── ui/                          # Radix UI primitives & Tailwind components
│   │   │       ├── avatar.jsx               # Avatar with fallback letters & image support
│   │   │       ├── button.jsx               # Button primitive with CVA variants
│   │   │       ├── card.jsx                 # Card container primitive
│   │   │       ├── dialog.jsx               # Modal dialog portal primitive
│   │   │       ├── input.jsx                # Form input primitive
│   │   │       ├── label.jsx                # Form label primitive
│   │   │       └── sonner.jsx               # Sonner toast container configuration
│   │   ├── features/                        # Domain Features (Vertical Slices)
│   │   │   ├── auth/                        # User authentication & profile feature
│   │   │   │   ├── api/authApi.js           # REST endpoints: register, login, refresh, logout, me
│   │   │   │   ├── context/AuthContext.jsx  # Authenticated session & user token state
│   │   │   │   └── pages/                   # Login, Register, Profile, and OAuthCallback views
│   │   │   ├── chat/                        # Messaging, rooms, media & polling feature
│   │   │   │   ├── api/                     # Rooms, users, and media upload endpoints
│   │   │   │   │   ├── mediaApi.js          # Cloudinary encrypted blob upload endpoint
│   │   │   │   │   ├── roomsApi.js          # Room list, creation, history, member administration
│   │   │   │   │   └── usersApi.js          # User directory, theme, and notification preferences
│   │   │   │   ├── components/              # Chat UI layout & message views
│   │   │   │   │   ├── media/               # Media attachments, audio recording, PDF/GIF viewers
│   │   │   │   │   │   ├── CustomAudioPlayer.jsx # Audio note playback with waveforms
│   │   │   │   │   │   ├── CustomVideoPlayer.jsx # In-chat video player with custom controls
│   │   │   │   │   │   ├── DownloadLink.jsx      # Encrypted blob downloader
│   │   │   │   │   │   ├── EmojiPickerPopover.jsx# Emoji selection popover
│   │   │   │   │   │   ├── FileAttachmentCard.jsx# Document attachment card
│   │   │   │   │   │   ├── GifPickerButton.jsx   # GIPHY picker toggle button
│   │   │   │   │   │   ├── GifPickerPopover.jsx  # GIPHY GIF search popover
│   │   │   │   │   │   ├── GifVideoPlayer.jsx    # Looping muted GIF player
│   │   │   │   │   │   ├── ImageAttachment.jsx   # Decrypted image thumbnail & modal preview
│   │   │   │   │   │   ├── MediaAttachment.jsx   # Attachment dispatcher by MIME kind
│   │   │   │   │   │   ├── MediaPreviewModal.jsx # Fullscreen media viewer
│   │   │   │   │   │   ├── PdfAttachment.jsx     # PDF preview card
│   │   │   │   │   │   ├── PdfViewer.jsx         # In-app PDF pagination & zoom viewer
│   │   │   │   │   │   └── VoiceRecorder.jsx     # Microphone recorder with animated bars
│   │   │   │   │   ├── polls/               # Poll creation, voting bubble & vote inspection modal
│   │   │   │   │   │   ├── CreatePollDialog.jsx  # Poll authoring modal
│   │   │   │   │   │   ├── PollBubble.jsx        # In-chat interactive voting bubble
│   │   │   │   │   │   └── PollVotesDialog.jsx   # Voter breakdown inspection modal
│   │   │   │   │   ├── ChatWindow.jsx       # Main chat viewport, header, and messages feed
│   │   │   │   │   ├── LinkPreview.jsx      # Auto-detected link card preview
│   │   │   │   │   ├── MembersPanel.jsx     # Group member roster & administrative controls
│   │   │   │   │   ├── MessageBubble.jsx    # WhatsApp-style message bubble (ticks, quotes, pills)
│   │   │   │   │   ├── MessageInput.jsx     # Input bar with attachments, voice notes, and polls
│   │   │   │   │   ├── MessageSearchBar.jsx # Client-side search bar with match counter
│   │   │   │   │   ├── NewChatDialog.jsx    # Create DM or group conversation dialog
│   │   │   │   │   ├── QuickReactBar.jsx    # Hover emoji quick reaction bar
│   │   │   │   │   ├── ReactionPills.jsx    # Emoji aggregation pills below messages
│   │   │   │   │   ├── RoomList.jsx         # Conversation sidebar with unread badges
│   │   │   │   │   ├── SystemMessage.jsx    # Group activity pill (members added, names changed)
│   │   │   │   │   └── TypingIndicator.jsx  # Live "Alice is typing..." indicator
│   │   │   │   ├── hooks/                   # Chat utility hooks
│   │   │   │   │   ├── useChatScroll.js     # Smart auto-scroll and unread divider tracker
│   │   │   │   │   ├── useChatSearch.js     # Client-side IndexedDB search & highlight jumper
│   │   │   │   │   ├── usePickerTheme.js    # Syncs picker popovers with active UI theme
│   │   │   │   │   └── useVoiceRecorder.js  # Web Audio API voice recorder hook
│   │   │   │   ├── lib/                     # Chat helper functions
│   │   │   │   │   ├── gifConverter.js      # Client-side WebAssembly video/GIF converter (@ffmpeg)
│   │   │   │   │   └── mediaUtils.js        # File MIME type and extension analyzer
│   │   │   │   └── pages/Dashboard.jsx      # Primary authenticated dashboard interface
│   │   │   ├── e2ee/                        # End-to-End Encryption engine & verification UI
│   │   │   │   ├── api/keysApi.js           # Public device key & backup REST endpoints
│   │   │   │   ├── components/              # E2EE modals & indicators
│   │   │   │   │   ├── BackupSettings.jsx   # Passphrase key backup export & import view
│   │   │   │   │   ├── EncryptionNotice.jsx # Header encryption badge & tooltip
│   │   │   │   │   ├── EncryptionStatus.jsx # Device key status indicator
│   │   │   │   │   ├── KeyChangeNotice.jsx  # Security warning when a contact's key changes
│   │   │   │   │   └── SafetyNumberDialog.jsx # 60-digit safety number & QR verification modal
│   │   │   │   ├── context/E2EEContext.jsx  # Device key initialization & room encryption state
│   │   │   │   ├── hooks/useVerification.js # Verification state & roster monitoring
│   │   │   │   └── lib/                     # Web Crypto engine
│   │   │   │       ├── backup.js            # PBKDF2 (600,000 iters) key backup encryption/restoration
│   │   │   │       ├── crypto.js            # ECDH P-256, Dual DH, HKDF, AES-GCM envelope engine
│   │   │   │       ├── deviceKey.js         # Browser keypair generation & IndexedDB storage
│   │   │   │       ├── directory.js         # Public key fetching & caching layer
│   │   │   │       ├── encoding.js          # Base64url and Uint8Array converters
│   │   │   │       ├── identity.js          # Local identity state manager
│   │   │   │       ├── keyStore.js          # IndexedDB wrapper for private device keys
│   │   │   │       ├── media.js             # Two-tier media symmetric encryption engine
│   │   │   │       ├── messages.js          # Envelope builder, unpacker, reaction & vote builder
│   │   │   │       ├── messageStore.js      # IndexedDB decrypted local search cache
│   │   │   │       ├── safety.js            # Signal-compatible 60-digit safety number algorithm
│   │   │   │       └── verification.js      # Contact trust verification store
│   │   │   ├── notifications/               # Push & In-App Notification feature
│   │   │   │   ├── api/pushApi.js           # Web Push subscription endpoints
│   │   │   │   ├── components/              # Notification banner & background notification manager
│   │   │   │   │   ├── NotificationBanner.jsx # Permission request prompt banner
│   │   │   │   │   └── NotificationManager.jsx# Foreground push handler & tab badge manager
│   │   │   │   ├── hooks/                   # Browser notification switches & push subscription hooks
│   │   │   │   │   ├── useBrowserNotifications.js # Web Notifications API permission controller
│   │   │   │   │   ├── useChatNotifications.js    # Unread tab title ticker & audio chime
│   │   │   │   │   └── usePushSubscription.js     # Service Worker VAPID sync hook
│   │   │   │   └── lib/                     # Notification helpers & VAPID push worker clients
│   │   │   │       ├── notifications.js     # In-app sound player & device ID helpers
│   │   │   │       └── push.js              # PushManager subscription coordinator
│   │   │   └── videoCall/                   # 1-on-1 Voice, Video & Screen Sharing feature
│   │   │       ├── api/callsApi.js          # Dynamic Metered.ca TURN & Google STUN endpoints
│   │   │       ├── components/              # Active call dialogs and media views
│   │   │       │   ├── CallControls.jsx     # Floating control dock (mute, cam, screen, hangup)
│   │   │       │   ├── CallModal.jsx        # Full-window call viewport & quality indicators
│   │   │       │   ├── DevicePicker.jsx     # Mid-call hardware selector popover
│   │   │       │   ├── IncomingCallDialog.jsx# Synchronous locked incoming call notification
│   │   │       │   ├── RemoteAudio.jsx      # Permanent isolated audio playback element
│   │   │       │   └── VideoGrid.jsx        # Video viewport with Fit/Fill and PiP rendering
│   │   │       ├── context/CallContext.jsx  # WebRTC state machine & signaling coordinator
│   │   │       └── hooks/                   # Calling hooks
│   │   │           ├── useCallSound.js      # Ringtones, ringback, and call-ended audio synthesizer
│   │   │           ├── useMediaDevices.js   # Hardware enumerator, hot-swap & constraints manager
│   │   │           ├── useSpeakingDetector.js# Web Audio API RMS speaking loudness meter
│   │   │           └── useWebRTC.js         # PeerConnection lifecycle, Opus tuning, adaptive bitrate
│   │   ├── lib/                             # Shared framework-agnostic utilities
│   │   │   ├── axios.js                     # Axios instance with JWT refresh interceptors
│   │   │   ├── socket.js                    # Singleton Socket.io factory with token auto-renewal
│   │   │   ├── themes.js                    # 20 HSL color themes & palette definitions
│   │   │   └── utils.js                     # Utility functions (cn, date formatters, SERVER_ORIGIN)
│   │   ├── styles/                          # Global CSS stylesheets
│   │   │   └── index.css                    # Tailwind CSS v4 directives & theme variables
│   │   └── main.jsx                         # Application entry point
│   ├── index.html                           # Single-page HTML shell
│   ├── jsconfig.json                        # VS Code path aliases configuration (`@/*`)
│   ├── package.json                         # Client dependencies & scripts
│   ├── postcss.config.js                    # PostCSS configuration
│   ├── tailwind.config.js                   # Tailwind CSS configuration
│   └── vite.config.js                       # Vite 8 configuration with path aliases
│
└── server/                                  # Backend Application (Node.js + Express 5 + Mongoose + Socket.io)
    ├── src/
    │   ├── config/                          # Infrastructure & environment setup
    │   │   ├── cloudinary.js                # Cloudinary SDK storage client
    │   │   ├── db.js                        # MongoDB Mongoose connection coordinator
    │   │   ├── env.js                       # Environment variable loader & validator
    │   │   └── passport.js                  # Google OAuth 2.0 Passport strategy
    │   ├── constants/                       # Shared constant definitions
    │   │   └── themes.js                    # Whitelist of 20 allowed theme identifiers
    │   ├── middlewares/                     # Express request processing middlewares
    │   │   ├── authGuard.js                 # JWT cookie validation & req.userId injector
    │   │   ├── errorHandler.js              # Centralized API error formatter & 404 handler
    │   │   ├── mediaUpload.js               # Multer memory storage (15MB limit) for encrypted blobs
    │   │   └── upload.js                    # Multer avatar upload limiter (3MB, JPG/PNG/WebP only)
    │   ├── models/                          # MongoDB Mongoose Schemas
    │   │   ├── DeviceKey.js                 # Registered device public keys (`userId`, `deviceId`, `publicKey`)
    │   │   ├── KeyBackup.js                 # Passphrase-encrypted private key vault
    │   │   ├── Message.js                   # Message documents (E2EE envelope, polls, reactions, receipts)
    │   │   ├── PushSubscription.js          # Browser Web Push notification endpoints
    │   │   ├── Room.js                      # Direct/Group conversations, memberships & permissions
    │   │   └── User.js                      # User profile, credentials, theme & notification settings
    │   ├── modules/                         # Domain Modules (Controller, Service, Routes)
    │   │   ├── auth/                        # Registration, login, logout, refresh, Google OAuth
    │   │   │   ├── auth.controller.js       # Authentication request controllers
    │   │   │   ├── auth.routes.js           # Auth routes
    │   │   │   └── auth.service.js          # User creation, password validation, token signing
    │   │   ├── calls/                       # WebRTC ICE configuration module
    │   │   │   ├── calls.controller.js      # Dynamic Metered.ca TURN & Google STUN handler
    │   │   │   └── calls.routes.js          # Calls routes
    │   │   ├── keys/                        # Device key directory & key backup module
    │   │   │   ├── keys.controller.js       # Device key registration & backup controllers
    │   │   │   ├── keys.routes.js           # Keys routes
    │   │   │   └── keys.service.js          # Device key queries & passphrase backup persistence
    │   │   ├── media/                       # Cloudinary media storage module
    │   │   │   ├── media.controller.js      # Encrypted blob upload controller
    │   │   │   ├── media.routes.js          # Media routes
    │   │   │   └── media.service.js         # Cloudinary stream uploader & asset deletion
    │   │   ├── messages/                    # Message history & E2EE envelope validation
    │   │   │   ├── e2ee.validation.js       # Strict envelope, reaction & poll vote ciphertext validator
    │   │   │   ├── messages.controller.js   # Message history API controller
    │   │   │   └── messages.service.js      # Message queries, fetch-around & system message logger
    │   │   ├── push/                        # Web Push notification module
    │   │   │   ├── push.controller.js       # VAPID public key & subscription endpoints
    │   │   │   ├── push.notifications.js    # Message push dispatcher & background scheduler
    │   │   │   ├── push.routes.js           # Push routes
    │   │   │   └── push.service.js          # Web-push client & payload delivery
    │   │   ├── rooms/                       # Conversation rooms & group administration
    │   │   │   ├── rooms.controller.js      # Room creation, member management, admin roles
    │   │   │   ├── rooms.routes.js          # Rooms routes
    │   │   │   └── rooms.service.js         # Room queries, permissions & avatar uploads
    │   │   └── users/                       # User management & profile settings
    │   │       ├── users.controller.js      # Profile updates, password changes, theme settings
    │   │       ├── users.routes.js          # Users routes
    │   │       └── users.service.js         # User lookups, avatar uploads, preferences
    │   ├── scripts/                         # Maintenance & testing scripts
    │   │   └── sendTestPush.js              # CLI tool for verifying Web Push subscriptions
    │   ├── sockets/                         # Real-Time WebSocket Architecture
    │   │   ├── handlers/                    # Socket domain event handlers
    │   │   │   ├── call.handler.js          # WebRTC P2P signaling, ICE relay, busy check & timeout state
    │   │   │   ├── message.handler.js       # message:send, message:react, message:poll-vote, message:delete
    │   │   │   ├── presence.handler.js      # Online/offline presence, delivery ticks, grace periods
    │   │   │   ├── room.handler.js          # room:join and room:leave channel subscriptions
    │   │   │   └── typing.handler.js        # Ephemeral typing:start and typing:stop broadcasts
    │   │   ├── middlewares/                 # Socket connection middlewares
    │   │   │   └── socketAuth.js            # JWT handshake authentication & userId binding
    │   │   └── index.js                     # Socket.io initialization & channel router
    │   ├── utils/                           # Shared server utility functions
    │   │   ├── ApiError.js                  # Custom operational error class
    │   │   ├── generateTokens.js            # JWT Access/Refresh token generation & cookie config
    │   │   └── imageStorage.js              # Cloudinary avatar buffer uploader & destroyer
    │   ├── app.js                           # Express application configuration & route mounting
    │   └── server.js                        # HTTP server startup & MongoDB connection
    ├── .env.sample                          # Environment variable template
    ├── package.json                         # Backend dependencies & scripts
    └── package-lock.json                    # Locked backend dependency tree
```

---

## 📡 REST API Reference

All protected endpoints require authentication via the `accessToken` HTTP-only cookie.

### Authentication (`/api/auth`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | No | Register a new account (`name`, `email`, `password`). Returns user profile and sets JWT cookies. |
| `POST` | `/api/auth/login` | No | Authenticate with email and password (`email`, `password`). Sets JWT cookies. |
| `POST` | `/api/auth/logout` | No | Invalidate session and clear authentication cookies. |
| `POST` | `/api/auth/refresh` | No | Rotate access token using the HTTP-only `refreshToken` cookie. |
| `GET` | `/api/auth/me` | **Yes** | Retrieve currently authenticated user profile. |
| `GET` | `/api/auth/google` | No | Initiate Google OAuth 2.0 authentication flow. |
| `GET` | `/api/auth/google/callback` | No | Google OAuth redirect callback endpoint. |

### Users & Preferences (`/api/users`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users` | **Yes** | Search and list platform users (`?search=`, `?limit=`). |
| `PATCH`| `/api/users/me` | **Yes** | Update display name (`name`). |
| `PATCH`| `/api/users/me/password` | **Yes** | Change account password (`currentPassword`, `newPassword`). |
| `POST` | `/api/users/me/avatar` | **Yes** | Upload custom user profile photo (Multer: `avatar`, max 3MB). |
| `DELETE`| `/api/users/me/avatar` | **Yes** | Remove custom profile photo and revert to avatar fallback. |
| `PATCH`| `/api/users/me/theme` | **Yes** | Update user UI theme (`theme` must be one of the 20 theme IDs). |
| `PATCH`| `/api/users/me/notifications` | **Yes** | Update push notification preferences (`enabled`, `showPreview`). |

### Rooms & Messaging (`/api/rooms`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/rooms` | **Yes** | List all conversation rooms the user is a member of. |
| `POST` | `/api/rooms` | **Yes** | Create a room (`type: "private" | "group"`, `recipientId`, `name`, `memberIds`). |
| `GET` | `/api/rooms/:roomId/encryption` | **Yes** | Fetch public device keys for all members in the room for E2EE wrapping. |
| `GET` | `/api/rooms/:roomId/messages` | **Yes** | Retrieve message history (`?before=<date>`, `?around=<msgId>`, `?limit=30`). |
| `GET` | `/api/rooms/:roomId/members` | **Yes** | List all participants in a group chat with admin roles. |
| `POST` | `/api/rooms/:roomId/members` | **Yes** | Add new member(s) to a group (`userId`). |
| `DELETE`| `/api/rooms/:roomId/members/:memberId` | **Yes** | Remove a member from the group (Admin only). |
| `POST` | `/api/rooms/:roomId/admins` | **Yes** | Promote a member to group administrator (`memberId`). |
| `DELETE`| `/api/rooms/:roomId/admins/:memberId` | **Yes** | Demote an administrator to regular member. |
| `POST` | `/api/rooms/:roomId/creator` | **Yes** | Transfer group creator status to another administrator (`newCreatorId`). |
| `POST` | `/api/rooms/:roomId/leave` | **Yes** | Leave a group conversation (auto-transfers creator if applicable). |
| `PATCH`| `/api/rooms/:roomId/name` | **Yes** | Update group name (Admin only). |
| `PATCH`| `/api/rooms/:roomId/avatar` | **Yes** | Upload group avatar photo (Multer: `avatar`, max 3MB). |
| `DELETE`| `/api/rooms/:roomId/avatar` | **Yes** | Remove group avatar photo. |

### E2EE Device Keys & Vault Backup (`/api/keys`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `PUT` | `/api/keys/device` | **Yes** | Register or update public key for this device (`deviceId`, `publicKey`). |
| `GET` | `/api/keys/me` | **Yes** | List all active device keys registered to the authenticated user. |
| `GET` | `/api/keys/users/:userId`| **Yes** | Fetch all active public device keys for a specific user. |
| `DELETE`| `/api/keys/device/:deviceId` | **Yes** | Deregister a device key when logging out or revoking access. |
| `GET` | `/api/keys/backup` | **Yes** | Retrieve encrypted key vault bundle and PBKDF2 salt parameters. |
| `PUT` | `/api/keys/backup` | **Yes** | Create initial encrypted key backup (`publicKey`, `kdf`, `wrapped`). |
| `POST` | `/api/keys/backup/entries` | **Yes** | Add an encrypted device key entry to the backup vault. |
| `PUT` | `/api/keys/backup/passphrase` | **Yes** | Change backup passphrase and re-encrypt the vault bundle. |

### Media Upload (`/api/media`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/media/upload` | **Yes** | Upload client-encrypted binary ciphertext blob (Multer: `file`, max 15MB). |

### Web Push Notifications (`/api/push`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/push/public-key` | **Yes** | Retrieve the server's VAPID public key. |
| `POST` | `/api/push/subscribe` | **Yes** | Register a Web Push subscription object (`subscription`, `deviceId`). |
| `POST` | `/api/push/unsubscribe` | **Yes** | Unregister a push subscription endpoint. |

### WebRTC Calls (`/api/calls`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/calls/ice-servers`| **Yes** | Retrieve dynamic Metered.ca TURN & Google STUN ICE server credentials. |

---

## ⚡ WebSocket Event Reference

WebSockets require an authenticated JWT token passed during the connection handshake:
```javascript
io(SERVER_ORIGIN, {
  auth: { token: accessToken, deviceId: currentDeviceId }
})
```

### Connection & Presence Events
| Direction | Event Name | Payload | Description |
| :--- | :--- | :--- | :--- |
| Client $\to$ Server | `disconnecting` | — | Internal socket event capturing active room IDs before departure. |
| Server $\to$ Client | `presence:update` | `{ userId, status, lastSeen }` | Broadcasts user online/offline status changes. |
| Server $\to$ Client | `message:delivered`| `{ roomId, userId, upTo }` | Updates delivery ticks for messages delivered to a reconnected user. |

### Messaging Events
| Direction | Event Name | Payload | Description |
| :--- | :--- | :--- | :--- |
| Client $\to$ Server | `message:send` | `{ roomId, e2ee, poll }` | Dispatches an end-to-end encrypted message envelope. |
| Server $\to$ Client | `message:new` | `{ roomId, message, room }` | Broadcasts new message with user-filtered wrapped keys (`viewForUser`). |
| Client $\to$ Server | `message:seen` | `{ roomId }` | Clears unread counts and marks messages as seen (blue ticks). |
| Server $\to$ Client | `message:seen-update`| `{ roomId, userId, upTo }` | Broadcasts seen timestamp, updating message ticks to blue. |
| Client $\to$ Server | `message:handled` | `{ messageId }` | Confirms receipt in open tab, suppressing fallback push notifications. |
| Client $\to$ Server | `message:react` | `{ roomId, messageId, reaction, remove }` | Attaches or removes a sealed (iv + ciphertext) emoji reaction. |
| Server $\to$ Client | `message:reaction-update`| `{ roomId, messageId, reactions }` | Broadcasts updated list of sealed reactions for a message. |
| Client $\to$ Server | `message:poll-vote`| `{ roomId, messageId, vote }` | Casts a sealed (iv + ciphertext) vote for a poll. |
| Server $\to$ Client | `message:poll-vote-update`| `{ roomId, messageId, votes }` | Broadcasts updated sealed vote collection. |
| Client $\to$ Server | `message:edit` | `{ roomId, messageId, e2ee }` | Replaces a message envelope within 15 minutes of sending. |
| Server $\to$ Client | `message:edited` | `{ roomId, messageId, senderId, editedAt, e2ee }` | Broadcasts edited ciphertext envelope to room members. |
| Client $\to$ Server | `message:delete` | `{ roomId, messageId, mediaPublicId }` | Soft-deletes a message and destroys associated Cloudinary media. |
| Server $\to$ Client | `message:deleted` | `{ roomId, messageId, deletedAt }` | Informs room members to render the deleted message placeholder. |

### Typing Indicators
| Direction | Event Name | Payload | Description |
| :--- | :--- | :--- | :--- |
| Client $\to$ Server | `typing:start` | `{ roomId }` | Informs room members that the user is currently typing. |
| Server $\to$ Client | `typing:start` | `{ roomId, userId, name, avatarUrl }` | Relays typing indicator to everyone in the room except sender. |
| Client $\to$ Server | `typing:stop` | `{ roomId }` | Informs room members that typing has stopped. |
| Server $\to$ Client | `typing:stop` | `{ roomId, userId }` | Clears typing indicator for the specified user. |

### WebRTC Calling Events
| Direction | Event Name | Payload | Description |
| :--- | :--- | :--- | :--- |
| Client $\to$ Server | `call:initiate` | `{ targetUserId, roomId, callType }` | Requests a 1-on-1 voice or video call session. |
| Server $\to$ Client | `call:incoming` | `{ callId, callerId, callerName, callerAvatar, callType, roomId }` | Alerts the callee of an incoming call. |
| Client $\to$ Server | `call:cancel` | `{ callId }` | Caller cancels call before the callee picks up. |
| Server $\to$ Client | `call:cancelled`| `{ callId }` | Informs callee that the incoming call was cancelled. |
| Client $\to$ Server | `call:accept` | `{ callId }` | Callee accepts incoming call. |
| Server $\to$ Client | `call:accepted` | `{ callId, token, calleeId }` | Informs caller that call was accepted; issues resume tokens. |
| Server $\to$ Client | `call:answered-elsewhere` | `{ callId }` | Dismisses ringing on other tabs/devices of the callee. |
| Client $\to$ Server | `call:reject` | `{ callId, reason }` | Callee declines call (`reason: "declined" | "busy"`). |
| Server $\to$ Client | `call:rejected` | `{ callId, reason }` | Informs caller that call was declined or peer was busy. |
| Client $\to$ Server | `call:sdp-offer` | `{ callId, sdp }` | Transmits WebRTC Session Description Protocol offer. |
| Server $\to$ Client | `call:sdp-offer` | `{ callId, sdp }` | Relays SDP offer to the bound peer socket. |
| Client $\to$ Server | `call:sdp-answer`| `{ callId, sdp }` | Transmits WebRTC SDP answer. |
| Server $\to$ Client | `call:sdp-answer`| `{ callId, sdp }` | Relays SDP answer to the bound peer socket. |
| Client $\to$ Server | `call:ice-candidate` | `{ callId, candidate }` | Dispatches WebRTC ICE candidate. |
| Server $\to$ Client | `call:ice-candidate` | `{ callId, candidate }` | Relays ICE candidate to the peer. |
| Client $\to$ Server | `call:media-toggle`| `{ callId, kind, enabled }` | Notifies peer of track toggle (`kind: "audio"|"video"|"screen"|"rearcam"`). |
| Server $\to$ Client | `call:media-toggle`| `{ callId, kind, enabled }` | Relays media state changes to the peer. |
| Client $\to$ Server | `call:media-connected` | `{ callId }` | Reports that DTLS-SRTP media stream is active. |
| Client $\to$ Server | `call:rejoin` | `{ callId, token }` | Reconnects a dropped socket to an ongoing call session. |
| Server $\to$ Client | `call:peer-rejoined` | `{ callId }` | Informs peer that disconnected partner has resumed connection. |
| Server $\to$ Client | `call:peer-offline` | `{ callId }` | Informs peer that partner disconnected and is in grace period. |
| Client $\to$ Server | `call:end` | `{ callId, token }` | Terminates active call session. |
| Server $\to$ Client | `call:ended` | `{ callId, reason, duration }` | Informs both participants that call has ended. |

---

## 🗄️ Database Schema & Data Models

### 1. `User` Model
```javascript
{
  name: { type: String, required: true, minlength: 2, maxlength: 50 },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, select: false },
  googleId: { type: String, default: null },
  avatarUrl: { type: String, default: "" },
  avatarPublicId: { type: String, default: "" },
  theme: { type: String, enum: THEME_IDS, default: "system" },
  notificationSettings: {
    enabled: { type: Boolean, default: true },
    showPreview: { type: Boolean, default: true }
  },
  status: { type: String, enum: ["online", "offline"], default: "offline" },
  lastSeen: { type: Date, default: Date.now },
  timestamps: true
}
```

### 2. `DeviceKey` Model
```javascript
{
  userId: { type: ObjectId, ref: "User", required: true, index: true },
  deviceId: { type: String, required: true },
  publicKey: { type: String, required: true }, // Raw base64url uncompressed ECDH P-256 (65 bytes)
  algorithm: { type: String, enum: ["ecdh-p256"], default: "ecdh-p256" },
  keyVersion: { type: Number, default: 1 },
  timestamps: true
}
// Compound unique index: { userId: 1, deviceId: 1 }
```

### 3. `KeyBackup` Model
```javascript
{
  userId: { type: ObjectId, ref: "User", required: true, unique: true },
  publicKey: { type: String, required: true }, // Backup ECDH P-256 public key
  kdf: {
    name: String,        // "PBKDF2"
    iterations: Number,  // 600,000
    salt: String         // Base64url 16-byte random salt
  },
  wrapped: { iv: String, ciphertext: String }, // Private key wrapped via passphrase key
  entries: [
    {
      deviceId: String,
      publicKey: String,
      epk: String,
      iv: String,
      sealed: String,
      createdAt: { type: Date, default: Date.now }
    }
  ],
  timestamps: true
}
```

### 4. `Room` Model
```javascript
{
  type: { type: String, enum: ["private", "group"], required: true },
  name: { type: String, trim: true },
  encrypted: { type: Boolean, default: true },
  createdBy: { type: ObjectId, ref: "User", default: null },
  groupAvatarUrl: { type: String, default: "" },
  groupAvatarPublicId: { type: String, default: "" },
  members: [
    {
      userId: { type: ObjectId, ref: "User", required: true },
      isAdmin: { type: Boolean, default: false },
      joinedAt: { type: Date },
      unreadCount: { type: Number, default: 0 },
      lastReadMessageId: { type: ObjectId, ref: "Message", default: null }
    }
  ],
  lastMessage: {
    messageId: { type: ObjectId, ref: "Message" },
    text: String,
    sender: { type: ObjectId, ref: "User" },
    createdAt: Date,
    system: Schema.Types.Mixed,
    encrypted: Boolean,
    e2ee: Schema.Types.Mixed // Ciphertext preview for conversation sidebar
  },
  timestamps: true
}
// Index: { "members.userId": 1 }
```

### 5. `Message` Model
```javascript
{
  roomId: { type: ObjectId, ref: "Room", required: true, index: true },
  sender: { type: ObjectId, ref: "User", required: true },
  text: { type: String, default: "" }, // Only populated for system messages / tombstones
  encrypted: { type: Boolean, default: true },
  e2ee: {
    v: Number,
    senderDeviceId: String,
    spk: String,
    iv: String,
    ciphertext: String,
    keys: [
      {
        userId: String,
        deviceId: String,
        epk: String,
        iv: String,
        wrapped: String
      }
    ]
  },
  poll: {
    options: [{ id: { type: String, required: true } }],
    allowMultipleAnswers: { type: Boolean, default: false },
    votes: [
      {
        userId: { type: ObjectId, ref: "User", required: true },
        iv: { type: String, required: true },
        ciphertext: { type: String, required: true }, // Fixed 128-byte block
        updatedAt: { type: Date, default: Date.now }
      }
    ]
  },
  reactions: [
    {
      userId: { type: ObjectId, ref: "User", required: true },
      iv: { type: String, required: true },
      ciphertext: { type: String, required: true } // Fixed 64-byte block
    }
  ],
  deliveredTo: [{ type: ObjectId, ref: "User" }],
  seenBy: [{ type: ObjectId, ref: "User" }],
  type: { type: String, enum: ["user", "system"], default: "user" },
  system: {
    kind: { type: String, enum: [...] },
    actorId: { type: ObjectId, ref: "User" },
    actorName: String,
    targetId: { type: ObjectId, ref: "User" },
    targetName: String,
    meta: { oldName: String, newName: String }
  },
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  timestamps: true
}
```

### 6. `PushSubscription` Model
```javascript
{
  userId: { type: ObjectId, ref: "User", required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  deviceId: { type: String, default: null, index: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true }
  },
  timestamps: true
}
```

---

## 🎨 UI Customization & 20 Built-In Themes

Threadline includes 20 comprehensive UI themes defined in `client/src/lib/themes.js` and whitelisted on the backend in `server/src/constants/themes.js`. Themes inject custom HSL CSS custom property palettes into the `:root` element:

1. **System** (Syncs dynamically with OS `prefers-color-scheme`)
2. **Light** (High-contrast clean daylight interface)
3. **Dark** (Default deep slate nighttime palette)
4. **Ocean** (Deep navy blue with cyan highlights)
5. **Mint** (Fresh crisp eucalyptus green)
6. **Sunset** (Warm dusk gradient with coral accents)
7. **Rose** (Soft blush pink and magenta tones)
8. **Lavender** (Subtle calming violet accents)
9. **Forest** (Deep pine woodland emerald)
10. **Midnight** (Ultra-deep black with electric indigo)
11. **Coffee** (Rich roasted espresso and warm cream)
12. **Sky** (Vibrant bright azure blue)
13. **Sand** (Desert dune warm neutral tones)
14. **Lemon** (Energizing citrus yellow)
15. **Slate** (Cool industrial steel gray)
16. **Graphite** (Monochrome carbon dark styling)
17. **Crimson** (Vivid scarlet red accents)
18. **Amethyst** (Royal deep jewel purple)
19. **Nord** (Arctic blue pastel winter theme)
20. **Abyss** (Pitch black OLED battery-saver profile)

---

## 💻 Tech Stack

### Frontend Architecture
* **Core:** React 19 (`^19.2.8`), React DOM (`^19.2.8`), Vite 8 (`^8.3.0`), React Router DOM v7 (`^7.18.4`)
* **Styling & Icons:** Tailwind CSS v4 (`^4.3.3`), `@tailwindcss/postcss`, Lucide React (`^1.48.0`), Class Variance Authority (`cva`), `clsx`, `tailwind-merge`
* **Real-Time & Media:** Socket.io Client (`^4.8.4`), Native WebRTC (`RTCPeerConnection`, `getStats`), Web Audio API (`AudioContext`, `AnalyserNode`)
* **In-Browser WebAssembly:** `@ffmpeg/ffmpeg` (`^0.12.15`), `@ffmpeg/util` (`^0.12.2`), `@ffmpeg/core` (`^0.12.10`)
* **Cryptography & Storage:** Native Web Crypto API (`window.crypto.subtle`), IndexedDB (`threadline-e2ee` and `threadline-messages-cache`)
* **Document & Pickers:** `pdfjs-dist` (`^6.4.299`), `emoji-picker-react` (`^4.22.3`), `gif-picker-react` (`^2.0.0`), `qrcode` (`^1.5.4`), `@dicebear/core` & `@dicebear/collection` (`^9.4.x`)
* **Notifications:** Sonner toasts (`^2.0.8`), PWA Service Workers (`sw.js`, `sw-e2ee.js`)

### Backend Architecture
* **Runtime & Framework:** Node.js (ES Modules), Express 5 (`^5.2.1`)
* **Database & ODM:** MongoDB, Mongoose 9 (`^9.10.2`)
* **Real-Time Sockets:** Socket.io 4 (`^4.8.4`)
* **Authentication:** JSON Web Tokens (`jsonwebtoken` `^9.0.3`), `cookie-parser` (`^1.4.7`), `bcryptjs` (`^3.0.3`), Passport.js (`^0.7.0`), Google OAuth 2.0 (`passport-google-oauth20` `^2.0.0`)
* **Cloud Storage & Uploads:** Cloudinary SDK (`^2.11.0`), Multer memory storage (`^2.4.0`)
* **Push Notifications:** `web-push` (`^3.6.7`) with VAPID key pairs
* **Signaling & Relays:** WebRTC Signaling Engine with dynamic Metered.ca TURN & Google STUN fallback

---

## ⚙️ Environment Configuration

### 1. Server Environment (`server/.env`)

Create `server/.env` with the following variables:

```env
# Application Port & Environment
PORT=5000
NODE_ENV=development

# Frontend Client Origin (for CORS and OAuth redirects)
CLIENT_URL=http://localhost:5173

# MongoDB Connection String
MONGO_URI=mongodb://localhost:27017/threadline

# JWT Secrets & Expiration
JWT_ACCESS_SECRET=your_super_secret_jwt_access_key_min_32_chars
JWT_REFRESH_SECRET=your_super_secret_jwt_refresh_key_min_32_chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth 2.0 (Optional: For Google Sign-In)
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# Cloudinary Storage (For encrypted media & avatar uploads)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Web Push VAPID Keys (Generate with `npx web-push generate-vapid-keys`)
VAPID_PUBLIC_KEY=your_generated_vapid_public_key
VAPID_PRIVATE_KEY=your_generated_vapid_private_key
VAPID_SUBJECT=mailto:admin@threadline.com

# Metered.ca Dynamic TURN (Optional: For restrictive NAT/firewall traversal)
METERED_DOMAIN=your_metered_app_name.metered.live
METERED_API_KEY=your_metered_secret_api_key

# WebRTC Timing Overrides (Optional: Defaults shown)
CALL_RING_TIMEOUT_MS=30000
CALL_RECONNECT_GRACE_MS=10000
CALL_MEDIA_SETUP_TIMEOUT_MS=45000
CALL_MAX_DURATION_MS=21600000
```

### 2. Client Environment (`client/.env`)

Create `client/.env` with the following variables:

```env
# Backend REST API Base URL
VITE_API_URL=http://localhost:5000/api

# GIPHY API Key (For animated GIF picker search)
VITE_GIPHY_API_KEY=your_giphy_api_key
```

> [!NOTE]
> * `VITE_SOCKET_URL` is **not required**: the frontend automatically derives the socket connection origin from `VITE_API_URL`.
> * `VITE_VAPID_PUBLIC_KEY` is **not required**: the frontend dynamically fetches the VAPID public key from the backend endpoint (`GET /api/push/public-key`).

---

## 🛠️ Getting Started & Development

### Prerequisites
* **Node.js:** v20.0.0 or higher
* **npm:** v10.0.0 or higher
* **MongoDB:** Local MongoDB daemon or MongoDB Atlas instance
* **Cloudinary Account:** Free Cloudinary credentials for media file storage

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/threadline.git
   cd threadline
   ```

2. **Install Server Dependencies:**
   ```bash
   cd server
   npm install
   ```

3. **Install Client Dependencies:**
   ```bash
   cd ../client
   npm install
   ```

### Running Locally

Open two separate terminal windows:

#### Terminal 1: Backend Server
```bash
cd server
npm run dev
```
The server starts on `http://localhost:5000`.

#### Terminal 2: Frontend Client
```bash
cd client
npm run dev
```
The Vite development server boots on `http://localhost:5173`.

Visit `http://localhost:5173` in your browser. Register an account, create a conversation, and test end-to-end encrypted messaging, voice recording, polls, and video calls.

### Additional Backend Scripts

* **Test Web Push Notification:**
  To send a test push notification to a registered user from the command line:
  ```bash
  cd server
  npm run push:test user@example.com
  # or by MongoDB ObjectId:
  npm run push:test 652a9f7e02b4d1001234abcd
  ```

---

## 🛡️ Security Model & Threat Defense

| Threat Vector | Mitigation Strategy in Threadline |
| :--- | :--- |
| **Eavesdropping on Database / Relays** | All message bodies, media URLs, keys, replies, reactions, and poll choices are encrypted with AES-GCM-256 before transmission. The database only sees ciphertext. |
| **Rogue Server Replay / Cut & Paste** | Dual Diffie-Hellman ($DH_1 + DH_2$) and strict AAD binding to `roomId`, `senderUserId`, `senderDeviceId`, and `spk`. Relaying ciphertexts to other rooms or users breaks GCM authentication tags. |
| **Forward Secrecy Breach** | Fresh ephemeral keypairs ($DH_1$) are generated for every message envelope. Even if a long-term device key is compromised, historical conversations cannot be decrypted. |
| **Media File Inspection by Cloud Hosts** | Media files are symmetrically encrypted into binary noise (`.enc`) in browser memory before hitting Cloudinary. Cloudinary holds no decryption keys. |
| **Reaction / Poll Vote Inference via Size** | Emojis are padded into fixed 64-byte blocks (`REACTION_BLOCK`) and poll votes into fixed 128-byte blocks (`POLL_VOTE_BLOCK`). Ciphertext byte sizes leak zero information about content. |
| **Man-in-the-Middle (MITM) Key Swap** | Signal-compatible 60-digit safety numbers and dynamic QR code verification. Out-of-band comparison immediately detects swapped public keys. |
| **Compromised Key Backup Server** | Device key vaults stored in MongoDB are encrypted via PBKDF2 with 600,000 iterations of SHA-256 and AES-GCM. The server never receives the passphrase. |
| **WebRTC Media Interception** | Peer-to-peer audio, video, and screen sharing streams are encrypted end-to-end via DTLS-SRTP. The server only routes SDP signaling messages. |
| **Malicious Media Script Execution (XSS)** | Avatar uploads are strictly filtered to JPG, PNG, and WebP (SVGs are forbidden). File attachments in chats are decrypted in isolated memory and rendered using native canvas, media players, or sandboxed PDF workers. |

---

## 📄 License

This project is licensed under the ISC License.
