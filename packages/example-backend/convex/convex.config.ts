import { defineApp } from "convex/server";
import teams from "convex-teams/convex.config.js";

const app = defineApp();
app.use(teams);
export default app;
