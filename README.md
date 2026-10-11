# Ajour plugins index

This repository is the catalog Ajour uses to discover connectors and plugins.
It contains metadata and artwork only; installable code remains in each
extension's own repository and release assets.

## Catalog layout

`catalog.yaml` is the stable entry point. Each listed path points to one
directory-owned plugin definition:

```text
catalog.yaml
plugins/
  example-plugin/
    plugin.yaml
    thumbnail.webp  # optional
    hero.webp       # optional
schema/
  catalog.schema.json
  plugin.schema.json
```

The current catalog contains:

| Extension | Type | Status | Repository |
| --- | --- | --- | --- |
| Azure DevOps | Connector | Available (prerelease) | [ajc-azure-devops](https://github.com/les-cabochons/ajc-azure-devops) |
| Jira | Connector | Available (prerelease) | [ajc-jira](https://github.com/les-cabochons/ajc-jira) |
| Workday project data shape | Plugin | Coming soon | [ajp-workday](https://github.com/les-cabochons/ajp-workday) |

Workday is listed so the catalog covers every current Ajour extension
repository, but it intentionally has no `install` block until that repository
publishes an installable release.

## Plugin definition

Every `plugin.yaml` has human-facing metadata, source and license links,
compatibility information, capabilities, and tags. An available plugin also
declares how Ajour can find its installable release asset:

```yaml
schemaVersion: 1
id: example
type: plugin
title: Example plugin
description: Adds an example capability to Ajour.
author:
  name: Example Author
  url: https://github.com/example
license:
  name: MIT License
  spdxId: MIT
  url: https://github.com/example/ajp-example/blob/main/LICENSE
website: https://example.com/ajp-example
repository:
  provider: github
  slug: example/ajp-example
  url: https://github.com/example/ajp-example
status: available
compatibility:
  pluginApiVersion: 1
capabilities:
  - project-data-shape
install:
  method: github-release
  allowPrereleases: false
  assetPattern: '^example-[0-9A-Za-z.+-]+\.ajour-plugin$'
images:
  thumbnail: thumbnail.webp
  hero: hero.webp
tags:
  - example
```

Image paths are optional. When present, they must be local to the plugin
directory and use PNG, JPEG, WebP, or AVIF. Use a square image of at least
512 by 512 pixels for `thumbnail` and a 16:9 image of at least 1600 by 900
pixels for `hero`. Keep each optimized file below 1 MB.

The complete machine-readable contracts are in `schema/`. Schema versions are
independent from an extension's `compatibility.pluginApiVersion`: the former
versions this catalog format, while the latter tells Ajour which plugin host
contract the extension needs.

## Ajour consumption

An Ajour client should:

1. Fetch and validate `catalog.yaml`.
2. Resolve every entry relative to the catalog URL and validate its
   `plugin.yaml`.
3. Resolve optional images relative to that plugin definition.
4. For an `available` GitHub release, query the repository's releases, ignore
   drafts, honor `allowPrereleases`, and select exactly one asset matching the
   anchored `assetPattern`.
5. Download that asset and pass it to Ajour's existing local plugin installer.

The index deliberately does not pin a release version in YAML. Ajour can pick
the newest eligible release without requiring a catalog change for every
plugin publication.

## Add or update a plugin

1. Create `plugins/<plugin-id>/plugin.yaml`.
2. Add optional `thumbnail` and `hero` images in the same directory and
   reference them under `images`.
3. Add the definition path to `catalog.yaml`.
4. Run `just install` once, then `just validate`.

Validation rejects unknown fields, omitted plugin directories, duplicate
catalog paths or plugin IDs, directory/ID mismatches, invalid HTTPS or GitHub
links, missing images, unanchored or invalid release patterns, and install
rules on coming-soon entries.

## License

[MIT](LICENSE)
