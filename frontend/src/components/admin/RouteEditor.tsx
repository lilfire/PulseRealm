import React, { useState } from "react";

export interface CuratedRouteItem {
  fromLat: number;
  fromLng: number;
  fromAddress: string;
  toLat: number;
  toLng: number;
  toAddress: string;
}

interface Props {
  routes: CuratedRouteItem[];
  onChange: (routes: CuratedRouteItem[]) => void;
}

const emptyRoute: CuratedRouteItem = { fromLat: 0, fromLng: 0, fromAddress: "", toLat: 0, toLng: 0, toAddress: "" };

export function RouteEditor({ routes, onChange }: Props) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<CuratedRouteItem>(emptyRoute);
  const [adding, setAdding] = useState(false);

  function startAdd() {
    setDraft({ ...emptyRoute });
    setAdding(true);
    setEditIdx(null);
  }

  function startEdit(idx: number) {
    setDraft({ ...routes[idx] });
    setEditIdx(idx);
    setAdding(false);
  }

  function save() {
    if (!draft.fromAddress.trim() || !draft.toAddress.trim()) return;
    if (adding) {
      onChange([...routes, draft]);
    } else if (editIdx !== null) {
      onChange(routes.map((r, i) => (i === editIdx ? draft : r)));
    }
    setAdding(false);
    setEditIdx(null);
  }

  function cancel() {
    setAdding(false);
    setEditIdx(null);
  }

  function remove(idx: number) {
    onChange(routes.filter((_, i) => i !== idx));
    if (editIdx === idx) {
      setEditIdx(null);
    }
  }

  const isEditing = adding || editIdx !== null;

  return (
    <div>
      <div className="fg-col" style={{ display: "flex", flexDirection: "column", "--fg": "0.5rem" } as React.CSSProperties}>
        {routes.map((route, i) => (
          <div
            key={route.fromAddress + route.toAddress || i}
            className="fg-row"
            style={{
              display: "flex",
              alignItems: "center",
              "--fg": "0.75rem",
              padding: "0.5rem 0.75rem",
              background: editIdx === i ? "rgba(51, 223, 255, 0.08)" : "var(--code-bg, #1f2028)",
              borderRadius: "6px",
              border: editIdx === i ? "1px solid var(--accent2, #33DFFF)" : "1px solid var(--border, #2e303a)",
            } as React.CSSProperties}
          >
            <div style={{ flex: 1, fontSize: "0.9rem" }}>
              <span style={{ color: "var(--accent2, #33DFFF)" }}>{route.fromAddress}</span>
              <span style={{ color: "var(--text, #9ca3af)", margin: "0 0.4rem" }}>&rarr;</span>
              <span style={{ color: "var(--accent2, #33DFFF)" }}>{route.toAddress}</span>
            </div>
            <button onClick={() => startEdit(i)} style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", margin: 0, background: "transparent", border: "1px solid #555", color: "var(--text)" }}>
              Edit
            </button>
            <button onClick={() => remove(i)} style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", margin: 0, background: "transparent", border: "1px solid #555", color: "#f87171" }}>
              Delete
            </button>
          </div>
        ))}
      </div>

      {isEditing && (
        <div style={{ marginTop: "1rem", padding: "1rem", background: "var(--code-bg, #1f2028)", borderRadius: "8px", border: "1px solid var(--accent2, #33DFFF)" }}>
          <div className="fg-col" style={{ display: "flex", flexDirection: "column", "--fg": "0.75rem" } as React.CSSProperties}>
            <div>
              <label className="admin-label">From Address</label>
              <input className="admin-input" value={draft.fromAddress} onChange={(e) => setDraft({ ...draft, fromAddress: e.target.value })} placeholder="e.g. Eiffel Tower, Paris" />
            </div>
            <div className="fg-row" style={{ display: "flex", "--fg": "1rem" } as React.CSSProperties}>
              <div style={{ flex: 1 }}>
                <label className="admin-label">From Latitude</label>
                <input className="admin-input" type="number" step="any" value={draft.fromLat} onChange={(e) => setDraft({ ...draft, fromLat: Number(e.target.value) })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="admin-label">From Longitude</label>
                <input className="admin-input" type="number" step="any" value={draft.fromLng} onChange={(e) => setDraft({ ...draft, fromLng: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="admin-label">To Address</label>
              <input className="admin-input" value={draft.toAddress} onChange={(e) => setDraft({ ...draft, toAddress: e.target.value })} placeholder="e.g. Louvre Museum, Paris" />
            </div>
            <div className="fg-row" style={{ display: "flex", "--fg": "1rem" } as React.CSSProperties}>
              <div style={{ flex: 1 }}>
                <label className="admin-label">To Latitude</label>
                <input className="admin-input" type="number" step="any" value={draft.toLat} onChange={(e) => setDraft({ ...draft, toLat: Number(e.target.value) })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="admin-label">To Longitude</label>
                <input className="admin-input" type="number" step="any" value={draft.toLng} onChange={(e) => setDraft({ ...draft, toLng: Number(e.target.value) })} />
              </div>
            </div>
            <div className="fg-row" style={{ display: "flex", "--fg": "0.5rem" } as React.CSSProperties}>
              <button onClick={save} className="admin-btn-primary" style={{ flex: 1 }}>
                {adding ? "Add" : "Update"}
              </button>
              <button onClick={cancel} className="admin-btn-secondary" style={{ flex: 1 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {!isEditing && (
        <button onClick={startAdd} style={{ marginTop: "1rem", padding: "0.5rem 1.2rem", fontSize: "0.9rem", borderRadius: "8px", border: "1px dashed #555", background: "transparent", color: "var(--text)", cursor: "pointer" }}>
          + Add Route
        </button>
      )}
    </div>
  );
}
