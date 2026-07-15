import satori from "satori"
import { initWasm, Resvg } from "@resvg/resvg-wasm"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const KANJI_API_URL = "https://kanjiapi.dev/v1/kanji"

interface KanjiDetails {
	jlpt: number
	kanji: string
	grade: number
	stroke_count: number
	meanings: string[]
	kun_readings: string[]
	on_readings: string[]
	name_readings: string[]
	heisig_en: string
}

let wasmReady: Promise<void> | null = null

function ensureWasm(): Promise<void> {
	if (!wasmReady) {
		wasmReady = (async () => {
			const wasmPath = join(import.meta.dirname || ".", "index_bg.wasm")
			const wasmBuffer = readFileSync(wasmPath)
			await initWasm(wasmBuffer)
		})()
	}
	return wasmReady
}

let cachedFont: ArrayBuffer | null = null

async function getFont(): Promise<ArrayBuffer> {
	if (cachedFont) return cachedFont

	const regular = await fetch(
		"https://fonts.gstatic.com/s/notosansjp/v53/zjwtc5_VGPvsQhP9hiGAfPjsHD3U.woff2",
	)
	const data = await regular.arrayBuffer()
	cachedFont = data
	return data
}

export default async (req: Request) => {
	const url = new URL(req.url)
	const kanji = url.searchParams.get("kanji")

	if (!kanji) {
		return new Response(
			JSON.stringify({ error: "Missing 'kanji' query parameter" }),
			{ status: 400, headers: { "Content-Type": "application/json" } },
		)
	}

	try {
		await ensureWasm()

		const response = await fetch(`${KANJI_API_URL}/${kanji}`)
		if (!response.ok) {
			return new Response(
				JSON.stringify({ error: `Kanji '${kanji}' not found` }),
				{ status: 404, headers: { "Content-Type": "application/json" } },
			)
		}

		const details: KanjiDetails = await response.json()
		const font = await getFont()
		const meaning = details.heisig_en || details.meanings[0] || ""
		const kunReading = details.kun_readings[0] || "—"
		const onReading = details.on_readings[0] || "—"

		const svg = await satori(
			{
				type: "div",
				props: {
					style: {
						width: 400,
						height: 500,
						backgroundColor: "#ffffff",
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						fontFamily: "Noto Sans JP",
					},
					children: [
						{
							type: "div",
							props: {
								style: {
									fontSize: 18,
									color: "#888888",
									marginBottom: 24,
									letterSpacing: 2,
								},
								children: `N${details.jlpt}`,
							},
						},
						{
							type: "div",
							props: {
								style: {
									fontSize: 160,
									lineHeight: 1,
									marginBottom: 24,
								},
								children: kanji,
							},
						},
						{
							type: "div",
							props: {
								style: {
									fontSize: 22,
									color: "#333333",
									marginBottom: 48,
									textTransform: "capitalize",
								},
								children: meaning,
							},
						},
						{
							type: "div",
							props: {
								style: {
									display: "flex",
									gap: 80,
								},
								children: [
									{
										type: "div",
										props: {
											style: {
												display: "flex",
												flexDirection: "column",
												alignItems: "center",
											},
											children: [
												{
													type: "div",
													props: {
														style: {
															fontSize: 14,
															color: "#999999",
															marginBottom: 8,
														},
														children: "KUN",
													},
												},
												{
													type: "div",
													props: {
														style: { fontSize: 28 },
														children: kunReading,
													},
												},
											],
										},
									},
									{
										type: "div",
										props: {
											style: {
												display: "flex",
												flexDirection: "column",
												alignItems: "center",
											},
											children: [
												{
													type: "div",
													props: {
														style: {
															fontSize: 14,
															color: "#999999",
															marginBottom: 8,
														},
														children: "ON",
													},
												},
												{
													type: "div",
													props: {
														style: { fontSize: 28 },
														children: onReading,
													},
												},
											],
										},
									},
								],
							},
						},
					],
				},
			},
			{
				width: 400,
				height: 500,
				fonts: [
					{
						name: "Noto Sans JP",
						data: font,
						style: "normal",
						weight: 400,
					},
				],
			},
		)

		const resvg = new Resvg(svg, {
			fitTo: { mode: "width", value: 800 },
		})
		const pngData = resvg.render()
		const pngBuffer = pngData.asPng()

		return new Response(Buffer.from(pngBuffer), {
			status: 200,
			headers: {
				"Content-Type": "image/png",
				"Cache-Control": "public, max-age=3600, s-maxage=86400",
			},
		})
	} catch (error) {
		console.error("Error generating kanji image:", error)
		return new Response(
			JSON.stringify({
				error: "Failed to generate image",
				details: error instanceof Error ? error.message : String(error),
			}),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		)
	}
}

export const config = {
	path: "/api/kanji-image",
}
