import { app } from "./app";
import { env } from "./config/env";
import { startAudioCleanupJob } from "./jobs/audio-cleanup.job";
import { startReminderJob } from "./jobs/reminder.job";

app.listen(env.PORT, () => {
  console.log(`Server chay tai http://localhost:${env.PORT}`);
  startAudioCleanupJob(); // T19: dọn file âm thanh mồ côi (không chạy khi NODE_ENV=test)
  startReminderJob();
});