# Full-Creative Prompts (creative finite con scritte)

20 prompt JSON che generano l'**intera ad finita** — foto Elena + headline + sub + CTA + date — in un unico output Higgsfield. Caricabile direttamente in Meta Ads.

## Differenza vs `prompts/`

| | `prompts/` | `prompts-full-creative/` |
|---|---|---|
| Cosa genera | Solo scena Elena (no testo) | Ad completa con scritte |
| Workflow | Higgsfield → HTML template → Puppeteer screenshot | Higgsfield → upload diretto Meta |
| Controllo testo | Totale (Poppins CSS) | Limitato (dipende da Soul) |
| Riproducibilità | 100% identico | Variabile, può servire rigenerare |
| Costo | 1 generazione per scena | 3-5 generazioni medie per ad |
| Modificabilità copy | Cambi HTML, riprovi → 0$ | Cambi prompt, rigeneri → $ |

## Disclaimer importante (devi leggere)

Soul (basato su Flux/SDXL) **rende il testo italiano in modo imperfetto**. Aspettati:

- **Accenti storpiati** → tutti i prompt usano testo SENZA accenti (PIU al posto di PIÙ, E al posto di È, ecc.). Il rendering risulta più affidabile.
- **Lettere distorte** in headline lunghi → meglio headline brevi e maiuscole.
- **Variabilità** → ogni generazione produce risultato diverso. Conta su 3-5 tentativi per ad per averne uno usabile.
- **Layout drift** → Soul interpreta il layout in modo libero. Il "vertical split 50/50" può diventare 60/40 o full-bleed.

**Quando questo workflow ha senso:**
- Vuoi varietà visiva super alta in poco tempo
- Hai budget per generare 60-100 immagini per averne 20 ottime
- Accetti che le scritte abbiano un'estetica "AI" piuttosto che pixel-perfect

**Quando NON ha senso:**
- Hai bisogno di typography pixel-perfect (usa `prompts/` + HTML template)
- Vuoi A/B testare 5 copy diverse → cambia HTML, non rigenerare 5×$
- Devi rispettare brand-book stretto su font/colori

## Anatomia di un prompt full-creative

Ogni JSON è strutturato per dare a Soul tutte le informazioni in un solo prompt:

```
1. LAYOUT — split vertical 50/50, full-bleed, etc.
2. LEFT HALF / FULL FRAME — descrizione fotografica scena Elena
3. RIGHT HALF / OVERLAY — descrizione text composition
4. TEXT CONTENT — il testo esatto da rendere (uppercase, no accenti)
5. TYPOGRAPHY — Poppins / Inter, weight, size
6. COLOR PALETTE — hex code specifici
7. STYLE REFERENCE — "Vogue Italia editorial meets Nike ad"
8. NEGATIVE PROMPT — misspelled, garbled, accent errors, ecc.
```

## I 20 prompt mappati alle 10 ads

| File | Ad | Layout | Schwartz |
|---|---|---|---|
| 01-A-livingroom-cream | ad-01 | Split cream + photo sx | Unaware |
| 01-B-kitchen-coffee | ad-01 | Split cream + photo sx | Unaware |
| 02-A-window-thoughtful | ad-02 | Split cream + photo sx | Problem |
| 02-B-reading-book | ad-02 | Split cream + photo sx | Problem |
| 03-A-stat-poster | ad-03 | Stat poster centered | Solution |
| 03-B-stat-poster-warm | ad-03 | Stat poster warm tone | Solution |
| 04-A-authority-darkroom | ad-04 | Split dark + photo sx | Product |
| 04-B-authority-stage | ad-04 | Split dark + photo sx | Product |
| 05-A-yoga-mat | ad-05 | Split cream + photo sx | Unaware |
| 05-B-walking-street | ad-05 | Split cream + photo sx | Unaware |
| 06-A-method-fitness | ad-06 | Split dark + photo sx | Solution |
| 06-B-method-coaching | ad-06 | Split dark + photo sx | Solution |
| 07-A-stage-applause | ad-07 | Full-bleed + overlay | Product |
| 07-B-hugging-attendee | ad-07 | Full-bleed + overlay | Product |
| 08-A-mirror-reflection | ad-08 | Full-bleed + overlay | Problem |
| 08-B-pensive-event | ad-08 | Full-bleed + overlay | Problem |
| 09-A-pain-bench | ad-09 | Split dark + photo sx | Problem |
| 09-B-pain-stool-direct | ad-09 | Split dark + photo sx | Problem |
| 10-A-no-miracoli | ad-10 | Split dark + photo sx | Solution |
| 10-B-no-miracoli-realtalk | ad-10 | Split dark + photo sx | Solution |

## Come si usa

1. **Crea il character** (Step 1-2 del README parent): `mcp__higgsfield__create_character` con le 8 reference, salva ID
2. **Sostituisci** `{{ELENA_CHARACTER_ID}}` in tutti i 20 file con l'ID reale
3. Per ogni file:
   ```
   mcp__higgsfield__generate_image({
     prompt: file.prompt,
     negative_prompt: file.negative_prompt,
     character_id: file.character_id,
     aspect_ratio: "1:1",
     resolution: "1080x1080"
   })
   ```
4. Polling con `mcp__higgsfield__get_generation_status`
5. Salva l'output in `generated/{file.id}.webp`

## Tips per ottenere creative usabili

1. **Genera 3-5 varianti** per ogni prompt — Soul è non-deterministic
2. **Iterazioni**: se il testo è storpiato, riformula il prompt accorciandolo
3. **Riusa i seed** che funzionano (alcuni endpoint Soul accettano seed parameter)
4. **Maiuscole** > minuscole (rendering più affidabile)
5. **No accenti italiani** (sostituiti con vocale semplice nel prompt)
6. **Headline sotto 8 parole** rendono meglio
7. **Una sola dimensione font dominante** in headline (no mix 60+40+30 nello stesso testo)

## Plan B se non vengono bene

Se dopo 3-5 generazioni una variante non rende il testo correttamente:
1. Usa la corrispondente da `prompts/` (solo scena)
2. Salva in `img/elena-gen-XX.webp`
3. Inseriscila nel template HTML che ti garantisce typography pixel-perfect
4. Render con `npm run render`

I template HTML sono già pronti in `ads/webinar-maggio/`.
