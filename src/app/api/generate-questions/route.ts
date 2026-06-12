import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

const MODE_PROMPTS: Record<string, string> = {
  principiante: 'divertidas, inocentes y apropiadas para todos',
  gossip: 'sobre secretos, cotilleos y dinámicas del grupo',
  picante: 'sobre relaciones, coqueteo y situaciones íntimas',
  hardcore: 'oscuras, que revelen secretos profundos y generen tensión',
  descarado: 'atrevidas, espontáneas y que saquen el lado descarado de cada uno',
}

export async function POST(request: Request) {
  try {
    const { playerNames, mode } = await request.json()
    const modeDesc = MODE_PROMPTS[mode] ?? MODE_PROMPTS.principiante

    const result = await model.generateContent(
      `Genera exactamente 10 preguntas del estilo "¿Quién es más probable que..." para el juego de mesa Exposed VDR.

Jugadores: ${playerNames.join(', ')}
Modo: ${mode} — preguntas ${modeDesc}

Reglas:
- Cada pregunta DEBE empezar con "¿Quién es más probable que"
- Menciona los nombres reales de los jugadores en al menos 5 de las 10 preguntas
- Las preguntas deben ser específicas para este grupo concreto
- Responde ÚNICAMENTE con un JSON array de 10 strings, sin texto extra ni markdown
- Ejemplo: ["¿Quién es más probable que...", "¿Quién es más probable que..."]`
    )

    const text = result.response.text()
    const clean = text.replace(/```(?:json)?\n?/g, '').trim()
    const questions: string[] = JSON.parse(clean)

    return Response.json({ questions })
  } catch (err) {
    console.error('generate-questions error:', err)
    return Response.json({ error: 'Failed to generate questions' }, { status: 500 })
  }
}
