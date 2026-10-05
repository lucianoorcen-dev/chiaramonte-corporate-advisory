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

    // 1. Obtener token de Ualá PRODUCCIÓN
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

    const authData = await authResponse.json();

    if (!authResponse.ok) {
      return res.status(authResponse.status).json({
        ok: false,
        step: "authentication",
        details: authData
      });
    }

    const accessToken = authData.access_token;

    if (!accessToken) {
      return res.status(500).json({
        ok: false,
        step: "authentication",
        error: "Ualá no devolvió un access_token."
      });
    }

    // 2. Crear referencia única para la compra
    const externalReference =
      `CCA-CAREER-${Date.now()}`;

    // 3. Guardar la orden en Neon
    await sql`
      INSERT INTO orders (
        order_id,
        amount,
        currency,
        status
      )
      VALUES (
        ${externalReference},
        20,
        'ARS',
        'pending'
      )
    `;

    // 4. Crear checkout en Ualá PRODUCCIÓN
    // Ualá recibe el monto en centavos:
    // ARS 15.000 = 1.500.000 centavos
    const orderResponse = await fetch(
      "https://checkout.developers.ar.ua.la/v2/api/checkout",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          amount: "20",
          description: "CCA Career Assessment",
          callback_fail:
            "https://www.corporateadvisory.com.ar/career-assessment/",
          callback_success:
            "https://www.corporateadvisory.com.ar/career-assessment/",
          notification_url:
            "https://www.corporateadvisory.com.ar/api/ualabis/webhook",
          external_reference: externalReference
        })
      }
    );

    const orderData = await orderResponse.json();

    if (!orderResponse.ok) {
      return res.status(orderResponse.status).json({
        ok: false,
        step: "create_order",
        details: orderData
      });
    }

    return res.status(200).json({
      ok: true,
      environment: "PRODUCTION",
      external_reference: externalReference,
      order: orderData
    });

  } catch (error) {
    console.error("Create order error:", error);

    return res.status(500).json({
      ok: false,
      error: "Error interno.",
      details: error.message
    });
  }
}
