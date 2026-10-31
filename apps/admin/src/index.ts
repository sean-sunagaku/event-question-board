import { frontend } from "@eqb/core/frontend";
import clientJS from "../../../work/client-source.ts";
export default { fetch: frontend("admin", clientJS) };
