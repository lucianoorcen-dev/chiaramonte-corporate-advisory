import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method Not Allowed"
    });
  }

  try {
    const code = req.query?.code;
    const order = req.query?.order;

    if (!code && !order) {
      return res.status(400).json({
        ok: false,
        error: "Falta el código de acceso o la orden."
      });
    }

    let accessCodes;

    // Buscar directamente por código
    if (code) {
      accessCodes = await sql`
        SELECT
          access_codes.*,
          orders.status AS order_status
        FROM access_codes
        INNER JOIN orders
          ON orders.order_id = access_codes.order_id
        WHERE access_codes.access_code = ${code}
        LIMIT 1
      `;
    }

    // Buscar por order_id
    if (!code && order) {
      accessCodes = await sql`
        SELECT
          access_codes.*,
          orders.status AS order_status
        FROM access_codes
        INNER JOIN orders
          ON orders.order_id = access_codes.order_id
        WHERE access_codes.order_id = ${order}
        LIMIT 1
      `;
    }

    if (accessCodes.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "No encontramos un acceso asociado a esta orden."
      });
    }

    const access = accessCodes[0];

    // Verificar que el pago esté aprobado
    if (access.order_status !== "APPROVED") {
      return res.status(403).json({
        ok: false,
        error: "El pago todavía no está aprobado."
      });
    }

    // Verificar que no haya sido utilizado
    if (access.used === true) {
      return res.status(403).json({
        ok: false,
        error: "Este acceso ya fue utilizado."
      });
    }

    return res.status(200).json({
      ok: true,
      access_code: access.access_code,
      order_id: access.order_id,
      message: "Acceso válido."
    });

  } catch (error) {
    console.error("Access error:", error);

    return res.status(500).json({
      ok: false,
      error: "Error interno verificando el acceso."
    });
  }
}
