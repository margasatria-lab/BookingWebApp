export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        padding: "48px",
        textAlign: "center",
      }}
    >
      <span
        style={{
          fontSize: "14px",
          fontWeight: 700,
          letterSpacing: "2px",
          textTransform: "uppercase",
          color: "var(--color-primary)",
        }}
      >
        Booking Platform
      </span>
      <h1 style={{ fontSize: "40px", fontWeight: 700 }}>
        Table tennis venues, booked in under a minute.
      </h1>
      <p style={{ color: "var(--color-text-muted)", maxWidth: "480px" }}>
        The app is scaffolded and connected to the database. Sign up, login,
        and booking screens are being built next.
      </p>
    </main>
  );
}
