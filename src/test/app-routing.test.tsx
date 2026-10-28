import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, waitFor, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

async function renderAt(path: string) {
  const queryClient = new QueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  // Wait for router to be ready
  await router.load();
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Assert only that the router mounts and paints, never page content:
// routes are rewritten as the app is built and this must keep passing.
describe("App routing", () => {
  it("renders the index route", async () => {
    await renderAt("/");

    // The index route renders the Workbench, which contains the heading
    // "Low-Altitude Drone Corridors" in the header. In the test environment
    // without CesiumJS, we check that the route attempted to mount the Workbench
    // by finding this stable text that doesn't depend on Cesium loading.
    await waitFor(() => {
      expect(screen.getByText("Low-Altitude Drone Corridors")).toBeInTheDocument();
    });
  });

  it("renders the not-found route", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await renderAt("/this-route-does-not-exist");

    await waitFor(() => {
      expect(screen.getByText("404")).toBeInTheDocument();
      expect(screen.getByText("Page not found")).toBeInTheDocument();
    });
  });
});
