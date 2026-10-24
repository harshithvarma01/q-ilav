// Sovereign Identity & Cryptography
export interface KeyPair {
  publicKey: string;  // Base64-encoded X25519 public key
  secretKey: string;  // Base64-encoded X25519 private key
}

export interface UserSession {
  address: string;    // e.g. "alex@mesh.ilav"
  keys: KeyPair;
}

export interface UserProfile {
  displayName: string;
  avatarId: string;
}

export interface IdentityResolution {
  exists: boolean;
  destinationKey: string | null;
  profile: UserProfile | null;
}

// Direct Messaging
export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  isMe: boolean;
}

// Call State Machine
export type CallMode = 'audio' | 'video';

export type CallStatus =
  | 'idle'
  | 'calling'       // Outgoing ring
  | 'incoming'      // Incoming ring
  | 'connected'     // Active WebRTC audio/video link
  | 'ended';

export interface ActiveCallContext {
  callSessionId: string;
  peerAddress: string;
  peerPublicKey: string;
  mode: CallMode;
  sdp?: any;
}

// Nostr Swarm Signaling Envelopes
export type SignalPayload =
  | {
      type: 'CHAT_TEXT';
      text: string;
    }
  | {
      type: 'CALL_OFFER';
      callSessionId: string;
      mode: CallMode;
      sdp: any;
      ttlSeconds: number;
    }
  | {
      type: 'CALL_ANSWER';
      callSessionId: string;
      sdp: any;
    }
  | {
      type: 'CALL_ICE';
      callSessionId: string;
      candidate: any;
    }
  | {
      type: 'CALL_CANCEL';
      callSessionId: string;
      reason?: string;
    }
  | {
      type: 'CALL_HANGUP';
      callSessionId: string;
    };

export interface EncryptedEnvelope {
  cipherText: string;
  nonce: string;
  sender?: string;
  senderPublicKey?: string;
}

export interface InboundSwarmEvent {
  target?: string;
  sender: string;
  senderPublicKey: string;
  cipherText: string;
  nonce: string;
  eventId: string;
  created_at: number;
}