import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boardEventMatches,
  publishBoardChanged,
  resetLiveEventsForTests,
  subscribeToBoardChanges,
  type BoardChangedEvent,
} from "@/lib/live-events";

const event: BoardChangedEvent = {
  type: "board_changed",
  deliveryId: "delivery-1",
  githubEvent: "projects_v2_item",
  action: "edited",
  owner: "AgencyAI-one",
  projectId: "PVT_1",
  at: "2026-09-01T12:00:00.000Z",
};

describe("live board events", () => {
  afterEach(resetLiveEventsForTests);

  it("publishes each GitHub delivery only once", () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeToBoardChanges(subscriber);
    expect(publishBoardChanged(event)).toBe(true);
    expect(publishBoardChanged(event)).toBe(false);
    expect(subscriber).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("replays recent deliveries when an SSE client connects late", () => {
    expect(publishBoardChanged(event)).toBe(true);
    expect(publishBoardChanged({ ...event, deliveryId: "delivery-2" })).toBe(true);
    const recentSubscriber = vi.fn();
    subscribeToBoardChanges(recentSubscriber, { replayRecentMs: 60_000 });
    expect(recentSubscriber).toHaveBeenCalledTimes(2);

    const reconnectingSubscriber = vi.fn();
    subscribeToBoardChanges(reconnectingSubscriber, { replayAfterDeliveryId: "delivery-1" });
    expect(reconnectingSubscriber).toHaveBeenCalledOnce();
    expect(reconnectingSubscriber).toHaveBeenCalledWith(expect.objectContaining({ deliveryId: "delivery-2" }));
  });

  it("matches exact projects before organization fallback", () => {
    expect(boardEventMatches(event, { repository: "AgencyAI-one/GIT_Master", projectId: "PVT_1" })).toBe(true);
    expect(boardEventMatches(event, { repository: "AgencyAI-one/GIT_Master", projectId: "PVT_2" })).toBe(false);
    expect(boardEventMatches(event, { repository: "AgencyAI-one/GIT_Master" })).toBe(false);
  });

  it("matches repository and owner-scoped events case-insensitively", () => {
    expect(boardEventMatches({ ...event, projectId: undefined, repository: "agencyai-ONE/git_master" }, { repository: "AgencyAI-one/GIT_Master" })).toBe(true);
    expect(boardEventMatches({ ...event, projectId: undefined }, { repository: "agencyai-one/another" })).toBe(true);
    expect(boardEventMatches({ ...event, projectId: undefined }, { repository: "other/repo" })).toBe(false);
  });
});
