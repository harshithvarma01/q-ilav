import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserSession, UserProfile, ChatMessage } from '../types';

const PREFIX_SESSION = '@qilav_auth_session';
const PREFIX_PROFILE = '@qilav_profile_';
const PREFIX_CONTACTS = '@qilav_contacts_';
const PREFIX_CHATS = '@qilav_thread_';
const PREFIX_SYNC = '@qilav_sync_checkpoint_';
const KEY_THEME = '@qilav_theme_mode';

/**
 * Persists the active authenticated session.
 */
export const saveActiveSession = async (session: UserSession): Promise<void> => {
  try {
    await AsyncStorage.setItem(PREFIX_SESSION, JSON.stringify(session));
  } catch (err) {
    console.error('Failed to save session:', err);
  }
};

/**
 * Retrieves the stored user session, if one exists.
 */
export const getActiveSession = async (): Promise<UserSession | null> => {
  try {
    const raw = await AsyncStorage.getItem(PREFIX_SESSION);
    return raw ? (JSON.parse(raw) as UserSession) : null;
  } catch {
    return null;
  }
};

/**
 * Clears the active session on logout.
 * Note: Individual sync checkpoints and chat logs are preserved on disk.
 */
export const clearActiveSession = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(PREFIX_SESSION);
  } catch (err) {
    console.error('Failed to clear session:', err);
  }
};

/**
 * Retrieves the last-synced timestamp checkpoint for an account.
 * Defaults to 24 hours prior if this is the first sync on the device.
 */
export const getLastSyncCheckpoint = async (accountAddress: string): Promise<number> => {
  const clean = accountAddress.trim().toLowerCase();
  try {
    const raw = await AsyncStorage.getItem(`${PREFIX_SYNC}${clean}`);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch {}
  // Default to 24-hour lookback on initial registration
  return Math.floor(Date.now() / 1000) - 86400;
};

/**
 * Updates the sync timestamp checkpoint for an account.
 */
export const saveLastSyncCheckpoint = async (
  accountAddress: string,
  timestamp: number
): Promise<void> => {
  const clean = accountAddress.trim().toLowerCase();
  try {
    await AsyncStorage.setItem(`${PREFIX_SYNC}${clean}`, timestamp.toString());
  } catch (err) {
    console.error('Failed to save sync checkpoint:', err);
  }
};

/**
 * Loads the complete message thread between the current user and a peer.
 */
export const getChatThread = async (
  myAddress: string,
  peerAddress: string
): Promise<ChatMessage[]> => {
  const myClean = myAddress.trim().toLowerCase();
  const peerClean = peerAddress.trim().toLowerCase();
  const threadKey = `${PREFIX_CHATS}${myClean}:${peerClean}`;

  try {
    const raw = await AsyncStorage.getItem(threadKey);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
};

/**
 * Appends a message to the local thread, deduplicating by ID.
 * Returns the updated array sorted in reverse-chronological order (newest first).
 */
export const saveChatMessage = async (
  myAddress: string,
  peerAddress: string,
  message: ChatMessage
): Promise<ChatMessage[]> => {
  const myClean = myAddress.trim().toLowerCase();
  const peerClean = peerAddress.trim().toLowerCase();
  const threadKey = `${PREFIX_CHATS}${myClean}:${peerClean}`;

  try {
    const current = await getChatThread(myClean, peerClean);
    if (current.some((m) => m.id === message.id)) {
      return current;
    }

    const updated = [message, ...current];
    await AsyncStorage.setItem(threadKey, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save chat message:', err);
    return [];
  }
};

/**
 * Retrieves the contact list for a specific account.
 */
export const getSavedContacts = async (myAddress: string): Promise<string[]> => {
  const myClean = myAddress.trim().toLowerCase();
  try {
    const raw = await AsyncStorage.getItem(`${PREFIX_CONTACTS}${myClean}`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

/**
 * Saves a contact address to the user's contact book, avoiding duplicates.
 */
export const saveContact = async (myAddress: string, peerAddress: string): Promise<string[]> => {
  const myClean = myAddress.trim().toLowerCase();
  const peerClean = peerAddress.trim().toLowerCase();

  try {
    const contacts = await getSavedContacts(myClean);
    const set = new Set(contacts);
    set.add(peerClean);
    const updated = Array.from(set);
    await AsyncStorage.setItem(`${PREFIX_CONTACTS}${myClean}`, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Failed to save contact:', err);
    return [];
  }
};

/**
 * Saves the local user profile (display name, avatar identifier).
 */
export const saveUserProfile = async (
  address: string,
  profile: UserProfile
): Promise<void> => {
  const clean = address.trim().toLowerCase();
  try {
    await AsyncStorage.setItem(`${PREFIX_PROFILE}${clean}`, JSON.stringify(profile));
  } catch (err) {
    console.error('Failed to save user profile:', err);
  }
};

/**
 * Retrieves the local user profile.
 */
export const getUserProfile = async (address: string): Promise<UserProfile | null> => {
  const clean = address.trim().toLowerCase();
  try {
    const raw = await AsyncStorage.getItem(`${PREFIX_PROFILE}${clean}`);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
};

/**
 * Theme preference persistence ('dark' | 'light').
 */
export const saveThemePreference = async (theme: 'dark' | 'light'): Promise<void> => {
  try {
    await AsyncStorage.setItem(KEY_THEME, theme);
  } catch {}
};

export const getThemePreference = async (): Promise<'dark' | 'light' | null> => {
  try {
    const raw = await AsyncStorage.getItem(KEY_THEME);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return null;
  }
};