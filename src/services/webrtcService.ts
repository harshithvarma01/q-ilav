import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  MediaStream,
  mediaDevices,
} from 'react-native-webrtc';
import { encryptPayload } from './crypto';
import { dispatchMessage } from './relayService';
import { CallMode, KeyPair, SignalPayload } from '../types';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

let peerConnection: RTCPeerConnection | null = null;
let localMediaStream: MediaStream | null = null;
let activeSessionId: string | null = null;
let pendingIceCandidates: RTCIceCandidate[] = [];

/**
 * Accesses local hardware (Microphone and optional Camera)
 */
export const startLocalMedia = async (mode: CallMode): Promise<MediaStream> => {
  stopLocalMedia();

  const isVideo = mode === 'video';
  const constraints = {
    audio: true,
    video: isVideo
      ? {
          facingMode: 'user',
          frameRate: 30,
        }
      : false,
  };

  try {
    const stream = (await mediaDevices.getUserMedia(constraints)) as unknown as MediaStream;
    localMediaStream = stream;
    return stream;
  } catch (err: any) {
    throw new Error(err?.message || 'Failed to acquire camera/microphone permissions');
  }
};

/**
 * Halts all local tracks and releases camera/mic hardware
 */
export const stopLocalMedia = (): void => {
  if (localMediaStream) {
    localMediaStream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
    localMediaStream = null;
  }
};

/**
 * Creates and configures the RTCPeerConnection for a designated call session
 */
export const initPeerConnection = (
  callSessionId: string,
  targetAddress: string,
  targetPublicKey: string,
  myKeys: KeyPair,
  myAddress: string,
  onRemoteStream: (stream: MediaStream) => void,
  onConnected: () => void,
  onDisconnected: () => void
): RTCPeerConnection => {
  destroyPeerConnection();

  activeSessionId = callSessionId;
  pendingIceCandidates = [];

  const pc = new RTCPeerConnection(ICE_SERVERS);
  peerConnection = pc;

  // Attach local media tracks if stream exists
  if (localMediaStream) {
    localMediaStream.getTracks().forEach((track) => {
      pc.addTrack(track, localMediaStream!);
    });
  }

  // Handle local ICE candidates and dispatch over Nostr
  pc.addEventListener('icecandidate', (event: any) => {
    if (event.candidate && activeSessionId === callSessionId) {
      const payload: SignalPayload = {
        type: 'CALL_ICE',
        callSessionId,
        candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate,
      };

      const envelope = encryptPayload(payload, targetPublicKey, myKeys.secretKey);
      dispatchMessage(targetAddress, {
        ...envelope,
        sender: myAddress,
        senderPublicKey: myKeys.publicKey,
      }).catch(() => {});
    }
  });

  // Handle incoming remote media track
  pc.addEventListener('track', (event: any) => {
    if (event.streams && event.streams[0]) {
      onRemoteStream(event.streams[0]);
    }
  });

  // Monitor connection states
  pc.addEventListener('connectionstatechange', () => {
    if (!pc) return;
    const state = pc.connectionState;

    if (state === 'connected') {
      onConnected();
    } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      onDisconnected();
    }
  });

  return pc;
};

/**
 * Generates and dispatches a WebRTC Offer for an outgoing call
 */
export const sendCallOffer = async (
  callSessionId: string,
  targetAddress: string,
  targetPublicKey: string,
  myKeys: KeyPair,
  myAddress: string,
  mode: CallMode
): Promise<void> => {
  if (!peerConnection) {
    throw new Error('PeerConnection not initialized');
  }

  const offerDescription = await peerConnection.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: mode === 'video',
  });

  await peerConnection.setLocalDescription(offerDescription);

  const payload: SignalPayload = {
    type: 'CALL_OFFER',
    callSessionId,
    mode,
    sdp: offerDescription,
    ttlSeconds: 30,
  };

  const envelope = encryptPayload(payload, targetPublicKey, myKeys.secretKey);
  await dispatchMessage(targetAddress, {
    ...envelope,
    sender: myAddress,
    senderPublicKey: myKeys.publicKey,
  });
};

/**
 * Processes an incoming WebRTC Offer, sets remote description, and dispatches an Answer
 */
export const handleIncomingOffer = async (
  callSessionId: string,
  sdp: any,
  targetAddress: string,
  targetPublicKey: string,
  myKeys: KeyPair,
  myAddress: string
): Promise<void> => {
  if (!peerConnection) {
    throw new Error('PeerConnection not initialized');
  }

  activeSessionId = callSessionId;
  const remoteDesc = new RTCSessionDescription(sdp);
  await peerConnection.setRemoteDescription(remoteDesc);

  // Flush queued candidates
  await drainPendingIceCandidates();

  const answerDescription = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answerDescription);

  const payload: SignalPayload = {
    type: 'CALL_ANSWER',
    callSessionId,
    sdp: answerDescription,
  };

  const envelope = encryptPayload(payload, targetPublicKey, myKeys.secretKey);
  await dispatchMessage(targetAddress, {
    ...envelope,
    sender: myAddress,
    senderPublicKey: myKeys.publicKey,
  });
};

/**
 * Processes an incoming WebRTC Answer from the callee
 */
export const handleIncomingAnswer = async (
  callSessionId: string,
  sdp: any
): Promise<void> => {
  if (!peerConnection || activeSessionId !== callSessionId) return;

  const remoteDesc = new RTCSessionDescription(sdp);
  await peerConnection.setRemoteDescription(remoteDesc);

  // Flush queued candidates
  await drainPendingIceCandidates();
};

/**
 * Adds a remote ICE candidate, or queues it if remote description is still pending
 */
export const handleRemoteIce = async (
  callSessionId: string,
  candidateData: any
): Promise<void> => {
  if (!peerConnection || activeSessionId !== callSessionId || !candidateData) return;

  try {
    const candidate = new RTCIceCandidate(candidateData);
    if (peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
      await peerConnection.addIceCandidate(candidate);
    } else {
      pendingIceCandidates.push(candidate);
    }
  } catch {}
};

/**
 * Flushes any pending ICE candidates that arrived before SDP negotiation
 */
const drainPendingIceCandidates = async (): Promise<void> => {
  if (!peerConnection) return;

  while (pendingIceCandidates.length > 0) {
    const candidate = pendingIceCandidates.shift();
    if (candidate) {
      try {
        await peerConnection.addIceCandidate(candidate);
      } catch {}
    }
  }
};

/**
 * Closes connections and resets state
 */
export const destroyPeerConnection = (): void => {
  if (peerConnection) {
    try {
      peerConnection.close();
    } catch {}
    peerConnection = null;
  }
  activeSessionId = null;
  pendingIceCandidates = [];
};