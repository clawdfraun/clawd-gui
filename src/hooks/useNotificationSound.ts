import { useState, useCallback, useRef, useEffect } from 'react';

const STORAGE_KEY = 'clawd-gui-sound-enabled';

// Generate a pleasant notification tone using Web Audio API
function playNotificationTone() {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Pleasant two-tone chime (C5 -> E5)
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    oscillator.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5

    // Fade in and out for smooth sound
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.25);

    // Clean up after sound finishes
    setTimeout(() => ctx.close(), 300);
  } catch (e) {
    console.warn('Failed to play notification sound:', e);
  }
}

export function useNotificationSound() {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  const toggle = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      // Play a test tone when enabling
      if (next) {
        playNotificationTone();
      }
      return next;
    });
  }, []);

  const playSound = useCallback(() => {
    if (soundEnabled) {
      playNotificationTone();
    }
  }, [soundEnabled]);

  return { soundEnabled, toggle, playSound };
}
