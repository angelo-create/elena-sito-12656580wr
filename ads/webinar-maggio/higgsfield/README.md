# Higgsfield generation pipeline

20 prompt JSON per generare scene di Elena con il modello **Soul** + character reference.

## Struttura

```
higgsfield/
├── character.json              ← config del character (reference + tratti)
├── manifest.json               ← mapping prompts → ads
├── README.md                   ← questo file
├── references/                 ← 8 foto reali per create_character
│   └── README.md               ← istruzioni copia
├── prompts/                    ← 20 prompt JSON (10 ads × 2 varianti A/B)
│   ├── ad-01-A-livingroom-cream.json
│   ├── ad-01-B-kitchen-coffee.json
│   └── ...
└── generated/                  ← output Higgsfield .webp
```

## Flow d'uso

### Step 1 — Prepara reference (una volta sola)

Copia 8 foto Elena in `references/` seguendo `references/README.md`:

```bash
cd ads/webinar-maggio/higgsfield/references
# eseguire i comandi cp dal README
```

### Step 2 — Crea il character su Higgsfield

Chiama `mcp__higgsfield__create_character` con:
- `name`: "Elena Giordani"
- `description`: vedi `character.json`
- `images`: i path delle 8 reference

Salva il `character_id` ritornato in `character.json` sotto `higgsfield_character_id`.

### Step 3 — Genera le 20 immagini

Per ogni prompt JSON in `prompts/`:
1. Sostituisci `{{ELENA_CHARACTER_ID}}` con l'ID reale
2. Chiama `mcp__higgsfield__generate_image` passando `prompt`, `negative_prompt`, `aspect_ratio`, `character_id`
3. Salva il risultato in `generated/{id}.webp`

### Step 4 — Polling status

Higgsfield generation è asincrona. Per ogni job ID, fai polling con `mcp__higgsfield__get_generation_status` finché `status: "completed"`.

### Step 5 — Integra nel template HTML

Ogni `ad-XX-Y-*.json` ha campo `ad_target` che indica il template HTML (`../ad-XX-*.html`).

Per usare l'immagine generata:
1. Copia `generated/ad-01-A-livingroom-cream.webp` → `../img/elena-gen-01A.webp`
2. Modifica `../ad-01-curiosity.html`: cambia `<img src="img/elena-01.webp">` in `<img src="img/elena-gen-01A.webp">`
3. Lancia `npm run render` nella cartella `ads/webinar-maggio/`

## Schwartz coverage

Dei 20 prompts:
- **4 Unaware** (#01 ×2, #05 ×2) — entrano dall'identità/lifestyle
- **6 Problem-Aware** (#02 ×2, #08 ×2, #09 ×2) — pain narrativo + emotivo
- **6 Solution-Aware** (#03 ×2, #06 ×2, #10 ×2) — mechanism + contrarian
- **4 Product-Aware** (#04 ×2, #07 ×2) — autorità Elena + community

## Regole copy nei prompt

✅ **OK nel prompt:** scena, persona, abbigliamento, luce, lente, mood, palette colori, sfondo, posa
❌ **MAI nel prompt:** testo italiano, scritte, headline, logo, parole, signage leggibile, font

Higgsfield/Soul storpia il testo italiano. Il testo va aggiunto sopra in CSS con il template HTML esistente.

## Costo stimato

20 generazioni × ~$0.05-0.15 ciascuna su Higgsfield = ~$1-3 totali per la prima passata.
Iterare le varianti che non vengono bene = +50% buffer.
