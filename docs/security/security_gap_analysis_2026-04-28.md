# Security Gap Analysis (as of April 28, 2026)

## Important reality check
No system can be "100% protected" forever. The practical goal is **risk reduction + rapid detection + fast recovery**.

## Current strengths in this repository
Based on current project docs and backend code:
- E2EE architecture and Signal-like protocol are declared.
- Argon2id password hashing is declared.
- TOTP-based 2FA exists in API routes.
- Basic rate limiting / abuse controls are declared in docs.
- Audit logging exists in the data model.

## Priority gaps to close for a high-assurance messenger

### P0 — Must implement first (critical)
1. **Independent cryptography audit + protocol proof review**
   - Documentation claims are strong ("military-grade" and multiple algorithms), but there is no evidence of a repeatable third-party audit report in-repo.
   - Action: external cryptography review (X3DH/Double Ratchet implementation, key lifecycle, replay protection, downgrade resistance).

2. **Key transparency / device key verification UX**
   - Need robust anti-impersonation controls (safety numbers, QR verification, key change alerts).
   - Action: implement key transparency log + user-visible trust change events.

3. **JWT hardening (move from shared-secret HS256 to asymmetric signing with rotation)**
   - Current backend token code signs with HS256 and one shared secret.
   - Action: RS256/EdDSA + `kid` rotation + short access-token TTL + revocation list + refresh token family rotation.

4. **2FA upgrade to phishing-resistant factors**
   - TOTP is better than password-only, but it is not phishing-resistant.
   - Action: add WebAuthn / passkeys for admins and high-risk accounts; keep TOTP as fallback.

5. **Secrets and credentials hygiene**
   - Repository currently includes `SUPABASE_CREDENTIALS.txt` path, which is a red flag operationally.
   - Action: remove secrets from git history, rotate keys, enforce secret scanning in CI.

### P1 — Strongly recommended (defense in depth)
6. **Formal security baseline mapping (ASVS + MASVS)**
   - Action: map backend/web controls to OWASP ASVS L2+, mobile apps to MASVS L2.

7. **Supply-chain security**
   - Action: signed releases/artifacts (Sigstore/Cosign), SBOM per build, dependency policy gates, provenance attestation (SLSA-aligned).

8. **Runtime abuse & anomaly detection**
   - Action: impossible travel checks, token replay detection, per-device risk score, adaptive auth challenges.

9. **Binary/update trust chain**
   - Auto-update already exists in product concept, but should be cryptographically pinned.
   - Action: mandatory signature verification, rollback protection, transparency log for release manifests.

10. **Incident response readiness**
    - Action: tabletop playbooks (key compromise, signing key leak, supply-chain compromise), recovery SLAs, user notification templates.

### P2 — Strategic improvements
11. **Post-quantum transition roadmap**
    - Action: hybrid key exchange experiments and migration plan; crypto-agility interfaces.

12. **Metadata minimization validation**
    - Action: measure and reduce side-channel metadata (timing, push payloads, contact graph leakage).

13. **Continuous adversarial testing**
    - Action: red-team exercises, bug bounty, fuzzing for parsers/protocol state machines.

## Minimum target architecture for "maximum practical protection"
- **Identity/Auth:** passkeys + device binding + step-up auth.
- **Messaging security:** audited Signal/MLS-grade protocol + key transparency.
- **Infrastructure:** zero-trust service-to-service identity, least privilege, hardware-backed secrets.
- **SDLC:** threat modeling per release, SAST/DAST/SCA, reproducible signed builds.
- **Operations:** SIEM detections, response playbooks, quarterly key rotation drills.

## Suggested 90-day execution plan
- **Days 1–30:** secret purge/rotation, JWT redesign, WebAuthn rollout plan, ASVS/MASVS gap matrix.
- **Days 31–60:** key verification UX, artifact signing/SBOM/provenance, protocol audit kickoff.
- **Days 61–90:** incident drills, external pentest, mobile hardening validation, public security whitepaper update.

## External references used for this analysis
- IETF RFC 9420 (Messaging Layer Security).
- OWASP ASVS and OWASP MASVS.
- NIST SP 800-63B (Digital Identity).
- NIST SP 800-207 (Zero Trust Architecture).
- NIST CSF 2.0.
- CISA Secure by Design guidance.
- Sigstore Cosign documentation.
- SLSA framework.
