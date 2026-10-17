# Honam Semiconductor Cluster

An editorial geographic assessment of the Honam (Southwest) Semiconductor Cluster planned for the Gwangju military airport site in South Korea. It asks whether Gwangju can deliver Korea's second chip production base, covering water, power, land, the airbase relocation, labour and politics. Status as of 13 October 2026.

Open `index.html` in a browser to read it. The page is self-contained apart from Google Fonts, Leaflet (cdnjs) and the Esri basemap tiles.

## Contents

| Path | What it is |
|---|---|
| `index.html` | The interactive report: map, charts, factor tiles and references |
| `data/factors.json` | The nine site factors, with mapped features, figures and source IDs |
| `data/honam-boundaries.geojson` | Municipal boundaries for the Honam region |
| `research/sources.md` | Source ledger (S1–S41), verification of starting leads, and limitations |
| `research/verify.js` | Headless Puppeteer check of the page: layers, popups, citations, overflow |
| `research/verification-results.json` | Output of the last verification run |
| `LICENSE` | MIT License |

## Running the verification

`verify.js` expects the page to be served at `http://127.0.0.1:8765/` and a local Chrome install:

```bash
npm install puppeteer-core
python3 -m http.server 8765
node research/verify.js "$PWD" ./shots
```

Screenshots go to `./shots`, which git ignores.

## Data and attribution

- Municipal boundaries: Statistics Korea (통계청) SGIS via [southkorea/southkorea-maps](https://github.com/southkorea/southkorea-maps), KOGL Type 1 licence.
- Map features: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL 1.0.
- Basemap: Esri.
- News and government sources are listed in `research/sources.md`. Korean-language sources are paraphrased in English. No article text is reproduced.

## License

The code and original content in this repository are released under the [MIT License](LICENSE). Third-party data keeps its own licence: OpenStreetMap features under ODbL 1.0, municipal boundaries under KOGL Type 1, and basemap tiles under Esri's terms. Linked news articles belong to their publishers.
