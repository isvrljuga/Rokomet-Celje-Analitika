# Klepet z analitikom – namestitev posrednika na Cloudflare

Posrednik (`worker.js`) sprejme vprašanje iz aplikacije, preveri, da je uporabnik prijavljen
(Firebase račun projekta `rokomet-celje`), omeji število vprašanj na dan in vprašanje skupaj s
tabelami ekipe pošlje odprtokodnemu modelu v Cloudflare Workers AI. Ključev ni treba nikamor vpisovati.

## 1. Ustvari Worker
1. Prijavi se na <https://dash.cloudflare.com> (brezplačen račun zadošča).
2. **Compute (Workers) → Workers & Pages → Create → Create Worker** (»Hello World«).
3. Ime: `celje-klepet` → **Deploy**.
4. **Edit code**: izbriši vso vsebino, prilepi celotno vsebino datoteke `chat-worker/worker.js` → **Deploy**.

## 2. Poveži model (obvezno)
**Settings → Bindings → Add binding → Workers AI** → ime spremenljivke: `AI` → **Add binding / Deploy**.

## 3. Dnevna omejitev vprašanj (priporočeno)
1. **Storage & Databases → KV → Create namespace** → ime `celje-klepet-omejitev`.
2. V Workerju: **Settings → Bindings → Add binding → KV namespace** → ime spremenljivke `CHAT_KV`, izberi zgornji namespace.

Privzeto ima vsak prijavljen uporabnik 30 vprašanj na dan.

## 4. Neobvezne nastavitve (Settings → Variables and Secrets, tip »Text«)
| Ime | Pomen | Privzeto |
|---|---|---|
| `MODEL` | Model iz kataloga Workers AI (AI → Models, kategorija Text Generation) | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| `DAILY_LIMIT` | Število vprašanj na uporabnika na dan | `30` |
| `ALLOWED_ORIGINS` | Naslovi aplikacije, ločeni z vejico | `https://isvrljuga.github.io` |

Če privzetega modela v katalogu ni več, izberi drug večji »instruct« model (npr. Llama, Qwen ali Mistral) in
njegovo ime vpiši v `MODEL`. Koda se ne spremeni.

## 5. Vklopi klepet v aplikaciji
Naslov Workerja je na njegovi strani (npr. `https://celje-klepet.<tvoje-ime>.workers.dev`).
Vpiši ga v `firebase-config.js` pod `chatUrl` in objavi. Okno »Vprašaj analitika« se prikaže na
prvi strani samo prijavljenim uporabnikom.

## Stroški
Workers in Workers AI imata brezplačno dnevno kvoto. Ena ekipa pošlje približno 2.000–3.000 tokenov
podatkov na vprašanje. Porabo vidiš v Cloudflare pod **AI → Workers AI**.
