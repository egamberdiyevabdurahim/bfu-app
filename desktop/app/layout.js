export const metadata = {
  title: "Bright Futures Uzbekistan",
  description: "A city of builders, lit up at dusk.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
