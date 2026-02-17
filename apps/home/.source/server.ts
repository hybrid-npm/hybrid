// @ts-nocheck
import { default as __fd_glob_15 } from "../content/docs/server/meta.json?collection=meta"
import { default as __fd_glob_14 } from "../content/docs/getting-started/meta.json?collection=meta"
import { default as __fd_glob_13 } from "../content/docs/development/meta.json?collection=meta"
import { default as __fd_glob_12 } from "../content/docs/deployment/meta.json?collection=meta"
import { default as __fd_glob_11 } from "../content/docs/configuration/meta.json?collection=meta"
import { default as __fd_glob_10 } from "../content/docs/meta.json?collection=meta"
import * as __fd_glob_9 from "../content/docs/server/sub-agents.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/server/sse.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/server/api.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/development/contributing.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/getting-started/quickstart.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/getting-started/architecture.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/deployment/docker.mdx?collection=docs"
import * as __fd_glob_2 from "../content/docs/configuration/system-prompt.mdx?collection=docs"
import * as __fd_glob_1 from "../content/docs/configuration/skills.mdx?collection=docs"
import * as __fd_glob_0 from "../content/docs/index.mdx?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.doc("docs", "content/docs", {"index.mdx": __fd_glob_0, "configuration/skills.mdx": __fd_glob_1, "configuration/system-prompt.mdx": __fd_glob_2, "deployment/docker.mdx": __fd_glob_3, "getting-started/architecture.mdx": __fd_glob_4, "getting-started/quickstart.mdx": __fd_glob_5, "development/contributing.mdx": __fd_glob_6, "server/api.mdx": __fd_glob_7, "server/sse.mdx": __fd_glob_8, "server/sub-agents.mdx": __fd_glob_9, });

export const meta = await create.meta("meta", "content/docs", {"meta.json": __fd_glob_10, "configuration/meta.json": __fd_glob_11, "deployment/meta.json": __fd_glob_12, "development/meta.json": __fd_glob_13, "getting-started/meta.json": __fd_glob_14, "server/meta.json": __fd_glob_15, });