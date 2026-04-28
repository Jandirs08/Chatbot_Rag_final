🎯 Nivel 1: Precisión Numérica (La prueba de fuego)
Usa estas para ver si el Prompt de "no inventar y usar cifras" está funcionando.

Pregunta 1: ¿Cuál es la composición exacta de Zinc en el producto Algarium Semilla SC?

Respuesta Esperada: El producto contiene 30% p/v de Zinc. (También puede mencionar el extracto de algas, pero el 30% es obligatorio).

Pregunta 2: ¿Qué concentración de aminoácidos libres tiene el producto Ánimo?

Respuesta Esperada: Tiene una concentración de 29.0% p/v de aminoácidos libres.

Pregunta 3: ¿Cuál es la fórmula NPK exacta del Soluvit 500K?

Respuesta Esperada: Su composición es 0-8-50. Contiene 50% p/v (o 500 g/L) de Potasio y 8% p/v de Fósforo.

🚜 Nivel 2: Dosis y Aplicación (Detalle Técnico)
Prueba si el RAG puede conectar un cultivo con una instrucción específica.

Pregunta 4: ¿Cuál es la dosis recomendada de Algarium Semilla SC para gramíneas como el arroz o maíz?

Respuesta Esperada: La dosis es de 5 ml por kg de semilla.

Pregunta 5: ¿Para qué etapa específica se recomienda el uso de Soluvit Ca-B-Zn?

Respuesta Esperada: Se recomienda para las etapas de polinización y cuajado, ya que aporta los elementos esenciales para estos procesos.

🏢 Nivel 3: Datos Corporativos y Servicios
Prueba la recuperación de entidades y ubicaciones.

Pregunta 6: ¿Dónde está ubicada la planta de producción de Equilibra y qué fabrican allí?

Respuesta Esperada: Está ubicada en Paita, Piura (inaugurada en 2020) y se dedica a la fabricación de fertilizantes líquidos (Línea LiquidMáster).

Pregunta 7: ¿Cuál es el diferencial técnico del servicio LiquidMáster?

Respuesta Esperada: Ofrecen formulaciones a la medida basadas estrictamente en el análisis de suelo y agua del cliente.

---

Nivel 4: Cruce de Información (Multi-hop)
Evalúa si el RAG puede conectar datos de dos o más secciones distantes del documento.

Pregunta 8: Si un cliente asiste a la sede administrativa en Santiago de Surco para contratar el servicio LiquidMáster, ¿en qué ciudad se fabricará físicamente su pedido y qué información técnica debe proveer el cliente para que lo preparen?

Respuesta Esperada: Se fabricará en la planta de Paita, Piura. El cliente debe proveer un análisis de agua y suelo.

Por qué es robusta: El sistema debe unir la sección de "Infraestructura" (oficinas y planta) con los requisitos específicos de la "Línea LiquidMáster".

Pregunta 9: ¿En qué año se inauguró la instalación donde se fabrican los fertilizantes líquidos de Equilibra y qué alianza internacional logró la empresa exactamente ese mismo año?

Respuesta Esperada: La planta se inauguró en 2020. Ese mismo año, la empresa logró la alianza para la distribución exclusiva en Perú y Bolivia de las líneas premium de Yara.

Por qué es robusta: Obliga al modelo a localizar el año "2020" en la sección de la planta de Paita y luego escanear el resto del documento para encontrar coincidencias temporales en la sección de "Alianzas".

Nivel 5: Desambiguación y Comparación
Evalúa si el sistema se confunde cuando hay productos con nombres o componentes parecidos.

Pregunta 10: ¿Cuál es la diferencia exacta en la concentración de Calcio (CaO) y en la etapa de aplicación recomendada entre el Soluvit Ca-B-Zn y el Soluvit Calcio?

Respuesta Esperada: El Soluvit Ca-B-Zn tiene 11.0% p/v de Calcio y se usa para polinización y cuajado. El Soluvit Calcio tiene el doble, 22.0% p/v, y se usa para calidad post-cosecha y firmeza.

Por qué es robusta: Ambos productos pertenecen a la misma línea y contienen "Calcio" o "Ca" en su nombre. El RAG debe ser capaz de perfilar cada uno sin mezclar sus porcentajes ni sus usos.

Pregunta 11: En la línea de bioestimulantes, hay dos productos que destacan por contener extracto de Ascophyllum nodosum. ¿Cuáles son y qué porcentaje de Zinc aporta cada uno?

Respuesta Esperada: Son Algarium Semilla SC, que aporta 30% p/v de Zinc, y Algarium +Micros, que aporta 2.6% de Zinc.

Por qué es robusta: Hace que el RAG filtre toda la Categoría A, ignore los productos de la familia "Ánimo" y extraiga un valor numérico específico (Zinc) solo de las coincidencias correctas.

Nivel 6: Deducción y Restricciones
Evalúa si el RAG entiende las reglas de nomenclatura del texto y procesa exclusiones.

Pregunta 12: Considerando la regla de nomenclatura de la línea Soluvit respecto a los g/L, ¿cuántos gramos por litro de Potasio (K2O) aporta el Soluvit 500K y cómo se refleja esto en su porcentaje p/v?

Respuesta Esperada: Aporta 500 g/L de Potasio (K2O), lo cual se refleja como un 50.0% p/v en su composición.

Por qué es robusta: Requiere que el sistema aplique la aclaración inicial ("El '500' refiere a la concentración en g/L") directamente a los datos de la composición del producto, validando si entiende la relación entre nombre y fórmula.

Pregunta 13: De los productos detallados que contienen aminoácidos libres, ¿cuál es el único que además indica un porcentaje específico de Ácido Glutámico y cuál es ese valor?

Respuesta Esperada: Es el producto Ánimo (Aminoácidos), y su valor es de 19 - 20% p/v de Ácido Glutámico.

Por qué es robusta: El sistema debe buscar todos los productos con aminoácidos (Ánimo, Ánimo Fortaleza, Ánimo Madurador) y discriminar cuál de ellos desglosa el Ácido Glutámico en su composición exacta.