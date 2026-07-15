import { useEffect, useState } from "react"
import "./app.css"
import { useParams } from "react-router"

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

const KANJI_API_URL = "https://kanjiapi.dev/v1/kanji"

let n5KanjiCache: Promise<string[]> | null = null
const kanjiDetailsCache = new Map<string, Promise<KanjiDetails | null>>()

const fetchN5Kanji = async () => {
	if (n5KanjiCache) {
		return n5KanjiCache
	}

	n5KanjiCache = (async () => {
		try {
			const response = await fetch(`${KANJI_API_URL}/jlpt-5`)
			const data = await response.json()
			return data
		} catch (error) {
			console.error("Error fetching N5 Kanji:", error)
			return []
		}
	})()

	return n5KanjiCache
}

const fetchKanjiDetails = async (kanji: string) => {
	const cached = kanjiDetailsCache.get(kanji)
	if (cached) {
		return cached
	}

	const request = (async () => {
		try {
			const response = await fetch(`${KANJI_API_URL}/${kanji}`)
			const data = await response.json()
			return data
		} catch (error) {
			console.error(`Error fetching details for kanji ${kanji}:`, error)
			return null
		}
	})()

	kanjiDetailsCache.set(kanji, request)
	return request
}

function App() {
	const params = useParams()
	const kanjiParam = params.kanji || ""
	const [kanji, setKanji] = useState<string>("")
	const [kanjiDetails, setKanjiDetails] = useState<KanjiDetails | null>(null)

	useEffect(() => {
		const getKanjiFromParam = async () => {
			if (kanjiParam) {
				setKanji(kanjiParam)
			}
		}

		getKanjiFromParam()
	}, [kanjiParam])

	useEffect(() => {
		const getKanji = async () => {
			const kanjiList = await fetchN5Kanji()
			if (kanjiList.length > 0) {
				const randomIndex = Math.floor(Math.random() * kanjiList.length)
				setKanji(kanjiList[randomIndex])
			}
		}
		if (!kanjiParam && !kanji) {
			getKanji()
		}
	}, [kanjiParam, kanji])

	useEffect(() => {
		const getKanjiDetails = async () => {
			if (kanji) {
				const details = await fetchKanjiDetails(kanji)
				setKanjiDetails(details)
			}
		}

		getKanjiDetails()
	}, [kanji])

	return (
		<>
			<div className="app-container">
				<h2 className="serif-jp subtitle">N{kanjiDetails?.jlpt}</h2>
				<h1 className="serif-jp title">{kanji}</h1>
				<h2 className="serif-jp subtitle">
					{kanjiDetails?.heisig_en
						? kanjiDetails?.heisig_en
						: kanjiDetails?.meanings[0]}
				</h2>
				<div className="readings-container">
					<div>
						<h3 className="serif-jp title-text">KUN</h3>
						<h4 className="sans-serif-jp text">
							{kanjiDetails?.kun_readings[0]}
						</h4>
					</div>
					<div>
						<h3 className="serif-jp title-text">ON</h3>
						<h4 className="sans-serif-jp text">
							{kanjiDetails?.on_readings[0]}
						</h4>
					</div>
				</div>
			</div>
		</>
	)
}

export default App
