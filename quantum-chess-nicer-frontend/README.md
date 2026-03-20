# Quantum Chess Full Frontend

This folder contains a fully static browser version of the project so it can be deployed to GitHub Pages.

## Files

- `index.html`: app shell
- `style.css`: page styling
- `engine.js`: browser-side chess and quantum rules
- `app.js`: UI rendering and interaction logic

## GitHub Pages

Deploy this folder as a static site. Because it uses only relative asset paths and no backend, it can run directly on GitHub Pages.

## Local Preview

Opening `index.html` directly may be enough in some browsers, but a small static server is safer for ES modules:

```powershell
cd quantum-chess-nicer-frontend
python -m http.server 8000
```

Then open `http://localhost:8000`.
