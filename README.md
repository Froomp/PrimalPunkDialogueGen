# Primal Punk Dialogue Editor

Standalone React editor for authoring Primal Punk dialogue graphs, previewing skill-check flows, and exporting runtime-ready JSON plus images.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run test`
- `npm run test:run`

## Stack

- React + TypeScript + Vite
- React Flow canvas editor
- Zustand state store
- Zod schemas and validation
- Vitest + Testing Library

## Export

The editor keeps an internal project model and exports a runtime package zip:

- `<sceneId>.json`
- `images/` referenced by the scene
