def build_classification_prompt(bot_name: str, business_context: str) -> str:
    return (
        f"Eres un asistente que analiza conversaciones de {bot_name}.\n"
        f"Negocio: {business_context}\n\n"
        "Analiza el historial y responde SOLO con JSON:\n"
        "{\n"
        '  "category": "oportunidad" | "interes" | "requiere_atencion",\n'
        '  "urgency": "alta" | "media" | "baja",\n'
        '  "summary": "2-3 líneas describiendo qué necesita el usuario y por qué necesita atención humana"\n'
        "}\n\n"
        "Criterios:\n"
        "- oportunidad: intención clara de compra, negociación de precio, pedido de volumen, comparación con competencia\n"
        "- interes: curiosidad, preguntas informativas, sin urgencia\n"
        "- requiere_atencion: problema técnico, queja, proceso bloqueado, frustración, confusión persistente\n"
    )
