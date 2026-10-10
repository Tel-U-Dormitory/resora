# ADR-0002: NIM-first SR authentication and actor separation

**Date:** 2026-10-10 | **Status:** Accepted direction; provisioning details Open

## Decision
Only SR accounts log in for NEED-001. User logs in with **NIM/password**, created through privileged provisioning/import, no public sign-up. Use Better Auth Username Plugin. Each account has exactly one primary actor. SR accounts have one department, one building and separate position/jabatan (`KADIV` is a position).

## Important nuance
An event audience is not an account role. `ALL_STUDENTS` can include SR and Mahasiswa while an account has only one primary actor. `KADIV` audience includes position=KADIV across all departments; only *department=HCO and position=KADIV* grants manual attendance approval.

## Security and unresolved work
Better Auth username creation requires an email field. Decide a legitimate/approved email approach; use secure account provisioning, random temporary passwords, forced change, no credential exposure and clear reset policy. SR import format/source, actual position list and authentication email policy are **OPEN**.
