# Hermes MoA — Multi-Agent Orchestrated Artifacts

**Pack**: National Sparky App
**Target platform**: Vercel / Netlify serverless
**Hook**: Virginia SOL K–12 heavy

## Three Pillars
1. **K-12 Workbook Presets** — structured state-space companions with specs, sequence, rubrics, work room, edit log, and full manifest.
2. **PDF Kitchen** — Moonbeam/MCP cube inspired pipeline for parsing PDFs to structured JSON, powered by LayoutLMv3-style extraction.
3. **Glyph / Gemini PAI Bridge** — image-first entity analysis, visual breakdowns for lock-supply, labels, and state transitions.

## Deployability Notes
- Vercel rewrite: `/api/*` routes to `/api/*.js`
- Static assets under `/public` or root `/assets`
- Secrets injected via `vercel env add` (never committed)

## Starter Preset Ordering
1. K-12 Science — Virginia SOL Grade 5 Electricity and Magnetism
2. PDF Kitchen — workflow manifest
3. Glyph — visual capture spec
4. Imager — Lock/Entity cut diagrams
5. Video — walkthrough screenplay
6. System / Trades — direct-use kit

## Reproducibility Protocol
Bootstrap:
```bash
bash ops/bootstrap.sh
```

Add preset:
```bash
bash ops/new_preset.sh "My New Preset"
```

PDF parse:
```bash
bash ops/pdf_ingest.sh .
```

Build deploy:
```bash
bash ops/build.sh
bash ops/ship.sh
```
