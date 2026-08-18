# Deploy Resume to VPS

Target URL: `https://resume.myevonne.top/`

## Build

From this folder:

```bash
RESUME_DIR=/Users/KShen6/MyEvonne/resume
hugo --config "$RESUME_DIR/site/config.toml" --source "$RESUME_DIR/site" --destination "$RESUME_DIR/dist"
```

The static site is generated into `dist/`.

Note: the legacy `npm run build` path uses Gulp 3, which fails on modern
Node versions with `primordials is not defined`. The current site assets used
by the resume already live under `site/static`, so the Hugo-only build is the
deployment path for the VPS.

## Copy to VPS

Recommended server path:

```bash
/srv/resume.myevonne.top
```

Example copy command:

```bash
rsync -av --delete dist/ <user>@<vps-ip>:/srv/resume.myevonne.top/
```

## DNS

Add an `A` record:

```text
resume.myevonne.top -> <vps-ip>
```

## Caddy

Add this site block to the VPS Caddyfile:

```caddy
resume.myevonne.top {
    root * /srv/resume.myevonne.top
    file_server
}
```

Then reload Caddy:

```bash
sudo systemctl reload caddy
```

Caddy will request and renew the HTTPS certificate automatically.
