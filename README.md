# Rokomet Celje – analitika tekem

Odzivna spletna aplikacija za namizni in mobilni brskalnik. Podatki se shranjujejo v `localStorage` naprave. Ko je nastavljena **skupna baza** (Firebase, glej spodaj), se tekme samodejno delijo: vsak s povezavo jih gleda v živo, prijavljeni (Google račun ali katerikoli e-poštni naslov z geslom) jih vnašajo, briše jih samo skrbnik.

## Zagon

- Na računalniku: razširite ZIP in odprite `index.html`.
- Za namestitev kot PWA (ikona na začetnem zaslonu in delo brez povezave) aplikacijo objavite na HTTPS naslovu. Service worker je aktiven samo prek HTTPS ali localhost.
- Prvič odprite **Ekipa in igralke** ter dopolnite vratarke, ki jih Excelov indeks ne vsebuje.

## Skupna baza (Firebase)

1. Na https://console.firebase.google.com ustvari projekt in vanj dodaj spletno aplikacijo (`</>`). Vrednosti iz `firebaseConfig` prepiši v `firebase-config.js`.
2. **Authentication → Sign-in method**: vklopi **Google** in **Email/Password**. V **Authentication → Settings → Authorized domains** dodaj `isvrljuga.github.io`.
3. **Firestore Database → Create database** (production mode), nato v zavihek **Rules** prilepi vsebino `firestore.rules`.
4. Odpri aplikacijo, se prijavi in v zavihku **Izvoz** prepiši svoj ID v `adminUids` v `firebase-config.js` in namesto `SKRBNIK_ID` v pravilih (Rules → Publish).

Tekme se delijo s povezavo `…/#tekma=<id>` (gumb »Kopiraj povezavo« na tekmi). Tekme, uvožene iz Excela, ostanejo lokalne.

## Funkcionalnosti

- Ločeni seznami članic in mladink, tekme ter možnost dodajanja igralk.
- Zapis strelov obeh ekip, štirih tipov asistenc, štirih tipov prekrškov, dveh tipov napak in dveh tipov dobljenih žog.
- Evidenca 7 m in izključitev, vratarke na golu ob strelih nasprotnic ter individualni čas z odbitkom za samo napad/obrambo.
- **Vnos v živo** (telefon in tablica): ob odprtju tekme celozaslonski vnos z dotiki – igralka → akcija → podrobnost, brez spustnih menijev. Ura tekme na gumb (start/pavza, ±1 min, polčas) samodejno določi minuto in četrtino; igralni čas se beleži z vstopom in izstopom. Gumb »Zapisnik« odpre klasični pogled (rezultat, zaključek tekme), »Vnos v živo« pa vrne nazaj.
- **Menjave in izključitve** v vnosu v živo: ob novi tekmi izbereš začetno postavo, na zaslonu »Menjave« tapneš, kdo gre ven in kdo noter (igralni čas se zapiše sam). Izključitev 2 min / 4 min / rdeči pošlje igralko na klop z odštevanjem po uri tekme; po izteku se vrne ista ali druga igralka. Več izključitev hkrati je podprtih.
- Zgodovina z večkratnim razveljavljanjem in brisanjem posamezne akcije.
- Skupni pregled, izvoz v dve začasni Excelovi delovni zvezki in JSON varnostna kopija.

## Obračun

Četrtine se razporedijo po vpisanem polčasu in minuti. Novi indeks uporablja uteži iz zavihka `Legenda` v predlogi. Stari indeks uporablja uteži iz predloge `stari index 2025`. Excelova lista trenutno povzemata podatke v kompatibilnih tabelah; še nista preslikana 1:1 v izvirne celice in oblikovanje klubskih predlog. Pred uradno uporabo jih je treba še uskladiti z obema predlogama.

## Benchmark Lige prvakinj (EHF)

Zavihek »Analiza tekem« primerja Celje in njihove nasprotnice s povprečjem ekipe v EHF Ligi prvakinj (`ehf-benchmark.json`).

- `tools/ehf_pdf.py` poišče aktualno sezono na strani EHF in prenese statistiko (Online Statistics) ter zapisnik vsake odigrane tekme v mapo `ehf-pdf/`. Že prenesene preskoči.
- `tools/ehf_stat.py ehf-pdf ehf-benchmark.json` iz statistik prebere pregled tekme, izid strelov, strele in obrambe po pozicijah, asistence, ukradene žoge in bloke ter izračuna povprečja.
- GitHub Action `EHF benchmark` (`.github/workflows/ehf-benchmark.yml`) to naredi vsak ponedeljek in posodobljen `ehf-benchmark.json` shrani v `main`. Ročno: Actions → EHF benchmark → Run workflow. Vsi PDF-ji so pri zagonu na voljo kot artifact za prenos (30 dni).

EHF v sezoni 2026-27 ne beleži prodorov in protinapadov posebej (prišteti so k 6 m) in ne objavlja prekrškov razen 7 m in izključitev.
