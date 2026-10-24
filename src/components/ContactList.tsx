import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { User, LogOut, Sun, Moon, UserPlus, Shield } from 'lucide-react-native';
import { AppTheme } from '../theme';
import { UserProfile } from '../types';
import { normalizeAddress } from '../services/crypto';
import { resolveIlavIdentity } from '../services/relayService';

interface ContactListProps {
  theme: AppTheme;
  themeMode: 'dark' | 'light';
  currentUser: string;
  userProfile: UserProfile;
  contacts: string[];
  onToggleTheme: () => void;
  onLogout: () => void;
  onSelectContact: (address: string) => void;
  onAddContact: (address: string) => Promise<void>;
}

export const ContactList: React.FC<ContactListProps> = ({
  theme,
  themeMode,
  currentUser,
  userProfile,
  contacts,
  onToggleTheme,
  onLogout,
  onSelectContact,
  onAddContact,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [newContactInput, setNewContactInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleConnect = async () => {
    const check = normalizeAddress(newContactInput);
    if (!check.valid) {
      Alert.alert('Invalid Address', 'Use the standard format: name@network.ilav');
      return;
    }

    if (check.fullAddress === currentUser) {
      Alert.alert('Action Denied', 'You cannot add your own sovereign address.');
      return;
    }

    setIsVerifying(true);
    try {
      const res = await resolveIlavIdentity(check.fullAddress);
      if (!res.exists || !res.destinationKey) {
        Alert.alert('Not Found', 'No sovereign keys found on the network for this address.');
        setIsVerifying(false);
        return;
      }

      await onAddContact(check.fullAddress);
      setNewContactInput('');
      setModalOpen(false);
      onSelectContact(check.fullAddress);
    } catch {
      Alert.alert('Relay Query Failed', 'Could not verify contact on Nostr relays.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Bar */}
      <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={styles.profileSection}>
          <View style={[styles.avatarBox, { backgroundColor: theme.surface }]}>
            <User size={18} color={theme.primary} />
          </View>
          <View style={styles.userTextMeta}>
            <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
              {userProfile.displayName || currentUser.split('@')[0]}
            </Text>
            <Text style={[styles.profileAddress, { color: theme.textSecondary }]} numberOfLines={1}>
              {currentUser}
            </Text>
          </View>
        </View>

        <View style={styles.headerControls}>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={onToggleTheme}
          >
            {themeMode === 'dark' ? (
              <Sun size={16} color={theme.text} />
            ) : (
              <Moon size={16} color={theme.text} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
            onPress={onLogout}
          >
            <LogOut size={16} color={theme.danger} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Contacts List */}
      <FlatList
        data={contacts}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Shield size={36} color={theme.textMuted} />
            <Text style={[styles.emptyHeader, { color: theme.textSecondary }]}>No Peer Channels</Text>
            <Text style={[styles.emptySub, { color: theme.textMuted }]}>
              Add an .ilav address to begin end-to-end encrypted messaging.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.contactCard, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={() => onSelectContact(item)}
          >
            <View style={[styles.contactAvatar, { backgroundColor: theme.primaryGlow }]}>
              <Text style={[styles.avatarInitial, { color: theme.primary }]}>
                {(item[0] || '?').toUpperCase()}
              </Text>
            </View>
            <View style={styles.contactDetails}>
              <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>
                {item}
              </Text>
              <Text style={[styles.contactStatus, { color: theme.accent }]}>Sovereign Link Ready</Text>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Floating Add Contact Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.primary }]}
        onPress={() => setModalOpen(true)}
      >
        <UserPlus size={22} color="#ffffff" />
      </TouchableOpacity>

      {/* Add Contact Modal */}
      <Modal visible={modalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.borderActive }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Peer Contact</Text>
            <TextInput
              style={[
                styles.modalInput,
                { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
              ]}
              placeholder="peer@mesh.ilav"
              placeholderTextColor={theme.textMuted}
              value={newContactInput}
              onChangeText={setNewContactInput}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => {
                  setModalOpen(false);
                  setNewContactInput('');
                }}
                disabled={isVerifying}
              >
                <Text style={{ color: theme.textMuted, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirm, { backgroundColor: theme.primary }]}
                onPress={handleConnect}
                disabled={isVerifying}
              >
                {isVerifying ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Connect</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  profileSection: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarBox: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  userTextMeta: { marginLeft: 12, flex: 1 },
  profileName: { fontSize: 15, fontWeight: '700' },
  profileAddress: { fontSize: 11, marginTop: 2 },
  headerControls: { flexDirection: 'row', gap: 8 },
  iconButton: { padding: 8, borderRadius: 10, borderWidth: 1 },
  listContainer: { padding: 16, gap: 10 },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  contactAvatar: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { fontSize: 18, fontWeight: '800' },
  contactDetails: { marginLeft: 14, flex: 1 },
  contactName: { fontSize: 14, fontWeight: '700' },
  contactStatus: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  emptyContainer: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyHeader: { fontSize: 16, fontWeight: '700', marginTop: 14 },
  emptySub: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: { width: '100%', borderRadius: 16, borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '800', marginBottom: 14 },
  modalInput: { height: 46, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 14 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 14 },
  modalConfirm: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 8 },
  modalConfirmText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
});