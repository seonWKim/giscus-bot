#!/usr/bin/env node

// Thin wrapper that loads the built CLI entry point.
// This file is committed to the repo so that the `bin` field
// in package.json points to a file that always exists.

import("../dist/cli.js");
