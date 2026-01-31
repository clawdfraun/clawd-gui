import { useState, useCallback } from 'react';

export interface Reaction {
  emoji: string;
  source: 'user' | 'assistant';
}

export type ReactionsMap = Record<string, Reaction>;

const STORAGE_PREFIX = 'clawd-reactions:';

function loadReactions(sessionKey: string): ReactionsMap {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + sessionKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveReactions(sessionKey: string, reactions: ReactionsMap) {
  localStorage.setItem(STORAGE_PREFIX + sessionKey, JSON.stringify(reactions));
}

export function useReactions(sessionKey: string) {
  const [reactions, setReactions] = useState<ReactionsMap>(() => loadReactions(sessionKey));

  const addReaction = useCallback((msgKey: string, emoji: string, source: 'user' | 'assistant') => {
    setReactions(prev => {
      const existing = prev[msgKey];
      // If same emoji, remove it (toggle off)
      if (existing && existing.emoji === emoji && existing.source === source) {
        const { [msgKey]: _, ...rest } = prev;
        saveReactions(sessionKey, rest);
        return rest;
      }
      // Otherwise set single reaction (replaces any previous)
      const updated = { ...prev, [msgKey]: { emoji, source } };
      saveReactions(sessionKey, updated);
      return updated;
    });
  }, [sessionKey]);

  const removeReaction = useCallback((msgKey: string) => {
    setReactions(prev => {
      const { [msgKey]: _, ...rest } = prev;
      saveReactions(sessionKey, rest);
      return rest;
    });
  }, [sessionKey]);

  const getReaction = useCallback((msgKey: string): Reaction | null => {
    return reactions[msgKey] || null;
  }, [reactions]);

  return { reactions, addReaction, removeReaction, getReaction };
}
