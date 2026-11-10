export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method Not Allowed"
    });
  }

  // Test checkout must never be callable from the production deployment.
  if (process.env.VERCEL_ENV === "production") {
    return res.status(404).json({ ok: false, error: "Not Found" });
  }

  try {
    const username = process.env.UALA_TEST_USERNAME;
    const clientId = process.env.UALA_TEST_CLIENT_ID;
    const clientSecretId = process.env.UALA_TEST_CLIENT_SECRET_ID;

    if (!username || !clientId || !clientSecretId) {
      return res.status(500).json({
        ok: false,
        error: "Faltan credenciales Ualá TEST."
      });
    }

    // 1. Obtener token
    const authResponse = await fetch(
      "https://auth.stage.developers.ar.ua.la/v2/api/auth/token",
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
        error: "Ualá TEST rechazó la autenticación."
      });
    }

    const accessToken = authData.access_token;

    // 2. Crear orden TEST
    const externalReference =
      `CCA-TEST-${Date.now()}`;

    const orderResponse = await fetch(
      "https://checkout.stage.developers.ar.ua.la/v2/api/checkout",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          amount: "100",
          description: "CCA Career Assessment - TEST",
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
        error: "Ualá TEST no pudo crear la orden."
      });
    }

    return res.status(200).json({
      ok: true,
      environment: "TEST",
      external_reference: externalReference,
      order: orderData
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error interno.",
      error: "Error interno al crear la orden TEST."
    });
  }
}
