import teams from "@clipin/convex-teams/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(teams);
export default app;
