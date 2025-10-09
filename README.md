# Earnings Week Planner

Tools for building Reuters-ready earnings coverage sheets.

## Local development
- Install dependencies with `pip install -r requirements.txt`.
- Run the Flask app locally via `flask --app app run` to use the dynamic API.

## Static build
- Generate the static site with `python build_static.py`.
- The rendered site is written to the `docs/` directory and includes precomputed API payloads and CSV downloads.

## GitHub Pages deployment
1. Push the repository to GitHub.
2. In the repository settings, open **Pages** and select **GitHub Actions** as the source.
3. The `Deploy static site` workflow builds the site on every push to `main` (or on manual dispatch), uploading `docs/` as the Pages artifact.
4. Once the `deploy` job completes, GitHub Pages serves the latest build at `https://<your-username>.github.io/earnings-list/`.

If the build needs to be re-run, trigger the workflow manually from the **Actions** tab.
