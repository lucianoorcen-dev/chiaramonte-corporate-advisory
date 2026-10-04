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

    // Buscar la orden en Neon
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

    // Guardar el pago recibido de Ualá
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

    // Actualizar el estado de la orden
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

    console.log(
      `Pago recibido: ${external_reference} - ${status}`
    );

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

