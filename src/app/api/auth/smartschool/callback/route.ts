export async function GET() {
  return Response.json(
    { error: "Smartschool-aanmelding is nog niet actief." },
    { status: 503 },
  );
}
