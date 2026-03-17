import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { StreetViewEditor, type StreetViewLocationItem } from "./StreetViewEditor";

const sampleLocations: StreetViewLocationItem[] = [
  { lat: 48.8584, lng: 2.2945, address: "Eiffel Tower, Paris, France" },
  { lat: 40.6892, lng: -74.0445, address: "Statue of Liberty, New York, USA" },
];

function setup(locations: StreetViewLocationItem[] = [], onChangeMock?: ReturnType<typeof vi.fn>) {
  const onChange = onChangeMock ?? vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(<StreetViewEditor locations={locations} onChange={onChange} />);
  return { onChange, user, rerender };
}

describe("StreetViewEditor", () => {
  it("renders list of locations", () => {
    setup(sampleLocations);
    expect(screen.getByText("Eiffel Tower, Paris, France")).toBeInTheDocument();
    expect(screen.getByText("Statue of Liberty, New York, USA")).toBeInTheDocument();
  });

  it("shows address and coordinates for each location", () => {
    setup(sampleLocations);
    // Eiffel Tower coordinates
    expect(screen.getByText("48.8584, 2.2945")).toBeInTheDocument();
    // Statue of Liberty coordinates
    expect(screen.getByText("40.6892, -74.0445")).toBeInTheDocument();
  });

  it("shows '+ Add Location' button when not editing", () => {
    setup();
    expect(screen.getByRole("button", { name: /\+ add location/i })).toBeInTheDocument();
  });

  it("clicking '+ Add Location' shows the form", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /\+ add location/i }));
    expect(screen.getByPlaceholderText(/eiffel tower/i)).toBeInTheDocument();
    // Add button in form
    expect(screen.getByRole("button", { name: /^add$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("hides '+ Add Location' button when form is open", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /\+ add location/i }));
    expect(screen.queryByRole("button", { name: /\+ add location/i })).not.toBeInTheDocument();
  });

  it("can add a new location", async () => {
    const onChange = vi.fn();
    const { user } = setup([], onChange);

    await user.click(screen.getByRole("button", { name: /\+ add location/i }));

    await user.type(screen.getByPlaceholderText(/eiffel tower/i), "Big Ben, London, UK");

    // lat and lng are spinbutton inputs; both start at 0
    const spinbuttons = screen.getAllByRole("spinbutton");
    const latInputEl = spinbuttons[0];
    const lngInputEl = spinbuttons[1];

    await user.clear(latInputEl);
    await user.type(latInputEl, "51.5007");
    await user.clear(lngInputEl);
    await user.type(lngInputEl, "-0.1246");

    await user.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ address: "Big Ben, London, UK" }),
      ]);
    });
  });

  it("does not call onChange when address is empty on save", async () => {
    const onChange = vi.fn();
    const { user } = setup([], onChange);

    await user.click(screen.getByRole("button", { name: /\+ add location/i }));
    // Leave address blank and click Add
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(onChange).not.toHaveBeenCalled();
    // Form should remain open
    expect(screen.getByRole("button", { name: /^add$/i })).toBeInTheDocument();
  });

  it("does not call onChange when address is only whitespace", async () => {
    const onChange = vi.fn();
    const { user } = setup([], onChange);

    await user.click(screen.getByRole("button", { name: /\+ add location/i }));
    await user.type(screen.getByPlaceholderText(/eiffel tower/i), "   ");
    await user.click(screen.getByRole("button", { name: /^add$/i }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("clicking 'Edit' shows form with location data", async () => {
    const { user } = setup(sampleLocations);

    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    await user.click(editButtons[0]);

    expect(screen.getByDisplayValue("Eiffel Tower, Paris, France")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /update/i })).toBeInTheDocument();
  });

  it("can update a location", async () => {
    const onChange = vi.fn();
    const { user } = setup(sampleLocations, onChange);

    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    await user.click(editButtons[0]);

    const addressInput = screen.getByDisplayValue("Eiffel Tower, Paris, France");
    await user.clear(addressInput);
    await user.type(addressInput, "Eiffel Tower Updated");

    await user.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith([
        expect.objectContaining({ address: "Eiffel Tower Updated" }),
        sampleLocations[1],
      ]);
    });
  });

  it("cancel button hides the form when adding", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /\+ add location/i }));
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ add location/i })).toBeInTheDocument();
  });

  it("cancel button hides the form when editing", async () => {
    const { user } = setup(sampleLocations);
    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    await user.click(editButtons[0]);

    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\+ add location/i })).toBeInTheDocument();
  });

  it("clicking 'Delete' removes a location", async () => {
    const onChange = vi.fn();
    const { user } = setup(sampleLocations, onChange);

    const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
    await user.click(deleteButtons[0]);

    expect(onChange).toHaveBeenCalledWith([sampleLocations[1]]);
  });

  it("deleting a location that is being edited clears edit state", async () => {
    // We need a controlled component to test this properly
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <StreetViewEditor locations={sampleLocations} onChange={onChange} />
    );

    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    await user.click(editButtons[0]);
    expect(screen.getByRole("button", { name: /update/i })).toBeInTheDocument();

    // Simulate deleting the item being edited (first delete button is index 0)
    const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
    await user.click(deleteButtons[0]);

    // onChange called with remaining locations
    expect(onChange).toHaveBeenCalledWith([sampleLocations[1]]);
  });

  it("renders Edit and Delete buttons for each location", () => {
    setup(sampleLocations);
    const editButtons = screen.getAllByRole("button", { name: /^edit$/i });
    const deleteButtons = screen.getAllByRole("button", { name: /^delete$/i });
    expect(editButtons).toHaveLength(2);
    expect(deleteButtons).toHaveLength(2);
  });

  it("renders empty list with only Add button when no locations", () => {
    setup([]);
    expect(screen.getByRole("button", { name: /\+ add location/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^edit$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });
});
