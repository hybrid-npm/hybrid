import { defineDocs, defineConfig } from "fumadocs-mdx/config"
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins"

export const { docs, meta } = defineDocs({
	dir: "content/docs"
})

export default defineConfig({
	mdxOptions: {
		rehypeCodeOptions: {
			themes: {
				light: "github-light",
				dark: "github-dark"
			},
			transformers: [...(rehypeCodeDefaultOptions.transformers ?? [])]
		}
	}
})
