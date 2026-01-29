import { AgentInfo } from '../hooks/useGateway';

interface AgentSelectorProps {
  agents: AgentInfo[];
  activeAgentId: string;
  onSelect: (agentId: string) => void;
}

export function AgentSelector({ agents, activeAgentId, onSelect }: AgentSelectorProps) {
  if (agents.length <= 1) return null;

  return (
    <div className="flex items-center gap-1.5">
      <label className="text-xs text-text-secondary font-medium">Agent</label>
      <select
        value={activeAgentId}
        onChange={(e) => onSelect(e.target.value)}
        className="text-sm bg-bg-primary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        title="Switch agent"
      >
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name || agent.id}
            {agent.default ? ' (default)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
