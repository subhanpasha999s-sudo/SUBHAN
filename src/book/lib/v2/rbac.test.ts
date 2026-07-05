/**
 * RBAC consistency (Phase 12 hardening) — the permission map is the UI layer of
 * the 3-layer model, so a section/action with a malformed or empty access list
 * is a silent access bug. These tests pin the map's shape and a few key rules.
 */
import { describe, it, expect } from "vitest";
import { SECTION_ACCESS, CAN_DO, canSee, canDo, homeFor, ROLE_LABELS, type AppSection } from "./rbac";
import type { Role } from "./types";

const ALL_ROLES: Role[] = ["owner", "manager", "returns_manager", "accountant", "viewer"];

describe("SECTION_ACCESS shape", () => {
  it("every section lists a non-empty set of valid roles", () => {
    for (const [section, roles] of Object.entries(SECTION_ACCESS)) {
      expect(roles.length, `${section} has no roles`).toBeGreaterThan(0);
      expect(new Set(roles).size, `${section} has duplicate roles`).toBe(roles.length);
      for (const r of roles) expect(ALL_ROLES, `${section} → ${r}`).toContain(r);
    }
  });

  it("owner can see every section", () => {
    for (const section of Object.keys(SECTION_ACCESS) as AppSection[]) {
      expect(canSee("owner", section), `owner blocked from ${section}`).toBe(true);
    }
  });

  it("returns_manager is walled off from financial areas", () => {
    for (const s of ["ledger", "gl", "reports", "gst", "invoices", "matching"] as AppSection[]) {
      expect(canSee("returns_manager", s), `returns_manager can see ${s}`).toBe(false);
    }
    expect(canSee("returns_manager", "returns")).toBe(true);
  });

  it("viewer is read-only (no team, no destructive sections)", () => {
    expect(canSee("viewer", "team")).toBe(false);
  });
});

describe("CAN_DO shape", () => {
  it("every action lists valid roles and owner can do all of them", () => {
    for (const [action, roles] of Object.entries(CAN_DO)) {
      expect(roles.length, `${action} empty`).toBeGreaterThan(0);
      for (const r of roles) expect(ALL_ROLES).toContain(r);
      expect(canDo("owner", action as keyof typeof CAN_DO), `owner cannot ${action}`).toBe(true);
    }
  });

  it("only the owner manages the team", () => {
    expect(CAN_DO.manage_team).toEqual(["owner"]);
    expect(canDo("manager", "manage_team")).toBe(false);
  });

  it("unknown actions are denied", () => {
    expect(canDo("owner", "definitely_not_a_real_action" as keyof typeof CAN_DO)).toBe(false);
  });
});

describe("roles & routing", () => {
  it("every role has a label", () => {
    for (const r of ALL_ROLES) expect(ROLE_LABELS[r]).toBeTruthy();
  });
  it("returns_manager lands on returns, others on the dashboard", () => {
    expect(homeFor("returns_manager")).toBe("/book/returns");
    expect(homeFor("accountant")).toBe("/book/dashboard");
  });
});
