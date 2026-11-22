import cron, { type ScheduledTask } from "node-cron";
import { env } from "../config/env";
import { REMINDER_SCAN_FAILED } from "../modules/notifications/notifications.constants";
import { runReminderScan } from "../modules/notifications/notifications.reminder";

export const startReminderJob = (): ScheduledTask | null => {
  if (process.env.NODE_ENV === "test") return null;

  let running = false;
  const run = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const { scanned, created, failed } = await runReminderScan({ now: new Date() });
      if (created > 0 || failed > 0) {
        console.log(`[reminder] scanned=${scanned} created=${created} failed=${failed}`);
      }
    } catch {
      console.error(REMINDER_SCAN_FAILED);
    } finally {
      running = false;
    }
  };

  try {
    const task = cron.schedule(`*/${env.REMINDER_SCAN_INTERVAL_MINUTES} * * * *`, run);
    void run();
    return task;
  } catch {
    console.error(REMINDER_SCAN_FAILED);
    return null;
  }
};