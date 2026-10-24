import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Platform,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { LinearGradient } from 'expo-linear-gradient';
import { Phone, PhoneOff, Mic, MicOff, Video } from 'lucide-react-native';
import { AppTheme } from '../theme';
import { CallStatus, CallMode } from '../types';

interface CallModalProps {
  theme: AppTheme;
  visible: boolean;
  status: CallStatus;
  mode: CallMode;
  peerAddress: string;
  duration: number;
  localStreamUrl: string | null;
  remoteStreamUrl: string | null;
  isMuted: boolean;
  onToggleMute: () => void;
  onAccept: () => void;
  onEndCall: () => void;
}

export const CallModal: React.FC<CallModalProps> = ({
  theme,
  visible,
  status,
  mode,
  peerAddress,
  duration,
  localStreamUrl,
  remoteStreamUrl,
  isMuted,
  onToggleMute,
  onAccept,
  onEndCall,
}) => {
  const formatSeconds = (sec: number): string => {
    const mins = Math.floor(sec / 60);
    const remainingSec = sec % 60;
    return `${mins}:${remainingSec < 10 ? '0' : ''}${remainingSec}`;
  };

  const isVideo = mode === 'video';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen">
      <View style={styles.container}>
        <StatusBar
          barStyle="light-content"
          {...(Platform.OS === 'android' ? { backgroundColor: '#000000' } : {})}
        />

        {/* Video Viewports */}
        {isVideo ? (
          <View style={StyleSheet.absoluteFill}>
            {remoteStreamUrl ? (
              <RTCView streamURL={remoteStreamUrl} style={styles.fullscreenStream} objectFit="cover" />
            ) : (
              <View style={[styles.fullscreenStream, styles.videoPlaceholder]}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={styles.placeholderText}>Negotiating Video Feed...</Text>
              </View>
            )}

            {localStreamUrl && (
              <View style={styles.pipContainer}>
                <RTCView streamURL={localStreamUrl} style={styles.pipStream} objectFit="cover" zOrder={1} />
              </View>
            )}
          </View>
        ) : (
          <LinearGradient colors={['#090a0f', '#12141c']} style={StyleSheet.absoluteFill} />
        )}

        {/* Overlay Controls */}
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'transparent', 'rgba(0,0,0,0.85)']}
          style={styles.overlay}
        >
          {/* Header Metadata */}
          <View style={styles.topInfo}>
            <View style={[styles.avatarGlow, { backgroundColor: theme.primaryGlow }]}>
              {isVideo ? <Video size={36} color={theme.primary} /> : <Phone size={36} color={theme.primary} />}
            </View>
            <Text style={styles.peerText} numberOfLines={1}>
              {peerAddress}
            </Text>
            <Text style={styles.statusText}>
              {status === 'calling' && 'Calling Sovereign Link...'}
              {status === 'incoming' && `Incoming ${isVideo ? 'Video' : 'Audio'} Call`}
              {status === 'connected' && `Encrypted Call (${formatSeconds(duration)})`}
            </Text>
          </View>

          {/* Action Triggers */}
          {status === 'incoming' ? (
            <View style={styles.controlsRow}>
              <TouchableOpacity
                style={[styles.actionCircle, { backgroundColor: theme.danger }]}
                onPress={onEndCall}
              >
                <PhoneOff size={28} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionCircle, { backgroundColor: theme.online }]}
                onPress={onAccept}
              >
                <Phone size={28} color="#ffffff" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.controlsRow}>
              <TouchableOpacity
                style={[styles.actionCircle, { backgroundColor: 'rgba(255, 255, 255, 0.15)' }]}
                onPress={onToggleMute}
              >
                {isMuted ? <MicOff size={24} color={theme.danger} /> : <Mic size={24} color="#ffffff" />}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionCircle, { backgroundColor: theme.danger }]}
                onPress={onEndCall}
              >
                <PhoneOff size={28} color="#ffffff" />
              </TouchableOpacity>
            </View>
          )}
        </LinearGradient>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  fullscreenStream: { width: '100%', height: '100%' },
  videoPlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#090a0f' },
  placeholderText: { color: '#ffffff', marginTop: 12, fontSize: 13, fontWeight: '600' },
  pipContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 100,
    height: 145,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 10,
    elevation: 8,
  },
  pipStream: { width: '100%', height: '100%' },
  overlay: { flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
  topInfo: { alignItems: 'center', marginTop: 30 },
  avatarGlow: { width: 90, height: 90, borderRadius: 45, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  peerText: { color: '#ffffff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  statusText: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 13, marginTop: 8, fontWeight: '600' },
  controlsRow: { flexDirection: 'row', gap: 40, marginBottom: 20, zIndex: 10 },
  actionCircle: { width: 68, height: 68, borderRadius: 34, justifyContent: 'center', alignItems: 'center' },
});