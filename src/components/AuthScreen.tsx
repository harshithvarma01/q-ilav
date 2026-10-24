import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Shield, Sun, Moon } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppTheme } from '../theme';
import { normalizeAddress, deriveKeypairFromSecret } from '../services/crypto';
import {
  resolveIlavIdentity,
  announceIdentity,
  setSessionSignerKey,
} from '../services/relayService';
import {
  saveActiveSession,
  saveUserProfile,
} from '../services/storageService';
import { UserSession, UserProfile } from '../types';

interface AuthScreenProps {
  theme: AppTheme;
  themeMode: 'dark' | 'light';
  onToggleTheme: () => void;
  onAuthenticated: (session: UserSession, profile: UserProfile) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  theme,
  themeMode,
  onToggleTheme,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [addressInput, setAddressInput] = useState('');
  const [secretInput, setSecretInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    const addressCheck = normalizeAddress(addressInput);
    if (!addressCheck.valid) {
      Alert.alert(
        'Invalid Address Format',
        'Please enter a valid format: user@network.ilav'
      );
      return;
    }

    if (!secretInput || secretInput.length < 4) {
      Alert.alert('Secret Required', 'Secret key must be at least 4 characters.');
      return;
    }

    setIsLoading(true);
    const fullAddress = addressCheck.fullAddress;

    try {
      // 1. Derive deterministic keys
      setSessionSignerKey(fullAddress, secretInput);
      const keys = deriveKeypairFromSecret(fullAddress, secretInput);

      // 2. Query swarm for identity status
      const existing = await resolveIlavIdentity(fullAddress);

      if (mode === 'login') {
        if (!existing.exists) {
          Alert.alert(
            'Address Not Found',
            'This address is not yet registered on the network. Switch to Sign Up.'
          );
          setIsLoading(false);
          return;
        }
        if (existing.destinationKey && existing.destinationKey !== keys.publicKey) {
          Alert.alert('Authentication Failed', 'Incorrect secret for this sovereign address.');
          setIsLoading(false);
          return;
        }
      } else {
        if (existing.exists && existing.destinationKey && existing.destinationKey !== keys.publicKey) {
          Alert.alert('Address Unavailable', 'This address has already been claimed on the network.');
          setIsLoading(false);
          return;
        }
      }

      const defaultProfile: UserProfile = existing.profile || {
        displayName: addressCheck.username,
        avatarId: 'default',
      };

      // 3. Announce identity to Nostr relays
      await announceIdentity(fullAddress, keys.publicKey, defaultProfile);

      const session: UserSession = { address: fullAddress, keys };
      await saveActiveSession(session);
      await saveUserProfile(fullAddress, defaultProfile);

      onAuthenticated(session, defaultProfile);
    } catch (err: any) {
      Alert.alert('Network Error', err?.message || 'Could not reach Nostr relays.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.bg }]}
    >
      <View style={styles.topNav}>
        <TouchableOpacity
          onPress={onToggleTheme}
          style={[styles.themeBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          {themeMode === 'dark' ? (
            <Sun size={18} color={theme.text} />
          ) : (
            <Moon size={18} color={theme.text} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.iconWrapper, { backgroundColor: theme.primaryGlow }]}>
            <Shield size={32} color={theme.primary} />
          </View>

          <Text style={[styles.brandTitle, { color: theme.text }]}>Q-ILAV</Text>
          <Text style={[styles.brandSubtitle, { color: theme.textSecondary }]}>
            Sovereign Peer-to-Peer Encryption
          </Text>

          <View style={[styles.tabBar, { backgroundColor: theme.surface }]}>
            <TouchableOpacity
              style={[styles.tab, mode === 'signup' && { backgroundColor: theme.surfaceLight }]}
              onPress={() => setMode('signup')}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: mode === 'signup' ? theme.text : theme.textMuted },
                ]}
              >
                Sign Up
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'login' && { backgroundColor: theme.surfaceLight }]}
              onPress={() => setMode('login')}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: mode === 'login' ? theme.text : theme.textMuted },
                ]}
              >
                Sign In
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: theme.textSecondary }]}>SOVEREIGN ADDRESS</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
            ]}
            placeholder="handle@mesh.ilav"
            placeholderTextColor={theme.textMuted}
            value={addressInput}
            onChangeText={setAddressInput}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.label, { color: theme.textSecondary }]}>AUTHENTICATION SECRET</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: theme.inputBg, borderColor: theme.border, color: theme.text },
            ]}
            placeholder="••••••••••••"
            placeholderTextColor={theme.textMuted}
            value={secretInput}
            onChangeText={setSecretInput}
            secureTextEntry
          />

          <TouchableOpacity style={styles.actionBtn} onPress={handleSubmit} disabled={isLoading}>
            <LinearGradient
              colors={[theme.primary, theme.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.gradient}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.btnText}>
                  {mode === 'signup' ? 'Claim Identity' : 'Authenticate'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  topNav: { flexDirection: 'row', justifyContent: 'flex-end', padding: 20 },
  themeBtn: { padding: 10, borderRadius: 12, borderWidth: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 40 },
  card: { borderRadius: 20, borderWidth: 1, padding: 24 },
  iconWrapper: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  brandTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center', letterSpacing: 1 },
  brandSubtitle: { fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 24 },
  tabBar: { flexDirection: 'row', borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabText: { fontSize: 13, fontWeight: '700' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginTop: 12 },
  input: { height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, fontSize: 14 },
  actionBtn: { marginTop: 24, borderRadius: 12, overflow: 'hidden' },
  gradient: { paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#ffffff', fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
});