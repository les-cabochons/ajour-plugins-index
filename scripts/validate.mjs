import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const idPattern = /^[a-z0-9][a-z0-9_-]{1,63}$/u;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const repositorySlugPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const imagePattern = /^(thumbnail|hero)\.(png|jpe?g|webp|avif)$/u;
const catalogPathPattern = /^plugins\/([a-z0-9][a-z0-9_-]*)\/plugin\.yaml$/u;

const failures = [];

function fail(file, message) {
  failures.push(`${path.relative(repoRoot, file).replaceAll("\\", "/")}: ${message}`);
}

function parseYaml(file) {
  try {
    return YAML.parse(fs.readFileSync(file, "utf8"), {
      schema: "core",
      strict: true,
      uniqueKeys: true,
    });
  } catch (error) {
    fail(file, `invalid YAML: ${error.message}`);
    return undefined;
  }
}

function parseJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(file, `invalid JSON: ${error.message}`);
    return undefined;
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkRecord(file, value, label, required, allowed) {
  if (!isRecord(value)) {
    fail(file, `${label} must be an object`);
    return false;
  }

  for (const key of required) {
    if (!(key in value)) fail(file, `${label}.${key} is required`);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(file, `${label}.${key} is not supported`);
  }
  return true;
}

function checkString(file, value, label, { min = 1, max = 500, pattern } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    fail(file, `${label} must be a string between ${min} and ${max} characters`);
    return false;
  }
  if (pattern && !pattern.test(value)) {
    fail(file, `${label} has an invalid format`);
    return false;
  }
  return true;
}

function checkHttpsUrl(file, value, label) {
  if (!checkString(file, value, label)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error("not HTTPS");
    return true;
  } catch {
    fail(file, `${label} must be a valid HTTPS URL`);
    return false;
  }
}

function checkSlugList(file, value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) {
    fail(file, `${label} must contain between 1 and 12 values`);
    return;
  }
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string" || !slugPattern.test(item)) {
      fail(file, `${label} contains an invalid slug`);
    } else if (seen.has(item)) {
      fail(file, `${label} contains duplicate value "${item}"`);
    }
    seen.add(item);
  }
}

function validatePlugin(file, plugin, expectedId) {
  const topLevelKeys = [
    "schemaVersion", "id", "type", "title", "description", "author",
    "license", "website", "repository", "status", "compatibility",
    "capabilities", "install", "images", "tags",
  ];
  const requiredKeys = topLevelKeys.filter((key) => !["install", "images"].includes(key));
  if (!checkRecord(file, plugin, "plugin", requiredKeys, topLevelKeys)) return;

  if (plugin.schemaVersion !== 1) fail(file, "plugin.schemaVersion must equal 1");
  if (checkString(file, plugin.id, "plugin.id", { max: 64, pattern: idPattern }) && plugin.id !== expectedId) {
    fail(file, `plugin.id must match its directory name "${expectedId}"`);
  }
  if (!["connector", "plugin"].includes(plugin.type)) {
    fail(file, "plugin.type must be connector or plugin");
  }
  checkString(file, plugin.title, "plugin.title", { max: 80 });
  checkString(file, plugin.description, "plugin.description", { max: 500 });
  checkHttpsUrl(file, plugin.website, "plugin.website");

  if (checkRecord(file, plugin.author, "plugin.author", ["name", "url"], ["name", "url"])) {
    checkString(file, plugin.author.name, "plugin.author.name", { max: 100 });
    checkHttpsUrl(file, plugin.author.url, "plugin.author.url");
  }

  if (checkRecord(file, plugin.license, "plugin.license", ["name", "spdxId", "url"], ["name", "spdxId", "url"])) {
    checkString(file, plugin.license.name, "plugin.license.name", { max: 80 });
    checkString(file, plugin.license.spdxId, "plugin.license.spdxId", {
      max: 80,
      pattern: /^[A-Za-z0-9-.+]+$/u,
    });
    checkHttpsUrl(file, plugin.license.url, "plugin.license.url");
  }

  if (checkRecord(file, plugin.repository, "plugin.repository", ["provider", "slug", "url"], ["provider", "slug", "url"])) {
    if (plugin.repository.provider !== "github") fail(file, "plugin.repository.provider must be github");
    const validSlug = checkString(file, plugin.repository.slug, "plugin.repository.slug", {
      max: 200,
      pattern: repositorySlugPattern,
    });
    const validUrl = checkHttpsUrl(file, plugin.repository.url, "plugin.repository.url");
    if (validSlug && validUrl && plugin.repository.url !== `https://github.com/${plugin.repository.slug}`) {
      fail(file, "plugin.repository.url must match plugin.repository.slug");
    }
  }

  if (!["available", "coming-soon", "deprecated"].includes(plugin.status)) {
    fail(file, "plugin.status must be available, coming-soon, or deprecated");
  }

  if (checkRecord(file, plugin.compatibility, "plugin.compatibility", ["pluginApiVersion"], ["pluginApiVersion"])) {
    if (!Number.isInteger(plugin.compatibility.pluginApiVersion) || plugin.compatibility.pluginApiVersion < 1) {
      fail(file, "plugin.compatibility.pluginApiVersion must be a positive integer");
    }
  }

  checkSlugList(file, plugin.capabilities, "plugin.capabilities");
  checkSlugList(file, plugin.tags, "plugin.tags");

  if (plugin.status === "available" && !plugin.install) {
    fail(file, "available plugins must define plugin.install");
  }
  if (plugin.status === "coming-soon" && plugin.install) {
    fail(file, "coming-soon plugins must not define plugin.install");
  }

  if (plugin.install !== undefined && checkRecord(
    file,
    plugin.install,
    "plugin.install",
    ["method", "allowPrereleases", "assetPattern"],
    ["method", "allowPrereleases", "assetPattern"],
  )) {
    if (plugin.install.method !== "github-release") fail(file, "plugin.install.method must be github-release");
    if (typeof plugin.install.allowPrereleases !== "boolean") {
      fail(file, "plugin.install.allowPrereleases must be a boolean");
    }
    if (checkString(file, plugin.install.assetPattern, "plugin.install.assetPattern", { min: 3, max: 200 })) {
      if (!plugin.install.assetPattern.startsWith("^") || !plugin.install.assetPattern.endsWith("$")) {
        fail(file, "plugin.install.assetPattern must be anchored with ^ and $");
      }
      try {
        const assetPattern = new RegExp(plugin.install.assetPattern, "u");
        if (assetPattern.test("")) fail(file, "plugin.install.assetPattern must not match an empty string");
      } catch (error) {
        fail(file, `plugin.install.assetPattern is not a valid regular expression: ${error.message}`);
      }
    }
  }

  if (plugin.images !== undefined && checkRecord(
    file,
    plugin.images,
    "plugin.images",
    [],
    ["thumbnail", "hero"],
  )) {
    if (Object.keys(plugin.images).length === 0) fail(file, "plugin.images must not be empty");
    for (const [role, imagePath] of Object.entries(plugin.images)) {
      if (!checkString(file, imagePath, `plugin.images.${role}`, { max: 100, pattern: imagePattern })) continue;
      const resolved = path.resolve(path.dirname(file), imagePath);
      if (path.dirname(resolved) !== path.dirname(file)) {
        fail(file, `plugin.images.${role} must stay inside the plugin directory`);
      } else if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
        fail(file, `plugin.images.${role} references missing file "${imagePath}"`);
      } else if (fs.statSync(resolved).size > 1_000_000) {
        fail(file, `plugin.images.${role} must be smaller than 1 MB`);
      }
    }
  }
}

const catalogFile = path.join(repoRoot, "catalog.yaml");
const catalog = parseYaml(catalogFile);
const pluginIds = new Set();
const catalogEntries = new Set();

parseJson(path.join(repoRoot, "schema", "catalog.schema.json"));
parseJson(path.join(repoRoot, "schema", "plugin.schema.json"));

if (checkRecord(catalogFile, catalog, "catalog", ["schemaVersion", "entries"], ["schemaVersion", "entries"])) {
  if (catalog.schemaVersion !== 1) fail(catalogFile, "catalog.schemaVersion must equal 1");
  if (!Array.isArray(catalog.entries) || catalog.entries.length === 0) {
    fail(catalogFile, "catalog.entries must be a non-empty array");
  } else {
    const seenPaths = new Set();
    for (const entry of catalog.entries) {
      if (typeof entry !== "string") {
        fail(catalogFile, "catalog.entries must contain only strings");
        continue;
      }
      const match = entry.match(catalogPathPattern);
      if (!match) {
        fail(catalogFile, `catalog entry "${entry}" must use plugins/<id>/plugin.yaml`);
        continue;
      }
      if (seenPaths.has(entry)) fail(catalogFile, `catalog entry "${entry}" is duplicated`);
      seenPaths.add(entry);
      catalogEntries.add(entry);

      const file = path.resolve(repoRoot, ...entry.split("/"));
      if (!file.startsWith(path.join(repoRoot, "plugins") + path.sep)) {
        fail(catalogFile, `catalog entry "${entry}" escapes the plugins directory`);
        continue;
      }
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        fail(catalogFile, `catalog entry "${entry}" does not exist`);
        continue;
      }

      const plugin = parseYaml(file);
      validatePlugin(file, plugin, match[1]);
      if (isRecord(plugin) && typeof plugin.id === "string") {
        if (pluginIds.has(plugin.id)) fail(file, `plugin.id "${plugin.id}" is duplicated`);
        pluginIds.add(plugin.id);
      }
    }
  }
}

const pluginsDirectory = path.join(repoRoot, "plugins");
if (!fs.existsSync(pluginsDirectory) || !fs.statSync(pluginsDirectory).isDirectory()) {
  fail(catalogFile, "plugins directory does not exist");
} else {
  for (const child of fs.readdirSync(pluginsDirectory, { withFileTypes: true })) {
    if (!child.isDirectory()) continue;
    const entry = `plugins/${child.name}/plugin.yaml`;
    const definition = path.join(pluginsDirectory, child.name, "plugin.yaml");
    if (!fs.existsSync(definition)) {
      fail(definition, "plugin directory must contain plugin.yaml");
    } else if (!catalogEntries.has(entry)) {
      fail(definition, `plugin definition is missing from catalog.yaml as "${entry}"`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Catalog validation failed with ${failures.length} error(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Catalog validation passed for ${pluginIds.size} plugin(s).`);
}
