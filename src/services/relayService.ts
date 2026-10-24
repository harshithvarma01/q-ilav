import { finalizeEvent } from 'nostr-tools/pure';
import { sha256Bytes } from './crypto';
import {
  getLastSyncCheckpoint,
  saveLastSyncCheckpoint,
} from './storageService';
import {
  UserProfile,
  IdentityResolution,
  EncryptedEnvelope,
  InboundSwarmEvent,
} from '../types';

export const NOSTR_RELAYS: string[] = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.wine',
  'wss://relay.snort.social',
];

// In-memory cache to reduce redundant network queries
const peerKeyCache: Record<string, string> = {};
const peerProfileCache: Record<string, UserProfile> = {};
const seenEventIds = new Set<string>();

let sessionSignerKey: Uint8Array | null = null;

/**
 * Initializes the deterministic Nostr event signing key from address + password.
 */
export const setSessionSignerKey = (address: string, secret: string): Uint8Array => {
  const seedString = `nostr_signer_${address.trim().toLowerCase()}_${secret}`;
  sessionSignerKey = sha256Bytes(seedString);
  return sessionSignerKey;
};

export const clearRelayCache = (): void => {
  seenEventIds.clear();
  sessionSignerKey = null;
};

/**
 * Resolves a peer's X25519 public key and profile from Nostr relays by their .ilav handle.
 */
export const resolveIlavIdentity = async (address: string): Promise<IdentityResolution> => {
  const cleanAddress = address.trim().toLowerCase();

  // Return cached key if already resolved in this session
  if (peerKeyCache[cleanAddress]) {
    return {
      exists: true,
      destinationKey: peerKeyCache[cleanAddress],
      profile: peerProfileCache[cleanAddress] || null,
    };
  }

  return new Promise((resolve) => {
    let resolved = false;

    // Safety timeout: If relays don't answer within 7 seconds, return not found
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ exists: false, destinationKey: null, profile: null });
      }
    }, 7000);

    NOSTR_RELAYS.forEach((relayUrl) => {
      try {
        const ws = new WebSocket(relayUrl);
        const subId = `res_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

        ws.onopen = () => {
          ws.send(
            JSON.stringify([
              'REQ',
              subId,
              { kinds: [1], '#t': [`ilav_${cleanAddress}`], limit: 1 },
            ])
          );
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (Array.isArray(data) && data[0] === 'EVENT' && data[2]?.content) {
              const eventObj = data[2];
              let resolvedKey: string | null = null;
              let resolvedProfile: UserProfile | null = null;

              // 1. Check tag 'k'
              const kTag = eventObj.tags?.find((t: string[]) => t[0] === 'k');
              if (kTag && kTag[1]) {
                resolvedKey = kTag[1];
              }

              // 2. Parse JSON content for encryptionKey and profile
              try {
                const parsed = JSON.parse(eventObj.content);
                if (parsed.encryptionKey) resolvedKey = parsed.encryptionKey;
                if (parsed.profile) resolvedProfile = parsed.profile;
              } catch {}

              if (resolvedKey && !resolved) {
                resolved = true;
                clearTimeout(timeout);
                peerKeyCache[cleanAddress] = resolvedKey;
                if (resolvedProfile) peerProfileCache[cleanAddress] = resolvedProfile;
                ws.close();
                resolve({
                  exists: true,
                  destinationKey: resolvedKey,
                  profile: resolvedProfile,
                });
              }
            }
          } catch {}
        };

        ws.onerror = () => {};
      } catch {}
    });
  });
};

/**
 * Announces this user's .ilav identity and X25519 public key to the Nostr relays.
 */
export const announceIdentity = async (
  address: string,
  x25519PublicKey: string,
  profile: UserProfile
): Promise<boolean> => {
  if (!sessionSignerKey) {
    throw new Error('Session signer key not set. User must authenticate first.');
  }

  const cleanAddress = address.trim().toLowerCase();
  peerKeyCache[cleanAddress] = x25519PublicKey;
  peerProfileCache[cleanAddress] = profile;

  const payload = JSON.stringify({
    handle: cleanAddress,
    encryptionKey: x25519PublicKey,
    profile,
  });

  const signedEvent = finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', `ilav_${cleanAddress}`],
        ['k', x25519PublicKey],
        ['app', 'qilav_core'],
      ],
      content: payload,
    },
    sessionSignerKey
  );

  const frame = JSON.stringify(['EVENT', signedEvent]);

  NOSTR_RELAYS.forEach((relayUrl) => {
    try {
      const ws = new WebSocket(relayUrl);
      ws.onopen = () => {
        ws.send(frame);
        setTimeout(() => {
          try { ws.close(); } catch {}
        }, 3000);
      };
      ws.onerror = () => {};
    } catch {}
  });

  return true;
};

/**
 * Dispatches an encrypted envelope (chat or call signal) to a target .ilav address.
 */
export const dispatchMessage = async (
  recipientAddress: string,
  payloadEnvelope: EncryptedEnvelope
): Promise<void> => {
  if (!sessionSignerKey) {
    throw new Error('Session signer key not set. User must authenticate first.');
  }

  const target = recipientAddress.trim().toLowerCase();

  const signedEvent = finalizeEvent(
    {
      kind: 4,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', target],
        ['app', 'qilav_secure'],
      ],
      content: JSON.stringify(payloadEnvelope),
    },
    sessionSignerKey
  );

  seenEventIds.add(signedEvent.id);
  const frame = JSON.stringify(['EVENT', signedEvent]);

  NOSTR_RELAYS.forEach((relayUrl) => {
    try {
      const ws = new WebSocket(relayUrl);
      ws.onopen = () => {
        ws.send(frame);
      };

      ws.onmessage = (e) => {
        try {
          const res = JSON.parse(e.data);
          // When relay responds with ['OK', eventId, true], close cleanly
          if (Array.isArray(res) && res[0] === 'OK' && res[1] === signedEvent.id) {
            ws.close();
          }
        } catch {}
      };

      // Fallback timeout to close the socket
      setTimeout(() => {
        try { ws.close(); } catch {}
      }, 5000);

      ws.onerror = () => {};
    } catch {}
  });
};

/**
 * Subscribes to incoming encrypted messages and signals for the active user.
 * Uses checkpoint timestamps to prevent fetching old duplicate messages.
 */
export const subscribeToQilav = (
  userAddress: string,
  onPayloadReceived: (event: InboundSwarmEvent) => void
): (() => void) => {
  const cleanAddress = userAddress.trim().toLowerCase();
  const sockets: WebSocket[] = [];
  let isSubscribed = true;

  (async () => {
    // Read the specific checkpoint timestamp for this account
    const sinceTimestamp = await getLastSyncCheckpoint(cleanAddress);
    let latestReceived = sinceTimestamp;

    NOSTR_RELAYS.forEach((relayUrl) => {
      try {
        const ws = new WebSocket(relayUrl);
        sockets.push(ws);

        ws.onopen = () => {
          if (!isSubscribed) {
            ws.close();
            return;
          }
          const subId = `sub_${cleanAddress}_${Math.random().toString(36).substring(2, 6)}`;
          ws.send(
            JSON.stringify([
              'REQ',
              subId,
              {
                kinds: [4],
                '#t': [cleanAddress],
                since: sinceTimestamp,
              },
            ])
          );
        };

        ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            if (Array.isArray(data) && data[0] === 'EVENT' && data[2]?.content) {
              const eventObj = data[2];

              // Discard if already seen
              if (seenEventIds.has(eventObj.id)) return;
              seenEventIds.add(eventObj.id);

              // Maintain cache size under 3000 IDs to avoid memory leaks
              if (seenEventIds.size > 3000) {
                const oldest = seenEventIds.values().next().value;
                if (oldest) seenEventIds.delete(oldest);
              }

              // Advance and persist checkpoint
              if (eventObj.created_at > latestReceived) {
                latestReceived = eventObj.created_at;
                await saveLastSyncCheckpoint(cleanAddress, latestReceived);
              }

              const inner = JSON.parse(eventObj.content) as EncryptedEnvelope;
              const targetTag = eventObj.tags?.find((t: string[]) => t[0] === 't')?.[1];

              onPayloadReceived({
                ...inner,
                sender: inner.sender || '',
                senderPublicKey: inner.senderPublicKey || '',
                target: targetTag,
                eventId: eventObj.id,
                created_at: eventObj.created_at,
              });
            }
          } catch {}
        };

        ws.onerror = () => {};
      } catch {}
    });
  })();

  // Return unsubscribe cleanup function
  return () => {
    isSubscribed = false;
    sockets.forEach((ws) => {
      try { ws.close(); } catch {}
    });
  };
};