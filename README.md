# Threadline 🧵

> **A modern, privacy-first, real-time messaging platform with zero-knowledge End-to-End Encryption (E2EE).**

---

## 📖 Table of Contents
1. [Overview](#-overview)
2. [Key Application Features](#-key-application-features)
3. [Project Directory Structure](#-project-directory-structure)
4. [E2EE Cryptographic Architecture](#-e2ee-cryptographic-architecture)
   - [Cryptographic Primitives](#cryptographic-primitives)
   - [Identity & Key Lifecycle](#identity--key-lifecycle)
   - [1. Messages Architecture (Envelope Encryption)](#1-messages-architecture-envelope-encryption)
   - [2. Media & Attachments Architecture (Two-Tier Encryption)](#2-media--attachments-architecture-two-tier-encryption)
   - [3. Quoted Replies Architecture](#3-quoted-replies-architecture)
   - [4. Reactions Architecture (Message Secret & Zero-Leakage Padding)](#4-reactions-architecture-message-secret--zero-leakage-padding)
   - [5. Interactive Polls Architecture (Encrypted Voting)](#5-interactive-polls-architecture-encrypted-voting)
5. [Security & Verification](#-security--verification)
   - [Safety Numbers & QR Code Verification](#safety-numbers--qr-code-verification)
   - [PWA Service Worker Background Decryption](#pwa-service-worker-background-decryption)
   - [Encrypted Key Backup & Recovery](#encrypted-key-backup--recovery)
6. [1-on-1 Voice, Video & Screen Sharing Architecture (WebRTC)](#-1-on-1-voice-video--screen-sharing-architecture-webrtc)
   - [Signaling & Session Lifecycle](#signaling--session-lifecycle)
   - [STUN/TURN & Metered.ca ICE Configuration](#stunturn--meteredca-ice-configuration)
   - [WebRTC Media Engine & Opus Audio Tuning](#webrtc-media-engine--opus-audio-tuning)
   - [Adaptive Network Quality & Auto-Degradation](#adaptive-network-quality--auto-degradation)
   - [Intelligent Auto-Layout & Aspect Ratio Engine](#intelligent-auto-layout--aspect-ratio-engine)
   - [Race-Condition Proof State Machine & Audio Isolation](#race-condition-proof-state-machine--audio-isolation)
7. [Tech Stack](#-tech-stack)
8. [Getting Started](#-getting-started)

---

## 🌟 Overview

**Threadline** is an encrypted web messaging application designed to provide privacy guarantees equivalent to Signal and WhatsApp, combined with a responsive, modern user experience.

The server operates strictly as an **untrusted, zero-knowledge relay and storage layer**. Plaintext messages, search indexes, media files, quotes, reactions, and poll choices are encrypted and decrypted **exclusively on users' client devices** using standard browser-native cryptography (Web Crypto API).

---

## 🚀 Key Application Features

* **📹 1-on-1 Voice, Video & Screen Sharing (WebRTC):**
  Zero-lag peer-to-peer audio and video calls encrypted via DTLS-SRTP. Powered by dynamic Metered.ca TURN & Google STUN fallback, Opus audio tuning with in-band FEC, real-time adaptive quality scaling (good/fair/poor), screen sharing with detail preservation, ambient blurred backdrops, and an isolated audio playback pipeline that prevents cutouts.
* **🔒 Zero-Knowledge End-to-End Encryption (E2EE):**
  ECDH P-256 key agreement with HKDF-SHA256 and AES-GCM-256 envelope encryption. Plaintext never touches the database or network in cleartext.
* **💬 Real-Time Messaging & Sockets:**
  Low-latency bidirectional messaging powered by Socket.io, with real-time delivered/seen read receipts, online/offline presence indicators, and live typing indicators.
* **📊 WhatsApp-Style Encrypted Polls:**
  Create single-choice or multi-choice polls. Poll questions, options, and individual votes are end-to-end encrypted with zero length leakage, animated progress bars, voter avatar stacks, and a detailed "View Votes" results modal.
* **📎 Encrypted Media & Document Attachments:**
  Share images, videos, audio clips, and documents up to 15 MiB. Media is encrypted into ciphertext blobs on the client before upload to Cloudinary.
* **📄 In-App PDF Document Viewer:**
  Inspect shared PDF documents directly inside the browser using an integrated `pdfjs-dist` viewer with pagination and zoom controls.
* **🎙️ Voice Notes Recorder:**
  Record and preview audio messages directly inside the chat bar with live wave visualizers and playback speed controls.
* **😄 Rich Reactions, Emojis & GIFs:**
  React to messages with emoji pills and browse animated GIFs via Tenor/GIPHY integration. Sealed reactions prevent the server from inspecting emoji choices.
* **↩️ Quoted Replies (Swipe-to-Reply):**
  Reply directly to any text, media, or poll message on desktop or mobile with touch swipe gestures. Quoted snippets remain encrypted.
* **🛡️ Identity Verification & Safety Numbers:**
  Verify contacts with 60-digit safety numbers (12 blocks of 5 digits) or by scanning a dynamic QR code to defend against Man-in-the-Middle (MITM) attacks.
* **🔑 Encrypted Key Backup & Multi-Device Recovery:**
  Export and restore private device keys via a password-derived PBKDF2/AES-GCM backup saved to the server.
* **🔔 Web Push Notifications with Background Decryption:**
  Receive push notifications when offline or in the background. A dedicated Service Worker (`sw-e2ee.js`) accesses the local private key to decrypt notification previews client-side.
* **🔍 Client-Side Local Message Search:**
  Search message histories instantly without compromising privacy. Decrypted messages are indexed locally in client-side IndexedDB.
* **🎨 UI Customization & Themes:**
  Switch between custom themes (Midnight, Emerald, Rose, Amber, Ocean) and customize profiles using DiceBear avatar generation or custom photo uploads.

---

## 📂 Project Directory Structure

```
Project/
├── client/                                  # Frontend Application (React 19 + Vite 8 + Tailwind CSS v4)
│   ├── public/                              # Static public assets & Service Workers
│   │   ├── manifest.webmanifest             # PWA Web App Manifest
│   │   ├── sw.js                            # Main Service Worker for caching & push
│   │   └── sw-e2ee.js                       # Service Worker cryptographic push decryptor
│   ├── src/
│   │   ├── api/                             # Axios REST API clients
│   │   │   ├── authApi.js                   # Authentication & profile endpoints
│   │   │   ├── callsApi.js                  # Dynamic ICE / TURN server credentials endpoint
│   │   │   ├── keysApi.js                   # Public device key directory endpoints
│   │   │   ├── mediaApi.js                  # Encrypted/unencrypted media upload endpoints
│   │   │   ├── pushApi.js                   # Web Push subscription registration
│   │   │   ├── roomsApi.js                  # Chat rooms, group management & member endpoints
│   │   │   └── usersApi.js                  # User directory & search endpoints
│   │   ├── components/                      # UI Component Library (Radix / CVA / Tailwind)
│   │   │   └── ui/                          # Avatar, Button, Dialog, Input, Toasts, etc.
│   │   ├── context/                         # React context providers
│   │   │   ├── AuthContext.jsx              # Global authenticated user state
│   │   │   ├── CallContext.jsx              # WebRTC call state machine & signaling coordinator
│   │   │   ├── SocketContext.jsx            # Socket.io connection lifecycle manager
│   │   │   └── ThemeContext.jsx             # Color theme manager
│   │   ├── features/                        # Core application feature modules
│   │   │   ├── chat/                        # Chat UI & Interaction components
│   │   │   │   ├── ChatWindow.jsx           # Active conversation viewport & event controller
│   │   │   │   ├── CreatePollDialog.jsx     # WhatsApp-style poll creation modal
│   │   │   │   ├── EmojiPickerPopover.jsx   # Lazy-loaded emoji selection popover
│   │   │   │   ├── GifPickerPopover.jsx     # GIPHY/Tenor search popover
│   │   │   │   ├── LinkPreview.jsx          # OpenGraph rich link preview card
│   │   │   │   ├── MediaAttachment.jsx      # Image, video, audio & file attachments
│   │   │   │   ├── MembersPanel.jsx         # Group member list & admin role controls
│   │   │   │   ├── MessageBubble.jsx        # Individual chat bubble with menu & swipe-reply
│   │   │   │   ├── MessageInput.jsx         # Input bar with attachments, voice, poll buttons
│   │   │   │   ├── MessageSearchBar.jsx     # Local IndexedDB message search bar
│   │   │   │   ├── PdfViewer.jsx            # Integrated PDF viewer modal
│   │   │   │   ├── PollBubble.jsx           # Interactive in-chat poll option bars & votes
│   │   │   │   ├── PollVotesDialog.jsx      # WhatsApp-style "View Votes" modal breakdown
│   │   │   │   ├── QuickReactBar.jsx        # Quick reaction floating emoji bar
│   │   │   │   ├── ReactionPills.jsx        # Aggregated reaction pill counts on bubbles
│   │   │   │   ├── RoomList.jsx             # Left sidebar conversation list
│   │   │   │   ├── TypingIndicator.jsx      # Real-time typing bubble
│   │   │   │   └── VoiceRecorder.jsx        # Voice note recording interface
│   │   │   ├── e2ee/                        # E2EE security UI & components
│   │   │   │   ├── BackupSettings.jsx       # Passphrase backup / restore UI
│   │   │   │   ├── E2EEContext.jsx          # Device key initialization & room encryption state
│   │   │   │   ├── EncryptionStatus.jsx     # Chat header lock indicator & key info
│   │   │   │   └── SafetyNumberDialog.jsx   # QR code & safety number comparison modal
│   │   │   └── videoCall/                   # 1-on-1 Voice, Video & Screen Sharing module
│   │   │       ├── CallControls.jsx         # Floating call action bar (mic, camera, share, hangup)
│   │   │       ├── CallModal.jsx            # Fullscreen viewport, status badges & PiP container
│   │   │       ├── IncomingCallDialog.jsx   # Radar glow incoming call modal with auto-decline
│   │   │       ├── RemoteAudio.jsx          # Provider-level dedicated audio element (echo/dropout-free)
│   │   │       ├── VideoGrid.jsx            # Auto-layout viewport (Aspect math, Fit/Fill & blurred backdrop)
│   │   │       ├── hooks/                   # Calling hooks
│   │   │       │   ├── useCallSound.js      # Ringtone, ringback & end call tone synthesis
│   │   │       │   ├── useMediaDevices.js   # Camera/mic permissions, mobile constraints & screen share
│   │   │       │   └── useWebRTC.js         # Peer connection, Opus tuning, adaptive bitrate & ICE restart
│   │   │       └── utils/
│   │   │           └── callErrors.js        # User-friendly media device error formatter
│   │   ├── lib/                             # Utility helpers & cryptographic engine
│   │   │   ├── e2ee/                        # Web Crypto E2EE Engine
│   │   │   │   ├── backup.js                # PBKDF2/AES-GCM key backup export & import
│   │   │   │   ├── crypto.js                # ECDH, HKDF, AES-GCM, and reaction/poll crypto
│   │   │   │   ├── deviceKey.js             # Device keypair generation & IndexedDB storage
│   │   │   │   ├── directory.js             # Room participant public key cache
│   │   │   │   ├── encoding.js              # Base64URL and binary ArrayBuffer utilities
│   │   │   │   ├── identity.js              # Active device identity resolution
│   │   │   │   ├── keyStore.js              # IndexedDB wrapper for local private keys
│   │   │   │   ├── media.js                 # Client-side file encryption/decryption
│   │   │   │   ├── messages.js              # Envelope building, decryption & payload mapping
│   │   │   │   ├── messageStore.js          # IndexedDB local search index for decrypted text
│   │   │   │   └── safety.js                # SHA-256 Safety number computation
│   │   │   └── utils.js                     # Formatting, avatars, and class merging
│   │   └── pages/                           # Route pages (Dashboard, Login, Register, Profile)
│   ├── index.html                           # Application entry HTML
│   ├── package.json                         # Client dependencies & scripts
│   └── vite.config.js                       # Vite configuration
│
└── server/                                  # Backend Application (Node.js + Express 5 + Mongoose + Socket.io)
    └── src/
        ├── config/                          # Database, Cloudinary, Passport & Environment setup
        │   ├── cloudinary.js                # Cloudinary SDK storage configuration
        │   ├── db.js                        # MongoDB Mongoose connection
        │   ├── env.js                       # Environment variable loader
        │   └── passport.js                  # Google OAuth 2.0 passport strategy
        ├── middlewares/                     # Express middlewares
        │   ├── authGuard.js                 # JWT cookie authentication verification
        │   ├── errorHandler.js              # Centralized error handler
        │   └── upload.js                    # Multer memory storage file upload limiter
        ├── models/                          # MongoDB Mongoose Schemas
        │   ├── DeviceKey.js                 # Registered device public keys (`userId`, `deviceId`, `publicKey`)
        │   ├── KeyBackup.js                 # Passphrase-encrypted private key backup
        │   ├── Message.js                   # Message documents (E2EE envelope, polls, reactions)
        │   ├── PushSubscription.js          # Browser Web Push notification subscriptions
        │   ├── Room.js                      # Direct/Group chats, member roles, and metadata
        │   └── User.js                      # User profile, credentials & settings
        ├── modules/                         # Feature domain modules (Controller, Routes, Service)
        │   ├── auth/                        # Registration, login, logout, OAuth
        │   ├── calls/                       # Dynamic Metered.ca TURN & Google STUN endpoints
        │   ├── keys/                        # Device key registration & directory lookup
        │   ├── media/                       # Cloudinary upload endpoints
        │   ├── messages/                    # Message retrieval & E2EE envelope validation
        │   │   ├── e2ee.validation.js       # Strict envelope, reaction & poll vote ciphertext validation
        │   │   ├── messages.controller.js   # Message history API controller
        │   │   └── messages.service.js      # Message queries & system event logging
        │   ├── push/                        # Web push dispatching & notification scheduling
        │   ├── rooms/                       # Room creation, member management, admin roles
        │   └── users/                       # Profile updates & user search
        ├── sockets/                         # Real-Time WebSocket Architecture
        │   ├── handlers/                    # Socket event handlers
        │   │   ├── call.handler.js          # WebRTC P2P signaling, ICE relay & busy/timeout state
        │   │   ├── message.handler.js       # `message:send`, `message:react`, `message:poll-vote`, `message:delete`
        │   │   ├── presence.handler.js      # Online/offline presence & delivery ticks
        │   │   ├── room.handler.js          # Join room & room updates
        │   │   └── typing.handler.js        # Typing start/stop broadcasts
        │   └── index.js                     # Socket.io server initialization & authentication
        ├── app.js                           # Express application configuration
        └── server.js                        # HTTP & Socket server startup
```

---

## 🔒 E2EE Cryptographic Architecture

### Cryptographic Primitives

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Threadline Crypto Stack                         │
├──────────────────────────┬─────────────────────────────────────────────┤
│ Asymmetric Key Agreement │ ECDH with NIST Curve P-256                  │
│ Symmetric Cipher         │ AES-GCM (256-bit key, 12-byte random IV)    │
│ Key Derivation Function  │ HKDF with SHA-256 hash                      │
│ Integrity & Authenticity │ AES-GCM 128-bit authentication tag + AAD    │
│ Reaction & Vote Padding  │ Fixed-block size padding (Zero length leak) │
└──────────────────────────┴─────────────────────────────────────────────┘
```

### Identity & Key Lifecycle

1. **Generation:** When a user logs in on a new device, the client calls `generateDeviceKeyPair()` (`deviceKey.js`), creating an ECDH P-256 keypair.
2. **Local Storage:** The private key is stored securely in the browser's IndexedDB (`threadline-e2ee` -> `deviceKeys`). It is set to non-extractable in normal operations and never sent over the network.
3. **Public Directory:** The device's public key (raw base64url format, 87 characters) is uploaded to the server's `DeviceKey` collection with the assigned `deviceId`.

---

### 1. Messages Architecture (Envelope Encryption)

To support multiple recipients and multi-device accounts without encrypting entire messages dozens of times, Threadline uses **Hybrid Envelope Encryption** (`client/src/lib/e2ee/crypto.js` and `messages.js`).

```
[Sender]                                                            [Recipients]
   │
   ├─► Generate random 32-byte MessageKey (AES-256)
   │
   ├─► Encrypt JSON Payload (text, media keys, replyTo, poll)
   │   with MessageKey ──► produces Ciphertext + IV
   │
   ├─► For each recipient device (and sender's own devices):
   │     ├─► Generate Ephemeral ECDH keypair (epk, esk)
   │     ├─► Compute DH1 = ECDH(esk, RecipientPublicKey)
   │     ├─► Compute DH2 = ECDH(SenderStaticPrivateKey, RecipientPublicKey)
   │     ├─► Derive WrapKey = HKDF(DH1 || DH2, info=wrapInfo)
   │     └─► Wrap: Encrypt MessageKey with WrapKey ──► wrapped entry
   │
   └─► Send Envelope to Server:
       {
         v: 1,
         senderDeviceId,
         spk: SenderPublicKey,
         iv,
         ciphertext,
         keys: [ { userId, deviceId, epk, iv, wrapped }, ... ]
       }
```

#### Dual Diffie-Hellman (DH1 + DH2):
* **$DH_1$ (Ephemeral $\times$ Static):** Provides **Forward Secrecy**. A fresh ephemeral key is used for every single message.
* **$DH_2$ (Static $\times$ Static):** Provides **Sender Authentication**. Only the genuine sender possessing the private key of `spk` could compute $DH_2$.

#### Cryptographic Binding (AAD):
Every message encrypts with Authenticated Additional Data:
$$\text{AAD}_{\text{body}} = \text{"threadline-e2ee/v1/body|" } \parallel \text{roomId} \parallel \text{"|" } \parallel \text{senderUserId} \parallel \text{"|" } \parallel \text{senderDeviceId}$$
$$\text{AAD}_{\text{wrap}} = \text{"threadline-e2ee/v1/wrap|" } \parallel \text{roomId} \parallel \text{senderUserId} \parallel \text{senderDeviceId} \parallel \text{spk} \parallel \text{recipientUserId} \parallel \text{recipientDeviceId} \parallel \text{epk}$$
> If an attacker or malicious server copies a message to another room or alters the sender ID, the AES-GCM tag verification fails immediately and decryption is rejected.

#### Server-Side Privacy Filtering (`viewForUser`):
When broadcasting `message:new` or returning history via `GET /api/messages`, the server passes the envelope through `viewForUser(message, userId)`:
* The server strips away all other members' `keys` entries, returning **only the recipient's own locked key**. Bob never learns Alice's other device IDs or locks.

---

### 2. Media & Attachments Architecture (Two-Tier Encryption)

Media files (photos, videos, audio notes, PDFs, documents) are encrypted using a **Two-Tier Symmetric Scheme** (`client/src/lib/e2ee/media.js`):

```
                       ┌──────────────────────────────┐
                       │        Raw Media File        │
                       └──────────────┬───────────────┘
                                      │
              1. Generate random 32-byte MediaKey + 12-byte MediaIv
              2. AES-GCM-256 Encrypt Raw File Bytes
                                      │
                                      ▼
                       ┌──────────────────────────────┐
                       │    Encrypted Binary Blob     │
                       └──────────────┬───────────────┘
                                      │
         Upload encrypted bytes to Cloudinary / Storage (Zero knowledge)
                                      │
                                      ▼
                       ┌──────────────────────────────┐
                       │ Cloudinary URL (Ciphertext)  │
                       └──────────────┬───────────────┘
                                      │
         Bundle URL + MediaKey + MediaIv INSIDE the encrypted E2EE Envelope
                                      │
                                      ▼
                       ┌──────────────────────────────┐
                       │   Delivered to Recipient     │
                       └──────────────┬───────────────┘
                                      │
              1. Recipient opens envelope, reads MediaKey & MediaIv
              2. Fetches encrypted bytes from Cloudinary URL
              3. Decrypts ArrayBuffer with MediaKey
              4. Creates local URL.createObjectURL(blob)
```

* **Storage Safety:** Cloudinary and database servers only see random binary noise (`.enc`). They cannot inspect images, read documents, or analyze voice recordings.
* **Metadata Protection:** The file name, file MIME type, and byte length are sealed inside the encrypted message envelope payload, not in plaintext headers.

---

### 3. Quoted Replies Architecture

When replying to a message:
1. The client captures the quoted message snapshot (`messageId`, `senderName`, `text`, `mediaType`).
2. In E2EE mode, this `replyTo` object is placed **strictly inside the encrypted payload** before `encryptEnvelope()` is run.
3. In [`Message.js`](file:///c:/CollegeProgramming/Projects/Project/server/src/models/Message.js), `message.replyTo` is left undefined on the server document.
4. When Bob decrypts the envelope, his client extracts `payload.replyTo` and renders the WhatsApp-style quote card above the bubble. The server never learns which message was quoted or what text it contained.

---

### 4. Reactions Architecture (Message Secret & Zero-Leakage Padding)

Re-encrypting a full envelope for all 50 group devices just to add an emoji would create massive network and CPU overhead. Threadline uses **Message Secrets** (`client/src/lib/e2ee/crypto.js`):

1. **The Message Secret:**
   When a message is created, the sender generates a 32-byte random `secret` and seals it inside the message payload. Only users who can decrypt the message learn this `secret`.
2. **Deriving Reaction Keys:**
   Anyone reacting to the message derives a shared symmetric key:
   $$\text{reactionKey} = \text{HKDF}(\text{IKM}=\text{secret}, \text{info}=\text{"threadline-e2ee/v1/reaction-key|" } \parallel \text{roomId} \parallel \text{"|" } \parallel \text{messageId})$$
3. **Zero Length-Leakage (Fixed-Block Padding):**
   Different emojis have different byte lengths (e.g. `👍` = 4 bytes, complex emoji = 12 bytes). To prevent eavesdroppers from guessing the emoji by ciphertext size:
   * The emoji string is packed into a **fixed 64-byte block** (`REACTION_BLOCK`).
   * Byte `0` stores the actual byte length; the remaining bytes are zero-padded.
4. **AAD Binding:**
   $$\text{AAD}_{\text{reaction}} = \text{"threadline-e2ee/v1/reaction|" } \parallel \text{roomId} \parallel \text{"|" } \parallel \text{messageId} \parallel \text{"|" } \parallel \text{reactorId}$$
   This ensures a reaction ciphertext cannot be detached and pasted onto another message or forged on behalf of another user.
5. **Storage:** The server stores `{ userId, iv, ciphertext }` on `message.reactions` without the ability to decrypt it. Clients reading the message decrypt the reaction using `message.secret`.

---

### 5. Interactive Polls Architecture (Encrypted Voting)

Polls function with complete privacy: neither the question, the options, nor who voted for what is visible to the server.

```
1. Creator creates Poll:
   Question: "Where to have lunch?"
   Options: ["Pizza", "Sushi", "Tacos"]
   AllowMultiple: false
   │
   ▼
   Sealed inside Envelope Payload:
   payload.poll = { question, options, allowMultipleAnswers }
   (Server Message document only receives skeleton option IDs: [{ id: "opt_0" }, { id: "opt_1" }])

2. Voter casts / updates vote:
   Selected: ["opt_1"]
   │
   ▼
   1. Derive voteKey = HKDF(message.secret, info="threadline-e2ee/v1/poll-vote-key|" + roomId + "|" + messageId)
   2. Encode JSON.stringify(["opt_1"]) into fixed 128-byte block (POLL_VOTE_BLOCK)
   3. Encrypt with AES-GCM + AAD("threadline-e2ee/v1/poll-vote|" + roomId + "|" + messageId + "|" + voterId)
   4. Emit socket event: "message:poll-vote", { roomId, messageId, vote: { iv, ciphertext } }

3. Server updates message.poll.votes:
   Validates ciphertext structure (128-byte block + 16-byte tag = 192 base64url characters).
   Stores { userId, iv, ciphertext, updatedAt } and broadcasts "message:poll-vote-update".

4. Room members receive update:
   Decrypt each vote in votes[] using message.secret.
   Locally calculate percentages, option vote counts, and render voter avatar stacks.
```

---

## 🛡️ Security & Verification

### Safety Numbers & QR Code Verification
To guarantee that no Man-in-the-Middle (MITM) attack or rogue server has substituted public keys:
* Both users' public keys are lexicographically sorted and hashed with SHA-256 (`safety.js`).
* The hash is partitioned into **12 blocks of 5 decimal digits** (a 60-digit safety number, identical to Signal's algorithm).
* Users can compare safety numbers or scan the generated QR code (`SafetyNumberDialog.jsx`) to confirm their connection is secure.

### PWA Service Worker Background Decryption
When a user is offline or Threadline is running in the background:
* Web Push notifications sent by the backend carry only the recipient device's locked key entry.
* [`sw-e2ee.js`](file:///c:/CollegeProgramming\Projects\Project\client\public\sw-e2ee.js) intercepts the push event inside the Service Worker.
* It reads the device's private key directly from IndexedDB, derives the wrap key, decrypts the message or poll question, and displays the plaintext preview in the operating system's native notification window.

### Encrypted Key Backup & Recovery
Users can create an encrypted backup of their device keys to restore conversations on a new phone or computer:
* **Derivation:** A 256-bit AES key is derived from the user's passphrase using **PBKDF2** with **100,000 iterations** of SHA-256 and a random 16-byte salt.
* **Storage:** The private keys are encrypted with AES-GCM and stored in MongoDB under `KeyBackup`.
* The server only holds the encrypted bundle and salt; without the passphrase, the backup cannot be opened.

---

## 📹 1-on-1 Voice, Video & Screen Sharing Architecture (WebRTC)

Threadline implements peer-to-peer Voice, Video, and Screen Sharing calls using browser-native **WebRTC** secured with **DTLS-SRTP** encryption. Media flows directly between participants with zero cleartext access by the server.

```
                       ┌─────────────────────────┐
                       │   Metered.ca / STUN     │
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

### Signaling & Session Lifecycle

The signaling channel is managed over authenticated WebSockets (`server/src/sockets/handlers/call.handler.js`):

* **Shared Conversation Authorization**: Before initiating a call, the server verifies both participants share a conversation room (`members.userId`). Calls between unverified strangers are blocked.
* **Atomic Busy & Online Check**: Database authorization, socket presence check, and call session mapping (`userCallMap`) run atomically in the same event tick, eliminating race conditions where two callers might ring the same user simultaneously.
* **Centralized Secure Relay (`relay()`)**: SDP offers, answers, and ICE candidates are relayed strictly between active, verified participants of connected calls. Malicious sockets cannot inject signaling events into foreign calls.
* **10-Second Network Grace Period (`DISCONNECT_GRACE_MS`)**: If a socket disconnects abruptly mid-call (e.g. mobile Wi-Fi to cellular handover), a 10-second grace window allows reconnection before declaring the peer disconnected.
* **Multi-Tab Dismissal (`call:answered-elsewhere`)**: Answering or rejecting a call on one tab immediately dismisses the ringing dialog across all other active devices and tabs of that user.

### STUN/TURN & Metered.ca ICE Configuration

Real-world P2P calls frequently face NAT barriers, CGNAT, and firewalls. Threadline resolves connectivity via dynamic ICE discovery (`server/src/modules/calls/calls.controller.js`):

* **Dynamic Metered.ca TURN**: The server calls Metered.ca's API to fetch short-lived, time-limited TURN relay credentials.
* **In-Memory Caching (`CACHE_TTL_MS = 5m`)**: ICE server configurations are cached for 5 minutes, preventing redundant external API calls during bursts.
* **Safe Fallback**: If TURN credentials fail or time out (5-second `AbortController`), the server seamlessly falls back to Google's public STUN servers (`stun:stun.l.google.com:19302`).
* **Cache-Control Security**: Responses are served with `Cache-Control: no-store` so sensitive, expiring TURN credentials are never cached by intermediate proxies or browser disks.

### WebRTC Media Engine & Opus Audio Tuning

WebRTC connections are managed by [`useWebRTC.js`](file:///c:/CollegeProgramming/Projects/Project/client/src/features/videoCall/hooks/useWebRTC.js):

* **Opus Voice Tuning (`tuneOpus`)**: Modifies the SDP to optimize audio for voice:
  * Forces mono audio (`stereo=0`, `sprop-stereo=0`) for maximum acoustic echo cancellation (AEC) efficiency.
  * Enables in-band Forward Error Correction (`useinbandfec=1`) to reconstruct lost audio packets over jittery networks.
  * Caps maximum average bitrate at 32 kbps (`maxaveragebitrate=32000`) for wideband HD voice without speaker saturation.
* **Pre-Negotiated Bidirectional Transceivers (`ensureTransceivers` & `setSendRecv`)**: Both caller and callee configure audio and video transceivers as `sendrecv` from call creation. This allows either user to start or stop screen sharing and toggle video mid-call with **zero SDP renegotiation** needed.
* **Glare Handling / Perfect Negotiation**: If both peers trigger offers simultaneously, the callee functions as the "polite" peer and rolls back its local offer (`type: "rollback"`), preventing signaling deadlocks.

### Adaptive Network Quality & Auto-Degradation

To maintain smooth calls during bandwidth drops, [`useWebRTC.js`](file:///c:/CollegeProgramming/Projects/Project/client/src/features/videoCall/hooks/useWebRTC.js) runs an active WebRTC statistics monitor every 4 seconds (`pc.getStats()`):

| Profile | Trigger Criteria | Camera Bitrate / FPS | Screen Bitrate / FPS | Resolution Scale |
| :--- | :--- | :--- | :--- | :--- |
| **Good** | Default / Loss $\le 3\%$, RTT $\le 300\text{ms}$ | 1,500 kbps @ 30 FPS | 2,500 kbps @ 15 FPS | 1.0× (Native) |
| **Fair** | Loss $> 3\%$ or RTT $> 300\text{ms}$ | 800 kbps @ 24 FPS | 1,200 kbps @ 10 FPS | 1.5× Downscale |
| **Poor** | Loss $> 10\%$ or RTT $> 600\text{ms}$ | 300 kbps @ 15 FPS | 500 kbps @ 5 FPS | 2.0× Downscale |

* **Immediate Degradation, Hysteresis Recovery**: Quality drops to Fair or Poor immediately when loss/latency spikes to preserve audio intelligibility. Quality recovers to higher tiers only after 3 consecutive clean sampling cycles (`goodStreak >= 3`), preventing rapid visual flickering.
* **Detail-Preserving Screen Sharing**: Screen tracks receive `contentHint = "detail"` and `degradationPreference = "maintain-resolution"`. When network quality degrades, screen sharing lowers framerate rather than blurring code, text, or spreadsheets.

### Intelligent Auto-Layout & Aspect Ratio Engine

Video rendering is managed by [`VideoGrid.jsx`](file:///c:/CollegeProgramming/Projects/Project/client/src/features/videoCall/VideoGrid.jsx) with custom viewport math:

* **Aspect Ratio Calculation (`FILL_TOLERANCE = 1.2`)**:
  * Compares decoded video dimensions (`videoWidth`, `videoHeight`) against the container (`ResizeObserver`).
  * If the incoming video aspect ratio is within 20% of the viewport, it uses full-bleed `fill` (crops at most ~15%).
  * Otherwise, it uses `fit`, computing a framed viewport that prevents cutting off heads or vertical smartphone video.
  * **Screen shares are strictly forced to `fit` mode**, ensuring full UI visibility.
* **Ambient Frosted Backdrop**: In `fit` mode, a duplicate background video is rendered with heavy zoom and Gaussian blur (`blur-2xl opacity-40`), creating an ambient lighting effect similar to Apple FaceTime and Google Meet.
* **Dynamic Picture-in-Picture (PiP)**: Local preview PiP automatically mirrors camera feeds (`scale-x-[-1]`), un-mirrors screen shares, and shifts its aspect ratio between portrait (mobile) and landscape (desktop).
* **Fit/Fill Controls**: Users can double-click anywhere on the video or use the floating control button to toggle between Fit and Fill modes.

### Race-Condition Proof State Machine & Audio Isolation

* **Dedicated Audio Element (`<RemoteAudio/>`)**:
  * Incoming audio is bound exclusively to a permanent, provider-level `<audio autoPlay playsInline />` element (`RemoteAudio.jsx`).
  * All `<video>` elements are permanently forced to `muted={true}` via code and DOM properties.
  * This completely decouples audio from video rendering: minimizing, maximizing, hiding, or changing video layout **never causes audio dropouts, echoes, or volume jumps**.
  * Handles browser Autoplay policy blocks by deferring playback to the next user interaction (`pointerdown`).
* **Synchronous Ref State (`callStateRef` & `actionsRef`)**: Socket handlers in `CallContext.jsx` access state through `callStateRef.current` and callbacks through `actionsRef.current`. Socket listeners are bound once, preventing React closure staleness and re-subscription loops.
* **Double-Click Lock & Permission Cancellation**: Outgoing calls immediately claim the `"calling"` state. If a user cancels while the browser camera/mic permission prompt is pending, tracks are torn down immediately without dangling calls.

---

## 💻 Tech Stack

### Frontend
* **Core:** React 19, Vite 8, React Router v7
* **Styling & UI:** Tailwind CSS v4, Lucide Icons, Radix UI primitives, Sonner toasts
* **Real-time & Calling:** WebRTC (RTCPeerConnection, DTLS-SRTP, Adaptive Bitrate, Opus Voice Tuning), Socket.io-client
* **Cryptography:** Native Web Crypto API (`window.crypto.subtle`)
* **Storage & PDF:** IndexedDB (local encrypted caching & key storage), `pdfjs-dist`
* **Media:** Emoji Picker React, Gif Picker React, QR Code generator

### Backend
* **Core:** Node.js (ES Modules), Express 5
* **Database:** MongoDB, Mongoose 9
* **Real-time & Signaling:** Socket.io 4, WebRTC Signaling Engine, Metered.ca TURN & Google STUN
* **Authentication:** HTTP-only JWT cookies, Passport.js Google OAuth 2.0
* **Storage & Push:** Cloudinary SDK, `web-push` (VAPID)

---

## 🚀 Getting Started

### Prerequisites
* **Node.js:** v20+ installed
* **MongoDB:** Local instance or MongoDB Atlas URI
* **Cloudinary Account:** For media storage
* **Metered.ca Account (Optional / Free):** For TURN relay across restrictive cellular networks / symmetric NATs

### 1. Configure Server Environment
Create `server/.env`:
```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
MONGO_URI=mongodb://localhost:27017/threadline
JWT_ACCESS_SECRET=your_super_secret_jwt_access_key
JWT_REFRESH_SECRET=your_super_secret_jwt_refresh_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:admin@threadline.com
METERED_DOMAIN=your_app.metered.live
METERED_API_KEY=your_metered_api_key
```

### 2. Configure Client Environment
Create `client/.env`:
```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key
```

### 3. Install & Run

**Terminal 1 (Backend):**
```bash
cd server
npm install
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. Register an account and start private, end-to-end encrypted conversations and crystal-clear voice/video calls!
