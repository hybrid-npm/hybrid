// @ts-nocheck
import { browser } from 'fumadocs-mdx/runtime/browser';
import type * as Config from '../source.config';

const create = browser<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>();
const browserCollections = {
  docs: create.doc("docs", {"core-concepts.md": () => import("../content/docs/core-concepts.md?collection=docs"), "index.mdx": () => import("../content/docs/index.mdx?collection=docs"), "quickstart.md": () => import("../content/docs/quickstart.md?collection=docs"), "tools.md": () => import("../content/docs/tools.md?collection=docs"), "using-hybrid.md": () => import("../content/docs/using-hybrid.md?collection=docs"), "agent/behaviors.md": () => import("../content/docs/agent/behaviors.md?collection=docs"), "agent/error-handling.md": () => import("../content/docs/agent/error-handling.md?collection=docs"), "agent/models.md": () => import("../content/docs/agent/models.md?collection=docs"), "agent/prompts.md": () => import("../content/docs/agent/prompts.md?collection=docs"), "agent/runtime.md": () => import("../content/docs/agent/runtime.md?collection=docs"), "blockchain/foundry.md": () => import("../content/docs/blockchain/foundry.md?collection=docs"), "blockchain/multi-chain.md": () => import("../content/docs/blockchain/multi-chain.md?collection=docs"), "developing/contributing.md": () => import("../content/docs/developing/contributing.md?collection=docs"), "developing/framework.md": () => import("../content/docs/developing/framework.md?collection=docs"), "howto/mini-apps.md": () => import("../content/docs/howto/mini-apps.md?collection=docs"), "tools/blockchain.md": () => import("../content/docs/tools/blockchain.md?collection=docs"), "tools/index.md": () => import("../content/docs/tools/index.md?collection=docs"), }),
};
export default browserCollections;