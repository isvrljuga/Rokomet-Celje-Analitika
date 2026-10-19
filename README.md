# Rokomet Celje – analitika tekem

Odzivna spletna aplikacija za namizni in mobilni brskalnik. Uporablja lokalni `localStorage`; podatki niso samodejno sinhronizirani med napravami. Za uporabo na drugi napravi prenesite varnostno kopijo JSON in jo tam uvozite.

## Zagon

- Na računalniku: razširite ZIP in odprite `index.html`.
- Za namestitev kot PWA (ikona na začetnem zaslonu in delo brez povezave) aplikacijo objavite na HTTPS naslovu. Service worker je aktiven samo prek HTTPS ali localhost.
- Prvič odprite **Ekipa in igralke** ter dopolnite vratarke, ki jih Excelov indeks ne vsebuje.

## Funkcionalnosti

- Ločeni seznami članic in mladink, tekme ter možnost dodajanja igralk.
- Zapis strelov obeh ekip, štirih tipov asistenc, štirih tipov prekrškov, dveh tipov napak in dveh tipov dobljenih žog.
- Evidenca 7 m in izključitev, vratarke na golu ob strelih nasprotnic ter individualni čas z odbitkom za samo napad/obrambo.
- **Vnos v živo** (telefon in tablica): ob odprtju tekme celozaslonski vnos z dotiki – igralka → akcija → podrobnost, brez spustnih menijev. Ura tekme na gumb (start/pavza, ±1 min, polčas) samodejno določi minuto in četrtino; igralni čas se beleži z vstopom in izstopom. Gumb »Zapisnik« odpre klasični pogled (rezultat, zaključek tekme), »Vnos v živo« pa vrne nazaj.
- Zgodovina z večkratnim razveljavljanjem in brisanjem posamezne akcije.
- Skupni pregled, izvoz v dve začasni Excelovi delovni zvezki in JSON varnostna kopija.

## Obračun

Četrtine se razporedijo po vpisanem polčasu in minuti. Novi indeks uporablja uteži iz zavihka `Legenda` v predlogi. Stari indeks uporablja uteži iz predloge `stari index 2025`. Excelova lista trenutno povzemata podatke v kompatibilnih tabelah; še nista preslikana 1:1 v izvirne celice in oblikovanje klubskih predlog. Pred uradno uporabo jih je treba še uskladiti z obema predlogama.
