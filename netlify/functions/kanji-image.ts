import satori from "satori"
import { initWasm, Resvg } from "@resvg/resvg-wasm"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"

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
			const base = import.meta.dirname || "."
			const candidates = [
				join(base, "index_bg.wasm"),
				join(base, "../../node_modules/@resvg/resvg-wasm/index_bg.wasm"),
				resolve(base, "../../../node_modules/@resvg/resvg-wasm/index_bg.wasm"),
			]
			let wasmBuffer: Buffer | null = null
			for (const p of candidates) {
				try {
					wasmBuffer = readFileSync(p)
					break
				} catch {
					continue
				}
			}
			if (!wasmBuffer) {
				throw new Error(
					`WASM file not found. Tried: ${candidates.join(", ")}`,
				)
			}
			await initWasm(wasmBuffer)
		})()
	}
	return wasmReady
}

let cachedSerifFont: ArrayBuffer | null = null
let cachedSansFont: ArrayBuffer | null = null

function loadFont(filename: string): ArrayBuffer {
	const base = import.meta.dirname || "."
	const candidates = [
		join(base, `fonts/${filename}`),
		join(base, `../../netlify/functions/fonts/${filename}`),
	]
	for (const p of candidates) {
		try {
			return readFileSync(p).buffer
		} catch {
			continue
		}
	}
	throw new Error(`Font file '${filename}' not found. Tried: ${candidates.join(", ")}`)
}

function getSerifFont(): ArrayBuffer {
	if (!cachedSerifFont) cachedSerifFont = loadFont("NotoSerifJP-Regular.ttf")
	return cachedSerifFont
}

function getSansFont(): ArrayBuffer {
	if (!cachedSansFont) cachedSansFont = loadFont("NotoSansJP-Regular.ttf")
	return cachedSansFont
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
		const serifFont = getSerifFont()
		const sansFont = getSansFont()
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
						backgroundColor: "#282828",
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						justifyContent: "center",
						color: "#f0f0f0",
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
									fontFamily: "Noto Sans JP",
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
									fontFamily: "Noto Serif JP",
								},
								children: kanji,
							},
						},
						{
							type: "div",
							props: {
								style: {
									fontSize: 22,
									color: "#f0f0f0",
									marginBottom: 48,
									textTransform: "capitalize",
									fontFamily: "Noto Sans JP",
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
															color: "#888888",
															marginBottom: 8,
															fontFamily: "Noto Sans JP",
														},
														children: "KUN",
													},
												},
												{
													type: "div",
													props: {
														style: {
															fontSize: 28,
															fontFamily: "Noto Sans JP",
														},
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
															color: "#888888",
															marginBottom: 8,
															fontFamily: "Noto Sans JP",
														},
														children: "ON",
													},
												},
												{
													type: "div",
													props: {
														style: {
															fontSize: 28,
															fontFamily: "Noto Sans JP",
														},
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
						name: "Noto Serif JP",
						data: serifFont,
						style: "normal",
						weight: 400,
					},
					{
						name: "Noto Sans JP",
						data: sansFont,
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
