import { useEffect, useState, useCallback } from 'react';

interface WaitingItem {
  id: string;
  text: string;
  priority?: 'low' | 'normal' | 'high';
  createdAt?: string;
}

const FILE_URL = `http://${window.location.hostname}:9089/file/waiting-for-you.json`;

export function WaitingForYouPane() {
  const [items, setItems] = useState<WaitingItem[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('clawd-gui-dismissed-waiting');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const fetchItems = useCallback(async () => {
    try {
      const response = await fetch(FILE_URL);
      if (response.ok) {
        const data = await response.json();
        setItems(data.items || []);
      }
    } catch { /* file not available */ }
  }, []);

  useEffect(() => {
    fetchItems();
    const interval = setInterval(fetchItems, 60000);
    return () => clearInterval(interval);
  }, [fetchItems]);

  const handleDismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    localStorage.setItem('clawd-gui-dismissed-waiting', JSON.stringify([...next]));
  };

  const handleRestore = () => {
    setDismissed(new Set());
    localStorage.removeItem('clawd-gui-dismissed-waiting');
  };

  const visible = items.filter(i => !dismissed.has(i.id));
  const hasDismissed = dismissed.size > 0;

  const priorityColors: Record<string, string> = {
    high: 'text-error',
    normal: 'text-warning',
    low: 'text-text-muted',
  };

  const prioritySort: Record<string, number> = { high: 0, normal: 1, low: 2 };
  const sorted = [...visible].sort((a, b) =>
    (prioritySort[a.priority || 'normal'] ?? 1) - (prioritySort[b.priority || 'normal'] ?? 1)
  );

  return (
    <div className="border-b border-border">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase text-text-secondary tracking-wider">Waiting For You</h2>
        {hasDismissed && (
          <button
            onClick={handleRestore}
            className="text-[10px] text-text-muted hover:text-text-primary transition-colors"
            title="Restore dismissed items"
          >
            ↩ restore
          </button>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto">
        {sorted.length === 0 ? (
          <p className="text-xs text-text-muted px-3 py-3">All clear ✓</p>
        ) : (
          sorted.map(item => (
            <div key={item.id} className="px-3 py-2 border-b border-border/30 group flex items-start gap-2">
              <span className={`text-xs mt-0.5 ${priorityColors[item.priority || 'normal']}`}>●</span>
              <div className="flex-1 min-w-0">
                <span className="text-xs">{item.text}</span>
                {item.createdAt && (
                  <span className="text-[10px] text-text-muted ml-1.5">{item.createdAt}</span>
                )}
              </div>
              <button
                onClick={() => handleDismiss(item.id)}
                className="text-[10px] text-text-muted hover:text-error opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
