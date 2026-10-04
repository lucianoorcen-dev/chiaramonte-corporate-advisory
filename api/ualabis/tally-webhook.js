import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method Not Allowed"
    });
  }

  try {
    const payload = req.body;

    console.log("TALLY WEBHOOK:", payload);

    const accessCode =
      payload?.data?.fields?.find(
        field => field.key === "access_code"
      )?.value;

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
      RETURNING id, access_code, used, used_at;
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Código inexistente o ya utilizado."
      });
    }

    console.log(
      "ACCESS CODE USED:",
      result.rows[0]
    );

    return res.status(200).json({
      ok: true,
      message: "Acceso marcado como utilizado.",
      access_code: accessCode
    });

  } catch (error) {
    console.error(
      "Tally webhook error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "Error procesando Tally."
    });
  }
}
