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

Håll koll på beställningar. En anteckning kan hålla flera beställningar från olika ställen, var och en med
**Företag**, **Vara**, **Fraktbolag**, **Beställd**, **Skickad** och **Bedömt levdatum**.

- Beställningarna visas som en lista. Varje rad visar vara, företag och fraktbolag, och till höger det senaste
  steget: bedömt levdatum med hur många dagar det är kvar, annars skickad, annars beställd.
- Tryck på en beställning för att fälla ut den och ändra fälten. **Klar** fäller ihop den igen.
  En anteckning med bara en beställning visas utfälld direkt.
- **Ny beställning** lägger till en beställning sist i listan.
- **Ta bort beställning** frågar en gång till (*Tryck igen för att ta bort*). En tom beställning tas bort direkt.
- Fraktbolag fylls i fritt, med förslag (PostNord, DHL, Budbee, Instabox med flera).
- Datumen väljs i en datumväljare. Under varje datum står veckodag och hur långt det är dit eller sedan dess
  (t.ex. *Tisdag 3 november · om 7 dagar*). Beställd och Skickad har en knapp **Idag**.
- Ett passerat bedömt levdatum visas i rött, idag och imorgon i blått.
- Enter hoppar till nästa fält i samma beställning.
- Anteckningslistan i Standard Notes visar till exempel
  *2 beställningar: Skruvdragare (lev 3 nov), Vinterjacka (skickad 26 okt)*.

Allt sparas som vanlig text i anteckningen, ett block per beställning med en tom rad emellan, så det går att
läsa även i andra editorer:

```
Företag: Webbutiken
Vara: Skruvdragare
Fraktbolag: PostNord
Beställd: 2026-10-27
Skickad:
Bedömt levdatum: 2026-11-03

Företag: Begagnatsajten
Vara: Vinterjacka
Fraktbolag: Budbee
Beställd: 2026-10-25
Skickad: 2026-10-26
Bedömt levdatum: 2026-10-30
```

Anteckningar från tidigare versioner fungerar som de är och blir en beställning. Flera `Vara:`-rader i samma
block (från version 1.2) slås ihop till en vara med kommatecken.

Beställningar utan något ifyllt sparas inte. Rader som inte är fält ligger kvar oförändrade, i sin beställning
om de står i ett block med fält, annars sist. Ett datum som skrivits på annat sätt än ÅÅÅÅ-MM-DD behålls och
visas under datumfältet tills ett nytt datum väljs.

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
│   ├── nwo.js             Textformat och gränssnitt för beställningslistan
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

`note_type` i `ext.json` måste vara en av Standard Notes egna typer: `plain-text`, `markdown`, `rich-text`, `task`,
`code`, `spreadsheet`, `authentication`, `super` eller `unknown`. Annars kraschar editormenyn i appen
("undefined is not an object (evaluating 'e[o].push')").

Använd aldrig `plain-text` eller `super`: anteckningar med de typerna öppnas alltid i appens inbyggda
Plain Text- respektive Super-editor, så pluginet hoppar tillbaka till Plain Text när man väljer det.
Ett plugin som inte passar någon annan typ får `unknown`.

## Uppdatera ett plugin

Höj `version` i pluginets `ext.json` och `?v=` i `url` och i `index.html` när något ändras, så att appen inte visar cachade filer. Standard Notes läser `latest_url` och hämtar nya versioner.

## Licens

`vendor/component-relay.js` kommer från [@standardnotes/component-relay](https://github.com/standardnotes/component-relay)
och är licensierad under AGPL-3.0, se `vendor/component-relay.LICENSE`.

Biblioteket är lätt ändrat: när appen har ursprunget `null` (vissa Android-versioner) skickas meddelanden
till `*` i stället för `"null"`, annars kastar webbläsaren ett fel och pluginet visar "Ej ansluten".
Ändringen står som kommentar överst i filen. Pluginet använder inga `<form>`-element, eftersom editorns
iframe kan sakna tillåtelse att skicka formulär.
