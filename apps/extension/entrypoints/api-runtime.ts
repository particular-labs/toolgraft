import { defineUnlistedScript } from "wxt/utils/define-unlisted-script";
import { apiAdapter } from "@toolgraft/api-engine";
import { startAdapter } from "@toolgraft/adapter-sdk";
import type { Manifest } from "@toolgraft/adapter-schema";
export default defineUnlistedScript(() => {
  const data = Reflect.get(globalThis, "__TOOLGRAFT_API__") as {
    manifest: Manifest;
    payload: string;
  };
  Reflect.deleteProperty(globalThis, "__TOOLGRAFT_API__");
  startAdapter(apiAdapter(data.manifest, data.payload), data.manifest);
});
