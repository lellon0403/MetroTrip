import type { Metadata } from "next";
import Link from "next/link";
import "@/styles/tokens.css";
import { AccountAction } from "@/components/AccountAction";
import { AppProviders } from "@/components/AppProviders";
import "./styles.css";

export const metadata: Metadata = {
  title: "MetroTrip — 역에서 시작하는 여행",
  description: "천안·아산의 장소를 찾고 지도 위에서 일정을 만드는 여행 서비스",
};

const navigation = [
  ["맵", "/discover"],
  ["내 일정", "/plans"],
  ["후기", "/reviews"],
  ["모집", "/recruitments"],
  ["공지", "/notices"],
] as const;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <AppProviders>
          <header className="siteHeader">
            <Link className="brand" href="/" aria-label="MetroTrip 홈">
              <span className="brandMark">M</span>
              <span>MetroTrip</span>
            </Link>
            <nav aria-label="주요 메뉴">
              {navigation.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
            </nav>
            <AccountAction />
          </header>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
