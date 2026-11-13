# Case panel: Volaris

## English (main)

**Headline:** A contract engineering couldn't misread

**Problem**
On Volaris's booking app (Android and iOS), Figma, specs, and code each told a different story about the same component in a booking flow. Several design systems overlapped, so nobody could tell which one was the source of truth. Every gap got reinterpreted downstream, and reworked.

**What I did**
As Product Strategist (Q4 2026), I was the sole approver: I cleaned up the Figma file, verified it against the existing booking flow implementation, and turned each component into an explicit sealed contract between design and code. AI agents helped draft and audit; I reviewed and sealed every one myself. No code was delivered. The deliverables: sealed contracts, markdown verification reports, and a Figma handoff.

**Result**
10 sealed contracts shipped to engineering on Oct 1, 2026. Full flow: before, 1 to 2 days to about 2 hours, on both Android and iOS. Engineering has already implemented it: what used to take a couple of weeks took just days with the contracts. Leadership gave it the green light as a standard process for projects facing similar problems.

**Then I scaled it**
With that green light, I built a methodology to scale it to the rest of the team:
- Skills to speed up the process (before, 1 to 2 days to about 2 hours, on both Android and iOS)
- A course list for accelerated training
- Shadowing and workshops with key people on the project
- Alignment with leadership and the client for proper adoption

**The rule**
Design and code never sync directly. Both pass through the sealed contract first.

*The goal wasn't zero defects. It was zero guessing.*

## Español (tú)

**Titular:** Un contrato que ingeniería no podía malinterpretar

**Problema**
En la app de reservas de Volaris (Android e iOS), Figma, las specs y el código contaban historias distintas del mismo componente dentro de un flujo de reservas. Varios sistemas de diseño se superponían, así que no quedaba claro cuál mandaba. Cada vacío se reinterpretaba más adelante, y eso traía retrabajo.

**Lo que hice**
Como Product Strategist (Q4 2026), yo era el único que aprobaba: limpié el archivo de Figma, lo verifiqué contra la implementación existente del flujo de reservas, y convertí cada componente en un contrato sellado explícito entre diseño y código. Agentes de IA ayudaron con borradores y auditorías; cada contrato lo revisé y sellé yo mismo. No se entregó código. Los entregables: contratos sellados, informes markdown de verificación y el handoff en Figma.

**Resultado**
10 contratos sellados pasaron a ingeniería el 1 de octubre de 2026. Flujo completo: antes, de 1 a 2 días a unas 2 horas, tanto en Android como en iOS. Ingeniería ya lo implementó: lo que antes le tomaba un par de semanas, con los contratos tomó apenas días. Liderazgo le dio luz verde como proceso estándar para proyectos con problemas similares.

**Luego lo escalé**
Con esa luz verde, armé una metodología para escalarlo al resto del equipo:
- Skills para acelerar el proceso
- Una lista de cursos para entrenamiento acelerado
- Shadowing y talleres con personas clave del proyecto
- Alineación con liderazgo y el cliente para una adopción adecuada

**La regla**
Diseño y código nunca se sincronizan directo. Ambos pasan primero por el contrato sellado.

*La meta no era evitar errores. Era evitar que alguien tuviera que adivinar.*

## Placeholders & NDA items
- Not included: no approved direct quote from Adonay exists yet — add one if/when approved.
