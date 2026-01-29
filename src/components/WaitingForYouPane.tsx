import { useEffect, useState } from 'react';

interface WaitingItem {
  id: string;
  text: string;
  priority?: 'low' | 'normal' | 'high';
  createdAt?: string;
  sessionKey?: string;
}

export function WaitingForYouPane() {
  const [items, setItems] = useState<WaitingItem[]>([]);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        // Try to fetch from the gateway host (assumes file served or API)
        // For now, try a local fetch approach
        const response = await fetch('/api/pending-tasks');
        if (response.ok) {
          const data = await response.json();
          setItems(data.items || []);
        }
      } catch {
        // Fallback: try reading from localStorage for manual items
        const stored = localStorage.getItem('clawd-gui-pending-tasks');
        if (stored) {
          try { setItems(JSON.parse(stored)); } catch { /* ignore */ }
        }
      }
    };

    fetchItems();
    const interval = setInterval(fetchItems, 30000);
    return () => clearInterval(interval);
  }, []);

  const priorityColors = {
    high: 'text-error',
    normal: 'text-warning',
    low: 'text-text-secondary',
  };

  return (
    <div className="border-b border-border">
      <div className="px-3 py-2 border-b border-border">
        <h2 className="text-xs font-semibold uppercase text-text-secondary tracking-wider">Waiting For You</h2>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-xs text-text-muted px-3 py-3">All clear ✓</p>
        ) : (
          items.map(item => (
            <div key={item.id} className="px-3 py-2 border-b border-border/30">
              <div className="flex items-start gap-2">
                <span className={`text-xs ${priorityColors[item.priority || 'normal']}`}>●</span>
                <span className="text-xs">{item.text}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
