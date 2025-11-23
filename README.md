# Alain's Functionalpatterns Progress

Simple one-page static site that graphs progress for four exercises and shows the latest YouTube video per exercise.

Files
- `index.html` — main page
- `styles.css` — layout and responsive styles
- `app.js` — CSV loader, chart rendering (Chart.js), and iframe wiring
- `data.csv` — measurements (edit this to add data or change videos)
- `assets/` — optional images/icons

Data CSV format (header): `exercise,ts,value,units,youtubeId`
- `exercise`: one of `broad_jump`, `vertical_jump`, `sprint_top_speed`, `max_throw_velocity`
 - `exercise`: one of `broad_jump`, `vertical_jump`, `sprint_top_speed`, `max_throw_velocity`, `unmotorized_treadmill_top_speed`
 - `exercise`: one of `broad_jump`, `vertical_jump`, `sprint_top_speed`, `max_throw_velocity`, `unmotorized_treadmill_top_speed`

Note: This project now uses imperial units. Expected units per exercise:
- `broad_jump`: `ft` (feet)
- `vertical_jump`: `in` (inches)
- `sprint_top_speed`: `mph`
- `max_throw_velocity`: `mph`
- `unmotorized_treadmill_top_speed`: `mph`
- `ts`: ISO date like `2025-06-12`
- `value`: numeric measurement
- `units`: optional human-readable units
- `youtubeId`: optional YouTube video id (latest non-empty entry per exercise will be used)

Run
Open `index.html` in a browser. For local file permissions, run a simple static server such as Python's:

```bash
python -m http.server 8000
# then open http://localhost:8000
```
