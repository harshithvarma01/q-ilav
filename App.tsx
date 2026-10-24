import 'react-native-get-random-values';
import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  Alert,
  BackHandler,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { themes, AppTheme } from './src/theme';
import {
  UserSession,
  UserProfile,
  ChatMessage,
  CallStatus,
  CallMode,
  ActiveCallContext,
  SignalPayload,
} from './src/types';
import {
  encryptPayload,
  decryptPayload,
} from './src/services/crypto';
import {
  dispatchMessage,
  subscribeToQilav,
  resolveIlavIdentity,
  clearRelayCache,
} from './src/services/relayService';
import {
  getActiveSession,
  clearActiveSession,
  getThemePreference,
  saveThemePreference,
  getSavedContacts,
  saveContact,
  getChatThread,
  saveChatMessage,
  getUserProfile,
} from './src/services/storageService';
import {
  startLocalMedia,
  stopLocalMedia,
  initPeerConnection,
  sendCallOffer,
  handleIncomingOffer,
  handleIncomingAnswer,
  handleRemoteIce,
  destroyPeerConnection,
} from './src/services/webrtcService';

import { AuthScreen } from './src/components/AuthScreen';
import { ContactList } from './src/components/ContactList';
import { ChatThread } from './src/components/ChatThread';
import { CallModal } from './src/components/CallModal';

export default function App() {
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const theme: AppTheme = themes[themeMode];

  // Auth & Session
  const [session, setSession] = useState<UserSession | null>(null);
  const [profile, setProfile] = useState<UserProfile>({ displayName: '', avatarId: 'default' });

  // Navigation & Contacts
  const [contacts, setContacts] = useState<string[]>([]);
  const [activePeer, setActivePeer] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[]>([]);

  // WebRTC Call State Machine
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [callMode, setCallMode] = useState<CallMode>('audio');
  const [activeCall, setActiveCall] = useState<ActiveCallContext | null>(null);
  const [localStreamUrl, setLocalStreamUrl] = useState<string | null>(null);
  const [remoteStreamUrl, setRemoteStreamUrl] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Initial State Restoration
  useEffect(() => {
    (async () => {
      const savedTheme = await getThemePreference();
      if (savedTheme) setThemeMode(savedTheme);

      const existingSession = await getActiveSession();
      if (existingSession) {
        setSession(existingSession);
        const storedProfile = await getUserProfile(existingSession.address);
        if (storedProfile) setProfile(storedProfile);
        const loadedContacts = await getSavedContacts(existingSession.address);
        setContacts(loadedContacts);
      }
    })();
  }, []);

  // 2. Hardware Back Button Handling
  useEffect(() => {
    const handleBack = () => {
      if (callStatus !== 'idle') {
        endCall(true);
        return true;
      }
      if (activePeer) {
        setActivePeer(null);
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => sub.remove();
  }, [callStatus, activePeer]);

  // 3. Nostr Inbound Signaling & Message Listener
  useEffect(() => {
    if (!session) return;

    const unsubscribe = subscribeToQilav(session.address, async (envelope) => {
      try {
        const { sender, senderPublicKey, cipherText, nonce, created_at, eventId } = envelope;
        if (!cipherText || !nonce || sender === session.address) return;

        const payload: SignalPayload | null = decryptPayload(
          cipherText,
          nonce,
          senderPublicKey,
          session.keys.secretKey
        );

        if (!payload) return;

        // A. Direct Encrypted Chat Messages
        if (payload.type === 'CHAT_TEXT') {
          const newMsg: ChatMessage = {
            id: eventId || `${created_at}_${sender}`,
            sender,
            text: payload.text,
            timestamp: created_at ? created_at * 1000 : Date.now(),
            isMe: false,
          };

          const updatedThread = await saveChatMessage(session.address, sender, newMsg);
          if (activePeer === sender) {
            setThreadMessages(updatedThread);
          }

          const updatedContacts = await saveContact(session.address, sender);
          setContacts(updatedContacts);
          return;
        }

        // B. Incoming Call Offer
        if (payload.type === 'CALL_OFFER') {
          const nowSec = Math.floor(Date.now() / 1000);
          // Check TTL expiration
          if (created_at && payload.ttlSeconds && nowSec - created_at > payload.ttlSeconds) {
            return;
          }

          // Discard if already engaged in a call
          if (callStatus !== 'idle') return;

          setCallMode(payload.mode);
          setActiveCall({
            callSessionId: payload.callSessionId,
            peerAddress: sender,
            peerPublicKey: senderPublicKey,
            mode: payload.mode,
            sdp: payload.sdp,
          });
          setCallStatus('incoming');
          return;
        }

        // C. Call Cancellation by Caller
        if (payload.type === 'CALL_CANCEL') {
          if (activeCall && activeCall.callSessionId === payload.callSessionId) {
            cleanupCallState();
          }
          return;
        }

        // D. Incoming Call Answer
        if (payload.type === 'CALL_ANSWER') {
          if (activeCall && activeCall.callSessionId === payload.callSessionId) {
            if (ringTimeoutRef.current) {
              clearTimeout(ringTimeoutRef.current);
              ringTimeoutRef.current = null;
            }
            await handleIncomingAnswer(payload.callSessionId, payload.sdp);
            setCallStatus('connected');
            startDurationCounter();
          }
          return;
        }

        // E. ICE Candidate
        if (payload.type === 'CALL_ICE') {
          if (activeCall && activeCall.callSessionId === payload.callSessionId) {
            await handleRemoteIce(payload.callSessionId, payload.candidate);
          }
          return;
        }

        // F. Call Hangup
        if (payload.type === 'CALL_HANGUP') {
          if (activeCall && activeCall.callSessionId === payload.callSessionId) {
            cleanupCallState();
          }
          return;
        }
      } catch (err) {
        console.error('Failed to parse incoming payload:', err);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [session, activePeer, callStatus, activeCall]);

  const toggleTheme = async () => {
    const next = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(next);
    await saveThemePreference(next);
  };

  const handleAuthenticated = (userSession: UserSession, userProfile: UserProfile) => {
    setSession(userSession);
    setProfile(userProfile);
    getSavedContacts(userSession.address).then(setContacts);
  };

  const handleLogout = async () => {
    await clearActiveSession();
    clearRelayCache();
    setSession(null);
    setActivePeer(null);
    setContacts([]);
    cleanupCallState();
  };

  const handleOpenThread = async (peer: string) => {
    if (!session) return;
    setActivePeer(peer);
    const history = await getChatThread(session.address, peer);
    setThreadMessages(history);
  };

  const handleSendMessage = async (text: string) => {
    if (!session || !activePeer) return;

    const resolution = await resolveIlavIdentity(activePeer);
    if (!resolution.exists || !resolution.destinationKey) {
      Alert.alert('Offline', 'Could not locate recipient on the network.');
      return;
    }

    const payload: SignalPayload = { type: 'CHAT_TEXT', text };
    const envelope = encryptPayload(payload, resolution.destinationKey, session.keys.secretKey);

    await dispatchMessage(activePeer, {
      ...envelope,
      sender: session.address,
      senderPublicKey: session.keys.publicKey,
    });

    const myMessage: ChatMessage = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender: session.address,
      text,
      timestamp: Date.now(),
      isMe: true,
    };

    const updated = await saveChatMessage(session.address, activePeer, myMessage);
    setThreadMessages(updated);
  };

  const handleAddContact = async (address: string) => {
    if (!session) return;
    const updated = await saveContact(session.address, address);
    setContacts(updated);
  };

  // WebRTC Actions
  const startCall = async (mode: CallMode) => {
    if (!session || !activePeer) return;

    try {
      const resolution = await resolveIlavIdentity(activePeer);
      if (!resolution.exists || !resolution.destinationKey) {
        Alert.alert('Offline', 'Recipient is currently unreachable.');
        return;
      }

      const sessionId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      setCallMode(mode);
      setActiveCall({
        callSessionId: sessionId,
        peerAddress: activePeer,
        peerPublicKey: resolution.destinationKey,
        mode,
      });

      const localStream = await startLocalMedia(mode);
      setLocalStreamUrl(localStream.toURL());

      initPeerConnection(
        sessionId,
        activePeer,
        resolution.destinationKey,
        session.keys,
        session.address,
        (remoteStream) => setRemoteStreamUrl(remoteStream.toURL()),
        () => {
          if (ringTimeoutRef.current) {
            clearTimeout(ringTimeoutRef.current);
            ringTimeoutRef.current = null;
          }
          setCallStatus('connected');
          startDurationCounter();
        },
        () => cleanupCallState()
      );

      await sendCallOffer(
        sessionId,
        activePeer,
        resolution.destinationKey,
        session.keys,
        session.address,
        mode
      );

      setCallStatus('calling');

      // 30s auto-cancel if peer doesn't pick up
      ringTimeoutRef.current = setTimeout(() => {
        endCall(true);
      }, 30000);
    } catch (err: any) {
      Alert.alert('Device Error', err?.message || 'Could not acquire microphone/camera.');
      cleanupCallState();
    }
  };

  const acceptCall = async () => {
    if (!session || !activeCall || !activeCall.sdp) return;

    try {
      const localStream = await startLocalMedia(activeCall.mode);
      setLocalStreamUrl(localStream.toURL());

      initPeerConnection(
        activeCall.callSessionId,
        activeCall.peerAddress,
        activeCall.peerPublicKey,
        session.keys,
        session.address,
        (remoteStream) => setRemoteStreamUrl(remoteStream.toURL()),
        () => {
          setCallStatus('connected');
          startDurationCounter();
        },
        () => cleanupCallState()
      );

      await handleIncomingOffer(
        activeCall.callSessionId,
        activeCall.sdp,
        activeCall.peerAddress,
        activeCall.peerPublicKey,
        session.keys,
        session.address
      );

      setCallStatus('connected');
      startDurationCounter();
    } catch (err) {
      Alert.alert('Connection Failed', 'Failed to initialize peer media connection.');
      cleanupCallState();
    }
  };

  const endCall = async (notifyPeer = true) => {
    if (notifyPeer && session && activeCall) {
      const payload: SignalPayload =
        callStatus === 'calling'
          ? { type: 'CALL_CANCEL', callSessionId: activeCall.callSessionId }
          : { type: 'CALL_HANGUP', callSessionId: activeCall.callSessionId };

      const envelope = encryptPayload(payload, activeCall.peerPublicKey, session.keys.secretKey);
      dispatchMessage(activeCall.peerAddress, {
        ...envelope,
        sender: session.address,
        senderPublicKey: session.keys.publicKey,
      }).catch(() => {});
    }

    cleanupCallState();
  };

  const cleanupCallState = () => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }

    destroyPeerConnection();
    stopLocalMedia();

    setLocalStreamUrl(null);
    setRemoteStreamUrl(null);
    setActiveCall(null);
    setCallStatus('idle');
    setCallDuration(0);
    setIsMuted(false);
  };

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
  };

  const startDurationCounter = () => {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    setCallDuration(0);
    callTimerRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]}>
        <StatusBar
          barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'}
          {...(Platform.OS === 'android' ? { backgroundColor: theme.bg } : {})}
        />

        {!session ? (
          <AuthScreen
            theme={theme}
            themeMode={themeMode}
            onToggleTheme={toggleTheme}
            onAuthenticated={handleAuthenticated}
          />
        ) : activePeer ? (
          <ChatThread
            theme={theme}
            peerAddress={activePeer}
            messages={threadMessages}
            onBack={() => setActivePeer(null)}
            onSendMessage={handleSendMessage}
            onStartCall={startCall}
          />
        ) : (
          <ContactList
            theme={theme}
            themeMode={themeMode}
            currentUser={session.address}
            userProfile={profile}
            contacts={contacts}
            onToggleTheme={toggleTheme}
            onLogout={handleLogout}
            onSelectContact={handleOpenThread}
            onAddContact={handleAddContact}
          />
        )}

        {/* Global Call Modal */}
        <CallModal
          theme={theme}
          visible={callStatus !== 'idle'}
          status={callStatus}
          mode={callMode}
          peerAddress={activeCall?.peerAddress || ''}
          duration={callDuration}
          localStreamUrl={localStreamUrl}
          remoteStreamUrl={remoteStreamUrl}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          onAccept={acceptCall}
          onEndCall={() => endCall(true)}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});