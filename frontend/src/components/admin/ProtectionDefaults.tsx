import React from "react";

interface Props {
  maxWearableMessagesPerSecond: number;
  maxConcurrentRealms: number;
  onChange: (field: string, value: string | number) => void;
}

const btnStyle = (selected: boolean) => ({
  padding: "0.5rem 1.2rem",
  fontSize: "0.9rem",
  borderRadius: "8px",
  border: selected ? "2px solid var(--accent2, #33DFFF)" : "1px solid #333",
  background: selected ? "rgba(51, 223, 255, 0.1)" : "var(--code-bg, #1f2028)",
  color: selected ? "#fff" : "var(--text, #9ca3af)",
  cursor: "pointer" as const,
  fontWeight: selected ? 600 : 400,
  margin: 0,
});

export function ProtectionDefaults({ maxWearableMessagesPerSecond, maxConcurrentRealms, onChange }: Props) {
  return (
    <div className="fg-col" style={{ display: "flex", flexDirection: "column", "--fg": "1.5rem" } as React.CSSProperties}>
      <div>
        <label className="admin-label">Wearable Data Rate Limit (msg/sec)</label>
        <div className="fg-row" style={{ display: "flex", "--fg": "0.5rem" } as React.CSSProperties}>
          {[1, 2, 5, 10].map((v) => (
            <button key={v} onClick={() => onChange("maxWearableMessagesPerSecond", v)} style={btnStyle(maxWearableMessagesPerSecond === v)}>
              {v}
            </button>
          ))}
          <button onClick={() => onChange("maxWearableMessagesPerSecond", 0)} style={btnStyle(maxWearableMessagesPerSecond === 0)}>
            Unlimited
          </button>
        </div>
      </div>

      <div>
        <label className="admin-label">Max Concurrent Realms</label>
        <div className="fg-row" style={{ display: "flex", "--fg": "0.5rem" } as React.CSSProperties}>
          {[5, 10, 20, 50].map((v) => (
            <button key={v} onClick={() => onChange("maxConcurrentRealms", v)} style={btnStyle(maxConcurrentRealms === v)}>
              {v}
            </button>
          ))}
          <button onClick={() => onChange("maxConcurrentRealms", 0)} style={btnStyle(maxConcurrentRealms === 0)}>
            Unlimited
          </button>
        </div>
      </div>
    </div>
  );
}
