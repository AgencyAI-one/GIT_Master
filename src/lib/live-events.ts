export type BoardChangedEvent = {
  type: "board_changed";
  deliveryId: string;
  githubEvent: string;
  action: string;
  at: string;
  owner?: string;
  repository?: string;
  projectId?: string;
};

type Subscriber = (event: BoardChangedEvent) => void;

type LiveEventState = {
  subscribers: Set<Subscriber>;
  deliveries: Map<string, number>;
  recent: Array<{ event: BoardChangedEvent; publishedAt: number }>;
};

const globalLiveEvents = globalThis as typeof globalThis & {
  gitMasterLiveEvents?: LiveEventState;
};

function state() {
  if (!globalLiveEvents.gitMasterLiveEvents) {
    globalLiveEvents.gitMasterLiveEvents = {
      subscribers: new Set(),
      deliveries: new Map(),
      recent: [],
    };
  }
  return globalLiveEvents.gitMasterLiveEvents;
}

export function publishBoardChanged(event: BoardChangedEvent) {
  const current = state();
  if (current.deliveries.has(event.deliveryId)) return false;
  const publishedAt = Date.now();
  current.deliveries.set(event.deliveryId, publishedAt);
  current.recent.push({ event, publishedAt });
  if (current.deliveries.size > 250) {
    const oldest = current.deliveries.keys().next().value;
    if (oldest) current.deliveries.delete(oldest);
  }
  if (current.recent.length > 250) current.recent.splice(0, current.recent.length - 250);
  for (const subscriber of current.subscribers) subscriber(event);
  return true;
}

export function subscribeToBoardChanges(
  subscriber: Subscriber,
  options: { replayAfterDeliveryId?: string; replayRecentMs?: number; now?: number } = {},
) {
  const current = state();
  const snapshot = current.recent.slice();
  current.subscribers.add(subscriber);

  let replay: typeof snapshot = [];
  if (options.replayAfterDeliveryId) {
    const lastIndex = snapshot.findIndex(({ event }) => event.deliveryId === options.replayAfterDeliveryId);
    if (lastIndex >= 0) replay = snapshot.slice(lastIndex + 1);
  } else if (options.replayRecentMs) {
    const cutoff = (options.now ?? Date.now()) - options.replayRecentMs;
    replay = snapshot.filter(({ publishedAt }) => publishedAt >= cutoff);
  }
  for (const { event } of replay) subscriber(event);

  return () => current.subscribers.delete(subscriber);
}

export function boardEventMatches(
  event: BoardChangedEvent,
  workspace: { repository: string; projectId?: string },
) {
  if (event.projectId) return event.projectId === workspace.projectId;
  if (event.repository) return event.repository.toLocaleLowerCase("en-US") === workspace.repository.toLocaleLowerCase("en-US");
  if (event.owner) return workspace.repository.split("/")[0]?.toLocaleLowerCase("en-US") === event.owner.toLocaleLowerCase("en-US");
  return false;
}

export function resetLiveEventsForTests() {
  delete globalLiveEvents.gitMasterLiveEvents;
}
