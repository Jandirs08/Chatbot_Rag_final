def build_classification_prompt(bot_name: str, business_context: str) -> str:
    return (
        f"Eres un clasificador de conversaciones para {bot_name}.\n"
        f"Contexto del negocio: {business_context}\n\n"
        "Analiza el historial y responde ÚNICAMENTE con JSON válido con estos campos:\n\n"
        "{\n"
        '  "category": "informacion|soporte|comercial|sin_valor",\n'
        '  "urgency": "alta|media|baja",\n'
        '  "lead_score": 0-100,\n'
        '  "purchase_intent": 0-100,\n'
        '  "product_interests": ["tema A", "tema B"],\n'
        '  "recommended_action": "ninguna|enviar_informacion|contactar_pronto|escalar_ventas|resolver_urgente",\n'
        '  "confidence": 0.85,\n'
        '  "summary": "2-3 líneas sobre qué necesita el usuario y qué quedó pendiente"\n'
        "}\n\n"
        "=== PESA MENSAJES RECIENTES ===\n"
        "Mensajes en orden cronológico. Los últimos pesan más. Si el usuario cambió de postura, refleja la actual.\n\n"
        "=== CATEGORY: tipo de conversación ===\n"
        "- informacion: busca entender algo — cómo funciona, compatibilidad, instrucciones, especificaciones\n"
        "- soporte: tiene un problema activo — error, falla, queja, proceso bloqueado, frustración\n"
        "- comercial: pregunta de compra — precio, disponibilidad, cotización, volumen, condiciones de pago\n"
        "- sin_valor: spam, prueba del sistema, saludo sin continuidad, sin intención real\n\n"
        "=== URGENCY: qué tan urgente es la situación ===\n"
        "- alta: usuario bloqueado, problema activo que impide operar, o señal de decisión inmediata\n"
        "- media: pregunta específica con algo pendiente, sin bloqueo crítico\n"
        "- baja: exploración inicial, consulta general, sin presión de tiempo\n\n"
        "=== LEAD_SCORE (0-100): cuánto merece atención humana ===\n"
        "NO mide solo intención de compra. Mide el valor total de intervenir.\n"
        "- 0-20: bot resolvió completamente, sin pendiente — no se necesita seguimiento\n"
        "- 21-40: conversación informativa resuelta, bajo valor de intervención\n"
        "- 41-60: algo quedó sin resolver o hay interés moderado — podría beneficiarse de seguimiento\n"
        "- 61-80: claramente se beneficiaría de atención humana — problema parcial, interés real\n"
        "- 81-100: atención humana requerida pronto — bloqueado, problema grave, o decisión de compra activa\n\n"
        "=== PURCHASE_INTENT (0-100): señal específica de compra ===\n"
        "Solo refleja señales concretas de querer adquirir algo. Independiente del lead_score.\n"
        "- 0-20: sin señales de compra detectadas\n"
        "- 21-50: explorando opciones, pregunta de evaluación precompra\n"
        "- 51-80: interés concreto — pide precio, stock, condiciones específicas\n"
        "- 81-100: intención clara — negocia, pide disponibilidad, menciona urgencia de compra\n\n"
        "=== PRODUCT_INTERESTS: temas mencionados explícitamente ===\n"
        "Lista productos, servicios o temas que el usuario mencionó. Si no mencionó ninguno: []\n\n"
        "=== RECOMMENDED_ACTION: elegir UNO ===\n"
        "- ninguna: bot resolvió, lead_score < 30, sin pendiente\n"
        "- enviar_informacion: category=informacion, algo quedó sin aclarar, enviar ficha o contenido\n"
        "- contactar_pronto: lead_score >= 60, contactar en menos de 24h\n"
        "- escalar_ventas: category=comercial y purchase_intent >= 70\n"
        "- resolver_urgente: category=soporte con urgency=alta\n\n"
        "=== CONFIDENCE ===\n"
        "Seguridad en la clasificación. Baja si el mensaje es muy corto, ambiguo o cambia de tema.\n\n"
        "=== SUMMARY ===\n"
        "2-3 líneas: qué necesita el usuario, qué respondió el bot, qué quedó pendiente.\n"
        "Orientado al agente humano que leerá esto. Sin jerga interna.\n"
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
