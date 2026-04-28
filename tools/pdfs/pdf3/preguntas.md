Perfecto.
Aquí tienes **preguntas listas para probar tu RAG**, separadas por nivel y con **la respuesta que el sistema debería devolver si todo está funcionando correctamente** según tu documento.

---

# 🟢 **Nivel 1 — Preguntas simples (respuestas textuales exactas)**

### **1. ¿Quién lidera la fase 2 del proyecto Titán?**

**Respuesta esperada:**
➡️ *Ricardo Fuentes.*

---

### **2. ¿Cuándo es la fecha límite para completar la fase 2 del proyecto Titán?**

**Respuesta esperada:**
➡️ *El 15 de febrero de 2026.*

---

### **3. ¿Cuál es el presupuesto asignado para la fase 2 del proyecto Titán?**

**Respuesta esperada:**
➡️ *$120,000.*

---

### **4. ¿Cuánto se quiere mejorar la velocidad de consulta en el proyecto Titán?**

**Respuesta esperada:**
➡️ *Un 30%.*

---

### **5. ¿En qué trimestre se reanudará el proyecto Aurora?**

**Respuesta esperada:**
➡️ *En el Q2 de 2026.*

---

# 🟡 **Nivel 2 — Preguntas intermedias (requieren relacionar 1–2 líneas)**

### **6. ¿Quién es la Gerente de Producto del proyecto Aurora?**

**Respuesta esperada:**
➡️ *Ana Valdés.*

---

### **7. ¿Cuál es el modelo oficial de trabajo híbrido a partir del 1 de enero de 2026?**

**Respuesta esperada:**
➡️ *3 días en oficina (lunes, martes, jueves) y 2 días remotos.*

---

### **8. ¿Qué departamentos están exentos del modelo híbrido?**

**Respuesta esperada:**
➡️ *Ingeniería y Soporte al Cliente.*

---

### **9. ¿Cuál es el límite de gastos de comida según la política FIN-012?**

**Respuesta esperada:**
➡️ *$75 por día.*

---

### **10. ¿En cuántos días deben enviarse los reembolsos de viaje?**

**Respuesta esperada:**
➡️ *Dentro de los 15 días posteriores al viaje.*

---

# 🔵 **Nivel 3 — Preguntas complejas (requieren mezclar varios puntos)**

### **11. Resume el estado actual de los proyectos Titán y Aurora.**

**Respuesta esperada:**
➡️ *Titán: Fase 2 en curso, liderada por Ricardo Fuentes, con deadline 15/02/2026, presupuesto $120K y objetivo +30% velocidad.*
➡️ *Aurora: Pausado temporalmente, reevaluación de backend, se reanuda en Q2 2026, liderado por Ana Valdés.*

---

### **12. ¿Qué políticas nuevas de RR.HH. fueron anunciadas?**

**Respuesta esperada:**
➡️ *Política de Trabajo Híbrido HR-099.*
➡️ *Política de Reembolso de Gastos FIN-012.*

---

### **13. Explica los principales cambios introducidos por la política HR-099.**

**Respuesta esperada:**
➡️ *Nuevo modelo híbrido: 3 días oficina (lunes, martes, jueves), 2 remotos.*
➡️ *Exentos: Ingeniería y Soporte al Cliente.*

---

### **14. ¿Qué medidas de seguridad se implementarán próximamente?**

**Respuesta esperada:**
➡️ *Instalación automática de Sentinel V3 el lunes.*
➡️ *2FA obligatorio para acceder a la red Omega, usando AuthSecure.*

---

# 🔴 **Nivel 4 — Preguntas trampas (para validar chunking y comprensión)**

### **15. ¿Quién lidera el proyecto Aurora en la fase 2?**

**Respuesta correcta:**
➡️ *Nadie. Aurora no tiene fase 2; la fase 2 es del proyecto Titán.
Aurora es gestionado por Ana Valdés.*

---

### **16. ¿El proyecto Titán está en pausa?**

**Respuesta correcta:**
➡️ *No. Titán está en fase 2 de migración en curso.
El que está pausado es Aurora.*

---

### **17. ¿Qué software se instalará el próximo lunes?**

**Respuesta esperada:**
➡️ *Sentinel V3.*

---

### **18. ¿Se requiere 2FA para todos los usuarios?**

**Respuesta esperada:**
➡️ *Se requiere 2FA para acceder a la red Omega.*

---

¿Quieres que te genere un **archivo PDF de testing automático**,
o un **script de pruebas** para ejecutar todas estas preguntas contra tu API?
