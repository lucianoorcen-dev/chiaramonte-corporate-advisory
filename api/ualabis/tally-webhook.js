import { createHmac, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const signingSecret = process.env.TALLY_SIGNING_SECRET;
    if (!signingSecret) {
      console.error("Tally webhook: falta TALLY_SIGNING_SECRET.");
      return res.status(503).json({
        ok: false,
        error: "Verificación del formulario temporalmente no disponible."
      });
    }

    const payload = req.body;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({
        ok: false,
        error: "Payload inválido."
      });
    }

    const receivedSignature = req.headers?.["tally-signature"];
    if (typeof receivedSignature !== "string") {
      return res.status(401).json({
        ok: false,
        error: "Firma de Tally ausente o inválida."
      });
    }

    // Tally documents a base64-encoded HMAC-SHA256 of JSON.stringify(payload).
    const expectedSignature = createHmac("sha256", signingSecret)
      .update(JSON.stringify(payload))
      .digest("base64");

    const received = Buffer.from(receivedSignature, "utf8");
    const expected = Buffer.from(expectedSignature, "utf8");

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      return res.status(401).json({
        ok: false,
        error: "Firma de Tally ausente o inválida."
      });
    }

    if (payload.eventType !== "FORM_RESPONSE") {
      return res.status(400).json({
        ok: false,
        error: "Tipo de evento no admitido."
      });
    }

    const fields = payload?.data?.fields || [];
    const accessField = fields.find(
      (field) =>
        field.key === "access_code" ||
        field.label === "access_code"
    );

    const accessCode =
      typeof accessField?.value === "string"
        ? accessField.value.trim()
        : "";

    if (!accessCode) {
      return res.status(400).json({
        ok: false,
        error: "No se recibió access_code."
      });
    }

    const result = await sql`
      UPDATE access_codes
      SET
        used = true,
        used_at = NOW()
      WHERE access_code = ${accessCode}
        AND used = false
      RETURNING id
    `;

    if (result.length > 0) {
      return res.status(200).json({
        ok: true,
        message: "Acceso marcado como utilizado."
      });
    }

    // A signed retry for an already-consumed code is acknowledged idempotently.
    const existing = await sql`
      SELECT used
      FROM access_codes
      WHERE access_code = ${accessCode}
      LIMIT 1
    `;

    if (existing.length > 0 && existing[0].used === true) {
      return res.status(200).json({
        ok: true,
        message: "El acceso ya había sido procesado."
      });
    }

    return res.status(404).json({
      ok: false,
      error: "Código de acceso inexistente."
    });
  } catch (error) {
    console.error("Tally webhook: error interno al procesar el evento.", error?.message);
    return res.status(500).json({
      ok: false,
      error: "Error procesando Tally."
    });
  }
}
