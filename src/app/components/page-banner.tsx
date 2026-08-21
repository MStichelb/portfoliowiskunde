import Image, { type StaticImageData } from "next/image";

import adminBanner from "@/app/header_admin.png";
import mainBanner from "@/app/header_main.png";
import portfolioBanner from "@/app/header_port.png";

const banners: Record<"admin" | "main" | "portfolio", StaticImageData> = {
  admin: adminBanner,
  main: mainBanner,
  portfolio: portfolioBanner,
};

export function PageBanner({ variant }: { variant: keyof typeof banners }) {
  return <div className={`page-banner page-banner-${variant}`} aria-hidden="true">
    <Image src={banners[variant]} alt="" priority sizes="(max-width: 1120px) calc(100vw - 32px), 1080px" />
  </div>;
}
