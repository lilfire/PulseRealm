import type { AdminConfig } from "./AdminDashboard";

interface Props {
  maxWearableMessagesPerSecond: number;
  maxConcurrentRealms: number;
  onChange: <K extends keyof AdminConfig>(field: K, value: AdminConfig[K]) => void;
}

export function ProtectionDefaults({ maxWearableMessagesPerSecond, maxConcurrentRealms, onChange }: Props) {
  return (
    <div className="admin-card">
      <div className="admin-form-grid">
        <div>
          <label className="admin-label">Wearable Data Rate Limit (msg/sec)</label>
          <div className="admin-btn-group">
            {[1, 2, 5, 10].map((v) => (
              <button key={v} onClick={() => onChange("maxWearableMessagesPerSecond", v)} className={`admin-btn-option${maxWearableMessagesPerSecond === v ? " admin-btn-option-active" : ""}`}>
                {v}
              </button>
            ))}
            <button onClick={() => onChange("maxWearableMessagesPerSecond", 0)} className={`admin-btn-option${maxWearableMessagesPerSecond === 0 ? " admin-btn-option-active" : ""}`}>
              Unlimited
            </button>
          </div>
        </div>

        <div>
          <label className="admin-label">Max Concurrent Realms</label>
          <div className="admin-btn-group">
            {[5, 10, 20, 50].map((v) => (
              <button key={v} onClick={() => onChange("maxConcurrentRealms", v)} className={`admin-btn-option${maxConcurrentRealms === v ? " admin-btn-option-active" : ""}`}>
                {v}
              </button>
            ))}
            <button onClick={() => onChange("maxConcurrentRealms", 0)} className={`admin-btn-option${maxConcurrentRealms === 0 ? " admin-btn-option-active" : ""}`}>
              Unlimited
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
