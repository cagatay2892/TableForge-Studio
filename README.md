# TableForge Studio

**A private, local-first CSV analysis workspace.** Import a flat file, inspect its quality, group values into a quick chart, filter and sort records, and export a clean view. TableForge processes files in a Web Worker and saves datasets in the browser's IndexedDB. File contents are never sent to a server.

## Features

- Drag and drop CSV or TSV files up to 25 MB.
- Parse quoted fields, escaped quotes, embedded line breaks, and common delimiters.
- Profile columns by inferred type, missing values, unique values, and examples.
- Search across fields, filter by a column value, sort, and page through rows.
- Group the filtered data by any field and chart row counts, sums, or averages.
- Save and reopen datasets in a local IndexedDB library.
- Export the current filtered view as CSV.
- Light and dark themes, sample data, responsive layout, and keyboard shortcuts.
- Parse files in a background worker with a 100,000-row safety limit.

## Tech stack

- React 19 + TypeScript
- Vite
- Web Workers for parsing and profiling
- IndexedDB for local dataset storage
- Custom accessible HTML/SVG chart rendering

## Run locally

Requirements: Node.js 22.18+ (Node.js 24 LTS recommended) and npm.

```bash
git clone https://github.com/cagatay2892/tableforge-studio.git
cd tableforge-studio
npm install
npm run dev
```

Open the local URL printed by Vite. A sample dataset appears on first run. For a production build:

```bash
npm run lint
npm run build
npm run preview
```

## Privacy and limits

TableForge has no backend, account, analytics, or network data upload. Imported files stay in the current browser profile and are saved locally in IndexedDB. Clearing browser site data removes the saved library. The parser limits a single file to 25 MB and retains at most 100,000 data rows to keep the interface responsive. Exported CSV contains only rows matching the current filters.

The type profiler uses lightweight value heuristics. Review inferred dates and numbers before using an exported dataset in a high-stakes workflow.

## Project structure

```text
src/
  lib/
    sample.ts       Built-in demo dataset
    storage.ts      IndexedDB persistence
    types.ts        Shared dataset types
  App.tsx           Workspace, filters, charts, and table
  App.css           Responsive app styling
  index.css         Theme tokens and global styles
public/
  csv.worker.js     Background parser and profiler
  favicon.svg       App icon
```

## Contributing

Issues and pull requests are welcome. Keep data processing local, preserve the file and row limits, and include a short description with screenshots for visible UI changes.

## License

MIT. See [LICENSE](LICENSE).

