import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { YouTubeTrailLobby } from "./YouTubeTrailLobby";
import type { ClientProfile } from "../../types/session";
import type { YouTubeVideo } from "./YouTubeTrailLobby";

const baseProps = {
  joinCode: "777888",
  clients: ["c1"] as string[],
  clientProfiles: {
    c1: { clientId: "c1", name: "Alice", heightCm: 170, weightKg: 60 },
  } as Record<string, ClientProfile>,
  connected: true,
  onStart: vi.fn(),
  onLeave: vi.fn(),
};

// Five fixed curated videos used in tests to avoid randomness
const fixedVideos: YouTubeVideo[] = [
  { videoId: "vid1", url: "https://www.youtube.com/watch?v=vid1", title: "Video One" },
  { videoId: "vid2", url: "https://www.youtube.com/watch?v=vid2", title: "Video Two" },
  { videoId: "vid3", url: "https://www.youtube.com/watch?v=vid3", title: "Video Three" },
  { videoId: "vid4", url: "https://www.youtube.com/watch?v=vid4", title: "Video Four" },
  { videoId: "vid5", url: "https://www.youtube.com/watch?v=vid5", title: "Video Five" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("YouTubeTrailLobby", () => {
  describe("rendering", () => {
    it("renders the video URL input", () => {
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      expect(screen.getByPlaceholderText("Paste a YouTube link...")).toBeInTheDocument();
    });

    it("renders the YouTube Video heading", () => {
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      expect(screen.getByText("YouTube Video")).toBeInTheDocument();
    });

    it("renders curated video suggestions", () => {
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      expect(screen.getByText("Video One")).toBeInTheDocument();
      expect(screen.getByText("Video Two")).toBeInTheDocument();
    });

    it("shows 5 curated video suggestions when more than 5 are provided via custom curated videos", () => {
      const manyVideos: YouTubeVideo[] = Array.from({ length: 10 }, (_, i) => ({
        videoId: `v${i}`,
        url: `https://www.youtube.com/watch?v=v${i}`,
        title: `Video ${i}`,
      }));
      render(<YouTubeTrailLobby {...baseProps} clients={[]} clientProfiles={{}} curatedVideos={manyVideos} />);
      // With no players, only the video suggestion list items are rendered
      const items = screen.getAllByRole("option");
      // randomVideos picks 5
      expect(items.length).toBe(5);
    });

    it("uses custom curated videos when provided", () => {
      const custom: YouTubeVideo[] = [
        { videoId: "customA", url: "https://www.youtube.com/watch?v=customA", title: "Custom Video A" },
        { videoId: "customB", url: "https://www.youtube.com/watch?v=customB", title: "Custom Video B" },
        { videoId: "customC", url: "https://www.youtube.com/watch?v=customC", title: "Custom Video C" },
        { videoId: "customD", url: "https://www.youtube.com/watch?v=customD", title: "Custom Video D" },
        { videoId: "customE", url: "https://www.youtube.com/watch?v=customE", title: "Custom Video E" },
      ];
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={custom} />);
      // At least one of the custom titles should appear
      const customTitles = custom.map((v) => v.title);
      const found = customTitles.some((t) => {
        try { screen.getByText(t); return true; } catch { return false; }
      });
      expect(found).toBe(true);
    });
  });

  describe("URL parsing - valid URLs", () => {
    it("parses a standard youtube.com/watch?v= URL", async () => {
      const user = userEvent.setup();
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      const input = screen.getByPlaceholderText("Paste a YouTube link...");
      await user.clear(input);
      await user.type(input, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(screen.queryByText("Not a valid YouTube link")).not.toBeInTheDocument();
      // Thumbnail image should now appear
      expect(screen.getByAltText("Video thumbnail")).toBeInTheDocument();
    });

    it("parses a youtu.be shortlink URL", async () => {
      const user = userEvent.setup();
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      const input = screen.getByPlaceholderText("Paste a YouTube link...");
      await user.clear(input);
      await user.type(input, "https://youtu.be/dQw4w9WgXcQ");
      expect(screen.queryByText("Not a valid YouTube link")).not.toBeInTheDocument();
      expect(screen.getByAltText("Video thumbnail")).toBeInTheDocument();
    });

    it("parses an embed URL", async () => {
      const user = userEvent.setup();
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      const input = screen.getByPlaceholderText("Paste a YouTube link...");
      await user.clear(input);
      await user.type(input, "https://www.youtube.com/embed/dQw4w9WgXcQ");
      expect(screen.queryByText("Not a valid YouTube link")).not.toBeInTheDocument();
      expect(screen.getByAltText("Video thumbnail")).toBeInTheDocument();
    });

    it("parses a YouTube Shorts URL", async () => {
      const user = userEvent.setup();
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      const input = screen.getByPlaceholderText("Paste a YouTube link...");
      await user.clear(input);
      await user.type(input, "https://www.youtube.com/shorts/dQw4w9WgXcQ");
      expect(screen.queryByText("Not a valid YouTube link")).not.toBeInTheDocument();
      expect(screen.getByAltText("Video thumbnail")).toBeInTheDocument();
    });

    it("parses an m.youtube.com URL", async () => {
      const user = userEvent.setup();
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      const input = screen.getByPlaceholderText("Paste a YouTube link...");
      await user.clear(input);
      await user.type(input, "https://m.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(screen.queryByText("Not a valid YouTube link")).not.toBeInTheDocument();
      expect(screen.getByAltText("Video thumbnail")).toBeInTheDocument();
    });

    it("parses a youtube.com (without www) URL", async () => {
      const user = userEvent.setup();
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      const input = screen.getByPlaceholderText("Paste a YouTube link...");
      await user.clear(input);
      await user.type(input, "https://youtube.com/watch?v=dQw4w9WgXcQ");
      expect(screen.queryByText("Not a valid YouTube link")).not.toBeInTheDocument();
      expect(screen.getByAltText("Video thumbnail")).toBeInTheDocument();
    });
  });

  describe("URL parsing - invalid URLs", () => {
    it("shows error for clearly invalid URL (long enough to trigger)", async () => {
      const user = userEvent.setup();
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      const input = screen.getByPlaceholderText("Paste a YouTube link...");
      await user.clear(input);
      await user.type(input, "https://example.com/not-a-youtube-link");
      expect(screen.getByText("Not a valid YouTube link")).toBeInTheDocument();
    });

    it("does not show error for very short input (under 6 chars)", async () => {
      const user = userEvent.setup();
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      const input = screen.getByPlaceholderText("Paste a YouTube link...");
      await user.clear(input);
      await user.type(input, "http");
      expect(screen.queryByText("Not a valid YouTube link")).not.toBeInTheDocument();
    });

    it("clears error when input is cleared", async () => {
      const user = userEvent.setup();
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      const input = screen.getByPlaceholderText("Paste a YouTube link...");
      await user.type(input, "https://example.com/not-a-youtube-link");
      expect(screen.getByText("Not a valid YouTube link")).toBeInTheDocument();
      await user.clear(input);
      expect(screen.queryByText("Not a valid YouTube link")).not.toBeInTheDocument();
    });
  });

  describe("selecting a curated video", () => {
    it("can select a curated video", () => {
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      fireEvent.click(screen.getByText("Video One"));
      // Thumbnail should appear
      expect(screen.getByAltText("Video thumbnail")).toBeInTheDocument();
    });

    it("populates the URL input when a curated video is selected", () => {
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      fireEvent.click(screen.getByText("Video One"));
      const input = screen.getByPlaceholderText("Paste a YouTube link...") as HTMLInputElement;
      expect(input.value).toBe("https://www.youtube.com/watch?v=vid1");
    });
  });

  describe("thumbnail display", () => {
    it("shows thumbnail when a curated video is selected", () => {
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      fireEvent.click(screen.getByText("Video One"));
      const thumbnail = screen.getByAltText("Video thumbnail");
      expect(thumbnail).toBeInTheDocument();
      expect(thumbnail).toHaveAttribute("src", "https://img.youtube.com/vi/vid1/hqdefault.jpg");
    });

    it("does not show thumbnail before a video is selected", () => {
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      expect(screen.queryByAltText("Video thumbnail")).not.toBeInTheDocument();
    });
  });

  describe("onStart callback", () => {
    it("calls onStart with the selected curated video", () => {
      const onStart = vi.fn();
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} onStart={onStart} />);
      fireEvent.click(screen.getByText("Video One"));
      fireEvent.click(screen.getByRole("button", { name: "Start Realm" }));
      expect(onStart).toHaveBeenCalledTimes(1);
      const video: YouTubeVideo = onStart.mock.calls[0][0];
      expect(video.videoId).toBe("vid1");
      expect(video.title).toBe("Video One");
    });

    it("calls onStart with custom URL video", async () => {
      const user = userEvent.setup();
      const onStart = vi.fn();
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} onStart={onStart} />);
      const input = screen.getByPlaceholderText("Paste a YouTube link...");
      await user.type(input, "https://www.youtube.com/watch?v=abc123XYZ");
      fireEvent.click(screen.getByRole("button", { name: "Start Realm" }));
      expect(onStart).toHaveBeenCalledTimes(1);
      const video: YouTubeVideo = onStart.mock.calls[0][0];
      expect(video.videoId).toBe("abc123XYZ");
    });

    it("start button is disabled before selecting a video", () => {
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });

    it("start button is enabled after selecting a curated video", () => {
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      fireEvent.click(screen.getByText("Video One"));
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeEnabled();
    });

    it("start button becomes disabled again when URL is cleared after selection", async () => {
      const user = userEvent.setup();
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} />);
      fireEvent.click(screen.getByText("Video One"));
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeEnabled();
      const input = screen.getByPlaceholderText("Paste a YouTube link...");
      await user.clear(input);
      expect(screen.getByRole("button", { name: "Start Realm" })).toBeDisabled();
    });
  });

  describe("leave button", () => {
    it("calls onLeave when leave button is clicked", () => {
      const onLeave = vi.fn();
      render(<YouTubeTrailLobby {...baseProps} curatedVideos={fixedVideos} onLeave={onLeave} />);
      fireEvent.click(screen.getByRole("button", { name: "Leave Realm" }));
      expect(onLeave).toHaveBeenCalledTimes(1);
    });
  });
});
