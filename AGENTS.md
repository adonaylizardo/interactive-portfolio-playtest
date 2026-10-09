# Agent guidelines

## Definition of done

Before **opening** or **updating** any pull request, run every command below locally (or rely on an equivalent green CI run) and capture real terminal output for the PR **Verification** section. **Never open or update a PR while any of these checks are failing.**

| Step | Command | Pass criteria |
|------|---------|---------------|
| Install | `npm ci` | Exit 0 |
| Build | `npm run build` | Exit 0 |
| Typecheck | `npm run typecheck` | Exit 0 (`tsc --noEmit`) |
| Lint | `npm run lint` | **Only if** a lint script exists in `package.json`. This repo has no dedicated linter — **typecheck is the lint gate**. |
| Headless QA | `npm run qa:pinch` | Exit 0; JSON report must end with `"errors": []` (warnings are allowed) |

### UI changes

If the PR changes anything visible in the game or checklist UI:

- Run `npm run qa:pinch` so proof screenshots are written under `artifacts/qa-screenshots/`:
  - `desktop-1280x800.png` (1280×800 viewport)
  - `mobile-375x812.png` (375×812 viewport)
- Attach or link both images in the PR **Verification** section (CI uploads the same folder as a workflow artifact).

### Pull requests

- Fill in `.github/pull_request_template.md` **Verification** table with the **actual** command, exit/result, and a one-line summary — not placeholders.
- List anything not covered by automation under **Not verified** (e.g. real-iPhone touch, pinch on physical device).
- Keep PRs **draft** until the author explicitly asks for review; CI on `cursor/**` must be green before requesting review.
