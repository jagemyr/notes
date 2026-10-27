# Standard Notes-plugins

Egna plugins till [Standard Notes](https://standardnotes.com), publicerade med GitHub Pages på
<https://jagemyr.github.io/notes/>.

## Plugins

| Plugin | Typ | Installationsadress |
|---|---|---|
| Todo | Editor | `https://jagemyr.github.io/notes/todo/ext.json` |
| NWO | Editor | `https://jagemyr.github.io/notes/nwo/ext.json` |
| Testeditor | Editor | `https://jagemyr.github.io/notes/test-editor/ext.json` |

## Todo

- Avbockade uppgifter stryks över och samlas under **Klara** längst ner.
- Välj vem uppgiften gäller. Knapparna överst filtrerar listan per person, och filtret sparas per enhet.
  Nya uppgifter får den person som är vald i filtret.
- **Alla** i Vem-listan betyder hela familjen: uppgiften syns i allas filter och den som gör den bockar av den för alla.
- Personerna heter Pappa, Mamma, Dotter och Son från början. Pennan sist i raden byter namn,
  lägger till eller tar bort personer. **Egna namn sparas i anteckningen** (krypterad i Standard Notes),
  aldrig i koden eller i det här repot.
- Tryck på en uppgift för att ändra text, person, datum och upprepning.
- Upprepning: dagligen, vardagar, varje vecka, varannan vecka, varje månad, varje år.
  En avbockad återkommande uppgift står överstruken tills nästa datum och kommer då tillbaka oavbockad.
- **Rensa** tar bort klara engångsuppgifter (bara de som syns i filtret). Återkommande uppgifter ligger kvar.
- **Deluppgifter:** tryck på en uppgift och lägg till deluppgifter, var och en med egen person.
  Klara deluppgifter stryks över och hamnar längst ner, så att de återstående står överst.
  Huvuduppgiften visar framsteg (t.ex. 2/4 klara) och bockas av automatiskt när alla deluppgifter är klara;
  bockar man av huvuduppgiften bockas alla deluppgifter av. Med ett filter valt syns bara personens egna
  deluppgifter, och när de är klara hamnar uppgiften under Klara för den personen.
  En återkommande huvuduppgift nollställer sina deluppgifter när den kommer tillbaka.
- **Noteringar:** tryck på en uppgift eller deluppgift och skriv i fältet Notering. Noteringen visas under
  uppgiften och sparas som rader som börjar med `>`.

Uppgifterna sparas som vanlig text i anteckningen, en per rad, så de går att läsa även i andra editorer:

```
👥 Pappa, Mamma, Dotter, Son
- [ ] Köp mjölk
- [ ] Ta ut soporna 👤 Son 🔁 varje vecka 📅 2026-10-20
- [ ] Städdag 🔁 varje vecka
  - [ ] Dammsuga 👤 Son
  - [x] Handla 👤 Pappa ✅ 2026-10-18
- [ ] Boka tid hos tandläkaren
  > Ring före kl 12.
  > Kom ihåg försäkringskortet.
- [x] Ring tandläkaren ✅ 2026-10-18
```

Raden med 👥 skrivs bara när personerna har ändrats från standard. Rader som inte är uppgifter blir uppgifter när listan sparas.

## NWO

En mall med fyra fält: **Företag**, **Vara**, **Fraktbolag** och **Bedömt levdatum**.

- Fraktbolag fylls i fritt, med förslag (PostNord, DHL, Budbee, Instabox med flera).
- Bedömt levdatum väljs i en datumväljare. Under fältet står veckodag och hur långt det är kvar
  (t.ex. *Tisdag 3 november · om 7 dagar*). Passerade datum visas i rött.
- Enter hoppar till nästa fält.
- Anteckningslistan visar vara, företag, fraktbolag och datum, t.ex. *Skruvdragare · Exempelbolaget · PostNord · lev 3 nov*.

Fälten sparas som vanlig text i anteckningen, en rad per fält, så de går att läsa även i andra editorer:

```
Företag: Exempelbolaget
Vara: Skruvdragare
Fraktbolag: PostNord
Bedömt levdatum: 2026-11-03
```

Rader som inte är fält ligger kvar oförändrade under fälten. Ett datum som skrivits på annat sätt än ÅÅÅÅ-MM-DD
behålls och visas under datumfältet tills ett nytt datum väljs.

## Installera

1. Öppna Standard Notes → **Preferences → Plugins**.
2. Välj **Install Custom Plugin** och klistra in installationsadressen.
3. Öppna en anteckning, välj editor i menyn vid anteckningens titel och välj pluginet.

## Struktur

```
notes/
├── .nojekyll              Låter GitHub Pages servera filerna som de är
├── index.html             Översiktssida med installationsadresser
├── todo/
│   ├── ext.json
│   ├── index.html
│   ├── core.js            Textformat, datum och upprepning (utan gränssnitt)
│   ├── todo.js            Gränssnittet
│   ├── todo.css
│   └── vendor/
├── nwo/
│   ├── ext.json
│   ├── index.html
│   ├── nwo.js             Textformat och gränssnitt
│   ├── nwo.css
│   └── vendor/
└── test-editor/
    ├── ext.json           Beskrivningsfilen som Standard Notes läser
    ├── index.html         Själva editorn
    ├── editor.css
    ├── editor.js
    └── vendor/
        ├── component-relay.js        Standard Notes kommunikationsbibliotek (v2.2.2)
        └── component-relay.LICENSE
```

Varje plugin ligger i en egen mapp med en egen `ext.json`. Ett nytt plugin läggs till som en ny mapp.

## Uppdatera ett plugin

Höj `version` i pluginets `ext.json` och `?v=` i `url` och i `index.html` när något ändras, så att appen inte visar cachade filer. Standard Notes läser `latest_url` och hämtar nya versioner.

## Licens

`vendor/component-relay.js` kommer från [@standardnotes/component-relay](https://github.com/standardnotes/component-relay)
och är licensierad under AGPL-3.0, se `vendor/component-relay.LICENSE`.

Biblioteket är lätt ändrat: när appen har ursprunget `null` (vissa Android-versioner) skickas meddelanden
till `*` i stället för `"null"`, annars kastar webbläsaren ett fel och pluginet visar "Ej ansluten".
Ändringen står som kommentar överst i filen. Pluginet använder inga `<form>`-element, eftersom editorns
iframe kan sakna tillåtelse att skicka formulär.
