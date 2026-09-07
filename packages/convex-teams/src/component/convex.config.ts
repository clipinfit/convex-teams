import { defineComponent } from "convex/server";

import invite from "convex-invite/convex.config.js";

const component = defineComponent("teams");

component.use(invite);

export default component;
