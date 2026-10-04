import { neon } from "@neondatabase/serverless";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method Not Allowed"
    });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    const payload = req.body;

    console.log("TALLY WEBHOOK:", payload);

    const fields = payload?.data?.fields || [];

    const accessField = fields.find(
      (field) =>
        field.key === "access_code" ||
        field.label === "access_code"
    );

    const accessCode = accessField?.value;

    if (!accessCode) {
      console.error("No se recibió access_code.");

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
      RETURNING id, access_code, used, used_at
    `;

    if (result.length === 0) {
      console.error(
        "Código inexistente o ya utilizado:",
        accessCode
      );

      return res.status(404).json({
        ok: false,
        error: "Código inexistente o ya utilizado."
      });
    }

    console.log(
      "ACCESS CODE USED:",
      result[0]
    );

    return res.status(200).json({
      ok: true,
      message: "Acceso marcado como utilizado."
    });

  } catch (error) {
    console.error(
      "Tally webhook error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "Error procesando Tally.",
      details: error.message
    });
  }
}
