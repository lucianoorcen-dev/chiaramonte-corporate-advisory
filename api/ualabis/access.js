export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method Not Allowed"
    });
  }

  return res.status(200).json({
    ok: true,
    message: "Endpoint de acceso Career Assessment funcionando.",
    next_step: "Verificación de pago pendiente."
  });
}
