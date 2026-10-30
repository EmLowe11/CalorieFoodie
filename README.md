# CalorieFoodie

Find restaurants, fast food and cafés within 10 miles of any US zip code. Defaults to Sanford, FL (32771).

Plain HTML/CSS/JS with no build step and no API keys:

- **Zip → location:** [Zippopotam.us](https://zippopotam.us)
- **Restaurants:** [OpenStreetMap Overpass API](https://overpass-api.de)
- **Map:** [Leaflet](https://leafletjs.com) with CARTO/OpenStreetMap tiles

## Deploy to Netlify

Drag the repo folder into Netlify, or connect the repo with **no build command** and the publish directory set to the repo root (`netlify.toml` already does this).

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.
