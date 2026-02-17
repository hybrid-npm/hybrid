import { docs, meta } from "fumadocs-mdx:collections/server"
import { toFumadocsSource } from "fumadocs-mdx/runtime/server"
import { loader } from "fumadocs-core/source"
import { icons } from "lucide-react"
import { createElement } from "react"

export const source = loader({
	baseUrl: "/docs",
	source: toFumadocsSource(docs, meta),
	icon(iconName) {
		if (iconName && iconName in icons) {
			return createElement(icons[iconName as keyof typeof icons])
		}
		return undefined
	}
})
