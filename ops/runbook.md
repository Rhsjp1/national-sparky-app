# National Sparky — MoA Runbook

## Workflow Order
1. Preset creation: vocational or K-12 workbook.
2. Instructional sequence mapping.
3. Rubric + sensitivity audit.
4. PDF Kitchen bindings.
5. Glyph/PAI visual pack.
6. Video walkthrough screenplay.
7. System / trades direct-use packaging.
8. Deploy via Vercel.

## Hazard Hooks
- Git commit without credential scan.
- Missing CORS headers in new endpoints.
- Workbook presets with undocumented dependents.
- PDF assets without tiered access.

## Remediation
- Rerun `ops/verify_no_secrets.sh` before any commit or push.
- Use `vercel env add` and do not commit `.env.*` files.
- Add `edit_log.json` entry every time working-room output changes.
