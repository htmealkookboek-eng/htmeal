# HTMeal

A modular desktop-first cookbook application scaffold in Python.

## Structure

- `app.py` - application entrypoint
- `ui/` - visual components and presentation logic
- `logic/` - search, filters, collections, pantry, and ingredient logic
- `data/` - recipe data storage
- `assets/` - fonts, icons, textures, patterns
- `styles/` - shared theme CSS variables and styles

## Deployment

- Primary hosted deployment target: Render
- Use the repository root as the service source
- Render should start the app with `python app.py`
- The server now reads `PORT` from the environment, so it works correctly on Render
- The legacy static GitHub Pages build script remains available as a `build:static` npm script

## Next steps

- Add recipe data to `data/recipes.json`
- Integrate a Python UI framework (Tkinter, PySide, or Toga)
- Build the cooking mode experience and pantry UI
- Add AI search and smart suggestions
