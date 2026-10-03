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

    /*
      Por ahora solamente registramos la notificación.

      Más adelante:
      APPROVED  -> habilita acceso
      PROCESSED -> registra procesamiento
      REJECTED  -> marca pago rechazado
    */

    return res.status(200).json({
      ok: true
    });

  } catch (error) {
    console.error("Webhook error:", error);

    return res.status(500).json({
      ok: false
    });
  }
}
