import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ArrowLeft, Phone, Video, Send } from 'lucide-react-native';
import { AppTheme } from '../theme';
import { ChatMessage, CallMode } from '../types';

interface ChatThreadProps {
  theme: AppTheme;
  peerAddress: string;
  messages: ChatMessage[];
  onBack: () => void;
  onSendMessage: (text: string) => Promise<void>;
  onStartCall: (mode: CallMode) => void;
}

export const ChatThread: React.FC<ChatThreadProps> = ({
  theme,
  peerAddress,
  messages,
  onBack,
  onSendMessage,
  onStartCall,
}) => {
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!inputText.trim() || isSending) return;
    const textToSend = inputText.trim();
    setInputText('');
    setIsSending(true);

    try {
      await onSendMessage(textToSend);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.bg }]}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <ArrowLeft size={20} color={theme.text} />
        </TouchableOpacity>

        <View style={styles.metaContainer}>
          <Text style={[styles.peerName, { color: theme.text }]} numberOfLines={1}>
            {peerAddress}
          </Text>
          <Text style={[styles.linkStatus, { color: theme.accent }]}>End-to-End Encrypted</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.callBtn, { backgroundColor: theme.primaryGlow }]}
            onPress={() => onStartCall('audio')}
          >
            <Phone size={17} color={theme.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.callBtn, { backgroundColor: theme.accentGlow }]}
            onPress={() => onStartCall('video')}
          >
            <Video size={17} color={theme.accent} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages List */}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        inverted
        contentContainerStyle={styles.messageList}
        renderItem={({ item }) => (
          <View style={[styles.bubbleWrapper, item.isMe ? styles.alignRight : styles.alignLeft]}>
            <View
              style={[
                styles.bubble,
                {
                  backgroundColor: item.isMe ? theme.bubbleSelf : theme.bubblePeer,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={[styles.messageText, { color: theme.text }]}>{item.text}</Text>
              <Text style={[styles.timestamp, { color: theme.textMuted }]}>
                {new Date(item.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        )}
      />

      {/* Input Bar */}
      <View style={[styles.inputContainer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
          ]}
          placeholder="Encrypted message..."
          placeholderTextColor={theme.textMuted}
          value={inputText}
          onChangeText={setInputText}
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: theme.primary }]}
          onPress={handleSend}
          disabled={!inputText.trim()}
        >
          <Send size={16} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 8, marginRight: 8 },
  metaContainer: { flex: 1 },
  peerName: { fontSize: 14, fontWeight: '700' },
  linkStatus: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 10 },
  callBtn: { padding: 9, borderRadius: 10 },
  messageList: { paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
  bubbleWrapper: { flexDirection: 'row', marginVertical: 2 },
  alignLeft: { alignSelf: 'flex-start' },
  alignRight: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1 },
  messageText: { fontSize: 14, lineHeight: 20 },
  timestamp: { fontSize: 10, alignSelf: 'flex-end', marginTop: 4, fontWeight: '600' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  input: { flex: 1, height: 42, borderRadius: 21, borderWidth: 1, paddingHorizontal: 16, fontSize: 14 },
  sendBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
});