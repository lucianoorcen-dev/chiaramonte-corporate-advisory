import { randomUUID } from "node:crypto";
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
    const username = process.env.UALA_USERNAME;
    const clientId = process.env.UALA_CLIENT_ID;
    const clientSecretId = process.env.UALA_CLIENT_SECRET_ID;

    if (!username || !clientId || !clientSecretId) {
      return res.status(500).json({
        ok: false,
        error: "Faltan credenciales Ualá de producción."
      });
    }

    const authResponse = await fetch(
      "https://auth.developers.ar.ua.la/v2/api/auth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          client_id: clientId,
          client_secret_id: clientSecretId,
          grant_type: "client_credentials"
        })
      }
    );

    if (!authResponse.ok) {
      console.error("Ualá create-order: falló la autenticación.", authResponse.status);
      return res.status(502).json({
        ok: false,
        error: "No se pudo iniciar el pago con Ualá."
      });
    }

    const authData = await authResponse.json();
    const accessToken = authData.access_token;

    if (!accessToken) {
      return res.status(502).json({
        ok: false,
        error: "Ualá no devolvió un token de acceso."
      });
    }

    // Use an unpredictable reference so an order ID cannot be guessed by incrementing a timestamp.
    const externalReference = `CCA-CAREER-${randomUUID()}`;

    await sql`
      INSERT INTO orders (
        order_id,
        amount,
        currency,
        status
      )
      VALUES (
        ${externalReference},
        5000,
        'ARS',
        'pending'
      )
    `;

    const orderResponse = await fetch(
      "https://checkout.developers.ar.ua.la/v2/api/checkout",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          amount: "5000",
          description: "CCA Career Assessment",
          callback_success:
            `https://www.corporateadvisory.com.ar/career-assessment/access.html?order=${encodeURIComponent(externalReference)}`,
          callback_fail:
            "https://www.corporateadvisory.com.ar/career-assessment/",
          notification_url:
            "https://www.corporateadvisory.com.ar/api/ualabis/webhook",
          external_reference: externalReference
        })
      }
    );

    if (!orderResponse.ok) {
      const responseText = await orderResponse.text();
      console.error("Ualá create-order: rechazo al crear checkout.", orderResponse.status);
      return res.status(502).json({
        ok: false,
        step: "create_order",
        error: "Ualá no pudo crear el enlace de pago.",
        uala_status: orderResponse.status
      });
    }

    const orderData = await orderResponse.json();

    return res.status(200).json({
      ok: true,
      environment: "PRODUCTION",
      external_reference: externalReference,
      order: orderData
    });
  } catch (error) {
    console.error("Create order error:", error?.message);
    return res.status(500).json({
      ok: false,
      error: "Error interno."
    });
  }
}
