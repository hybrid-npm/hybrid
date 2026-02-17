import { source } from "@/app/source"
import {
	DocsPage,
	DocsBody,
	DocsTitle,
	DocsDescription
} from "fumadocs-ui/page"
import { notFound } from "next/navigation"
import defaultMdxComponents from "fumadocs-ui/mdx"
import type { Metadata } from "next"
import type { MDXContent } from "mdx/types"

interface PageProps {
	params: Promise<{ slug?: string[] }>
}

interface PageData {
	title: string
	description?: string
	toc: { title: string; url: string; depth: number }[]
	full?: boolean
	body: MDXContent
}

export default async function Page({ params }: PageProps) {
	const { slug } = await params
	const page = source.getPage(slug)

	if (!page) notFound()

	const pageData = page.data as PageData
	const MDX = pageData.body

	return (
		<DocsPage toc={pageData.toc} full={pageData.full}>
			<DocsTitle>{pageData.title}</DocsTitle>
			<DocsDescription>{pageData.description}</DocsDescription>
			<DocsBody>
				<MDX components={defaultMdxComponents} />
			</DocsBody>
		</DocsPage>
	)
}

export async function generateStaticParams() {
	return source.generateParams()
}

export async function generateMetadata({
	params
}: PageProps): Promise<Metadata> {
	const { slug } = await params
	const page = source.getPage(slug)

	if (!page) notFound()

	return {
		title: page.data.title,
		description: page.data.description
	}
}
