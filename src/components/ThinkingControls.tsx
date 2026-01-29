interface Props {
  showThinking: boolean;
  thinkingLevel: string | null;
  autoResolvedLevel?: string | null;
  onToggleShow: () => void;
  onCycleLevel: () => void;
}

const LEVELS = [null, 'low', 'medium', 'high', 'auto'] as const;

function getLevelIndex(level: string | null): number {
  if (!level || level === 'off' || level === 'none') return 0;
  const idx = LEVELS.indexOf(level as typeof LEVELS[number]);
  return idx >= 0 ? idx : 0;
}

function getLevelLabel(level: string | null): string {
  if (!level || level === 'off' || level === 'none') return 'Off';
  if (level === 'auto') return 'Auto';
  return level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * Brain icon with magnifying glass — toggle visibility of thinking blocks
 */
function ShowThinkingIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" strokeWidth="1.5"
      stroke={active ? 'currentColor' : 'currentColor'} className="inline-block">
      {/* Brain outline */}
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M12 5v13" opacity="0.4" />
      {/* Magnifying glass overlay */}
      <circle cx="17" cy="17" r="3" strokeWidth="1.5" />
      <path d="m19.5 19.5 2 2" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Brain icon with fill level indicator — shows current thinking depth
 */
function ThinkingLevelIcon({ level }: { level: string | null }) {
  const idx = getLevelIndex(level);
  const isAuto = level === 'auto';
  // 0=off, 1=low, 2=medium, 3=high, 4=auto

  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" strokeWidth="1.5" stroke="currentColor" className="inline-block">
      <defs>
        <clipPath id="brain-clip">
          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
          <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
        </clipPath>
      </defs>

      {/* Fill based on level — auto gets a gradient-like pulsing fill */}
      {isAuto ? (
        <rect
          x="2" width="20" y="2" height="20"
          fill="currentColor"
          opacity="0.2"
          clipPath="url(#brain-clip)"
          className="animate-pulse"
        />
      ) : idx > 0 && idx <= 3 && (
        <rect
          x="2" width="20"
          y={idx === 3 ? 2 : idx === 2 ? 8 : 13}
          height={idx === 3 ? 20 : idx === 2 ? 14 : 9}
          fill="currentColor"
          opacity="0.3"
          clipPath="url(#brain-clip)"
        />
      )}

      {/* Brain outline */}
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M12 5v13" opacity="0.4" />

      {/* "A" overlay for auto mode */}
      {isAuto && (
        <text x="12" y="15" textAnchor="middle" fontSize="8" fontWeight="bold"
          fill="currentColor" stroke="none">A</text>
      )}
    </svg>
  );
}

export function ThinkingControls({ showThinking, thinkingLevel, autoResolvedLevel, onToggleShow, onCycleLevel }: Props) {
  const isAuto = thinkingLevel === 'auto';
  const resolvedLabel = autoResolvedLevel === null ? 'Off' : autoResolvedLevel
    ? autoResolvedLevel.charAt(0).toUpperCase() + autoResolvedLevel.slice(1)
    : null;

  return (
    <div className="flex items-center gap-1">
      {/* Show/hide thinking toggle */}
      <button
        onClick={onToggleShow}
        className={`p-1.5 rounded-md transition-colors ${
          showThinking
            ? 'bg-accent/20 text-accent'
            : 'text-text-muted hover:text-text-primary'
        }`}
        title={`${showThinking ? 'Hide' : 'Show'} thinking blocks`}
      >
        <ShowThinkingIcon active={showThinking} />
      </button>

      {/* Thinking level toggle */}
      <button
        onClick={onCycleLevel}
        className={`p-1.5 rounded-md transition-colors flex items-center gap-1 ${
          getLevelIndex(thinkingLevel) > 0
            ? 'bg-accent/20 text-accent'
            : 'text-text-muted hover:text-text-primary'
        }`}
        title={`Thinking level: ${getLevelLabel(thinkingLevel)}${isAuto && resolvedLabel ? ` (resolved: ${resolvedLabel})` : ''} — click to cycle`}
      >
        <ThinkingLevelIcon level={thinkingLevel} />
        <span className="text-[10px] font-medium uppercase tracking-wide">
          {getLevelLabel(thinkingLevel)}
        </span>
        {isAuto && resolvedLabel !== null && (
          <span className="text-[9px] font-medium uppercase tracking-wide text-text-muted opacity-75">
            → {resolvedLabel}
          </span>
        )}
      </button>
    </div>
  );
}
