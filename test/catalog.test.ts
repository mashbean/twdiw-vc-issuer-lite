import { describe, expect, it } from "vitest";
import { CARD_TYPES, PERSONAS, claimLabel, claimsFor, isTaiwanNationalId, publicCatalog, withCheckDigit } from "../src/catalog";

describe("test personas", () => {
  it("carry national id numbers whose check digit validates but that follow an obviously synthetic pattern", () => {
    for (const persona of PERSONAS) {
      expect(isTaiwanNationalId(persona.idNumber), persona.name).toBe(true);
      expect(persona.idNumber).toMatch(/^[A-F][12]\d{8}$/);
    }
    expect(withCheckDigit("A12345678")).toBe("A123456789"); // the textbook example
    expect(() => withCheckDigit("A1234567")).toThrow();
  });

  it("use phone numbers in one synthetic block and sandbox e-mail addresses", () => {
    for (const persona of PERSONAS) {
      expect(persona.phone).toMatch(/^09000001\d{2}$/);
      expect(persona.email.endsWith("@sandbox.example")).toBe(true);
      expect(persona.employer.includes("沙盒")).toBe(true);
      expect(persona.school.includes("沙盒")).toBe(true);
    }
    expect(new Set(PERSONAS.map((persona) => persona.id)).size).toBe(PERSONAS.length);
    expect(new Set(PERSONAS.map((persona) => persona.idNumber)).size).toBe(PERSONAS.length);
  });
});

describe("card types", () => {
  it("all say sandbox in the type id so the wallet labels them as test cards", () => {
    for (const card of CARD_TYPES) {
      expect(card.id).toMatch(/^sandbox_[a-z_]+_v\d+$/);
      expect(card.issuerDisplay.includes("沙盒")).toBe(true);
      expect(card.claims.some((claim) => claim.key === "name") || card.id.includes("library")).toBe(true);
    }
    expect(new Set(CARD_TYPES.map((card) => card.id)).size).toBe(CARD_TYPES.length);
  });

  it("only ask the presentation demo for claims the card actually carries", () => {
    for (const card of CARD_TYPES) {
      const keys = new Set(card.claims.map((claim) => claim.key));
      expect(card.presentClaims.length).toBeGreaterThan(0);
      for (const claim of card.presentClaims) expect(keys.has(claim), `${card.id} → ${claim}`).toBe(true);
      expect(card.presentClaims.length).toBeLessThan(card.claims.length);
    }
  });

  it("fill every declared claim for every persona, deterministically for a fixed clock", () => {
    const now = new Date("2026-09-08T00:00:00Z");
    for (const card of CARD_TYPES) {
      for (const persona of PERSONAS) {
        const claims = claimsFor(card, persona, now);
        expect(Object.keys(claims)).toEqual(card.claims.map((claim) => claim.key));
        for (const [key, value] of Object.entries(claims)) {
          expect(typeof value, `${card.id}/${persona.id}/${key}`).toBe("string");
          expect(value.length, `${card.id}/${persona.id}/${key}`).toBeGreaterThan(0);
        }
        expect(claimsFor(card, persona, now)).toEqual(claims);
      }
    }
  });

  it("derive the telecom last-digit claims from the full number", () => {
    const telecom = CARD_TYPES.find((card) => card.id.includes("telecom"))!;
    const claims = claimsFor(telecom, PERSONAS[0]);
    expect(claims.phonel5).toBe(PERSONAS[0].phone.slice(-5));
    expect(claims.phonel3).toBe(PERSONAS[0].phone.slice(-3));
    expect(claims.phone_number).toBe(PERSONAS[0].phone);
  });

  it("label every claim key in Chinese", () => {
    for (const card of CARD_TYPES) for (const claim of card.claims) expect(claimLabel(claim.key)).not.toBe(claim.key);
    expect(claimLabel("does_not_exist")).toBe("does_not_exist");
  });

  it("publishes a catalog with a preview of every card for every persona", () => {
    const catalog = publicCatalog(new Date("2026-09-08T00:00:00Z"));
    expect(catalog.cards.length).toBe(CARD_TYPES.length);
    expect(catalog.personas.length).toBe(PERSONAS.length);
    for (const persona of catalog.personas) {
      expect(Object.keys(persona.preview).sort()).toEqual(CARD_TYPES.map((card) => card.id).sort());
      expect("idNumber" in persona).toBe(false);
    }
  });
});
