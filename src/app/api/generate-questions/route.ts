import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const MODE_CONFIG: Record<string, { description: string; style: string }> = {
  principiante: {
    description: 'divertidas e inocentes, aptas para todos',
    style: `Preguntas graciosas sobre hábitos cotidianos, momentos vergonzosos o comportamientos simpáticos.
Sin temas románticos ni polémicos. Tono ligero que genere carcajadas.
Ej: "¿Quién es más probable que se quede dormido antes de las 12 en nochevieja?"`,
  },
  gossip: {
    description: 'sobre secretos y cotilleos del grupo',
    style: `Preguntas sobre quién sabe más, quién guarda secretos, quién cotillea o crea drama.
Tono de intriga y morbo sobre las dinámicas internas del grupo.
Ej: "¿Quién es más probable que tenga un grupo de chat secreto sobre el resto?"`,
  },
  picante: {
    description: 'sobre coqueteo, relaciones y situaciones íntimas',
    style: `Preguntas atrevidas sobre romance, coqueteo y situaciones comprometidas.
Atrevidas pero no explícitas. Que generen risas incómodas y miradas cómplices.
Ej: "¿Quién es más probable que haya besado a alguien del grupo sin contárselo a nadie?"`,
  },
  hardcore: {
    description: 'oscuras, reveladoras y que generen tensión real',
    style: `Preguntas sobre traiciones, secretos oscuros y comportamientos cuestionables.
Que incomoden de verdad. Tensión máxima.
Ej: "¿Quién es más probable que haya puesto a dos personas del grupo en contra la una de la otra?"`,
  },
  descarado: {
    description: 'atrevidas, espontáneas y que motiven a la acción',
    style: `Preguntas sobre comportamientos locos, sin filtro y energéticos.
Que animen a hacer cosas locas e inesperadas.
Ej: "¿Quién es más probable que proponga hacer algo ilegal esta noche y convenza a todos?"`,
  },
}

export async function POST(request: Request) {
  try {
    const { playerNames, mode } = await request.json()
    const config = MODE_CONFIG[mode] ?? MODE_CONFIG.principiante

    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: { temperature: 1.4 },
    })

    const result = await model.generateContent(
      `Genera exactamente 10 preguntas únicas del estilo "¿Quién es más probable que..." para el juego Exposed VDR.

JUGADORES: ${playerNames.join(', ')}
MODO: ${mode} — ${config.description}

ESTILO DEL MODO:
${config.style}

REGLAS OBLIGATORIAS:
1. Cada pregunta DEBE empezar con "¿Quién es más probable que"
2. En al menos 7 de las 10 preguntas menciona nombres reales: ${(playerNames as string[]).map((n: string) => `"${n}"`).join(', ')}
3. Usa formatos variados para nombrarlos:
   - "¿Quién es más probable que [NOMBRE] haya...?"
   - "¿Entre [NOMBRE1] y [NOMBRE2], quién es más probable que...?"
   - "¿Quién es más probable que le haya dicho a [NOMBRE] que...?"
4. Sé creativo y sorprendente — NADA de preguntas genéricas o típicas
5. Cada pregunta debe ser diferente en estructura y tema
6. Adáptalas a que son un grupo que se conoce bien

Responde ÚNICAMENTE con un JSON array de 10 strings. Sin texto extra ni markdown.
["pregunta 1", "pregunta 2", ...]`
    )

    const text = result.response.text()
    const clean = text.replace(/```(?:json)?\n?/g, '').trim()
    const questions: string[] = JSON.parse(clean)

    return Response.json({ questions })
  } catch (err) {
    console.error('generate-questions error:', err)
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
