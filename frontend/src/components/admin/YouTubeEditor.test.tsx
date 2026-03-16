import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { YouTubeEditor, type YouTubeVideoItem } from "./YouTubeEditor";

const sampleVideos: YouTubeVideoItem[] = [
  { videoId: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Never Gonna Give You Up" },
  { videoId: "L_jWHffIx5E", url: "https://www.youtube.com/watch?v=L_jWHffIx5E", title: "Smells Like Teen Spirit" },
];

function setup(videos: YouTubeVideoItem[] = [], onChangeMock?: ReturnType<typeof vi.fn>) {
  const onChange = onChangeMock ?? vi.fn();
  const user = userEvent.setup();
  render(<YouTubeEditor videos={videos} onChange={onChange} />);
  return { onChange, user };
}

describe("YouTubeEditor", () => {
  it("renders list of videos with titles", () => {
    setup(sampleVideos);
    expect(screen.getByText("Never Gonna Give You Up")).toBeInTheDocument();
    expect(screen.getByText("Smells Like Teen Spirit")).toBeInTheDocument();
  });

  it("renders thumbnails for each video", () => {
    setup(sampleVideos);
    // Images use alt="" so their ARIA role is "presentation"; query by tag instead
    const thumbnails = document.querySelectorAll("img");
    expect(thumbnails).toHaveLength(2);
    expect(thumbnails[0]).toHaveAttribute(
      "src",
      "https://img.youtube.com/vi/dQw4w9WgXcQ/default.jpg"
    );
    expect(thumbnails[1]).toHaveAttribute(
      "src",
      "https://img.youtube.com/vi/L_jWHffIx5E/default.jpg"
    );
  });

  it("renders videoId for each video", () => {
    setup(sampleVideos);
    expect(screen.getByText("dQw4w9WgXcQ")).toBeInTheDocument();
    expect(screen.getByText("L_jWHffIx5E")).toBeInTheDocument();
  });

  it("shows '+ Add Video' button when not editing", () => {
    setup();
    expect(screen.getByRole("button", { name: /\+ add video/i })).toBeInTheDocument();
  });

  it("clicking '+ Add Video' shows the form", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /\+ add video/i }));
    expect(screen.getByPlaceholderText(/walking tour/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/youtube\.com/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^add$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("hides '+ Add Video' button when form is open", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /\+ add video/i }));
    expect(screen.queryByRole("button", { name: /\+ add video/i })).not.toBeInTheDocument();
  });

  it("can add a new video with a YouTube watch URL", async () => {
    const onChange = vi.fn();
    const { user } = setup([], onChange);

    await user.click(screen.getByRole("button", { name: /\+ add video/i }));

    await user.type(screen.getByPlaceholderText(/walking tour/i), "Tokyo Walk");
    await user.type(
      screen.getByPlaceholderText(/youtube\.com/i),
      "https://www.youtube.com/watch?v=abc123xyz"
    );

    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ title: "Tokyo Walk", videoId: "abc123xyz" }),
      ]);
    });
  });

  it("does not call onChange when title is empty on save", async () => {
    const onChange = vi.fn();
    const { user } = setup([], onChange);

    await user.click(screen.getByRole("button", { name: /\+ add video/i }));
    await user.type(
      screen.getByPlaceholderText(/youtube\.com/i),
      "https://www.youtube.com/watch?v=abc123"
    );
    // Do not fill in title
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^add$/i })).toBeInTheDocument();
  });

  it("does not call onChange when videoId is empty on save", async () => {
    const onChange = vi.fn();
    const { user } = setup([], onChange);

    await user.click(screen.getByRole("button", { name: /\+ add video/i }));
    await user.type(screen.getByPlaceholderText(/walking tour/i), "Some Title");
    // Leave URL blank (no videoId extracted)
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("extracts videoId from standard YouTube watch URL", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /\+ add video/i }));
    await user.type(
      screen.getByPlaceholderText(/youtube\.com/i),
      "https://www.youtube.com/watch?v=testId123"
    );
    expect(await screen.findByText(/video id:/i)).toBeInTheDocument();
    expect(screen.getByText("testId123")).toBeInTheDocument();
  });

  it("extracts videoId from youtu.be short URL", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /\+ add video/i }));
    await user.type(
      screen.getByPlaceholderText(/youtube\.com/i),
      "https://youtu.be/shortId456"
    );
    expect(await screen.findByText("shortId456")).toBeInTheDocument();
  });

  it("extracts videoId from YouTube embed URL", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /\+ add video/i }));
    await user.type(
      screen.getByPlaceholderText(/youtube\.com/i),
      "https://www.youtube.com/embed/embedId789"
    );
    expect(await screen.findByText("embedId789")).toBeInTheDocument();
  });

  it("extracts videoId from YouTube Shorts URL", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /\+ add video/i }));
    await user.type(
      screen.getByPlaceholderText(/youtube\.com/i),
      "https://www.youtube.com/shorts/shortsIdABC"
    );
    expect(await screen.findByText("shortsIdABC")).toBeInTheDocument();
  });

  it("extracts videoId from mobile YouTube URL (m.youtube.com)", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /\+ add video/i }));
    await user.type(
      screen.getByPlaceholderText(/youtube\.com/i),
      "https://m.youtube.com/watch?v=mobileId321"
    );
    expect(await screen.findByText("mobileId321")).toBeInTheDocument();
  });

  it("does not show Video ID preview when URL is invalid", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /\+ add video/i }));
    await user.type(screen.getByPlaceholderText(/youtube\.com/i), "not-a-valid-url");
    expect(screen.queryByText(/video id:/i)).not.toBeInTheDocument();
  });

  it("clicking 'Edit' shows form populated with video data", async () => {
    const { user } = setup(sampleVideos);

    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    await user.click(editButtons[0]);

    expect(screen.getByDisplayValue("Never Gonna Give You Up")).toBeInTheDocument();
    expect(screen.getByDisplayValue("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update/i })).toBeInTheDocument();
  });

  it("can edit an existing video", async () => {
    const onChange = vi.fn();
    const { user } = setup(sampleVideos, onChange);

    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    await user.click(editButtons[0]);

    const titleInput = screen.getByDisplayValue("Never Gonna Give You Up");
    await user.clear(titleInput);
    await user.type(titleInput, "Updated Title");

    await user.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ title: "Updated Title", videoId: "dQw4w9WgXcQ" }),
        sampleVideos[1],
      ]);
    });
  });

  it("can delete a video", async () => {
    const onChange = vi.fn();
    const { user } = setup(sampleVideos, onChange);

    const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
    await user.click(deleteButtons[0]);

    expect(onChange).toHaveBeenCalledWith([sampleVideos[1]]);
  });

  it("cancel hides the form when adding", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /\+ add video/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ add video/i })).toBeInTheDocument();
  });

  it("cancel hides the form when editing", async () => {
    const { user } = setup(sampleVideos);

    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    await user.click(editButtons[0]);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ add video/i })).toBeInTheDocument();
  });

  it("auto-populates URL with watch URL when only videoId is present after save", async () => {
    // This tests the save logic: if draft.url is empty but videoId is set,
    // the saved item gets url = https://www.youtube.com/watch?v={videoId}
    const onChange = vi.fn();
    const { user } = setup([], onChange);

    await user.click(screen.getByRole("button", { name: /\+ add video/i }));
    await user.type(screen.getByPlaceholderText(/walking tour/i), "Test Video");
    // Type a watch URL to populate videoId, then clear the URL field to simulate no URL
    await user.type(
      screen.getByPlaceholderText(/youtube\.com/i),
      "https://www.youtube.com/watch?v=autoId99"
    );

    // Clear the URL field so draft.url is empty but videoId was already extracted
    const urlInput = screen.getByPlaceholderText(/youtube\.com/i);
    await user.clear(urlInput);

    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({
          title: "Test Video",
          videoId: "autoId99",
          url: "https://www.youtube.com/watch?v=autoId99",
        }),
      ]);
    });
  });

  it("deleting a video that is being edited clears edit state", async () => {
    const onChange = vi.fn();
    const { user } = setup(sampleVideos, onChange);

    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    await user.click(editButtons[0]);
    expect(screen.getByRole("button", { name: /update/i })).toBeInTheDocument();

    const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
    await user.click(deleteButtons[0]);

    expect(onChange).toHaveBeenCalledWith([sampleVideos[1]]);
  });

  it("renders Edit and Delete buttons for each video", () => {
    setup(sampleVideos);
    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
    expect(editButtons).toHaveLength(2);
    expect(deleteButtons).toHaveLength(2);
  });

  it("renders empty state with only Add button when no videos", () => {
    setup([]);
    expect(screen.getByRole("button", { name: /\+ add video/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });
});
