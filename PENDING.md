# PENDING — Aleph Redesign v3

Tracker vivo entre sesiones. Leer SIEMPRE al iniciar una sesión nueva.
Última actualización: 2026-06-27

---

## CÓMO INICIAR CADA SESIÓN NUEVA

```
"Lee PENDING.md y DESIGN.md en C:\Chatbot-final-jandir\Chatbot_Rag_final.
Continuamos el redesign de Aleph. Siguiente vista: [nombre]."
```

---

## ESTADO ACTUAL

### ✅ COMPLETADO
- [x] HTML Preview aprobado — `docs/redesign/preview.html`
- [x] DESIGN.md v3 reescrito (light-first, teal, shadcn/ui, jerarquía)
- [x] Memoria de sesión guardada en `~/.claude/projects/.../memory/`
- [x] Plan de implementación completo (14.5 bloques, 8 vistas)

### ✅ FASE 0 — FUNDACIÓN (COMPLETADA)

```
[x] 1. shadcn/ui init formal (components.json) — creado manualmente
[x] 2. globals.css con CSS custom properties del DESIGN.md v3
[x] 3. tailwind.config.ts con tokens semánticos nuevos (surface-2/3, brand, shadows, radius)
[x] 5. app/lib/utils.ts (helper cn) — ya existía correcto
[x] 6. app/lib/motion.ts (variants framer-motion reutilizables) — creado
[x] 7. Fonts en layout.tsx — ya correctas (Space Grotesk + Inter + DM Mono)
[x] 4. Instalar componentes shadcn base — 24 componentes instalados ✅
```

**shadcn components (ejecutar en frontend/ con red doméstica):**
```bash
yarn dlx shadcn@latest add button card input label textarea select badge dialog sheet command tabs separator skeleton avatar tooltip dropdown-menu scroll-area progress slider popover table form calendar sonner
```

### 🔄 FASE ACTUAL: 1 — DASHBOARD

---

## ROADMAP

| # | Vista | Estado | Bloques |
|---|-------|--------|---------|
| 0 | Fundación (bases) | ✅ LISTO* | 1 |
| 1 | Dashboard | ⏳ | 1.5 |
| 2 | Conversaciones | ⏳ | 2 |
| 3 | Corpus | ⏳ | 1.5 |
| 4 | Observabilidad | ⏳ | 1.5 |
| 5 | Settings | ⏳ | 2 |
| 6 | Inbox/Kanban (NUEVO) | ⏳ | 2 |
| 7 | Auth | ⏳ | 1 |
| 8 | Chat Widget embed | ⏳ | 2 |
| **Total** | | | **~14.5** |

---

## FLUJO POR VISTA (cada sesión)

1. Jandir manda capturas de la vista actual
2. Claude hace HTML preview → `docs/redesign/preview-[vista].html`
3. Jandir aprueba o ajusta
4. Claude implementa en código (Next.js TSX)
5. `ecc:code-reviewer` automático después de implementar
6. Jandir valida en browser

---

## ARCHIVOS CLAVE

| Archivo | Propósito |
|---------|-----------|
| `DESIGN.md` | Biblia de diseño — leer siempre al inicio |
| `PENDING.md` | Este archivo — tracker |
| `docs/redesign/preview.html` | Preview visual aprobado (referencia) |
| `frontend/tailwind.config.ts` | Tokens de diseño |
| `frontend/src/app/globals.css` | CSS custom properties |
| `frontend/components.json` | Config shadcn/ui |

---

## DECISIONES TOMADAS (no re-debatir)

| Decisión | Elegida |
|----------|---------|
| Modo por defecto | Light-first |
| Componentes | shadcn/ui |
| Brand color | Teal #0d9488 |
| Tipografía | Space Grotesk + Inter + DM Mono |
| Settings pattern | Sidebar interno + sheets (NO sábana) |
| Iconos | Lucide React (ya instalado) |
| Animaciones | framer-motion (ya instalado) |

---

## BLOQUEADOR BUILD (red corp)

Fortinet MITM → `yarn install` falla en red corporativa.
Solución: red doméstica o hotspot móvil para cualquier `yarn add` o `shadcn init`.

---

## NOTAS

- Backend Python/FastAPI: NO tocar en este redesign
- Settings: jerarquía grandes/chicos/popups/contenedores — NO sábana de cajas
- Cada color tiene UN dominio funcional — ver DESIGN.md §2
- Preview HTML aprobado es la referencia visual para todo el redesign
