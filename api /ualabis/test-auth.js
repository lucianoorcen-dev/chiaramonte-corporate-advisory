export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method Not Allowed"
    });
  }

  try {
    const username = process.env.UALA_TEST_USERNAME;
    const clientId = process.env.UALA_TEST_CLIENT_ID;
    const clientSecretId = process.env.UALA_TEST_CLIENT_SECRET_ID;

    if (!username || !clientId || !clientSecretId) {
      return res.status(500).json({
        ok: false,
        error: "Faltan credenciales Ualá TEST en las variables de entorno."
      });
    }

    const response = await fetch(
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

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: "Ualá rechazó la autenticación.",
        details: data
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Autenticación con Ualá Bis TEST correcta.",
      token_type: data.token_type,
      expires_in: data.expires_in
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error interno al comunicarse con Ualá Bis.",
      details: error.message
    });
  }
}
