# Ajour plugin catalog command surface

set quiet
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

PNPM := "corepack pnpm"

[private]
default: help

[doc("Displays available commands")]
help:
    just --list --unsorted

[doc("Installs dependencies from the lockfile")]
install:
    corepack enable
    {{PNPM}} install --frozen-lockfile

[doc("Validates the catalog, plugin definitions, links, and local images")]
validate:
    {{PNPM}} validate

[doc("Runs the complete local verification")]
verify: validate

