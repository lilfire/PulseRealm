import React, { useState } from "react";

export interface YouTubeVideoItem {
  videoId: string;
  url: string;
  title: string;
  baseSpeedKmh: number;
  thumbnailUrl?: string;
}

interface Props {
  videos: YouTubeVideoItem[];
  onChange: (videos: YouTubeVideoItem[]) => void;
  serverUrl: string;
  authToken: string;
}

function resolveUrl(url: string, serverUrl: string): string {
  return url.startsWith("/") ? `${serverUrl}${url}` : url;
}

function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "youtu.be") return parsed.pathname.slice(1) || null;
    if (["www.youtube.com", "youtube.com", "m.youtube.com"].includes(parsed.hostname)) {
      if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
      const embed = parsed.pathname.match(/^\/embed\/([^/]+)/);
      if (embed) return embed[1];
      const shorts = parsed.pathname.match(/^\/shorts\/([^/]+)/);
      if (shorts) return shorts[1];
    }
  } catch { /* not a valid URL */ }
  return null;
}

export function YouTubeEditor({ videos, onChange, serverUrl, authToken }: Props) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<YouTubeVideoItem>({ videoId: "", url: "", title: "", baseSpeedKmh: 5 });
  const [adding, setAdding] = useState(false);

  function startAdd() {
    setDraft({ videoId: "", url: "", title: "", baseSpeedKmh: 5 });
    setAdding(true);
    setEditIdx(null);
  }

  function startEdit(idx: number) {
    setDraft({ ...videos[idx] });
    setEditIdx(idx);
    setAdding(false);
  }

  function handleUrlChange(url: string) {
    const videoId = extractVideoId(url);
    setDraft({ ...draft, url, videoId: videoId ?? draft.videoId });
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
    if (!draft.title.trim() || !draft.videoId) return;
    const item = { ...draft, url: draft.url || `https://www.youtube.com/watch?v=${draft.videoId}` };
    if (adding) {
      onChange([...videos, item]);
    } else if (editIdx !== null) {
      onChange(videos.map((v, i) => (i === editIdx ? item : v)));
    }
    setAdding(false);
    setEditIdx(null);
  }

  function cancel() {
    setAdding(false);
    setEditIdx(null);
  }

  function remove(idx: number) {
    onChange(videos.filter((_, i) => i !== idx));
    if (editIdx === idx) setEditIdx(null);
  }

  const isEditing = adding || editIdx !== null;

  function renderEditForm() {
    return (
      <div className="admin-edit-panel">
        <div>
          <label className="admin-label">Title</label>
          <input className="admin-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Walking Tour - Tokyo, Japan" />
        </div>
        <div>
          <label className="admin-label">YouTube URL</label>
          <input className="admin-input" value={draft.url} onChange={(e) => handleUrlChange(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
        </div>
        <div>
          <label className="admin-label">Base Speed (km/h = 1&times; playback)</label>
          <input className="admin-input" type="number" min="1" max="20" step="0.5" value={draft.baseSpeedKmh} onChange={(e) => setDraft({ ...draft, baseSpeedKmh: parseFloat(e.target.value) || 5 })} />
        </div>
        {draft.videoId && (
          <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text)" }}>
            Video ID: <span style={{ color: "var(--accent2, #33DFFF)" }}>{draft.videoId}</span>
          </p>
        )}
        <div>
          <label className="admin-label">Thumbnail</label>
          <div className="admin-thumb-section">
            <img
              src={draft.thumbnailUrl ? resolveUrl(draft.thumbnailUrl, serverUrl) : (draft.videoId ? `https://img.youtube.com/vi/${draft.videoId}/default.jpg` : "")}
              alt=""
              className="admin-thumb-preview"
              style={{
                background: "var(--border, #2e303a)",
                display: draft.thumbnailUrl || draft.videoId ? "block" : "none",
              }}
            />
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
        <h3 className="admin-card-title">YouTube Videos</h3>
        {!isEditing && (
          <button onClick={startAdd} className="admin-btn-add">+ Add Video</button>
        )}
      </div>

      {videos.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: 60 }}></th>
              <th>Title</th>
              <th>Base Speed</th>
              <th>Video ID</th>
              <th style={{ width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {videos.map((v, i) => (
              <React.Fragment key={v.videoId || i}>
                <tr className={editIdx === i ? "admin-table-row-active" : ""}>
                  <td>
                    <img
                      src={v.thumbnailUrl ? resolveUrl(v.thumbnailUrl, serverUrl) : `https://img.youtube.com/vi/${v.videoId}/default.jpg`}
                      alt=""
                      className="admin-table-thumb"
                    />
                  </td>
                  <td>
                    <a
                      href={v.url || `https://www.youtube.com/watch?v=${v.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="admin-table-link"
                    >
                      {v.title}
                    </a>
                  </td>
                  <td className="admin-table-mono">{v.baseSpeedKmh} km/h</td>
                  <td className="admin-table-mono">{v.videoId}</td>
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

      {videos.length === 0 && !isEditing && (
        <div className="admin-empty-state">No videos added yet</div>
      )}

      {adding && renderEditForm()}
    </div>
  );
}
