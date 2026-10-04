import { app } from "./app.ts";
import { env } from "./config/env.ts";

app.listen(env.PORT, () => {
  console.log(`Bammy API listening on port ${env.PORT}`);
});
