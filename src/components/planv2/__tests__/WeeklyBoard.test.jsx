import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import WeeklyBoard from "../WeeklyBoard";
import { unscheduleTopicFromDay } from "../../../services/planV2Api";

jest.mock("../../../services/planV2Api", () => ({
  scheduleTopicToDay: jest.fn(),
  scheduleTopicPackFromDay: jest.fn(),
  moveTopicSlicesToNextDay: jest.fn(),
  unscheduleTopicReturnToQueue: jest.fn(),
  unscheduleTopicFromDay: jest.fn(),
  searchMasterQueueTopics: jest.fn().mockResolvedValue([]),
  ensureMasterQueueBuilt: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../DayCapacityModal", () => function MockModal() {
  return null;
});

describe("WeeklyBoard unschedule flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("prevents duplicate unschedule calls while the request is in flight", async () => {
    jest.useFakeTimers();

    let resolveUnschedule;
    unscheduleTopicFromDay.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUnschedule = resolve;
        }),
    );

    render(
      <WeeklyBoard
        uid="user-1"
        weekKey="week-1"
        weekDates={[new Date("2099-01-01T00:00:00Z")]}
        dayCaps={{ "2099-01-01": 120 }}
        assigned={{
          "2099-01-01": [
            {
              seq: "42",
              minutes: 30,
              topicName: "Mock topic",
              subIdx: 0,
            },
          ],
        }}
        onRefresh={jest.fn()}
      />,
    );

    const removeButton = await screen.findByTitle("Remove from day");

    fireEvent.click(removeButton);
    fireEvent.click(removeButton);

    expect(unscheduleTopicFromDay).toHaveBeenCalledTimes(1);

    await waitFor(() =>
      expect(screen.queryByTitle("Remove from day")).toBeNull(),
    );

    await act(async () => {
      resolveUnschedule?.({ removed: 1 });
    });

    await act(async () => {
      jest.runOnlyPendingTimers();
    });

    const reEnabledButton = await screen.findByTitle("Remove from day");
    expect(reEnabledButton).not.toBeDisabled();
  });
});
