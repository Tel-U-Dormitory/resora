#!/usr/bin/env python3
"""Convert RESORA's committed private provisioning export into local k6 accounts.

Usage: py -3 convert-credentials.py "<path-to-credentials.csv>"
Run from tests/resora-loadtest. Never commit the resulting accounts.local.json.
"""
import csv
import hashlib
import json
import os
from pathlib import Path
import sys

def fail(msg):
    raise SystemExit("STOP: " + msg)

if len(sys.argv) != 2:
    fail('Usage: py -3 convert-credentials.py "<path-to-credentials.csv>"')

here = Path(__file__).resolve().parent
source = Path(sys.argv[1]).resolve(strict=True)
status_path = source.parent / "status.json"
expected_path = here / "sr-loadtest-50.csv"
dest = here / "accounts.local.json"

if source.name != "credentials.csv":
    fail("Provide the credentials.csv produced by RESORA provisioning")
if not status_path.is_file():
    fail("Missing adjacent provisioning status.json")
status = json.loads(status_path.read_text(encoding="utf-8"))
if status.get("state") != "COMMITTED":
    fail("Provisioning is not confirmed COMMITTED; do not run the load test")

raw = source.read_bytes()
if hashlib.sha256(raw).hexdigest() != status.get("sha256"):
    fail("Credentials checksum differs from the provisioning status")

with expected_path.open(encoding="utf-8-sig", newline="") as f:
    expected = list(csv.DictReader(f))
with source.open(encoding="utf-8-sig", newline="") as f:
    exported = list(csv.DictReader(f))
if len(expected) != 50 or len(exported) != 50 or status.get("count") != 50:
    fail("Expected exactly 50 newly provisioned accounts")

by_nim = {}
for entry in exported:
    nim = entry.get("nim", "")
    password = entry.get("temporary_password", "")
    if not nim or not password or nim in by_nim:
        fail("Missing/duplicate account or password in the credentials export")
    by_nim[nim] = entry

expected_nims = [entry["nim"] for entry in expected]
if set(expected_nims) != set(by_nim):
    fail("Export identifiers do not match sr-loadtest-50.csv")
if len({entry["temporary_password"] for entry in exported}) != 50:
    fail("Expected 50 unique synthetic passwords")
for entry in expected:
    from_export = by_nim[entry["nim"]]
    if (entry["name"] != from_export.get("name") or
            entry["email"] != from_export.get("email")):
        fail("Export does not match approved synthetic roster")

accounts = [
    {"username": nim, "password": by_nim[nim]["temporary_password"]}
    for nim in expected_nims
]
# O_EXCL refuses to overwrite local credentials from earlier experiments.
try:
    fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    fail("accounts.local.json already exists; inspect it before manually replacing")
with os.fdopen(fd, "w", encoding="utf-8") as f:
    json.dump({"accounts": accounts}, f, indent=2)
    f.write("\n")
print("Created 50-account k6 fixture at accounts.local.json (credentials not printed).")
