export const metadata = {
  title: "수제 디저트 쇼핑몰",
  description: "수제 디저트 상품 목록",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "sans-serif", background: "#fdf8f3" }}>
        {children}
      </body>
    </html>
  );
}
