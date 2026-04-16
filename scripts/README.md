# scripts/

## build-css.js

Concatena i file sorgente CSS in `css/main.css` (l'unico CSS effettivamente incluso dalle pagine).

### Uso

```bash
npm run build:css          # rigenera css/main.css
npm run build:css:check    # non modifica niente, exit 1 se drift
```

### Perché esiste

Il commento in cima a `css/main.css` (`/* Elena Giordani - Bundled CSS */`) indica che è un bundle dei file in `css/` e `css/components/`, ma finora la concatenazione è stata fatta **a mano**. Questo script formalizza il processo in modo che:

- modifiche vadano fatte solo nei sorgenti (`css/components/*.css`, `css/variables.css`, `css/base.css`);
- un solo comando rigeneri il bundle.

### ⚠️ Drift attuale (noto)

Al 2026-04-16, `css/main.css` in repo **differisce** dalla concatenazione dei sorgenti attuali. Esempio più grosso: `css/components/hero.css` ha una versione più nuova (con `.hero-vignette`, filtri aggiornati, gradient più morbido) che **non** è ancora nel bundle.

Eseguire `npm run build:css` oggi applicherebbe queste versioni nuove alla produzione. **Verificare visivamente** le pagine (in particolare hero) prima di committare il bundle rigenerato.

### Reconciling drift — procedura suggerita

1. `npm run build:css:check` → segnala che c'è drift.
2. `git diff --stat HEAD -- css/main.css` (dopo aver rigenerato con `npm run build:css`) per vedere lo scope.
3. Aprire localmente `index.html`, `percorso-coach.html`, `chi-sono.html` e verificare che la resa sia quella attesa.
4. Se qualche sezione regredisce, capire se la versione "buona" sia nel bundle attuale o nel componente sorgente, e allineare il componente a quel che si vuole tenere.
5. Dopo il primo commit del bundle rigenerato, aggiungere `npm run build:css` come pre-commit hook o step CI per evitare regressioni future.

### Aggiungere un nuovo file CSS

Modifica `MANIFEST` in `build-css.js` e aggiungi il path relativo a `css/`. Poi `npm run build:css`.
