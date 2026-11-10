import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const notification = req.body || {};
    const { uuid, external_reference } = notification;

    // The notification identifies the order, but its status is never trusted.
    if (
      typeof uuid !== "string" ||
      typeof external_reference !== "string" ||
      !uuid ||
      !external_reference
    ) {
      return res.status(400).json({
        ok: false,
        error: "Notificación Ualá incompleta."
      });
    }

    const username = process.env.UALA_USERNAME;
    const clientId = process.env.UALA_CLIENT_ID;
    const clientSecretId = process.env.UALA_CLIENT_SECRET_ID;

    if (!username || !clientId || !clientSecretId) {
      console.error("Ualá webhook: faltan variables de autenticación.");
      return res.status(503).json({
        ok: false,
        error: "Verificación de pago temporalmente no disponible."
      });
    }

    const authResponse = await fetch(
      "https://auth.developers.ar.ua.la/v2/api/auth/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          client_id: clientId,
          client_secret_id: clientSecretId,
          grant_type: "client_credentials"
        })
      }
    );

    if (!authResponse.ok) {
      console.error("Ualá webhook: falló la autenticación.", authResponse.status);
      return res.status(502).json({
        ok: false,
        error: "No se pudo verificar el pago con Ualá."
      });
    }

    const authData = await authResponse.json();
    if (!authData.access_token) {
      console.error("Ualá webhook: la autenticación no devolvió token.");
      return res.status(502).json({
        ok: false,
        error: "No se pudo verificar el pago con Ualá."
      });
    }

    // Confirm the order directly with Ualá before changing local payment state.
    const orderResponse = await fetch(
      `https://checkout.developers.ar.ua.la/v2/api/orders/${encodeURIComponent(uuid)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${authData.access_token}` }
      }
    );

    if (!orderResponse.ok) {
      console.error("Ualá webhook: no se pudo consultar la orden.", orderResponse.status);
      return res.status(502).json({
        ok: false,
        error: "No se pudo verificar la orden con Ualá."
      });
    }

    const verifiedOrder = await orderResponse.json();
    const validStatuses = ["PENDING", "PROCESSED", "APPROVED", "REJECTED", "REFUNDED"];

    if (
      verifiedOrder?.uuid !== uuid ||
      verifiedOrder?.external_reference !== external_reference ||
      !validStatuses.includes(verifiedOrder?.status)
    ) {
      console.error("Ualá webhook: la orden consultada no coincide con la notificación.");
      return res.status(400).json({
        ok: false,
        error: "La orden no pudo ser validada."
      });
    }

    const orders = await sql`
      SELECT *
      FROM orders
      WHERE order_id = ${external_reference}
      LIMIT 1
    `;

    if (orders.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "Orden no encontrada."
      });
    }

    // Match the independently verified Ualá amount to the amount stored for this order.
    const verifiedAmount = Number(verifiedOrder?.amount);
    const expectedAmount = Number(orders[0].amount);

    if (
      !Number.isFinite(verifiedAmount) ||
      !Number.isFinite(expectedAmount) ||
      verifiedAmount !== expectedAmount
    ) {
      console.error("Ualá webhook: el importe verificado no coincide con la orden local.");
      return res.status(400).json({
        ok: false,
        error: "El importe de la orden no pudo ser validado."
      });
    }

    // Store only the minimum verified order fields; avoid retaining customer/card metadata.
    const paymentData = {
      uuid: verifiedOrder.uuid,
      external_reference: verifiedOrder.external_reference,
      amount: verifiedAmount,
      status: verifiedOrder.status,
      created_date: verifiedOrder.created_date,
      updated_date: verifiedOrder.updated_date
    };

    const existingPayment = await sql`
      SELECT payment_id
      FROM payments
      WHERE payment_id = ${uuid}
      LIMIT 1
    `;

    if (existingPayment.length > 0) {
      await sql`
        UPDATE payments
        SET
          status = ${verifiedOrder.status},
          payment_data = ${JSON.stringify(paymentData)}
        WHERE payment_id = ${uuid}
      `;
    } else {
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
          ${verifiedOrder.status},
          ${JSON.stringify(paymentData)}
        )
      `;
    }

    await sql`
      UPDATE orders
      SET
        status = ${verifiedOrder.status},
        paid_at = CASE
          WHEN ${verifiedOrder.status} = 'APPROVED'
          THEN COALESCE(paid_at, NOW())
          ELSE paid_at
        END
      WHERE order_id = ${external_reference}
    `;

    if (verifiedOrder.status === "APPROVED") {
      const existingAccess = await sql`
        SELECT id
        FROM access_codes
        WHERE order_id = ${external_reference}
        LIMIT 1
      `;

      if (existingAccess.length === 0) {
        const accessCode =
          `CCA-${randomBytes(16).toString("hex").toUpperCase()}`;

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
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Ualá webhook: error interno al procesar la notificación.", error?.message);
    return res.status(500).json({
      ok: false,
      error: "Error interno procesando webhook."
    });
  }
}
