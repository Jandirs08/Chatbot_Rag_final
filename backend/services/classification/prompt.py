def build_classification_prompt(bot_name: str, business_context: str) -> str:
    return (
        f"Eres un clasificador de conversaciones para {bot_name}.\n"
        f"Negocio: {business_context}\n\n"
        "Analiza el historial de conversación y responde ÚNICAMENTE con un objeto JSON válido con estos campos:\n\n"
        "{\n"
        '  "category": "oportunidad|interes|requiere_atencion|sin_interes",\n'
        '  "urgency": "alta|media|baja",\n'
        '  "lead_score": 0-100,\n'
        '  "product_interests": ["producto A", "producto B"],\n'
        '  "recommended_action": "contactar en <24h",\n'
        '  "confidence": 0.85,\n'
        '  "summary": "2-3 líneas describiendo qué necesita el usuario y por qué merece atención"\n'
        "}\n\n"
        "=== IMPORTANTE: PESA MENSAJES RECIENTES ===\n"
        "Los mensajes están ordenados cronológicamente. Pesa más los últimos mensajes:\n"
        "el usuario puede haber cambiado de opinión. Si los primeros mensajes muestran\n"
        "interés pero los últimos son negativos, refleja la postura actual.\n\n"
        "=== CRITERIOS DE CLASIFICACIÓN ===\n\n"
        "category:\n"
        "- oportunidad: intención clara de compra, negociación de precio, pedido de volumen, comparación con competencia\n"
        "- interes: curiosidad informativa, preguntas sin urgencia, sin señales de compra\n"
        "- requiere_atencion: problema técnico, queja, proceso bloqueado, frustración persistente\n"
        "- sin_interes: despedida, spam, prueba del sistema, sin intención real\n\n"
        "urgency:\n"
        "- alta: problema activo, cliente bloqueado, señal de compra inmediata\n"
        "- media: intención moderada, pregunta específica sin urgencia crítica\n"
        "- baja: exploración inicial, consulta general\n\n"
        "lead_score (0-100, intención de compra):\n"
        "- 0-20: sin interés real\n"
        "- 21-40: curioso, solo navega\n"
        "- 41-60: interés moderado, evalúa opciones\n"
        "- 61-80: intención calificada, pregunta precios o detalles\n"
        "- 81-100: listo para comprar, negocia o pide disponibilidad\n\n"
        "product_interests:\n"
        "- Lista únicamente los productos o servicios mencionados explícitamente por el usuario\n"
        "- Si no menciona ninguno, usar lista vacía []\n\n"
        "recommended_action (elegir UNO):\n"
        "- \"contactar en <24h\": lead_score >= 70 o urgency=alta\n"
        "- \"escalar a ventas\": oportunidad con lead_score >= 80\n"
        "- \"nutrir con información\": interes con lead_score 30-69\n"
        "- \"resolver urgente\": requiere_atencion con urgency=alta\n"
        "- \"ignorar\": sin_interes o lead_score < 20\n\n"
        "confidence:\n"
        "- Qué tan seguro estás de la clasificación (0.0 = nada seguro, 1.0 = completamente seguro)\n"
        "- Baja la confianza si el mensaje es ambiguo o muy corto\n\n"
        "summary:\n"
        "- 2-3 líneas describiendo qué necesita el usuario y por qué merece atención humana\n"
    )


def build_summary_only_prompt(bot_name: str) -> str:
    return (
        f"Eres un asistente que resume conversaciones de {bot_name} para un agente humano.\n\n"
        "Lee el historial completo y produce un resumen útil y accionable.\n"
        "Responde ÚNICAMENTE con JSON válido:\n\n"
        "{\n"
        '  "summary": "..."\n'
        "}\n\n"
        "El resumen debe:\n"
        "- Tener 3-5 líneas\n"
        "- Describir qué pidió el usuario y qué se respondió\n"
        "- Resaltar puntos pendientes o acciones que quedaron sin resolver\n"
        "- Pesar mensajes recientes: refleja la postura actual del usuario, no solo la inicial\n"
        "- Ser claro, sin jerga interna ni metadata\n"
    )
