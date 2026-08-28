# 1. Record architecture decisions

Date: 2026-08-28

## Status
Accepted

## Context
We want the reasoning behind significant technical choices to be discoverable by future
contributors, not lost in chat history or PR threads.

## Decision
Use Architecture Decision Records (Michael Nygard format). One Markdown file per decision in
`docs/adr/`, numbered sequentially, never deleted — superseded ADRs are marked and linked.

## Consequences
Every architecturally significant change ships with an ADR in the same PR. Reviewers check for it.
