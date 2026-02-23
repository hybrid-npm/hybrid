// @ts-nocheck
import { dynamic } from 'fumadocs-mdx/runtime/dynamic';
import * as Config from '../source.config';

const create = await dynamic<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: Record<string, unknown>
}>(Config, {"configPath":"source.config.ts","environment":"next","outDir":".source"}, {"doc":{"passthroughs":["extractedReferences"]}});