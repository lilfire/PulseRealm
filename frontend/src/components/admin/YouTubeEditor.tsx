import { useState } from "react";

export interface YouTubeVideoItem {
  videoId: string;
  url: string;
  title: string;
}

interface Props {
  videos: YouTubeVideoItem[];
  onChange: (videos: YouTubeVideoItem[]) => void;
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

export function YouTubeEditor({ videos, onChange }: Props) {
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<YouTubeVideoItem>({ videoId: "", url: "", title: "" });
  const [adding, setAdding] = useState(false);

  function startAdd() {
    setDraft({ videoId: "", url: "", title: "" });
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

  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {videos.map((v, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.5rem 0.75rem",
              background: editIdx === i ? "rgba(51, 223, 255, 0.08)" : "var(--code-bg, #1f2028)",
              borderRadius: "6px",
              border: editIdx === i ? "1px solid var(--accent2, #33DFFF)" : "1px solid var(--border, #2e303a)",
            }}
          >
            <img
              src={`https://img.youtube.com/vi/${v.videoId}/default.jpg`}
              alt=""
              style={{ width: "48px", height: "36px", borderRadius: "3px", objectFit: "cover", flexShrink: 0 }}
            />
            <span style={{ flex: 1, fontSize: "0.9rem", color: "var(--text-h, #f3f4f6)" }}>{v.title}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text, #9ca3af)", whiteSpace: "nowrap" }}>{v.videoId}</span>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div>
              <label className="admin-label">Title</label>
              <input className="admin-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. Walking Tour - Tokyo, Japan" />
            </div>
            <div>
              <label className="admin-label">YouTube URL</label>
              <input className="admin-input" value={draft.url} onChange={(e) => handleUrlChange(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
            </div>
            {draft.videoId && (
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text)" }}>
                Video ID: <span style={{ color: "var(--accent2, #33DFFF)" }}>{draft.videoId}</span>
              </p>
            )}
            <div style={{ display: "flex", gap: "0.5rem" }}>
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
          + Add Video
        </button>
      )}
    </div>
  );
}
