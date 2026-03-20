import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import { RouteEditor, type CuratedRouteItem } from "./RouteEditor";

const makeRoute = (from = "Paris", to = "Lyon"): CuratedRouteItem => ({
  fromLat: 48.85,
  fromLng: 2.35,
  fromAddress: from,
  toLat: 45.76,
  toLng: 4.83,
  toAddress: to,
});

describe("RouteEditor", () => {
  function setup(routes: CuratedRouteItem[] = []) {
    const onChange = vi.fn();
    const result = render(
      <RouteEditor
        routes={routes}
        onChange={onChange}
        serverUrl="http://localhost:5062"
        authToken="test-token"
      />,
    );
    return { onChange, ...result };
  }

  it("shows empty state when no routes", () => {
    setup();
    expect(screen.getByText("No routes added yet")).toBeInTheDocument();
  });

  it("renders route table when routes exist", () => {
    setup([makeRoute()]);
    expect(screen.getByText("Paris")).toBeInTheDocument();
    expect(screen.getByText("Lyon")).toBeInTheDocument();
  });

  it("shows Add Route button", () => {
    setup();
    expect(screen.getByText("+ Add Route")).toBeInTheDocument();
  });

  it("shows add form when Add Route clicked", () => {
    setup();
    fireEvent.click(screen.getByText("+ Add Route"));
    expect(screen.getByPlaceholderText("e.g. Eiffel Tower, Paris")).toBeInTheDocument();
    expect(screen.getByText("Add")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("hides Add Route button while editing", () => {
    setup();
    fireEvent.click(screen.getByText("+ Add Route"));
    expect(screen.queryByText("+ Add Route")).not.toBeInTheDocument();
  });

  it("cancels adding and shows empty state again", () => {
    setup();
    fireEvent.click(screen.getByText("+ Add Route"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.getByText("No routes added yet")).toBeInTheDocument();
  });

  it("does not save when addresses are empty", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByText("+ Add Route"));
    fireEvent.click(screen.getByText("Add"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("saves a new route with filled addresses", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByText("+ Add Route"));

    const fromInput = screen.getByPlaceholderText("e.g. Eiffel Tower, Paris");
    const toInput = screen.getByPlaceholderText("e.g. Louvre Museum, Paris");

    fireEvent.change(fromInput, { target: { value: "Start" } });
    fireEvent.change(toInput, { target: { value: "End" } });
    fireEvent.click(screen.getByText("Add"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const newRoutes = onChange.mock.calls[0][0];
    expect(newRoutes).toHaveLength(1);
    expect(newRoutes[0].fromAddress).toBe("Start");
    expect(newRoutes[0].toAddress).toBe("End");
  });

  it("opens edit form when Edit button clicked", () => {
    setup([makeRoute()]);
    fireEvent.click(screen.getByText("Edit"));
    expect(screen.getByText("Update")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Paris")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Lyon")).toBeInTheDocument();
  });

  it("updates route on save during edit", () => {
    const { onChange } = setup([makeRoute()]);
    fireEvent.click(screen.getByText("Edit"));

    const fromInput = screen.getByDisplayValue("Paris");
    fireEvent.change(fromInput, { target: { value: "Marseille" } });
    fireEvent.click(screen.getByText("Update"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0].fromAddress).toBe("Marseille");
  });

  it("deletes a route", () => {
    const { onChange } = setup([makeRoute("A", "B"), makeRoute("C", "D")]);
    const deleteBtns = screen.getAllByText("Delete");
    fireEvent.click(deleteBtns[0]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
    expect(onChange.mock.calls[0][0][0].fromAddress).toBe("C");
  });

  it("shows 'No img' when route has no thumbnail", () => {
    setup([makeRoute()]);
    expect(screen.getByText("No img")).toBeInTheDocument();
  });

  it("shows thumbnail when route has thumbnailUrl", () => {
    const route = { ...makeRoute(), thumbnailUrl: "/img/thumb.jpg" };
    setup([route]);
    const img = screen.getByAltText("");
    expect((img as HTMLImageElement).src).toContain("http://localhost:5062/img/thumb.jpg");
  });

  it("shows 'No image' placeholder in edit form without thumbnail", () => {
    setup();
    fireEvent.click(screen.getByText("+ Add Route"));
    expect(screen.getByText("No image")).toBeInTheDocument();
  });

  it("updates coordinate inputs", () => {
    setup();
    fireEvent.click(screen.getByText("+ Add Route"));

    const latInputs = screen.getAllByDisplayValue("0");
    fireEvent.change(latInputs[0], { target: { value: "48.85" } });

    expect(screen.getByDisplayValue("48.85")).toBeInTheDocument();
  });

  it("handles thumbnail upload", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ url: "/uploads/thumb.jpg" }),
    });

    setup();
    fireEvent.click(screen.getByText("+ Add Route"));

    const fileInput = screen.getByText("Upload image").querySelector("input[type='file']")!;
    const file = new File(["img"], "thumb.jpg", { type: "image/jpeg" });

    await fireEvent.change(fileInput, { target: { files: [file] } });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:5062/api/admin/thumbnails",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });

  it("shows remove thumbnail button when thumbnail exists in edit form", () => {
    const route = { ...makeRoute(), thumbnailUrl: "/img/thumb.jpg" };
    setup([route]);
    fireEvent.click(screen.getByText("Edit"));
    expect(screen.getByText("Remove custom thumbnail")).toBeInTheDocument();
  });

  it("highlights active edit row", () => {
    setup([makeRoute()]);
    fireEvent.click(screen.getByText("Edit"));

    const rows = document.querySelectorAll("tr.admin-table-row-active");
    expect(rows.length).toBe(1);
  });
});
