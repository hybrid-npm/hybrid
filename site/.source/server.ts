// @ts-nocheck
import * as __fd_glob_23 from "../content/docs/tools/xmtp.md?collection=docs"
import * as __fd_glob_22 from "../content/docs/tools/index.md?collection=docs"
import * as __fd_glob_21 from "../content/docs/tools/blockchain.md?collection=docs"
import * as __fd_glob_20 from "../content/docs/blockchain/multi-chain.md?collection=docs"
import * as __fd_glob_19 from "../content/docs/blockchain/foundry.md?collection=docs"
import * as __fd_glob_18 from "../content/docs/developing/framework.md?collection=docs"
import * as __fd_glob_17 from "../content/docs/developing/contributing.md?collection=docs"
import * as __fd_glob_16 from "../content/docs/howto/mini-apps.md?collection=docs"
import * as __fd_glob_15 from "../content/docs/agent/runtime.md?collection=docs"
import * as __fd_glob_14 from "../content/docs/agent/prompts.md?collection=docs"
import * as __fd_glob_13 from "../content/docs/agent/models.md?collection=docs"
import * as __fd_glob_12 from "../content/docs/agent/error-handling.md?collection=docs"
import * as __fd_glob_11 from "../content/docs/agent/behaviors.md?collection=docs"
import * as __fd_glob_10 from "../content/docs/using-hybrid.md?collection=docs"
import * as __fd_glob_9 from "../content/docs/tools.md?collection=docs"
import * as __fd_glob_8 from "../content/docs/quickstart.md?collection=docs"
import * as __fd_glob_7 from "../content/docs/index.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/core-concepts.md?collection=docs"
import { default as __fd_glob_5 } from "../content/docs/tools/meta.json?collection=docs"
import { default as __fd_glob_4 } from "../content/docs/howto/meta.json?collection=docs"
import { default as __fd_glob_3 } from "../content/docs/developing/meta.json?collection=docs"
import { default as __fd_glob_2 } from "../content/docs/blockchain/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/agent/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, "agent/meta.json": __fd_glob_1, "blockchain/meta.json": __fd_glob_2, "developing/meta.json": __fd_glob_3, "howto/meta.json": __fd_glob_4, "tools/meta.json": __fd_glob_5, }, {"core-concepts.md": __fd_glob_6, "index.mdx": __fd_glob_7, "quickstart.md": __fd_glob_8, "tools.md": __fd_glob_9, "using-hybrid.md": __fd_glob_10, "agent/behaviors.md": __fd_glob_11, "agent/error-handling.md": __fd_glob_12, "agent/models.md": __fd_glob_13, "agent/prompts.md": __fd_glob_14, "agent/runtime.md": __fd_glob_15, "howto/mini-apps.md": __fd_glob_16, "developing/contributing.md": __fd_glob_17, "developing/framework.md": __fd_glob_18, "blockchain/foundry.md": __fd_glob_19, "blockchain/multi-chain.md": __fd_glob_20, "tools/blockchain.md": __fd_glob_21, "tools/index.md": __fd_glob_22, "tools/xmtp.md": __fd_glob_23, });