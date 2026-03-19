import React, { useState } from "react";

export interface CuratedRouteItem {
  fromLat: number;
  fromLng: number;
  fromAddress: string;
  toLat: number;
  toLng: number;
  toAddress: string;
  thumbnailUrl?: string;
}

interface Props {
  routes: CuratedRouteItem[];
  onChange: (routes: CuratedRouteItem[]) => void;
  serverUrl: string;
  authToken: string;
}

function resolveUrl(url: string, serverUrl: string): string {
  return url.startsWith("/") ? `${serverUrl}${url}` : url;
}

const emptyRoute: CuratedRouteItem = { fromLat: 0, fromLng: 0, fromAddress: "", toLat: 0, toLng: 0, toAddress: "" };

export function RouteEditor({ routes, onChange, serverUrl, authToken }: Props) {
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

  function renderEditForm() {
    return (
      <div className="admin-edit-panel">
        <div>
          <label className="admin-label">From Address</label>
          <input className="admin-input" value={draft.fromAddress} onChange={(e) => setDraft({ ...draft, fromAddress: e.target.value })} placeholder="e.g. Eiffel Tower, Paris" />
        </div>
        <div className="admin-form-grid">
          <div>
            <label className="admin-label">From Latitude</label>
            <input className="admin-input" type="number" step="any" value={draft.fromLat} onChange={(e) => setDraft({ ...draft, fromLat: Number(e.target.value) })} />
          </div>
          <div>
            <label className="admin-label">From Longitude</label>
            <input className="admin-input" type="number" step="any" value={draft.fromLng} onChange={(e) => setDraft({ ...draft, fromLng: Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <label className="admin-label">To Address</label>
          <input className="admin-input" value={draft.toAddress} onChange={(e) => setDraft({ ...draft, toAddress: e.target.value })} placeholder="e.g. Louvre Museum, Paris" />
        </div>
        <div className="admin-form-grid">
          <div>
            <label className="admin-label">To Latitude</label>
            <input className="admin-input" type="number" step="any" value={draft.toLat} onChange={(e) => setDraft({ ...draft, toLat: Number(e.target.value) })} />
          </div>
          <div>
            <label className="admin-label">To Longitude</label>
            <input className="admin-input" type="number" step="any" value={draft.toLng} onChange={(e) => setDraft({ ...draft, toLng: Number(e.target.value) })} />
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
        <h3 className="admin-card-title">Curated Routes</h3>
        {!isEditing && (
          <button onClick={startAdd} className="admin-btn-add">+ Add Route</button>
        )}
      </div>

      {routes.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 60 }}></th>
              <th>From</th>
              <th style={{ width: 30 }}></th>
              <th>To</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((route, i) => (
              <React.Fragment key={route.fromAddress + route.toAddress || i}>
                <tr className={editIdx === i ? "admin-table-row-active" : ""}>
                  <td>
                    {route.thumbnailUrl ? (
                      <img src={resolveUrl(route.thumbnailUrl, serverUrl)} alt="" className="admin-table-thumb" />
                    ) : (
                      <div className="admin-table-thumb-empty">No img</div>
                    )}
                  </td>
                  <td className="admin-table-link">{route.fromAddress}</td>
                  <td style={{ textAlign: "center", color: "var(--text, #9ca3af)" }}>&rarr;</td>
                  <td className="admin-table-link">{route.toAddress}</td>
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

      {routes.length === 0 && !isEditing && (
        <div className="admin-empty-state">No routes added yet</div>
      )}

      {adding && renderEditForm()}
    </div>
  );
}
