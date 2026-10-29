# Standard Notes-plugins

Egna plugins till [Standard Notes](https://standardnotes.com), publicerade med GitHub Pages på
<https://jagemyr.github.io/notes/>.

## Plugins

| Plugin | Typ | Installationsadress |
|---|---|---|
| Todo | Editor | `https://jagemyr.github.io/notes/todo/ext.json` |
| NWO | Editor | `https://jagemyr.github.io/notes/nwo/ext.json` |
| Te | Editor | `https://jagemyr.github.io/notes/te/ext.json` |
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
**Företag**, en eller flera **Varor**, **Fraktbolag**, **Beställd**, **Skickad**, **Bedömt levdatum**,
**Redo att hämtas** med **Hämtställe**, och **Levererad**.

- Beställningarna visas som en lista. Varje rad visar varorna, företag, fraktbolag och hämtställe, och till höger
  det senaste steget: levererad, redo att hämtas, bedömt levdatum med hur många dagar det är kvar, skickad
  eller beställd.
- Tryck på en beställning för att fälla ut den och ändra fälten. **Klar** fäller ihop den igen.
  En anteckning med bara en beställning visas utfälld direkt.
- **Ny beställning** lägger till en beställning sist i listan.
- **Sortera:** dra i greppet (⋮⋮) längst till höger på raden för att flytta en beställning. Det fungerar med
  mus och med fingret, och sidan skrollar när man drar mot kanten. Med tangentbordet: fokus på greppet och
  pil upp eller ner. Beställningar flyttas inom sin lista (På väg eller Levererade), och ordningen sparas som
  ordningen i anteckningens text. Greppet är egna pekarhändelser och inte HTML5 drag-and-drop, som inte
  fungerar med fingret i iOS.
- **Ta bort beställning** frågar en gång till (*Tryck igen för att ta bort*). En tom beställning tas bort direkt.
- Varor: **Lägg till vara** ger en ny rad, och Enter på en vara med text gör samma sak. Enter på en tom rad
  går vidare till Fraktbolag. Krysset tar bort varan. Tomma rader sparas inte.
- **Redo att hämtas:** fyll i datumet (eller tryck **Idag**) när paketet har kommit till en box eller ett
  utlämningsställe, och skriv var i **Hämtställe**. Raden visar *Redo att hämtas*
  och hur länge paketet har väntat. Bocka av beställningen när den är hämtad.
- **Färger:** varje rad har en färgad kant till vänster och statustexten i samma färg efter hur långt
  beställningen har kommit: grå när den är beställd, blå när den är skickad och grön när den är redo att hämtas.
  Bedömt levdatum ändrar inte färgen. Samma färger står som en prick framför datumfälten.
- **Levererad:** bocken framför en vara markerar den som levererad med dagens datum (varan stryks över).
  När alla varor är bockade är beställningen levererad. Bocken framför beställningen bockar av alla varor
  på en gång (eller av dem igen); är bara några varor levererade visar den ett streck och raden *1 av 2 levererade*.
- En levererad beställning tonas ner, fälls ihop och flyttas efter en kort stund till **Levererade** längst ner.
  **Rensa** tar bort alla levererade beställningar efter ett andra tryck.
- Fraktbolag fylls i fritt. Under fältet finns knappar med vanliga fraktbolag (PostNord, DHL, Budbee, Instabox
  med flera) som filtreras efter det man skriver. Det är egna knappar och inte en `<datalist>`, eftersom
  Safaris förslagsfönster kan få en nedtryckt tangent att upprepas i fältet.
- Datumen väljs i en datumväljare. Under varje datum står veckodag och hur långt det är dit eller sedan dess
  (t.ex. *Tisdag 3 november · om 7 dagar*). Beställd, Skickad och Redo att hämtas har en knapp **Idag**.
- Ett passerat bedömt levdatum visas i rött, idag och imorgon i blått (inte när paketet redan har kommit).
- Enter hoppar till nästa fält i samma beställning.
- Anteckningslistan i Standard Notes visar till exempel
  *1 att hämta, 1 på väg, 1 levererad: Skruvdragare +1 (att hämta Paketboxen), Vinterjacka (lev 30 okt)*.

Allt sparas som vanlig text i anteckningen, ett block per beställning med en tom rad emellan och en `Vara:`-rad
per vara, så det går att läsa även i andra editorer. En levererad vara får `✅` och datum efter namnet, och
`Levererad:` fylls i med senaste datumet när alla varor har kommit:

```
Företag: Webbutiken
Vara: Skruvdragare ✅ 2026-10-29
Vara: Bitsats
Fraktbolag: PostNord
Beställd: 2026-10-27
Skickad:
Bedömt levdatum: 2026-11-03
Redo att hämtas: 2026-10-30
Hämtställe: Paketboxen vid stationen
Levererad:

Företag: Begagnatsajten
Vara: Vinterjacka ✅ 2026-10-28
Fraktbolag: Budbee
Beställd: 2026-10-25
Skickad: 2026-10-26
Bedömt levdatum: 2026-10-30
Redo att hämtas:
Hämtställe:
Levererad: 2026-10-28
```

Skriver man `Levererad: datum` för hand i en annan editor räknas alla varor i beställningen som levererade.

## Te

En lista med teer. Varje te har **Sort**, **Namn**, **Temperatur**, **Land** och en bock för om det
**passar för gong fu**.

- Teerna grupperas per sort (grönt, vitt, gult, oolong, svart, pu-erh, mörkt, matcha, örtte, rooibos,
  sedan egna sorter och sist *Utan sort*) och sorteras på namn inom gruppen. Varje sort har en egen färg
  som kant till vänster på raden.
- Raden visar namn, land och temperatur, och ett grönt märke **Gong fu** för teer som passar för det.
- Tryck på ett te för att fälla ut det och ändra fälten. **Klar** fäller ihop det. Medan teet är utfällt
  står det kvar på sin plats även om man byter sort eller namn; det flyttas till rätt grupp när det fälls ihop.
- **Nytt te** lägger till ett te. Ett nytt te som fälls ihop utan att något fyllts i försvinner.
- **Ta bort te** frågar en gång till (*Tryck igen för att ta bort*).
- Sort, temperatur och land fylls i fritt. Under fälten finns knappar med vanliga sorter, temperaturer
  (70–100 grader) och länder; sort och temperatur visar den valda knappen markerad, länderna filtreras efter
  det man skriver. Andra stavningar av sorterna (t.ex. *grön*, *green*, *puerh*, *shou*) hamnar i rätt grupp.
- Temperaturen skrivs som en siffra (`95`) eller ett spann (`80-85`) och visas som *95 °C* eller *80–85 °C*.
- **Gong fu:** när bocken är ibockad visas ett bryggschema under den: first rinse (som hälls bort),
  infusion 1–5 och +10 sekunder för varje infusion efter den femte. Schemat är detsamma för alla teer och
  sparas inte i anteckningen.
- **Filter:** knapparna överst visar alla teer eller en sort i taget, och **Gong fu** visar bara teer som passar
  för gong fu (går att kombinera med en sort). Filtret sparas per enhet. Med ett filter valt får ett nytt te
  den sorten (och gong fu).
- Enter hoppar till nästa fält i samma te.
- Anteckningslistan i Standard Notes visar till exempel *9 teer, 6 för gong fu: 3 oolong, 2 grönt, 1 vitt, …*.

Allt sparas som vanlig text i anteckningen, ett block per te med en tom rad emellan, så det går att läsa även i
andra editorer:

```
Sort: Oolong
Namn: Dong Ding
Temperatur: 95
Land: Taiwan
Gong fu: ja

Sort: Grönt
Namn: Sencha
Temperatur: 70-80
Land: Japan
Gong fu:
```

`Gong fu` är `ja` eller tomt; skrivet för hand räknas även `x` och `✅` som ja. Fält skrivna för hand med andra
namn känns igen (t.ex. `Typ`, `Te`, `Temp`, `Ursprung`) och skrivs om till fältnamnen när listan sparas.
Teer utan något ifyllt sparas inte. Rader som inte är fält ligger kvar oförändrade, i sitt te om de står i ett
block med fält, annars sist.

Anteckningar från tidigare versioner fungerar som de är; en anteckning från version 1 blir en beställning.

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
├── te/
│   ├── ext.json
│   ├── index.html         Gränssnittet och gong fu-schemat
│   ├── te.js              Textformat och gränssnitt för telistan
│   ├── te.css
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
