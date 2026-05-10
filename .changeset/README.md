# Changesets

This directory contains changesets for tracking changes to published packages.

## Workflow

```bash
# 1. After making changes, create a changeset describing what changed
pnpm changeset

# 2. When ready to release, bump versions and update changelogs
pnpm version-packages

# 3. Build and publish all changed packages to npm
pnpm release
```

See the [changesets docs](https://github.com/changesets/changesets) for full documentation.
