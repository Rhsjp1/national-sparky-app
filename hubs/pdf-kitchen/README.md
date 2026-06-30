# PDF Kitchen — Primitives and Workflow

Hooks: LayoutLMv3 style extraction, MCP cube validation, MoA manifest-driven pipeline.

## Primitives
1. **Chunk** — parse PDF pages to raw text and affordance blocks.
2. **Structure** — assign hierarchy: heading, paragraph, table, math, figure caption.
3. **Validate** — MCP cube asserts shape, cross-page references, and bound counts.
4. **Serialize** — emit canonical JSON per schema/PDF schema.

## Recipe
`bash ops/pdf_ingest.sh ./samples.pdf`

Outputs:
- `out/index.json`
- `out/manifest.json`
- `out/fixtures.jsonl`

## Notes
- Deploy to Vercel as static JSON export or gateway endpoint.
- Respect credential rules; inject keys via `vercel env add`.
