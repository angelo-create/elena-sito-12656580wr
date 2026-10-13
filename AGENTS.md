# Sito Elena Giordani (X-Fit Academy)

Istruzioni per gli agenti che lavorano in questo repo (Claude Code, Codex e altri).
Si lavora con Angelo Allocca, marketer di Elena Giordani (life coach fitness per donne 35-65). Rispondi in italiano.

## Il repo

- Sito statico HTML/CSS/JS su Vercel, progetto `elena-sito-12656580wr`. Nessun framework e nessuna build delle pagine: ogni pagina è un file `.html` nella root.
- `api/`: funzioni serverless Node (Stripe, GoHighLevel, Meta CAPI, form lead). Prima di toccare un endpoint leggi `api/README.md` (regole GHL e runbook dei webhook Stripe).
- `css/main.css` è un bundle generato: modifica i sorgenti (`css/variables.css`, `css/base.css`, `css/components/*.css`) e ricompila. Mai editare `main.css` a mano. Dettagli in `scripts/README.md`.
- `vercel.json`: redirect delle landing, header, cron dei webhook.
- `scripts/`, `tests/`, `ads/`, `archive/` e `.context/` non vanno in produzione (`.vercelignore`).

## Comandi

- `npm run build:css:check` prima di ricompilare (segnala modifiche fatte a mano nel bundle), poi `npm run build:css`.
- Test: `node --test tests/*.test.cjs`.
- Variabili d'ambiente: `vercel env pull` dal progetto `elena-sito-12656580wr`. Mai stampare token o secret, né in chat né nei file.

## Domini

- `www.elenagiordani.com`: sito ufficiale. È l'URL da dare ad Angelo.
- `go.elenagiordani.com`: le stesse pagine di questo repo, usato per le landing dei funnel (noindex). Le landing webinar si modificano qui, per esempio `webinar-agosto.html`.
- `lp.elenagiordani.com`: landing su GoHighLevel, fuori da questo repo.

## Deploy

- Push su `main` = deploy in Production automatico in pochi secondi. Niente PR, niente promote.
- Mai commit o push senza richiesta. A fine lavoro su file del sito chiedi: "Lo aggiorniamo anche sul sito web?"
- Se la risposta è sì: `git add` dei soli file del lavoro (mai `-A`), commit, push, poi verifica l'URL con `curl`.
- Tutto ciò che è committato e non escluso da `.vercelignore` diventa pubblico sul dominio. Documenti interni (brief, docx, analisi, export del CRM) restano in `.context/` o fuori dal repo.

## Workspace Conductor

- Clone base: `~/conductor/repos/elena-sito-12656580wr`. Workspace: worktree in `~/conductor/workspaces/elena-sito-12656580wr/<città>`. Il lavoro sul sito si fa in `athens`, che tiene `main`.
- Il clone base e `athens` condividono `main`. Quando `athens` committa, nel clone base `git status` mostra modifiche al contrario (le versioni vecchie dei file) che non sono lavoro reale. Da lì non si committa, perché il commit riporterebbe il sito indietro. Il clone base serve per le analisi in `.context/`.
- Per riallinearlo: controlla che nessun file del sito sia stato modificato lì dopo l'ultimo commit di `main`, poi `git reset --hard HEAD`. `.context/` e i file non tracciati restano.
- I branch `angelo-create/*` restano spesso molto indietro rispetto a `main`. Prima di portare qualcosa su `main` controlla `git rev-list --left-right --count origin/main...HEAD` e porta solo i file del lavoro.
- I workspace paralleli possono committare file vecchi, soprattutto `css/main.css`: se il diff è molto più grande del lavoro fatto, non committarlo.

## GoHighLevel e Stripe

- Nelle analisi il CRM si legge e basta: nessuna scrittura senza richiesta esplicita.
- Mai passare `tags` a `POST /contacts/upsert`: sostituisce tutti i tag del contatto. Fai l'upsert senza tag, poi `POST /contacts/{id}/tags`.
- Gli UTM vanno sia in `attributionSource` sia nei custom field, con `api/_lib/build-utm-payload.js`.
- Calendari: "Consulenza Sbloccata Marco" = call di vendita con il setter. "One to one Elena" = cliente iscritta.
- Webhook Stripe di Club e OTO: endpoint e secret separati (`STRIPE_WEBHOOK_SECRET_CLUB`, `STRIPE_WEBHOOK_SECRET_OTO`). Mai lo stesso secret per due endpoint.

## Copy

- Niente em dash (—) e niente en dash usato come pausa: due punti, virgola, oppure punto e frase nuova.
- Voce di Elena: la fonte ufficiale è `~/.claude/skills/elena-tov/SKILL.md`. Usala per ogni testo a nome suo.
- Mai la cifra dell'Academy in chat, email o landing, nemmeno come forchetta: la dà Marco in call.
- I webinar sono sempre registrati: per l'urgenza usa "Posti limitati", mai "non viene registrato".
- La X-Fit Academy è un percorso annuale con ingressi mensili a posti limitati.
- Non cambiare titolo e sottotitolo del primo schermo delle landing webinar senza un A/B test: sono validati.
- Per offerte, funnel, ads e vendita il riferimento sono i framework di Alex Hormozi.

## Report e analisi

- Le analisi vivono in `.context/`, che non è in git. Ultima: `.context/crm-chat-2026-10-12/` (chat GO e Sfida, fonte delle call dal form calendario).
- Nessun dato personale nei report: ID abbreviati a 6 caratteri, nomi sostituiti da [Nome].
