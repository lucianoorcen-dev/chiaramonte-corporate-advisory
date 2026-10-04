import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method Not Allowed"
    });
  }

  try {
    const notification = req.body;

    console.log("UALA WEBHOOK:", notification);

    const {
      uuid,
      external_reference,
      status,
      created_date,
      api_version
    } = notification || {};

    console.log("UALA PAYMENT STATUS:", {
      uuid,
      external_reference,
      status,
      created_date,
      api_version
    });

    if (!uuid || !external_reference || !status) {
      console.error(
        "Webhook recibido con datos incompletos."
      );

      return res.status(400).json({
        ok: false,
        error: "Notificación Ualá incompleta."
      });
    }

    // Buscar la orden
    const orders = await sql`
      SELECT *
      FROM orders
      WHERE order_id = ${external_reference}
      LIMIT 1
    `;

    if (orders.length === 0) {
      console.error(
        "No se encontró la orden:",
        external_reference
      );

      return res.status(404).json({
        ok: false,
        error: "Orden no encontrada."
      });
    }

    // Guardar el pago recibido
    await sql`
      INSERT INTO payments (
        order_id,
        payment_id,
        status,
        payment_data
      )
      VALUES (
        ${external_reference},
        ${uuid},
        ${status},
        ${JSON.stringify(notification)}
      )
    `;

    // Actualizar la orden
    await sql`
      UPDATE orders
      SET
        status = ${status},
        paid_at = CASE
          WHEN ${status} = 'APPROVED'
          THEN NOW()
          ELSE paid_at
        END
      WHERE order_id = ${external_reference}
    `;

    // Si el pago fue aprobado, generar acceso
    if (status === "APPROVED") {

      const existingAccess = await sql`
        SELECT *
        FROM access_codes
        WHERE order_id = ${external_reference}
        LIMIT 1
      `;

      if (existingAccess.length === 0) {

        const accessCode =
          `CCA-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;

        await sql`
          INSERT INTO access_codes (
            order_id,
            access_code,
            email
          )
          VALUES (
            ${external_reference},
            ${accessCode},
            ${orders[0].email || null}
          )
        `;

        console.log(
          `Acceso creado para ${external_reference}: ${accessCode}`
        );

      } else {
        console.log(
          `La orden ${external_reference} ya tiene un acceso.`
        );
      }
    }

    return res.status(200).json({
      ok: true
    });

  } catch (error) {
    console.error("Webhook error:", error);

    return res.status(500).json({
      ok: false,
      error: "Error interno procesando webhook."
    });
  }
}
