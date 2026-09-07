/// <reference types="vite/client" />
import type { GenericSchema, SchemaDefinition } from "convex/server";
import { register as registerInvite } from "convex-invite/test";
import type { TestConvex } from "convex-test";
import schema from "./component/schema.js";

const modules = import.meta.glob("./component/**/*.ts");

export function register(
  t: TestConvex<SchemaDefinition<GenericSchema, boolean>>,
  name = "teams",
) {
  t.registerComponent(name, schema, modules);
  registerInvite(t, `${name}/invite`);
}

export default { register, schema, modules };
