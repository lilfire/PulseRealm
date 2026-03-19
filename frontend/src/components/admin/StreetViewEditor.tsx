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

  function renderEditForm() {
    return (
      <div className="admin-edit-panel">
        <div>
          <label className="admin-label">Address</label>
          <input className="admin-input" value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} placeholder="e.g. Eiffel Tower, Paris, France" />
        </div>
        <div className="admin-form-grid">
          <div>
            <label className="admin-label">Latitude</label>
            <input className="admin-input" type="number" step="any" value={draft.lat} onChange={(e) => setDraft({ ...draft, lat: Number(e.target.value) })} />
          </div>
          <div>
            <label className="admin-label">Longitude</label>
            <input className="admin-input" type="number" step="any" value={draft.lng} onChange={(e) => setDraft({ ...draft, lng: Number(e.target.value) })} />
          </div>
        </div>
        <div className="admin-form-grid">
          <div>
            <label className="admin-label">Heading (0&ndash;360&deg;)</label>
            <input className="admin-input" type="number" min={0} max={360} step="any" value={draft.heading ?? 0} onChange={(e) => setDraft({ ...draft, heading: Number(e.target.value) })} />
          </div>
          <div>
            <label className="admin-label">Pitch (-90&ndash;90&deg;)</label>
            <input className="admin-input" type="number" min={-90} max={90} step="any" value={draft.pitch ?? 0} onChange={(e) => setDraft({ ...draft, pitch: Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <label className="admin-label">Thumbnail</label>
          <div className="admin-thumb-section">
            {draft.thumbnailUrl ? (
              <img src={resolveUrl(draft.thumbnailUrl, serverUrl)} alt="" className="admin-thumb-preview" />
            ) : (
              <div className="admin-thumb-empty">No image</div>
            )}
            <div className="admin-thumb-controls">
              <label className="admin-upload-label">
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
                <button onClick={() => setDraft({ ...draft, thumbnailUrl: undefined })} className="admin-remove-thumb">
                  Remove custom thumbnail
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="admin-edit-panel-actions">
          <button onClick={save} className="admin-btn-primary" style={{ flex: 1 }}>
            {adding ? "Add" : "Update"}
          </button>
          <button onClick={cancel} className="admin-btn-secondary" style={{ flex: 1 }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-card">
      <div className="admin-card-header">
        <h3 className="admin-card-title">Street View Locations</h3>
        {!isEditing && (
          <button onClick={startAdd} className="admin-btn-add">+ Add Place</button>
        )}
      </div>

      {locations.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 60 }}></th>
              <th>Address</th>
              <th>Coordinates</th>
              <th>Heading / Pitch</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc, i) => (
              <React.Fragment key={loc.address || i}>
                <tr className={editIdx === i ? "admin-table-row-active" : ""}>
                  <td>
                    {loc.thumbnailUrl ? (
                      <img src={resolveUrl(loc.thumbnailUrl, serverUrl)} alt="" className="admin-table-thumb" />
                    ) : (
                      <div className="admin-table-thumb-empty">No img</div>
                    )}
                  </td>
                  <td>
                    <a
                      href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${loc.lat},${loc.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="admin-table-link"
                    >
                      {loc.address}
                    </a>
                  </td>
                  <td className="admin-table-mono">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</td>
                  <td className="admin-table-mono">H:{loc.heading ?? 0}&deg; P:{loc.pitch ?? 0}&deg;</td>
                  <td>
                    <div className="admin-table-actions">
                      <button onClick={() => startEdit(i)} className="admin-btn-action">Edit</button>
                      <button onClick={() => remove(i)} className="admin-btn-action-danger">Delete</button>
                    </div>
                  </td>
                </tr>
                {editIdx === i && (
                  <tr><td colSpan={5} style={{ padding: 0, border: "none" }}>{renderEditForm()}</td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}

      {locations.length === 0 && !isEditing && (
        <div className="admin-empty-state">No locations added yet</div>
      )}

      {adding && renderEditForm()}
    </div>
  );
}
