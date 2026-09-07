import { defineApp } from "convex/server";
import teams from "../../src/component/convex.config.js";

const app = defineApp();
app.use(teams);
export default app;
