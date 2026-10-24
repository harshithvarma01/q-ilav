export interface AppTheme {
  name: 'dark' | 'light';
  // Surfaces & Backgrounds
  bg: string;
  card: string;
  surface: string;
  surfaceLight: string;
  // Borders & Dividers
  border: string;
  borderActive: string;
  // Typography
  text: string;
  textSecondary: string;
  textMuted: string;
  // Brand Accents
  primary: string;
  primaryGlow: string;
  accent: string;
  accentGlow: string;
  // Status & Utility
  online: string;
  danger: string;
  dangerGlow: string;
  // Chat Bubbles
  bubbleSelf: string;
  bubblePeer: string;
  // Form Inputs
  inputBg: string;
}

export const darkTheme: AppTheme = {
  name: 'dark',
  bg: '#090a0f',
  card: '#12141c',
  surface: '#181b26',
  surfaceLight: '#212534',
  border: 'rgba(255, 255, 255, 0.08)',
  borderActive: 'rgba(99, 102, 241, 0.5)',
  text: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  primary: '#6366f1',
  primaryGlow: 'rgba(99, 102, 241, 0.15)',
  accent: '#06b6d4',
  accentGlow: 'rgba(6, 182, 212, 0.15)',
  online: '#10b981',
  danger: '#ef4444',
  dangerGlow: 'rgba(239, 68, 68, 0.15)',
  bubbleSelf: '#312e81',
  bubblePeer: '#1e2230',
  inputBg: '#0f1118',
};

export const lightTheme: AppTheme = {
  name: 'light',
  bg: '#f8fafc',
  card: '#ffffff',
  surface: '#f1f5f9',
  surfaceLight: '#e2e8f0',
  border: 'rgba(0, 0, 0, 0.08)',
  borderActive: 'rgba(79, 70, 229, 0.4)',
  text: '#0f172a',
  textSecondary: '#475569',
  textMuted: '#94a3b8',
  primary: '#4f46e5',
  primaryGlow: 'rgba(79, 70, 229, 0.1)',
  accent: '#0891b2',
  accentGlow: 'rgba(8, 145, 178, 0.1)',
  online: '#059669',
  danger: '#dc2626',
  dangerGlow: 'rgba(220, 38, 38, 0.1)',
  bubbleSelf: '#e0e7ff',
  bubblePeer: '#f1f5f9',
  inputBg: '#ffffff',
};

export const themes = {
  dark: darkTheme,
  light: lightTheme,
};