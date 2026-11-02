#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v cargo >/dev/null 2>&1; then
    printf '%s\n' 'Rust is required. See README.md for system requirements.' >&2
    exit 1
fi
printf '%s\n' 'Building an optimized Echo Next inside this project. No system files are installed.'
cargo build --release --locked
printf '%s\n' 'Ready: run ./target/release/echo from this folder.'
