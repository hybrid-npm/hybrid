// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "configuration/skills.mdx": () => import("../content/docs/configuration/skills.mdx?collection=docs"), "configuration/system-prompt.mdx": () => import("../content/docs/configuration/system-prompt.mdx?collection=docs"), "deployment/docker.mdx": () => import("../content/docs/deployment/docker.mdx?collection=docs"), "getting-started/architecture.mdx": () => import("../content/docs/getting-started/architecture.mdx?collection=docs"), "getting-started/quickstart.mdx": () => import("../content/docs/getting-started/quickstart.mdx?collection=docs"), "development/contributing.mdx": () => import("../content/docs/development/contributing.mdx?collection=docs"), "server/api.mdx": () => import("../content/docs/server/api.mdx?collection=docs"), "server/sse.mdx": () => import("../content/docs/server/sse.mdx?collection=docs"), "server/sub-agents.mdx": () => import("../content/docs/server/sub-agents.mdx?collection=docs"), }),
};
export default browserCollections;