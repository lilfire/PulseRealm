import React, { useState } from "react";

export interface StreetViewLocationItem {
  lat: number;
  lng: number;
  address: string;
  heading?: number;
  pitch?: number;
  thumbnailUrl?: string;
}

interface Props {
  locations: StreetViewLocationItem[];
  onChange: (locations: StreetViewLocationItem[]) => void;
  serverUrl: string;
  authToken: string;
}

function resolveUrl(url: string, serverUrl: string): string {
  return url.startsWith("/") ? `${serverUrl}${url}` : url;
}

export function StreetViewEditor({ locations, onChange, serverUrl, authToken }: Props) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<StreetViewLocationItem>({ lat: 0, lng: 0, address: "" });
  const [adding, setAdding] = useState(false);

  function startAdd() {
    setDraft({ lat: 0, lng: 0, address: "", heading: 0, pitch: 0 });
    setAdding(true);
    setEditIdx(null);
  }

  function startEdit(idx: number) {
    setDraft({ ...locations[idx] });
    setEditIdx(idx);
    setAdding(false);
  }

  async function uploadThumbnail(file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${serverUrl}/api/admin/thumbnails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${authToken}` },
      body: form,
    });
    if (res.ok) {
      const data = await res.json();
      setDraft({ ...draft, thumbnailUrl: data.url });
    }
  }

  function save() {
    if (!draft.address.trim()) return;
    if (adding) {
      onChange([...locations, draft]);
    } else if (editIdx !== null) {
      onChange(locations.map((l, i) => (i === editIdx ? draft : l)));
    }
    setAdding(false);
    setEditIdx(null);
  }

  function cancel() {
    setAdding(false);
    setEditIdx(null);
  }

  function remove(idx: number) {
    onChange(locations.filter((_, i) => i !== idx));
    if (editIdx === idx) {
      setEditIdx(null);
    }
  }

  const isEditing = adding || editIdx !== null;

  return (
    <div>
      <div className="fg-col" style={{ display: "flex", flexDirection: "column", "--fg": "0.5rem" } as React.CSSProperties}>
        {locations.map((loc, i) => (
          <div
            key={loc.address || i}
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
            {loc.thumbnailUrl ? (
              <img
                src={resolveUrl(loc.thumbnailUrl, serverUrl)}
                alt=""
                style={{ width: "48px", height: "36px", borderRadius: "3px", objectFit: "cover", flexShrink: 0 }}
              />
            ) : (
              <div style={{
                width: "48px",
                height: "36px",
                borderRadius: "3px",
                flexShrink: 0,
                background: "var(--border, #2e303a)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.65rem",
                color: "var(--text, #9ca3af)",
              }}>
                No img
              </div>
            )}
            <a
              href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${loc.lat},${loc.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flex: 1, fontSize: "0.9rem", color: "var(--accent2, #33DFFF)", textDecoration: "none" }}
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
            >
              {loc.address}
            </a>
            <span style={{ fontSize: "0.75rem", color: "var(--text, #9ca3af)", whiteSpace: "nowrap" }}>
              {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)} | H:{loc.heading ?? 0}° P:{loc.pitch ?? 0}°
            </span>
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
              <label className="admin-label">Address</label>
              <input className="admin-input" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="e.g. Eiffel Tower, Paris, France" />
            </div>
            <div className="fg-row" style={{ display: "flex", "--fg": "1rem" } as React.CSSProperties}>
              <div style={{ flex: 1 }}>
                <label className="admin-label">Latitude</label>
                <input className="admin-input" type="number" step="any" value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: Number(e.target.value) })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="admin-label">Longitude</label>
                <input className="admin-input" type="number" step="any" value={draft.lng} onChange={(e) => setDraft({ ...draft, lng: Number(e.target.value) })} />
              </div>
            </div>
            <div className="fg-row" style={{ display: "flex", "--fg": "1rem" } as React.CSSProperties}>
              <div style={{ flex: 1 }}>
                <label className="admin-label">Heading (0–360°)</label>
                <input className="admin-input" type="number" min={0} max={360} step="any" value={draft.heading ?? 0} onChange={(e) => setDraft({ ...draft, heading: Number(e.target.value) })} />
              </div>
              <div style={{ flex: 1 }}>
                <label className="admin-label">Pitch (-90–90°)</label>
                <input className="admin-input" type="number" min={-90} max={90} step="any" value={draft.pitch ?? 0} onChange={(e) => setDraft({ ...draft, pitch: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="admin-label">Thumbnail</label>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.4rem" }}>
                {draft.thumbnailUrl ? (
                  <img
                    src={resolveUrl(draft.thumbnailUrl, serverUrl)}
                    alt=""
                    style={{ width: "96px", height: "72px", borderRadius: "4px", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{
                    width: "96px",
                    height: "72px",
                    borderRadius: "4px",
                    background: "var(--border, #2e303a)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.75rem",
                    color: "var(--text, #9ca3af)",
                  }}>
                    No image
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  <label style={{ display: "inline-block", padding: "0.25rem 0.75rem", fontSize: "0.8rem", borderRadius: "6px", border: "1px solid #555", color: "var(--text)", background: "transparent", cursor: "pointer" }}>
                    Upload image
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadThumbnail(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {draft.thumbnailUrl && (
                    <button
                      onClick={() => setDraft({ ...draft, thumbnailUrl: undefined })}
                      style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem", borderRadius: "6px", border: "1px solid #555", color: "#f87171", background: "transparent", cursor: "pointer" }}
                    >
                      Remove custom thumbnail
                    </button>
                  )}
                </div>
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
          + Add Location
        </button>
      )}
    </div>
  );
}
