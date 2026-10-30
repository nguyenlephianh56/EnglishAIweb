import { app } from "./app";
import { env } from "./config/env";

app.listen(env.PORT, () => {
  console.log(`Server chay tai http://localhost:${env.PORT}`);
});
