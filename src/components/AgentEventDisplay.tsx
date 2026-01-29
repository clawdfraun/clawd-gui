import { AgentEvent } from '../types/gateway';

interface Props {
  events: AgentEvent[];
}

function getEventSummary(evt: AgentEvent): string | null {
  const { stream, data } = evt;
  
  if (stream === 'tool_call') {
    const name = data.name || data.tool || 'tool';
    return `🔧 ${name}`;
  }
  if (stream === 'tool_result') {
    const name = data.name || data.tool || 'tool';
    const ok = data.error ? '❌' : '✅';
    return `${ok} ${name}`;
  }
  if (stream === 'thinking') {
    return '💭 thinking...';
  }
  if (stream === 'status') {
    return `⚡ ${data.text || data.status || stream}`;
  }
  return null;
}

export function AgentEventDisplay({ events }: Props) {
  if (!events.length) return null;

  // Show last few events
  const recent = events.slice(-5);
  const summaries = recent.map(getEventSummary).filter(Boolean);

  if (!summaries.length) return null;

  return (
    <div className="flex justify-start mb-2">
      <div className="bg-bg-secondary border border-border rounded-lg px-3 py-2 max-w-[60%]">
        <div className="space-y-1">
          {summaries.map((s, i) => (
            <div key={i} className="text-xs text-text-secondary font-mono">
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
